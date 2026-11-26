'use server'

import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { getCommunity } from '@/features/communities/queries'
import type { Community } from '@/features/communities/types'
import { getUserId } from '@/lib/auth/dal'
import { clearHolder, currentHolder, findLogin, newAuthEmail, newCode, newHolder, NO_COMMUNITY, signInAs } from '@/lib/auth/logins'
import { sendEmail } from '@/lib/email'
import { t } from '@/lib/i18n'
import { OTP_PATTERN, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@/lib/limits'
import { refundAttempt, takeAttempt, waitMinutes } from '@/lib/rate-limit'
import { requestSite, requestSiteName } from '@/lib/sites'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Logins are per site (domain): the same email is a separate login, with its own password, on
// theirl.net and on aiproduktion.se (lib/auth/logins.ts). The site is the community's, never the
// browser's word. Emails carry a 6-digit code typed into the app, not a link: on a phone the link
// would open the browser, which on iOS does not share the installed PWA's login. The codes are ours
// and go out through Brevo after the response; Supabase Auth sends no email.
// The main domain has its own log in and join (/login, /join, client guide 261123): the same actions
// with no community in the form. Such a login has no community yet; it picks one on /communities.
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

// Where a form was sent from: a community's pages, or the main domain's own (no community). The
// emails carry the community's name, or the domain's.
type Place = { site: string; name: string; communityId: string | null; slug: string | null }

async function placeOf(slug: string): Promise<Place | null> {
  if (!slug) return { site: await requestSite(), name: await requestSiteName(), communityId: null, slug: null }
  const community = await getCommunity(slug)
  return community ? { site: community.site, name: community.name, communityId: community.id, slug } : null
}

// Where a login lands: its community's page, or the community list on the main domain.
const landing = (place: Place, page: 'chats' | 'pending' | 'login') =>
  place.slug ? `/${place.slug}/${page}` : page === 'login' ? '/login' : '/communities'

// Limits are counted per site, so the same email on another domain has its own.
const emailKey = (place: { site: string }, email: string) => `${place.site}:${email}`
const loginKey = (place: Place, login: string) => `${place.communityId ?? place.site}:${login}`

// A code email, after the response: the answer never waits for (or tells about) the email.
function sendCode(place: { site: string; name: string }, to: string, kind: 'signup' | 'reset', value: string | null) {
  if (!value) return
  after(() =>
    sendEmail({
      to,
      fromName: place.name,
      site: place.site,
      subject: kind === 'signup' ? t.codeEmail.signupSubject(value, place.name) : t.codeEmail.resetSubject(value),
      text: kind === 'signup' ? t.codeEmail.signupBody(value, place.name) : t.codeEmail.resetBody(value, place.name),
    }),
  )
}

// Someone tried to join with an email that has a login, with a wrong password: the owner learns by
// email, at most once an hour (join_notice_due), so the form can't flood anyone's inbox.
function sendJoinNotice(place: { site: string; name: string }, email: string) {
  after(async () => {
    const { data: due } = await createAdminClient().rpc('join_notice_due', { p_email: emailKey(place, email) })
    if (due) await sendEmail({ to: email, fromName: place.name, site: place.site, subject: t.joinNotice.subject(place.name), text: t.joinNotice.body(place.name) })
  })
}

// The password was right but the email isn't confirmed: this browser becomes the sign-up's holder
// and gets a fresh code, unless the email had its share of emails this hour.
async function startConfirm(place: Place, userId: string, email: string): Promise<AuthState> {
  const holder = await newHolder()
  if ((await takeAttempt('email', emailKey(place, email))).wait === 0) sendCode(place, email, 'signup', await newCode(userId, 'signup', holder))
  return { verifyEmail: email }
}

// Log in (AB) with username or email; on the main domain with email only (usernames are per
// community). Every failure before the password is proven gives one message.
export async function signInAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const typed = text(form, 'login')
  const password = String(form.get('password') ?? '')
  if (!typed || !password) return { error: slug ? t.login.missing : t.login.missingEmail }

  const failed = { error: slug ? t.login.failed : t.login.failedEmail }
  const place = await placeOf(slug)
  if (!place) return failed
  const login = await findLogin(place.site, place.communityId, typed)
  // Counted per login (or the typed name when there is none) and per IP, also for a login that
  // doesn't exist, so the limit tells nothing about which accounts exist.
  const attempt = await takeAttempt('password', login?.userId ?? loginKey(place, typed))
  if (attempt.wait > 0) return { error: t.common.tooMany(waitMinutes(attempt.wait)) }
  if (!login) return failed

  const supabase = await createClient()
  const { data: auth, error } = await supabase.auth.signInWithPassword({ email: login.authEmail, password })
  if (error?.code === 'email_not_confirmed') {
    // The password is right, so it is safe to show the email and send a fresh code.
    await refundAttempt('password', attempt)
    return startConfirm(place, login.userId, login.email)
  }
  if (error) return failed
  await refundAttempt('password', attempt)
  // The main domain: the login picks its community next.
  if (!place.communityId) redirect('/communities')

  const { data: member } = await supabase
    .from('members')
    .select('state')
    .eq('community_id', place.communityId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  // A login of this site with no account here yet (made on the main domain, or in another community):
  // the password is proven, so it stays logged in and goes to the join form, which then asks only for
  // a username and the consents. Nothing joins it without that form.
  if (!member) redirect(`/${slug}/join`)
  if (member.state === 'rejected' || member.state === 'removed') {
    await supabase.auth.signOut({ scope: 'local' })
    return failed
  }

  recordLogin(supabase, place.communityId, auth.user.id)
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

const checkUsername = (username: string) =>
  username.length < USERNAME_MIN || username.length > USERNAME_MAX ? t.join.usernameLength : username.includes('@') ? t.join.usernameAt : null

function checkNewLogin(form: FormData, email: string, password: string) {
  if (password.length < PASSWORD_MIN) return t.join.passwordTooShort
  if (password !== String(form.get('repeatPassword') ?? '')) return t.join.passwordMismatch
  if (!email.includes('@')) return t.join.emailInvalid
  return null
}

// The consents the join form ticked: the privacy terms always, "18 or older" when the community asks.
// The version of the text the form showed must be the current one; a newer one means agreeing to
// text not yet seen.
type Consents = Record<string, string | boolean>
function consentsFrom(community: Community, form: FormData): { value: Consents } | { error: string } {
  if (form.get('privacy') !== 'on' || (community.requireAge18 && form.get('age18') !== 'on')) return { error: t.join.consentMissing }
  if (text(form, 'privacyVersion') !== community.privacyVersion) return { error: t.join.consentChanged }
  return { value: { privacy: community.privacyVersion, ...(community.requireAge18 ? { age_18: true } : {}) } }
}

// An account in the community for the logged-in login (join_community; the database checks the
// login's site). The error to show, or null.
async function joinCommunity(supabase: Awaited<ReturnType<typeof createClient>>, communityId: string, username: string, consents: Consents) {
  const { error } = await supabase.rpc('join_community', { p_community: communityId, p_username: username, p_consents: consents })
  if (!error) return null
  if (error.message.includes('members_pkey')) return t.join.alreadyMember
  if (error.code === '23502') return t.join.consentChanged
  return error.code === '23505' ? t.join.usernameTaken : t.join.failed
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

  const invalid = checkUsername(username) ?? checkNewLogin(form, email, password)
  if (invalid) return { error: invalid }

  const community = await getCommunity(slug)
  if (!community) return { error: t.join.failed }
  const consents = consentsFrom(community, form)
  if ('error' in consents) return consents

  // Every join sends an email (a code, or the notice): limited per email and IP, the same for a new
  // email and one with a login, so the answer still tells nothing (D32).
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
      user_metadata: { community_id: community.id, username, consents: consents.value, site: community.site, login_email: email },
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
    // Same answer as a new email; the owner learns by email what happened.
    sendJoinNotice(community, email)
    return { verifyEmail: email }
  }

  await refundAttempt('password', attempt)
  const joinError = await joinCommunity(supabase, community.id, username, consents.value)
  if (joinError) {
    await supabase.auth.signOut({ scope: 'local' })
    return { error: joinError }
  }
  recordLogin(supabase, community.id, auth.user.id)
  redirect(`/${slug}/pending`)
}

// Join a community while logged in (picked on /communities, or its Join page opened while logged
// in): only a username for this community and the consents, as the login already exists.
export async function joinSignedInAction(_: AuthState, form: FormData): Promise<AuthState> {
  const slug = text(form, 'community')
  const username = text(form, 'username')
  const invalid = checkUsername(username)
  if (invalid) return { error: invalid }

  const [community, userId] = await Promise.all([getCommunity(slug), getUserId()])
  if (!community) return { error: t.join.failed }
  if (!userId) redirect(`/${slug}/join`)
  const consents = consentsFrom(community, form)
  if ('error' in consents) return consents

  const supabase = await createClient()
  const joinError = await joinCommunity(supabase, community.id, username, consents.value)
  if (joinError) return { error: joinError }
  recordLogin(supabase, community.id, userId)
  redirect(`/${slug}/pending`)
}

// Join on the main domain (/join): a login for this site with no community yet; it picks one on
// /communities. Same rules as joinAction: a new email gets a code, an email that has a login must use
// its password, and the answer never tells which (D32).
export async function siteJoinAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = text(form, 'email').toLowerCase()
  const password = String(form.get('password') ?? '')
  const invalid = checkNewLogin(form, email, password)
  if (invalid) return { error: invalid }

  const site = await requestSite()
  const place = { site, name: await requestSiteName() }
  const sends = await takeAttempt('email', emailKey(place, email))
  if (sends.wait > 0) return { error: t.common.tooMany(waitMinutes(sends.wait)) }

  // Also removes a sign-up for this email that was never confirmed, so it can start again.
  const admin = createAdminClient()
  const { data: found, error: findError } = await admin.rpc('site_join_prepare', { p_site: site, p_email: email }).maybeSingle()
  if (findError) return { error: t.join.failed }

  if (!found) {
    // No community is given, so the sign-up trigger makes only the login row.
    const { data: created, error } = await admin.auth.admin.createUser({
      email: newAuthEmail(site),
      password,
      email_confirm: false,
      user_metadata: { site, login_email: email },
    })
    if (error) return { error: error.code === 'weak_password' ? t.reset.weakPassword : t.join.failed }
    sendCode(place, email, 'signup', await newCode(created.user.id, 'signup', await newHolder()))
    return { verifyEmail: email }
  }

  const attempt = await takeAttempt('password', found.user_id)
  if (attempt.wait > 0) return { verifyEmail: email }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: found.auth_email, password })
  if (error) {
    sendJoinNotice(place, email)
    return { verifyEmail: email }
  }
  await refundAttempt('password', attempt)
  redirect('/communities')
}

// The code from the sign-up email, typed in the browser that signed up (or logged in with the right
// password). Success confirms the email and signs the person in.
export async function verifyEmailAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = text(form, 'email').toLowerCase()
  const token = code(form)
  if (!OTP_PATTERN.test(token)) return { verifyEmail: email, error: t.verify.badCode }
  const place = await placeOf(text(form, 'community'))
  if (!place) return { verifyEmail: email, error: t.verify.badCode }
  // Codes can be guessed: 5 tries per email (and 30 per IP) in 15 minutes, and 5 per code.
  const attempt = await takeAttempt('code', emailKey(place, email))
  if (attempt.wait > 0) return { verifyEmail: email, error: t.common.tooMany(waitMinutes(attempt.wait)) }

  const admin = createAdminClient()
  const { data: login, error } = await admin
    .rpc('signup_confirm', { p_site: place.site, p_email: email, p_code: token, p_holder_hash: (await currentHolder()) ?? '' })
    .maybeSingle()
  if (error || !login) return { verifyEmail: email, error: t.verify.badCode }
  await refundAttempt('code', attempt)

  const { error: confirmError } = await admin.auth.admin.updateUserById(login.user_id, { email_confirm: true })
  const supabase = await createClient()
  // If either step fails the code is used up: logging in with the password sends a new one.
  if (confirmError || !(await signInAs(supabase, login.auth_email))) return { error: t.join.failed }
  await clearHolder()
  if (place.communityId) recordLogin(supabase, place.communityId, login.user_id)
  redirect(landing(place, 'pending'))
}

// "Send a new code". Only the browser that holds the sign-up gets one; every other case answers
// like a sent code, so it never reveals an account (D32).
export async function resendCodeAction(_: AuthState, form: FormData): Promise<AuthState> {
  const email = text(form, 'email').toLowerCase()
  const place = await placeOf(text(form, 'community'))
  if (!place) return { verifyEmail: email, resent: true }
  const sends = await takeAttempt('email', emailKey(place, email))
  if (sends.wait > 0) return { verifyEmail: email, error: t.verify.wait }

  const holder = await currentHolder()
  if (holder) {
    const { data } = await createAdminClient().rpc('signup_resend', { p_site: place.site, p_email: email, p_holder_hash: holder }).maybeSingle()
    if (data) sendCode(place, email, 'signup', data.code)
  }
  return { verifyEmail: email, resent: true }
}

// Step 1 of a reset: send a code. Always answers the same, so it never tells whether an account exists.
export async function forgotPasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const typed = text(form, 'login')
  if (!typed) return { error: t.login.forgotMissing }

  const place = await placeOf(text(form, 'community'))
  if (!place) return { resetFor: typed }
  const login = await findLogin(place.site, place.communityId, typed)
  // Limited per login whether or not it exists, so the answer still tells nothing.
  const sends = await takeAttempt('email', login ? emailKey(place, login.email) : loginKey(place, typed))
  if (sends.wait > 0) return { error: t.common.tooMany(waitMinutes(sends.wait)) }
  if (login) sendCode(place, login.email, 'reset', await newCode(login.userId, 'reset', null))
  return { resetFor: typed }
}

// Step 2: the code plus the new password. The login is looked up again, never sent to the browser.
// The code proves the email, so a sign-up that was never confirmed is confirmed here too.
export async function resetPasswordAction(_: AuthState, form: FormData): Promise<AuthState> {
  const typed = text(form, 'login')
  const token = code(form)
  const password = String(form.get('password') ?? '')
  if (password.length < PASSWORD_MIN) return { resetFor: typed, error: t.join.passwordTooShort }
  if (password !== String(form.get('repeatPassword') ?? '')) return { resetFor: typed, error: t.join.passwordMismatch }
  if (!OTP_PATTERN.test(token)) return { resetFor: typed, error: t.verify.badCode }

  const place = await placeOf(text(form, 'community'))
  if (!place) return { resetFor: typed, error: t.verify.badCode }
  const attempt = await takeAttempt('code', loginKey(place, typed))
  if (attempt.wait > 0) return { resetFor: typed, error: t.common.tooMany(waitMinutes(attempt.wait)) }

  const admin = createAdminClient()
  const { data: login, error } = await admin
    .rpc('reset_confirm', { p_site: place.site, p_community: place.communityId ?? NO_COMMUNITY, p_login: typed, p_code: token })
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
  if (signInError) redirect(landing(place, 'login'))
  if (place.communityId) recordLogin(supabase, place.communityId, login.user_id)
  redirect(landing(place, 'chats'))
}

// Log out on this device. The button then loads the start page in full (not a soft navigation), so
// no page of this person's stays in the browser's memory for the next one to open with Back.
export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
}
