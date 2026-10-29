import 'server-only'
import { after } from 'next/server'
import { isRecord } from '@/lib/guards'
import { createAdminClient } from './admin'

// Storage removes at most this many files per call.
const REMOVE_BATCH = 1000

const paths = (value: unknown) => (Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string') : [])

// Removes files from a bucket by the service role, in batches. A failed batch only leaves unreachable
// files (their rows are gone), so it is logged, not retried.
async function removeFiles(bucket: 'private' | 'profile', files: string[]) {
  for (let start = 0; start < files.length; start += REMOVE_BATCH) {
    const { error } = await createAdminClient().storage.from(bucket).remove(files.slice(start, start + REMOVE_BATCH))
    if (error) console.error(`Files not deleted from Storage (${bucket}):`, error.message)
  }
}

// Files in the private bucket whose rows a database function has just deleted (its {files}: chat
// images, application and ID photos), removed from Storage after the response by the service role
// (they are other members' files too). Only ever called with paths a database function returned,
// never with input from the browser, and never from a Server Action file's exports. A failed delete
// only leaves an unreachable file.
export function deletePrivateFiles(data: unknown) {
  const files = isRecord(data) ? paths(data.files) : []
  if (files.length === 0) return
  after(() => removeFiles('private', files))
}

// Delete my account: every file delete_my_account returned ({private, profile}), after the response.
// Same rules as above: only paths the database function returned.
export function deleteAccountFiles(data: unknown) {
  if (!isRecord(data)) return
  const privateFiles = paths(data.private)
  const profileFiles = paths(data.profile)
  if (privateFiles.length === 0 && profileFiles.length === 0) return
  after(async () => {
    await removeFiles('private', privateFiles)
    await removeFiles('profile', profileFiles)
  })
}
