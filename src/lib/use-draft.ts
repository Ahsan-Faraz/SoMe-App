'use client'

import { useState } from 'react'

// A form field's draft of a saved value. It follows the saved value when that changes (a save of
// yours or someone else's coming back from the server) without remounting the form. Remounting
// dropped the focus after every save, so on phones the keyboard closed and the screen jumped up
// (client feedback 261115). Only the field whose saved value changed is reset: typing in another
// field is kept. `key` turns the value into a comparable string (arrays: join them).
export function useDraft<T>(saved: T, key: (value: T) => string = String): [T, (next: T | ((current: T) => T)) => void] {
  const [draft, setDraft] = useState(saved)
  const [base, setBase] = useState(() => key(saved))
  const savedKey = key(saved)
  if (savedKey !== base) {
    // Adjusting state while rendering (react.dev "you might not need an effect"): no extra paint.
    setBase(savedKey)
    setDraft(saved)
  }
  return [draft, setDraft]
}

export const joined = (values: readonly string[]) => values.join('\u0000')
