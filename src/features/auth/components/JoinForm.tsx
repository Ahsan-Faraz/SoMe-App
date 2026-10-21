'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { t } from '@/lib/i18n'
import { PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@/lib/limits'
import { joinAction } from '../actions'
import { submitWith, useFormError } from './submit'
import { VerifyEmail } from './VerifyEmail'

const check = 'flex items-start gap-2.5 text-[15px] leading-snug text-ink'

// AC. The consents are part of joining (D32): the privacy terms always, "18 or older" when the
// community asks for it. privacyVersion: the text shown, so a newer text has to be agreed to again.
export function JoinForm({
  community,
  communityName,
  privacyVersion,
  requireAge18,
}: {
  community: string
  communityName: string
  privacyVersion: string
  requireAge18: boolean
}) {
  const [state, join, pending] = useActionState(joinAction, undefined)
  const { error, clear } = useFormError(state, pending)

  if (state?.verifyEmail) return <VerifyEmail community={community} email={state.verifyEmail} />

  return (
    <form action={join} onSubmit={submitWith(join, true)} onChange={clear} className="grid gap-4">
      <input type="hidden" name="community" value={community} />
      <input type="hidden" name="privacyVersion" value={privacyVersion} />
      <p className="text-ink-soft">{t.join.subtitle(communityName)}</p>
      <TextField
        id="username"
        name="username"
        label={t.join.username}
        autoComplete="username"
        autoCapitalize="none"
        minLength={USERNAME_MIN}
        maxLength={USERNAME_MAX}
        required
      />
      <TextField
        id="password"
        name="password"
        type="password"
        label={t.join.password}
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
      />
      <TextField
        id="repeatPassword"
        name="repeatPassword"
        type="password"
        label={t.join.repeatPassword}
        autoComplete="new-password"
        required
      />
      <TextField id="email" name="email" type="email" label={t.join.email} autoComplete="email" inputMode="email" required />

      <div className="grid gap-3 pt-1">
        <label className={check}>
          <input type="checkbox" name="privacy" required className="mt-0.5 size-5 shrink-0" />
          <span>
            {t.join.privacyConsent}{' '}
            <Link href={`/${community}/privacy`} target="_blank" className="font-semibold text-accent underline">
              {t.join.privacyLink}
            </Link>
          </span>
        </label>
        {requireAge18 ? (
          <label className={check}>
            <input type="checkbox" name="age18" required className="mt-0.5 size-5 shrink-0" />
            <span>{t.join.ageConsent}</span>
          </label>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? t.join.submitting : t.join.submit}
      </Button>
    </form>
  )
}
