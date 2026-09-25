'use client'

import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { Button, buttonClass } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { TextField } from '@/components/ui/TextField'
import { t } from '@/lib/i18n'
import { signUp } from '../browser'

const MIN_PASSWORD_LENGTH = 8

export function JoinForm({ community, communityName }: { community: string; communityName: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!formElement.reportValidity()) return

    const form = new FormData(formElement)
    const username = String(form.get('username') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const repeat = String(form.get('repeatPassword') ?? '')
    const email = String(form.get('email') ?? '').trim()

    if (password.length < MIN_PASSWORD_LENGTH) return setError(t.join.passwordTooShort)
    if (password !== repeat) return setError(t.join.passwordMismatch)

    setError(null)
    setPending(true)
    await signUp({ username, password, email })
    setPending(false)
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <div className="grid justify-items-center gap-4 pt-6 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-sunken text-accent">
          <Icon name="mail" className="size-8" />
        </span>
        <h2 className="text-xl font-semibold">{t.join.sentTitle}</h2>
        <p className="text-ink-soft">{t.join.sentBody(sentTo)}</p>
        <Link href={`/${community}/login`} className={`${buttonClass('primary')} mt-4`}>
          {t.join.toLogin}
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <p className="text-ink-soft">{t.join.subtitle(communityName)}</p>
      <TextField id="username" name="username" label={t.join.username} autoComplete="username" autoCapitalize="none" required />
      <TextField
        id="password"
        name="password"
        type="password"
        label={t.join.password}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
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
