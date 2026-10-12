'use client'

import { htmlLang, locale, t } from '@/lib/i18n'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang={htmlLang[locale]}>
      <body>
        <main style={{ padding: 24, textAlign: 'center' }}>
          <p>{t.common.error}</p>
          <button type="button" onClick={reset}>
            {t.common.tryAgain}
          </button>
        </main>
      </body>
    </html>
  )
}
