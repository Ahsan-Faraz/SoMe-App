'use client'

import { useActionState, useEffect } from 'react'
import { t } from '@/lib/i18n'
import { deleteAccountAction } from '../actions'

const input = 'h-12 w-full rounded-xl border border-line bg-canvas px-3 text-[16px] outline-none focus:border-accent'

// Delete my account: what goes, then the password again and one button.
export function DeleteAccountForm({ community, communityName }: { community: string; communityName: string }) {
  const [state, action, pending] = useActionState(deleteAccountAction, undefined)

  // Deleted: a full page load of the start page, so no page of the deleted account stays in memory.
  useEffect(() => {
    if (state?.deleted) window.location.replace(`/${community}`)
  }, [state, community])

  return (
    <form action={action} className="mx-auto grid max-w-lg gap-5 px-5 py-6 text-[16px] leading-relaxed sm:px-8">
      <input type="hidden" name="community" value={community} />
      <p>{t.account.intro(communityName)}</p>
      <ul className="list-disc space-y-1 pl-5 text-ink-soft">
        {t.account.gone.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="text-ink-soft">{t.account.login}</p>
      <p className="font-semibold">{t.account.final}</p>
      <label className="grid gap-1.5 text-[14px] font-semibold">
        {t.login.password}
        <input name="password" type="password" required autoComplete="current-password" className={input} />
      </label>
      {state?.error ? (
        <p role="alert" className="text-[15px] font-semibold text-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || state?.deleted}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-danger px-5 text-[16px] font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {pending ? t.account.deleting : t.account.submit}
      </button>
    </form>
  )
}
