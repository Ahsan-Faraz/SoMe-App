'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { getCommunity } from '@/features/communities/queries'
import { t } from '@/lib/i18n'
import { OTP_PATTERN, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@/lib/limits'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Emails carry a 6-digit code typed into the app, not a link: on a phone the link would open the
// browser, which on iOS does not share the installed PWA's login.
export type AuthState =
  | {
      error?: string
      verifyEmail?: string // show the "enter the code" step for this email
      resetFor?: string // show the "code + new password" step for this login
      resent?: boolean
    }
  | undefined

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim()
const code = (form: FormData) => text(form, 'code').replace(/\s/g, '')

// A username's email, looked up on the server. An input with '@' is already an email.
async function emailFor(communityId: string, login: string): Promise<string | null> {
  if (login.includes('@')) return login.toLowerCase()
  const { data } = await createAdminClient().rpc('member_email', { p_community: communityId, p_username: login })
  return data
}

// Log in (AB) with username or email. Every failure before the password is proven gives one message.
export async function signInAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const login = text(form, 'login')
  const password = String(form.get('password') ?? '')
  if (!login || !password) return { error: t.login.missing }

  const community = await getCommunity(slug)
  const email = community ? await emailFor(community.id, login) : null
  if (!community || !email) return { error: t.login.failed }

  const supabase = await createClient()
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error?.code === 'email_not_confirmed') {
    // The password is right, so it is safe to show the email and send a fresh code.
    await supabase.auth.resend({ type: 'signup', email })
    return { verifyEmail: email }
  }
  if (error) return { error: t.login.failed }

  const { data: member } = await supabase
    .from('members')
    .select('state')
    .eq('community_id', community.id)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!member || member.state === 'rejected' || member.state === 'removed') {
    await supabase.auth.signOut({ scope: 'local' })
    return { error: member ? t.login.failed : t.login.noAccountHere(community.name) }
  }

  recordLogin(supabase, community.id, auth.user.id)
  redirect(member.state === 'approved' ? `/${slug}/chats` : `/${slug}/pending`)
}

// "Latest login" on the profile, for every way of signing in (password, email code, joining with an
// existing login, a new password). After the response; a trigger stamps the database's now(), so
// the value sent here is ignored.
function recordLogin(supabase: Awaited<ReturnType<typeof createClient>>, communityId: string, userId: string) {
  after(async () => {
    await supabase.from('members').update({ last_login_at: new Date().toISOString() }).eq('community_id', communityId).eq('user_id', userId)
  })
}

// Join (AC). A new email signs up and gets a code. An email that already has a login
// (another community, D17) must use that password, and gets a new account here.
export async function joinAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const username = text(form, 'username')
  const email = text(form, 'email').toLowerCase()
  const password = String(form.get('password') ?? '')

  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return { error: t.join.usernameLength }
  if (username.includes('@')) return { error: t.join.usernameAt }
  if (password.length < PASSWORD_MIN) return { error: t.join.passwordTooShort }
  if (password !== String(form.get('repeatPassword') ?? '')) return { error: t.join.passwordMismatch }
  if (!email.includes('@')) return { error: t.join.emailInvalid }

  const community = await getCommunity(slug)
  if (!community) return { error: t.join.failed }

  const { data: check, error: checkError } = await createAdminClient()
    .rpc('join_check', { p_community: community.id, p_username: username, p_email: email })
    .single()
  if (checkError) return { error: t.join.failed }
  if (check.username_taken) return { error: t.join.usernameTaken }

  const supabase = await createClient()

  if (!check.email_exists) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { community_id: community.id, username } },
    })
    // A username taken a moment ago fails inside the sign-up transaction.
    if (error) return { error: error.code === 'unexpected_failure' ? t.join.usernameTaken : t.join.failed }
    return { verifyEmail: email }
  }

  const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error?.code === 'email_not_confirmed') {
    await supabase.auth.resend({ type: 'signup', email })
    return { verifyEmail: email }
  }
  if (error) return { error: t.join.emailHasLogin }

  const { error: joinError } = await supabase.from('members').insert({ community_id: community.id, user_id: auth.user.id, username })
  if (joinError) {
    await supabase.auth.signOut({ scope: 'local' })
    if (joinError.message.includes('members_pkey')) return { error: t.join.alreadyMember }
    return { error: joinError.code === '23505' ? t.join.usernameTaken : t.join.failed }
  }
  recordLogin(supabase, community.id, auth.user.id)
  redirect(`/${slug}/pending`)
}

// The code from the sign-up email. Success signs the person in.
export async function verifyEmailAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const email = text(form, 'email').toLowerCase()
  const token = code(form)
  if (!OTP_PATTERN.test(token)) return { verifyEmail: email, error: t.verify.badCode }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) return { verifyEmail: email, error: t.verify.badCode }
  const community = await getCommunity(slug)
  if (community && data.user) recordLogin(supabase, community.id, data.user.id)
  redirect(`/${slug}/pending`)
}

export async function resendCodeAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = text(form, 'email').toLowerCase()
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) return { verifyEmail: email, error: error.code === 'over_email_send_rate_limit' ? t.verify.wait : t.join.failed }
  return { verifyEmail: email, resent: true }
}

// Step 1 of a reset: send a code. Always answers the same, so it never tells whether an account exists.
export async function forgotPasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const login = text(form, 'login')
  if (!login) return { error: t.login.forgotMissing }

  const community = await getCommunity(slug)
  const email = community ? await emailFor(community.id, login) : null
  if (email) {
    const supabase = await createClient()
    await supabase.auth.resetPasswordForEmail(email)
  }
  return { resetFor: login }
}

// Step 2: the code plus the new password. The email is looked up again, never sent to the browser.
export async function resetPasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const login = text(form, 'login')
  const token = code(form)
  const password = String(form.get('password') ?? '')
  if (password.length < PASSWORD_MIN) return { resetFor: login, error: t.join.passwordTooShort }
  if (password !== String(form.get('repeatPassword') ?? '')) return { resetFor: login, error: t.join.passwordMismatch }
  if (!OTP_PATTERN.test(token)) return { resetFor: login, error: t.verify.badCode }

  const community = await getCommunity(slug)
  const email = community ? await emailFor(community.id, login) : null
  if (!email) return { resetFor: login, error: t.verify.badCode }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
  if (error) return { resetFor: login, error: t.verify.badCode }

  const { data, error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) return { resetFor: login, error: updateError.code === 'same_password' ? t.reset.samePassword : t.join.failed }
  if (community) recordLogin(supabase, community.id, data.user.id)
  redirect(`/${slug}/chats`)
}

export async function signOutAction(slug: string) {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect(`/${slug}`)
}
