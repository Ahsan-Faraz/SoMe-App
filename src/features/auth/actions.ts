'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { getCommunity } from '@/features/communities/queries'
import type { Community } from '@/features/communities/types'
import { clearHolder, currentHolder, findLogin, newAuthEmail, newCode, newHolder, signInAs } from '@/lib/auth/logins'
import { sendEmail } from '@/lib/email'
import { t } from '@/lib/i18n'
import { OTP_PATTERN, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@/lib/limits'
import { refundAttempt, takeAttempt, waitMinutes } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Logins are per site (domain): the same email is a separate login, with its own password, on
// theirl.net and on aiproduktion.se (lib/auth/logins.ts). The site is the community's, never the
// browser's word. Emails carry a 6-digit code typed into the app, not a link: on a phone the link
// would open the browser, which on iOS does not share the installed PWA's login. The codes are ours
// and go out through Brevo after the response; Supabase Auth sends no email.
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

// Limits are counted per site, so the same email on another domain has its own.
const emailKey = (community: Community, email: string) => `${community.site}:${email}`
const loginKey = (community: Community, login: string) => `${community.id}:${login}`

// A code email, after the response: the answer never waits for (or tells about) the email.
function sendCode(community: Community, to: string, kind: 'signup' | 'reset', value: string | null) {
  if (!value) return
  after(() =>
    sendEmail({
      to,
      fromName: community.name,
      site: community.site,
      subject: kind === 'signup' ? t.codeEmail.signupSubject(value, community.name) : t.codeEmail.resetSubject(value),
      text: kind === 'signup' ? t.codeEmail.signupBody(value, community.name) : t.codeEmail.resetBody(value, community.name),
    }),
  )
}

// The password was right but the email isn't confirmed: this browser becomes the sign-up's holder
// and gets a fresh code, unless the email had its share of emails this hour.
async function startConfirm(community: Community, userId: string, email: string): Promise<AuthState> {
  const holder = await newHolder()
  if ((await takeAttempt('email', emailKey(community, email))).wait === 0) sendCode(community, email, 'signup', await newCode(userId, 'signup', holder))
  return { verifyEmail: email }
}

// Log in (AB) with username or email. Every failure before the password is proven gives one message.
export async function signInAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const typed = text(form, 'login')
  const password = String(form.get('password') ?? '')
  if (!typed || !password) return { error: t.login.missing }

  const community = await getCommunity(slug)
  if (!community) return { error: t.login.failed }
  const login = await findLogin(community.site, community.id, typed)
  // Counted per login (or the typed name when there is none) and per IP, also for a login that
  // doesn't exist, so the limit tells nothing about which accounts exist.
  const attempt = await takeAttempt('password', login?.userId ?? loginKey(community, typed))
  if (attempt.wait > 0) return { error: t.common.tooMany(waitMinutes(attempt.wait)) }
  if (!login) return { error: t.login.failed }

  const supabase = await createClient()
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email: login.authEmail, password })
  if (error?.code === 'email_not_confirmed') {
    // The password is right, so it is safe to show the email and send a fresh code.
    await refundAttempt('password', attempt)
    return startConfirm(community, login.userId, login.email)
  }
  if (error) return { error: t.login.failed }
  await refundAttempt('password', attempt)

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

// Join (AC). A new email on this site signs up and gets a code. An email that already has a login on
// this site (another community here, D17) must use that password, and gets a new account here. The
// same email on another site is unknown here: it signs up as new.
// The answer never tells whether an email has a login (D32): a wrong password for an existing email
// shows the same "enter the code" step as a new email, and the owner gets an email explaining it.
// The consents (privacy terms, 18+ when the community asks) are saved with the account, in the
// same transaction (sign-up trigger, or join_community).
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
  if (form.get('privacy') !== 'on' || (community.requireAge18 && form.get('age18') !== 'on')) return { error: t.join.consentMissing }
  // The version of the text the form showed; a newer one means agreeing to text not yet seen.
  if (text(form, 'privacyVersion') !== community.privacyVersion) return { error: t.join.consentChanged }
  const consents = { privacy: community.privacyVersion, ...(community.requireAge18 ? { age_18: true } : {}) }

  // Every join sends an email (a code, or the notice below): limited per email and IP, the same for
  // a new email and one with a login, so the answer still tells nothing (D32).
  const sends = await takeAttempt('email', emailKey(community, email))
  if (sends.wait > 0) return { error: t.common.tooMany(waitMinutes(sends.wait)) }

  // Also removes a sign-up for this email that was never confirmed, so it can start again.
  const admin = createAdminClient()
  const { data: check, error: checkError } = await admin
    .rpc('join_prepare', { p_site: community.site, p_community: community.id, p_username: username, p_email: email })
    .single()
  if (checkError) return { error: t.join.failed }
  if (check.username_taken) return { error: t.join.usernameTaken }

  if (!check.user_id) {
    // Created by the server, unconfirmed: nobody can log in with it until the code is typed. The
    // trigger saves the login, the account and the consents in the same transaction.
    const { data: created, error } = await admin.auth.admin.createUser({
      email: newAuthEmail(community.site),
      password,
      email_confirm: false,
      user_metadata: { community_id: community.id, username, consents, site: community.site, login_email: email },
    })
    // A username (or email) taken a moment ago fails inside the sign-up transaction. A password
    // Supabase Auth refuses (too weak, or found in a leak) gets the same answer as on reset.
    if (error) {
      if (error.code === 'weak_password') return { error: t.reset.weakPassword }
      return { error: error.code === 'unexpected_failure' ? t.join.usernameTaken : t.join.failed }
    }
    sendCode(community, email, 'signup', await newCode(created.user.id, 'signup', await newHolder()))
    return { verifyEmail: email }
  }

  // A password guess against an existing login: the same limit as logging in. Over it, the answer is
  // the same "enter the code" step as for a new email, and no notice email goes out.
  const attempt = await takeAttempt('password', check.user_id)
  if (attempt.wait > 0) return { verifyEmail: email }
  const supabase = await createClient()
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email: check.auth_email, password })
  if (error) {
    // Same answer as a new email; the owner learns by email what happened, at most once an hour
    // (join_notice_due), so the form can't flood anyone's inbox.
    after(async () => {
      const { data: due } = await createAdminClient().rpc('join_notice_due', { p_email: emailKey(community, email) })
      if (due) await sendEmail({ to: email, fromName: community.name, site: community.site, subject: t.joinNotice.subject(community.name), text: t.joinNotice.body(community.name) })
    })
    return { verifyEmail: email }
  }

  await refundAttempt('password', attempt)
  const { error: joinError } = await supabase.rpc('join_community', { p_community: community.id, p_username: username, p_consents: consents })
  if (joinError) {
    await supabase.auth.signOut({ scope: 'local' })
    if (joinError.message.includes('members_pkey')) return { error: t.join.alreadyMember }
    if (joinError.code === '23502') return { error: t.join.consentChanged }
    return { error: joinError.code === '23505' ? t.join.usernameTaken : t.join.failed }
  }
  recordLogin(supabase, community.id, auth.user.id)
  redirect(`/${slug}/pending`)
}

// The code from the sign-up email, typed in the browser that signed up (or logged in with the right
// password). Success confirms the email and signs the person in.
export async function verifyEmailAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const email = text(form, 'email').toLowerCase()
  const token = code(form)
  if (!OTP_PATTERN.test(token)) return { verifyEmail: email, error: t.verify.badCode }
  const community = await getCommunity(slug)
  if (!community) return { verifyEmail: email, error: t.verify.badCode }
  // Codes can be guessed: 5 tries per email (and 30 per IP) in 15 minutes, and 5 per code.
  const attempt = await takeAttempt('code', emailKey(community, email))
  if (attempt.wait > 0) return { verifyEmail: email, error: t.common.tooMany(waitMinutes(attempt.wait)) }

  const admin = createAdminClient()
  const { data: login, error } = await admin
    .rpc('signup_confirm', { p_site: community.site, p_email: email, p_code: token, p_holder_hash: (await currentHolder()) ?? '' })
    .maybeSingle()
  if (error || !login) return { verifyEmail: email, error: t.verify.badCode }
  await refundAttempt('code', attempt)

  const { error: confirmError } = await admin.auth.admin.updateUserById(login.user_id, { email_confirm: true })
  const supabase = await createClient()
  // If either step fails the code is used up: logging in with the password sends a new one.
  if (confirmError || !(await signInAs(supabase, login.auth_email))) return { error: t.join.failed }
  await clearHolder()
  recordLogin(supabase, community.id, login.user_id)
  redirect(`/${slug}/pending`)
}

// "Send a new code". Only the browser that holds the sign-up gets one; every other case answers
// like a sent code, so it never reveals an account (D32).
export async function resendCodeAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = text(form, 'email').toLowerCase()
  const community = await getCommunity(text(form, 'community'))
  if (!community) return { verifyEmail: email, resent: true }
  const sends = await takeAttempt('email', emailKey(community, email))
  if (sends.wait > 0) return { verifyEmail: email, error: t.verify.wait }

  const holder = await currentHolder()
  if (holder) {
    const { data } = await createAdminClient().rpc('signup_resend', { p_site: community.site, p_email: email, p_holder_hash: holder }).maybeSingle()
    if (data) sendCode(community, email, 'signup', data.code)
  }
  return { verifyEmail: email, resent: true }
}

// Step 1 of a reset: send a code. Always answers the same, so it never tells whether an account exists.
export async function forgotPasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const typed = text(form, 'login')
  if (!typed) return { error: t.login.forgotMissing }

  const community = await getCommunity(slug)
  if (!community) return { resetFor: typed }
  const login = await findLogin(community.site, community.id, typed)
  // Limited per login whether or not it exists, so the answer still tells nothing.
  const sends = await takeAttempt('email', login ? emailKey(community, login.email) : loginKey(community, typed))
  if (sends.wait > 0) return { error: t.common.tooMany(waitMinutes(sends.wait)) }
  if (login) sendCode(community, login.email, 'reset', await newCode(login.userId, 'reset', null))
  return { resetFor: typed }
}

// Step 2: the code plus the new password. The login is looked up again, never sent to the browser.
// The code proves the email, so a sign-up that was never confirmed is confirmed here too.
export async function resetPasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const typed = text(form, 'login')
  const token = code(form)
  const password = String(form.get('password') ?? '')
  if (password.length < PASSWORD_MIN) return { resetFor: typed, error: t.join.passwordTooShort }
  if (password !== String(form.get('repeatPassword') ?? '')) return { resetFor: typed, error: t.join.passwordMismatch }
  if (!OTP_PATTERN.test(token)) return { resetFor: typed, error: t.verify.badCode }

  const community = await getCommunity(slug)
  if (!community) return { resetFor: typed, error: t.verify.badCode }
  const attempt = await takeAttempt('code', loginKey(community, typed))
  if (attempt.wait > 0) return { resetFor: typed, error: t.common.tooMany(waitMinutes(attempt.wait)) }

  const admin = createAdminClient()
  const { data: login, error } = await admin
    .rpc('reset_confirm', { p_site: community.site, p_community: community.id, p_login: typed, p_code: token })
    .maybeSingle()
  if (error || !login) return { resetFor: typed, error: t.verify.badCode }
  await refundAttempt('code', attempt)

  // The code is still open here, so a password Supabase Auth refuses (too weak, or found in a leak)
  // can be changed and sent again with the same code.
  const { error: updateError } = await admin.auth.admin.updateUserById(login.user_id, { password, email_confirm: true })
  if (updateError) return { resetFor: typed, error: updateError.code === 'weak_password' ? t.reset.weakPassword : t.join.failed }
  // Uses the code up and ends every session of the login; then this device logs in again.
  const { error: finishError } = await admin.rpc('reset_finish', { p_user: login.user_id })
  if (finishError) return { resetFor: typed, error: t.join.failed }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: login.auth_email, password })
  if (signInError) redirect(`/${slug}/login`)
  recordLogin(supabase, community.id, login.user_id)
  redirect(`/${slug}/chats`)
}

// Log out on this device. The button then loads the start page in full (not a soft navigation), so
// no page of this person's stays in the browser's memory for the next one to open with Back.
export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
}
