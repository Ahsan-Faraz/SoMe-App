'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { PasswordField } from '@/components/ui/PasswordField'
import { TextField } from '@/components/ui/TextField'
import { t } from '@/lib/i18n'
import { PASSWORD_MIN } from '@/lib/limits'
import { siteJoinAction } from '../actions'
import { submitWith, useFormError } from './submit'
import { VerifyEmail } from './VerifyEmail'

// Join on the main domain (/join): a login for this domain, no community yet. The username and the
// consents come later, per community, when it joins one from /communities.
export function SiteJoinForm() {
  const [state, join, pending] = useActionState(siteJoinAction, undefined)
  const { error, clear } = useFormError(state, pending)

  if (state?.verifyEmail) return <VerifyEmail community="" email={state.verifyEmail} />

  return (
    <form action={join} onSubmit={submitWith(join, true)} onChange={clear} className="grid gap-4">
      <p className="text-ink-soft">{t.site.joinBody}</p>
      <TextField id="email" name="email" type="email" label={t.join.email} autoComplete="email" inputMode="email" required />
      <PasswordField id="password" name="password" label={t.join.password} hint={t.join.passwordHint} autoComplete="new-password" minLength={PASSWORD_MIN} required />
      <PasswordField id="repeatPassword" name="repeatPassword" label={t.join.repeatPassword} autoComplete="new-password" required />
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
