'use client'

import { useEffect, useState } from 'react'

// Profile status (profile type). The member picks it once, when they create their profile; after
// that it is locked and only the community admin can change it. It decides which fields the profile has.
// Kept on this device until the profile table exists; there the rule is enforced by the database
// (a member may set status only while it is empty, the community admin may always change it).

const EVENT = 'some-status'

function statusKey(community: string, userId: string) {
  return `some:status:${community}:${userId}`
}

export function readStatus(community: string, userId: string): string | null {
  try {
    const saved = localStorage.getItem(statusKey(community, userId))
    return saved || null
  } catch {
    return null
  }
}

export function writeStatus(community: string, userId: string, status: string) {
  try {
    localStorage.setItem(statusKey(community, userId), status)
  } catch {
    // Storage blocked: the choice lasts until the page is left.
  }
  window.dispatchEvent(new Event(EVENT))
}

// The profile's status: a saved choice (member's first pick or the admin's change), else the server's.
// '' = not chosen yet (a new profile). ready = this device's saved choice has been read.
export function useStatus(community: string, userId: string, initial: string): { status: string; ready: boolean } {
  const [state, setState] = useState({ status: initial, ready: false })

  useEffect(() => {
    const read = () => setState({ status: readStatus(community, userId) ?? initial, ready: true })
    read()
    window.addEventListener(EVENT, read)
    return () => window.removeEventListener(EVENT, read)
  }, [community, userId, initial])

  return state
}
