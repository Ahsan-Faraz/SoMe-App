import { type FormEvent, startTransition, useState } from 'react'

// Submitting through a transition keeps the typed values when the server answers with an error
// (a plain form action resets the form). Without JavaScript the form still posts to the action.
export function submitWith(action: (form: FormData) => void, validate = false) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (validate && !event.currentTarget.reportValidity()) return
    const form = new FormData(event.currentTarget)
    startTransition(() => action(form))
  }
}

// An error answers one try: it goes away while the person edits the form or sends it again, and
// the next wrong answer shows it again (every answer from the server is a new state object).
// Put `clear` on the form's onChange.
export function useFormError(state: { error?: string } | undefined, pending: boolean) {
  const [cleared, setCleared] = useState<typeof state>(undefined)
  return {
    error: pending || cleared === state ? undefined : state?.error,
    clear: () => setCleared(state),
  }
}
