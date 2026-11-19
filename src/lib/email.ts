import 'server-only'

// Every email the app sends (docs/backend-design.md §9): the sign-up and reset codes, the join
// notice and "You are approved". Sent through Brevo's API (EU). Supabase Auth sends none.
// Needs BREVO_API_KEY and a sender address verified in Brevo: EMAIL_FROM, or one per site in
// SITE_SENDERS="theirl=noreply@theirl.net,aiproduktion=noreply@aiproduktion.se" (lib/sites.ts), so
// each domain's email comes from that domain. Without them nothing is sent and the server log says
// so: an approval never depends on the email.

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const TIMEOUT_MS = 10_000

// site: the site of the community the email is about (communities.site).
export type Email = { to: string; subject: string; text: string; fromName: string; site: string }

// Read once per server instance. An entry that isn't "site=address" is skipped.
const senders = new Map(
  (process.env.SITE_SENDERS ?? '')
    .split(',')
    .map((entry) => entry.split('=').map((part) => part.trim().toLowerCase()))
    .filter((pair): pair is [string, string] => pair.length === 2 && Boolean(pair[0]) && Boolean(pair[1]?.includes('@'))),
)

export async function sendEmail({ to, subject, text, fromName, site }: Email): Promise<boolean> {
  const key = process.env.BREVO_API_KEY
  const from = senders.get(site) ?? process.env.EMAIL_FROM
  if (!key || !from) {
    console.warn('Email not sent: BREVO_API_KEY or a sender (EMAIL_FROM, SITE_SENDERS) is not set')
    return false
  }
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { email: from, name: fromName }, to: [{ email: to }], subject, textContent: text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) console.error(`Email not sent: Brevo answered ${response.status}`)
    return response.ok
  } catch (error) {
    console.error('Email not sent:', error instanceof Error ? error.message : error)
    return false
  }
}
