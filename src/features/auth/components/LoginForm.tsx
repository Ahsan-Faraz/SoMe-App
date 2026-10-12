'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { t } from '@/lib/i18n'
import { PASSWORD_MIN } from '@/lib/limits'
import { forgotPasswordAction, resetPasswordAction, signInAction } from '../actions'
import { submitWith, useFormError } from './submit'
import { CodeField, VerifyEmail } from './VerifyEmail'

export function LoginForm({ community }: { community: string }) {
  const [state, signIn, pending] = useActionState(signInAction, undefined)
  const [forgotOpen, setForgotOpen] = useState(false)
  const { error, clear } = useFormError(state, pending)

  // Right password, email never confirmed: confirm it here, then log in again.
  if (state?.verifyEmail) return <VerifyEmail community={community} email={state.verifyEmail} />
  if (forgotOpen) return <ForgotPassword community={community} onCancel={() => setForgotOpen(false)} />

  return (
    <div className="grid gap-4">
      <form action={signIn} onSubmit={submitWith(signIn)} onChange={clear} noValidate className="grid gap-4">
        <input type="hidden" name="community" value={community} />
        <TextField id="login" name="login" label={t.login.username} autoComplete="username" autoCapitalize="none" />
        <TextField id="password" name="password" type="password" label={t.login.password} autoComplete="current-password" />

{error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="mt-2">
          {pending ? t.login.submitting : t.login.submit}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setForgotOpen(true)}
        className="justify-self-center py-2 text-[15px] font-semibold text-accent hover:underline"
      >
        {t.login.forgot}
      </button>
    </div>
  )
}

// Forgot password: username or email → code by email → code + new password, all inside the app.
function ForgotPassword({ community, onCancel }: { community: string; onCancel: () => void }) {
  const [sendState, send, sending] = useActionState(forgotPasswordAction, undefined)
  const [resetState, reset, resetting] = useActionState(resetPasswordAction, undefined)
  const login = resetState?.resetFor ?? sendState?.resetFor
  const resetError = useFormError(resetState, resetting)
  const sendError = useFormError(sendState, sending)

  if (login) {
    return (
      <form action={reset} onSubmit={submitWith(reset, true)} onChange={resetError.clear} className="grid gap-4">
        <input type="hidden" name="community" value={community} />
        <input type="hidden" name="login" value={login} />
        <p className="text-ink-soft">{t.reset.body}</p>
        <CodeField />
        <TextField id="password" name="password" type="password" label={t.reset.password} autoComplete="new-password" minLength={PASSWORD_MIN} required />
        <TextField id="repeatPassword" name="repeatPassword" type="password" label={t.reset.repeatPassword} autoComplete="new-password" required />
{resetError.error ? (
          <p role="alert" className="text-sm text-danger">
            {resetError.error}
          </p>
        ) : null}
        <Button type="submit" disabled={resetting}>
          {resetting ? t.reset.submitting : t.reset.submit}
        </Button>
        <p className="text-center text-[13px] text-muted">{t.verify.spam}</p>
      </form>
    )
  }

  return (
    <form action={send} onSubmit={submitWith(send)} onChange={sendError.clear} noValidate className="grid gap-4">
      <input type="hidden" name="community" value={community} />
      <p className="text-ink-soft">{t.login.forgotBody}</p>
      <TextField id="forgot-login" name="login" label={t.login.username} autoComplete="username" autoCapitalize="none" />
      {sendError.error ? (
        <p role="alert" className="text-sm text-danger">
          {sendError.error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="ghost" onClick={onCancel}>
          {t.login.cancel}
        </Button>
        <Button type="submit" disabled={sending}>
          {t.login.forgotSubmit}
        </Button>
      </div>
    </form>
  )
}
