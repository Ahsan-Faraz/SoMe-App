'use client'

import { GrowingTextarea } from '@/components/ui/GrowingTextarea'
import { MultiSelect } from '@/components/ui/MultiSelect'
import type { FieldDef } from '@/features/fields/types'
import { t } from '@/lib/i18n'
import { FIELD_TEXT_MAX, SHORT_TEXT_MAX } from '@/lib/limits'
import type { FieldValue } from '../fields'

export const control = 'rounded-xl border border-line-strong bg-canvas px-3 text-[16px] font-normal text-ink outline-none focus:border-accent'
export const fieldLabel = 'grid gap-1.5 text-[14px] font-semibold text-ink'

// "Required" next to a field's name: it must be filled in before applying (the admin sets it).
export function RequiredTag() {
  return <span className="ml-1.5 rounded-md bg-accent/10 px-1.5 py-0.5 text-[12px] font-semibold text-accent">{t.profiles.required}</span>
}

// One schema-driven input for every field type except photo (photos are saved as they are taken).
// A retired choice stays shown while it is the saved answer, so saving again keeps it.
export function FieldInput({ field, label, value, onChange }: { field: FieldDef; label: string; value: FieldValue | undefined; onChange: (value: FieldValue) => void }) {
  const name = (
    <span>
      {label}
      {field.required ? <RequiredTag /> : null}
    </span>
  )
  const text = typeof value === 'string' ? value : ''
  const picked = Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : []
  const choices = field.choices.filter((choice) => choice.active || picked.includes(choice.id))
  switch (field.kind) {
    case 'yes_no':
      return (
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          {name}
        </label>
      )
    case 'pick_several':
      return (
        <MultiSelect
          label={label}
          tag={field.required ? <RequiredTag /> : null}
          options={choices.map((choice) => choice.id)}
          format={(id) => field.choices.find((choice) => choice.id === id)?.label ?? ''}
          value={picked}
          onChange={onChange}
          placeholder={t.profiles.choose}
        />
      )
    case 'pick_one':
      return (
        <label className={fieldLabel}>
          {name}
          <select value={text} onChange={(event) => onChange(event.target.value)} className={`${control} h-11`}>
            <option value="">{t.profiles.choose}</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'long_text':
      return (
        <label className={fieldLabel}>
          {name}
          <GrowingTextarea value={text} onChange={(event) => onChange(event.target.value)} maxLength={field.maxLength ?? FIELD_TEXT_MAX} className={`${control} py-2.5 leading-normal`} />
        </label>
      )
    case 'date':
      return (
        <label className={fieldLabel}>
          {name}
          <input type="date" value={text} onChange={(event) => onChange(event.target.value)} className={`${control} h-11`} />
        </label>
      )
    case 'number':
      return (
        <label className={fieldLabel}>
          {name}
          <input inputMode="decimal" value={text} onChange={(event) => onChange(event.target.value.replace(/[^\d.,-]/g, ''))} className={`${control} h-11`} />
        </label>
      )
    case 'photo':
      return null
    default:
      return (
        <label className={fieldLabel}>
          {name}
          <input value={text} maxLength={field.maxLength ?? SHORT_TEXT_MAX} onChange={(event) => onChange(event.target.value)} className={`${control} h-11`} />
        </label>
      )
  }
}
