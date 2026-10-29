'use server'

import { createClient as createPlainClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { getCommunity } from '@/features/communities/queries'
import { getSupabaseEnv } from '@/lib/env'
import { t } from '@/lib/i18n'
import { refundAttempt, takeAttempt, waitMinutes } from '@/lib/rate-limit'
import { deleteAccountFiles } from '@/lib/supabase/private-files'
import { createClient } from '@/lib/supabase/server'

export type DeleteAccountState = { error?: string; deleted?: boolean } | undefined

// Delete my account (GDPR). The password is asked again (limited like logging in), then one RPC,
// delete_my_account (supabase/migrations/20261031120000_launch.sql), removes the account here and
// everything below it, and the login itself when it was the last account. Every file it returns, in
// both buckets, is removed after the response; then the person is logged out on this device and the
// form loads the start page in full, so none of their pages stay in the browser's memory.
export async function deleteAccountAction(_: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  const slug = String(form.get('community') ?? '')
  const password = String(form.get('password') ?? '')
  if (!password) return { error: t.account.passwordMissing }
  const community = await getCommunity(slug)
  if (!community) return { error: t.common.error }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) redirect(`/${slug}/login`)

  const attempt = await takeAttempt('password', user.email)
  if (attempt.wait > 0) return { error: t.common.tooMany(waitMinutes(attempt.wait)) }
  // Checked on a separate client that keeps nothing, so this device's own login cookie is untouched;
  // its session is ended again right away.
  const check = createPlainClient(getSupabaseEnv().url, getSupabaseEnv().key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: wrong } = await check.auth.signInWithPassword({ email: user.email, password })
  if (wrong) return { error: t.account.wrongPassword }
  await refundAttempt('password', attempt)
  await check.auth.signOut({ scope: 'local' })

  const { data, error } = await supabase.rpc('delete_my_account', { p_community: community.id })
  if (error) return { error: error.code === '55000' ? t.account.lastAdmin : t.common.error }
  deleteAccountFiles(data)
  // The login may be gone already (the last account): this only clears this device's cookies.
  await supabase.auth.signOut({ scope: 'local' })
  return { deleted: true }
}
