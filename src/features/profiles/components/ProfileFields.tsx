'use client'

import { useState } from 'react'
import { t } from '@/lib/i18n'

const days = ['Tue', 'Sun']

export function ProfileFields({ own, about, status, headline }: { own: boolean; about: string; status: string; headline: string }) {
  const [text, setText] = useState(about)
  const [bike, setBike] = useState(true)
  const [kind, setKind] = useState('Gravel')
  const [years, setYears] = useState('4')
  const [picked, setPicked] = useState<string[]>(['Tue'])
  const [area, setArea] = useState('South of the city')

  if (!own) {
    return (
      <dl className="mt-6 grid gap-4 min-[52rem]:mt-0">
        <Field label={t.profiles.text} value={about || '—'} />
        <Field label={t.profiles.checkbox} value={t.profiles.yes} />
        <Field label={t.profiles.select} value="Gravel" />
        <Field label={t.profiles.number} value="4" />
        <Field label={t.profiles.multi} value="Tue" />
        <Field label={t.profiles.area} value="South of the city" />
        <Field label={t.profiles.status} value={status} />
        <Field label={t.profiles.headline} value={headline} />
      </dl>
    )
  }

  return (
    <form className="mt-6 grid gap-4 min-[52rem]:mt-0" onSubmit={(event) => event.preventDefault()}>
      <label className="grid gap-1.5 text-[14px] font-semibold text-ink">
        {t.profiles.text}
        <input value={text} onChange={(event) => setText(event.target.value)} className="h-11 rounded-xl border border-black/15 bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent" />
      </label>
      <label className="flex items-center gap-2 text-[15px]">
        <input type="checkbox" checked={bike} onChange={(event) => setBike(event.target.checked)} />
        {t.profiles.checkbox}
      </label>
      <label className="grid gap-1.5 text-[14px] font-semibold text-ink">
        {t.profiles.select}
        <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-11 rounded-xl border border-black/15 bg-canvas px-3 text-[16px] font-normal text-ink">
          <option>Gravel</option>
          <option>Road</option>
          <option>MTB</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-[14px] font-semibold text-ink">
        {t.profiles.number}
        <input inputMode="numeric" value={years} onChange={(event) => setYears(event.target.value)} className="h-11 rounded-xl border border-black/15 bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent" />
      </label>
      <fieldset className="text-[15px]">
        <legend className="mb-1.5 text-[14px] font-semibold text-ink">{t.profiles.multi}</legend>
        {days.map((day) => (
          <label key={day} className="mr-4 inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={picked.includes(day)}
              onChange={() => setPicked((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day]))}
            />
            {day}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1.5 text-[14px] font-semibold text-ink">
        {t.profiles.area}
        <textarea value={area} onChange={(event) => setArea(event.target.value)} rows={3} className="rounded-xl border border-black/15 bg-canvas px-3 py-2 text-[16px] font-normal text-ink outline-none focus:border-accent" />
      </label>
      <Field label={t.profiles.status} value={status} />
      <label className="grid gap-1.5 text-[14px] font-semibold text-ink">
        {t.profiles.headline}
        <input defaultValue={headline} className="h-11 rounded-xl border border-black/15 bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent" />
      </label>
    </form>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[14px] font-semibold text-ink">{label}</dt>
      <dd className="mt-0.5 text-[16px] text-ink-soft">{value}</dd>
    </div>
  )
}
