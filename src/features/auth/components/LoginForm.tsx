'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { t } from '@/lib/i18n'
import { signIn } from '../browser'

export function LoginForm({ community }: { community: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showForgotNote, setShowForgotNote] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!username || !password) {
      setError(t.login.missing)
      return
    }
    setError(null)
    setPending(true)
    const { role } = await signIn(username, password)
    router.push(role === 'pending' ? `/${community}/pending` : `/${community}/chats`)
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField id="username" name="username" label={t.login.username} autoComplete="username" autoCapitalize="none" />
      <TextField id="password" name="password" type="password" label={t.login.password} autoComplete="current-password" />

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? t.login.submitting : t.login.submit}
      </Button>

      <button
        type="button"
        onClick={() => setShowForgotNote(true)}
        className="justify-self-center py-2 text-sm font-medium text-accent"
      >
        {t.login.forgot}
      </button>
      {showForgotNote ? <p className="text-center text-sm text-neutral-500">{t.login.forgotUnavailable}</p> : null}

      <p className="mt-4 rounded-xl bg-neutral-100 p-3 text-center text-xs text-neutral-600">{t.login.demoHint}</p>
    </form>
  )
}
