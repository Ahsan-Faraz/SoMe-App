'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { t } from '@/lib/i18n'
import { PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@/lib/limits'
import { joinAction } from '../actions'
import { submitWith, useFormError } from './submit'
import { VerifyEmail } from './VerifyEmail'

export function JoinForm({ community, communityName }: { community: string; communityName: string }) {
  const [state, join, pending] = useActionState(joinAction, undefined)
  const { error, clear } = useFormError(state, pending)

  if (state?.verifyEmail) return <VerifyEmail community={community} email={state.verifyEmail} />

  return (
    <form action={join} onSubmit={submitWith(join, true)} onChange={clear} className="grid gap-4">
      <input type="hidden" name="community" value={community} />
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
