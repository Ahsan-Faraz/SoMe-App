import { t } from '@/lib/i18n'

// The line under every image in the app (client feedback 261111): "✓ Taken in app · 6 Oct 2026,
// 21:09" for an in-app camera photo, "Uploaded · 6 Oct 2026, 21:09" for a gallery one. `date` is
// already formatted (formatStamp); without one only the kind shows.
export function photoLabel(takenInApp: boolean, date?: string | null): string {
  const kind = takenInApp ? `✓ ${t.chats.takenInApp}` : t.chats.uploaded
  return date ? `${kind} · ${date}` : kind
}

// The label's text style: an in-app photo stands out, an upload is plain.
export const photoLabelClass = (takenInApp: boolean) => (takenInApp ? 'font-semibold text-accent' : 'text-muted')
