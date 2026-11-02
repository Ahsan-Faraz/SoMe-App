#!/usr/bin/env bash
# Builds and releases the app on the prod VPS. Installed as /usr/local/bin/some-deploy (owned by root).
# GitHub Actions reaches it over SSH as the `deploy` user, whose key may run only this script, so the
# command arrives in SSH_ORIGINAL_COMMAND. By hand: `some-deploy build <sha>`, then `some-deploy release <sha>`.
#
#   build <sha>    fetch the commit into releases/<sha>, npm ci, next build. The live site is untouched.
#   release <sha>  point `current` at that build, restart the app, check it answers; on failure go back.
set -euo pipefail

APP=/srv/some
KEEP=5 # releases kept on disk, for rollback

read -r action sha extra <<< "${SSH_ORIGINAL_COMMAND:-$*}"
if [[ ! ${action:-} =~ ^(build|release)$ || ! ${sha:-} =~ ^[0-9a-f]{40}$ || -n ${extra:-} ]]; then
  echo "usage: some-deploy build|release <40-character commit sha>" >&2
  exit 2
fi
dir=$APP/releases/$sha
live=$(readlink -e "$APP/current" || true) # empty before the first release

health() {
  for _ in $(seq 30); do
    curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3000/ && return 0
    sleep 2
  done
  return 1
}

case $action in
  build)
    if [[ -f $dir/.next/BUILD_ID ]]; then
      echo "$sha is already built"
      exit 0
    fi
    [[ $dir != "$live" ]] || { echo "$sha is live but not built; refusing to touch it" >&2; exit 1; }
    git -C "$APP/repo" fetch --quiet --prune origin
    git -C "$APP/repo" cat-file -e "$sha^{commit}"
    rm -rf "$dir"
    mkdir -p "$dir/.next"
    git -C "$APP/repo" archive "$sha" | tar -x -C "$dir"
    ln -s "$APP/shared/.env.production" "$dir/.env.production"
    # The previous build's compiler cache makes this build much faster.
    [[ -n $live && -d $live/.next/cache ]] && cp -a "$live/.next/cache" "$dir/.next/cache"
    cd "$dir"
    export NEXT_TELEMETRY_DISABLED=1
    # Per-build id: an open tab from the old build reloads instead of fetching chunks that are gone.
    export NEXT_DEPLOYMENT_ID=${sha:0:12}
    # Low priority, so the live site stays fast while the build runs next to it.
    nice -n 10 ionice -c 3 npm ci --no-audit --no-fund
    nice -n 10 ionice -c 3 npm run build
    echo "built $sha"
    ;;

  release)
    [[ -f $dir/.next/BUILD_ID ]] || { echo "$sha is not built" >&2; exit 1; }
    ln -sfn "$dir" "$APP/current"
    sudo /usr/bin/systemctl restart some.service
    if ! health; then
      echo "the new release does not answer" >&2
      if [[ -n $live && $live != "$dir" ]]; then
        echo "going back to $(basename "$live")" >&2
        ln -sfn "$live" "$APP/current"
        sudo /usr/bin/systemctl restart some.service
      fi
      exit 1
    fi
    # Keep the newest releases; never delete the live one or the one before it.
    for old in $(ls -1dt "$APP"/releases/*/ | tail -n +$((KEEP + 1))); do
      old=${old%/}
      [[ $old == "$dir" || $old == "$live" ]] || rm -rf "$old"
    done
    echo "released $sha"
    ;;
esac
