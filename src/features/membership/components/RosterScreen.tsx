import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { ScreenHeader } from '@/components/ui/ScreenHeader'
import { t } from '@/lib/i18n'
import type { RosterStart } from '../queries'
import type { RosterMode, Scope } from '../types'
import { RosterList } from './RosterList'

// Header title for admin screens: the community or group name above the screen name.
export function ScopeTitle({ scope, title }: { scope: string; title: string }) {
  return (
    <>
      <span className="block truncate text-[12px] font-semibold text-muted">{scope}</span>
      <span className="block truncate leading-tight">{title}</span>
    </>
  )
}

export function RosterScreen({
  community,
  scope,
  seed,
  mode,
  backHref,
  profileBase,
  addHref,
}: {
  community: string
  scope: Scope
  seed: RosterStart
  mode: RosterMode
  backHref: string
  profileBase: string
  addHref?: string
}) {
  return (
    <div className="min-h-app w-full bg-canvas">
      <ScreenHeader
        title={<ScopeTitle scope={scope.name} title={mode === 'members' ? t.admin.members : t.admin.applications} />}
        backHref={backHref}
        right={
          addHref ? (
            <Link href={addHref} aria-label={t.membership.addMember} title={t.membership.addMember} className="inline-flex size-11 items-center justify-center rounded-full text-accent hover:bg-hover">
              <Icon name="plus" />
            </Link>
          ) : undefined
        }
      />
      <RosterList
        community={community}
        communityId={seed.communityId}
        scope={{ kind: scope.kind, id: scope.id, stateLabels: scope.stateLabels }}
        first={seed.rows}
        labels={seed.labels}
        mode={mode}
        profileBase={profileBase}
      />
    </div>
  )
}
