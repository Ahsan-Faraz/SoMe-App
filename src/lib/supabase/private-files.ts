import 'server-only'
import { after } from 'next/server'
import { isRecord } from '@/lib/guards'
import { createAdminClient } from './admin'

// Files in the private bucket whose rows a database function has just deleted (its {files}: chat
// images, application and ID photos), removed from Storage after the response by the service role
// (they are other members' files too). Only ever called with paths a database function returned,
// never with input from the browser, and never from a Server Action file's exports. A failed delete
// only leaves an unreachable file.
export function deletePrivateFiles(data: unknown) {
  const files = isRecord(data) && Array.isArray(data.files) ? data.files.filter((path): path is string => typeof path === 'string') : []
  if (files.length === 0) return
  after(async () => {
    const { error } = await createAdminClient().storage.from('private').remove(files)
    if (error) console.error('Private files not deleted from Storage:', error.message)
  })
}
