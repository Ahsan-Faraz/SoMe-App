import 'server-only'

// Emails the app sends itself (docs/backend-design.md §9): "You are approved". Sent through Brevo's
// API (EU), the same provider as Supabase Auth's SMTP. Login emails (codes) are Supabase Auth's.
// Needs BREVO_API_KEY and EMAIL_FROM (a sender address verified in Brevo). Without them nothing is
// sent and the server log says so: the approval itself never depends on the email.

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const TIMEOUT_MS = 10_000

export type Email = { to: string; subject: string; text: string; fromName: string }

export async function sendEmail({ to, subject, text, fromName }: Email): Promise<boolean> {
  const key = process.env.BREVO_API_KEY
  const from = process.env.EMAIL_FROM
  if (!key || !from) {
    console.warn('Email not sent: BREVO_API_KEY or EMAIL_FROM is not set')
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
