'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { TextField } from '@/components/ui/TextField'
import { t } from '@/lib/i18n'
import { resendCodeAction, verifyEmailAction } from '../actions'
import { submitWith, useFormError } from './submit'

export function CodeField() {
  return (
    <TextField
      id="code"
      name="code"
      label={t.verify.code}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]{6,12}"
      maxLength={12}
      required
      className="h-14 w-full rounded-xl border border-line-strong bg-canvas px-4 text-center text-[24px] tracking-[0.4em] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
    />
  )
}

// After Join (or a login with an unconfirmed email): type the code from the email.
export function VerifyEmail({ community, email }: { community: string; email: string }) {
  const [state, verify, verifying] = useActionState(verifyEmailAction, undefined)
  const [resendState, resend, resending] = useActionState(resendCodeAction, undefined)
  const verifyError = useFormError(state, verifying)
  const resendError = useFormError(resendState, resending)
  const error = verifyError.error ?? resendError.error

  return (
    <div className="grid gap-4">
      <div className="grid justify-items-center gap-3 pt-2 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-sunken text-accent">
          <Icon name="mail" className="size-8" />
        </span>
        <h2 className="text-xl font-semibold">{t.verify.title}</h2>
        <p className="text-ink-soft">{t.verify.body(email)}</p>
      </div>

      <form
        action={verify}
        onSubmit={submitWith(verify, true)}
        onChange={() => {
          verifyError.clear()
          resendError.clear()
        }}
        className="grid gap-4"
      >
        <input type="hidden" name="community" value={community} />
        <input type="hidden" name="email" value={email} />
        <CodeField />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : resendState?.resent ? (
          <p role="status" className="text-sm text-ink-soft">
            {t.verify.resent}
          </p>
        ) : null}
        <Button type="submit" disabled={verifying}>
          {verifying ? t.verify.submitting : t.verify.submit}
        </Button>
      </form>

      <form action={resend} onSubmit={submitWith(resend)} className="grid justify-items-center gap-1">
        <input type="hidden" name="email" value={email} />
        <button type="submit" disabled={resending} className="py-2 text-[15px] font-semibold text-accent hover:underline disabled:opacity-50">
          {t.verify.resend}
        </button>
        <p className="text-[13px] text-muted">{t.verify.spam}</p>
      </form>
    </div>
  )
}
