'use client'

import { Fragment, useOptimistic, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { profileLayout, type Person, type Slot } from '@/features/fields/schema'
import type { ProfileSchema } from '@/features/fields/types'
import { todayKey } from '@/lib/format'
import { t } from '@/lib/i18n'
import { PLACE_MAX } from '@/lib/limits'
import { saveProfileAction, setStatusAction, setVisibleAction, type ProfileInput } from '../actions'
import { valueKey, type FieldValue } from '../fields'
import type { Owner } from '../photo'
import { missingRequired } from '../required'
import type { Profile } from '../types'
import { control, FieldInput, fieldLabel, RequiredTag } from './FieldInput'
import { PhotoField } from './PhotoField'
import type { BuiltinNodes } from './ProfileAnswers'

const hint = 'text-[13px] font-normal text-muted'

type Editable = Pick<Profile, 'state' | 'statusId' | 'status' | 'lookingForIds' | 'countryId' | 'districtId' | 'place' | 'people' | 'visibleInSearch' | 'values' | 'photoValues'>
type Lists = Pick<ProfileSchema, 'statuses' | 'substatuses' | 'countries' | 'districts' | 'builtins' | 'layout' | 'fields'>

// B1, your own profile. Status sits at the top because it decides which fields the profile has (D4);
// it is picked once. Then the profile in the community's order, as one form saved in one call: the
// main section, then a section per person of the Status with their birth date and the fields set for
// their substatus. `nodes` are the basic fields that are not form inputs (the image, the score, linked
// profiles), server-rendered and placed in order. The score is recomputed by the database.
// Before applying, required fields are marked and the ones still empty (as saved) are listed.
export function ProfileEditor({ owner, profile, lists, facts, nodes }: { owner: Owner; profile: Editable; lists: Lists; facts: ReactNode; nodes: BuiltinNodes }) {
  const [message, setMessage] = useState('')
  // The form is a draft of the saved profile: a newer save (fresh props) opens it fresh.
  const version = JSON.stringify([profile.statusId, profile.lookingForIds, profile.countryId, profile.districtId, profile.place, profile.people, profile.values])
  const missing = profile.state === 'profile' ? missingRequired(lists, profile) : []

  return (
    <>
      <div className="mb-6 grid gap-4 rounded-2xl bg-sunken p-4">
        <StatusField slug={owner.slug} statusId={profile.statusId} status={profile.status} statuses={lists.statuses} />
        {lists.builtins.visibility ? <VisibleToggle slug={owner.slug} visible={profile.visibleInSearch} /> : null}
        {facts}
        {missing.length > 0 ? <MissingFields missing={missing} /> : null}
      </div>
      {profile.statusId ? (
        <EditForm key={version} owner={owner} profile={profile} lists={lists} nodes={nodes} message={message} setMessage={setMessage} />
      ) : (
        // Before the Status is set only the parts that need no Status are shown (e.g. the image).
        <div className="grid gap-5">
          {profileLayout(lists, undefined).main.map((slot) => (slot.type === 'builtin' ? <Fragment key={slot.key}>{nodes[slot.key]}</Fragment> : null))}
          <p className="rounded-2xl border-2 border-dashed border-line-strong p-4 text-[15px] text-muted">{t.profiles.statusFirst}</p>
        </div>
      )}
    </>
  )
}

// Before applying: what still has to be filled in (Status first, then each required field).
function MissingFields({ missing }: { missing: string[] }) {
  return (
    <div role="status" className="rounded-xl border border-accent/40 bg-canvas p-3 text-[14px]">
      <p className="font-semibold">{t.apply.missingFields}</p>
      <ul className="mt-1 list-disc pl-5 text-ink-soft">
        {missing.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  )
}

// Picked once ("Set status"); after that it is shown locked: only the community admin changes it (A21).
function StatusField({ slug, statusId, status, statuses }: { slug: string; statusId: string | null; status: string; statuses: Lists['statuses'] }) {
  const [choice, setChoice] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  if (statusId) {
    return (
      <div className={fieldLabel}>
        <span>{t.profiles.status}</span>
        <p className="flex h-11 items-center gap-2 text-[16px] font-normal">
          <Icon name="lock" className="size-4 text-muted" />
          {status}
        </p>
        <span className={hint}>{t.profiles.statusLocked}</span>
      </div>
    )
  }

  return (
    <div className="grid gap-1.5">
      <label className={fieldLabel}>
        <span>
          {t.profiles.statusChoose}
          <RequiredTag />
        </span>
        <select value={choice} onChange={(event) => setChoice(event.target.value)} className={`${control} h-11`}>
          <option value="" disabled>
            {t.profiles.choose}
          </option>
          {statuses
            .filter((item) => item.active)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
        </select>
      </label>
      <span className={hint}>
        {t.profiles.statusHint} {t.profiles.statusOnce}
      </span>
      <button
        type="button"
        disabled={!choice || pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setStatusAction(slug, choice)
            setError(result?.error ?? '')
          })
        }
        className={`${buttonClass('primary')} mt-1 disabled:opacity-40`}
      >
        {pending ? t.profiles.saving : t.profiles.statusConfirm}
      </button>
      {error ? <p className="text-[14px] text-danger">{error}</p> : null}
    </div>
  )
}

// D22: saved as soon as it is toggled; shown at once, back to the saved value if the save fails.
function VisibleToggle({ slug, visible }: { slug: string; visible: boolean }) {
  const [shown, setShown] = useOptimistic(visible)
  const [, startTransition] = useTransition()
  return (
    <label className="flex min-h-11 items-center gap-2.5 text-[15px] font-semibold">
      <input
        type="checkbox"
        checked={shown}
        onChange={(event) => {
          const next = event.target.checked
          startTransition(async () => {
            setShown(next)
            await setVisibleAction(slug, next)
          })
        }}
      />
      {t.profiles.visibleInSearch}
    </label>
  )
}

type Draft = { lookingFor: string[]; countryId: string; districtId: string; place: string; birthDates: Record<string, string>; values: Record<string, FieldValue> }

function EditForm({
  owner,
  profile,
  lists,
  nodes,
  message,
  setMessage,
}: {
  owner: Owner
  profile: Editable
  lists: Lists
  nodes: BuiltinNodes
  message: string
  setMessage: (message: string) => void
}) {
  const { builtins } = lists
  const layout = profileLayout(lists, lists.statuses.find((item) => item.id === profile.statusId))
  const people = [...(layout.mainPerson ? [layout.mainPerson] : []), ...layout.sections.map((section) => section.person)]
  const activeCountries = lists.countries.filter((country) => country.active || country.id === profile.countryId)
  const savedBirth = (person: Person) => profile.people.find((item) => item.substatusId === person.substatusId && item.n === person.n)?.birthDate ?? ''

  const [draft, setDraft] = useState<Draft>(() => ({
    lookingFor: profile.lookingForIds,
    // One country to choose from: it is picked already.
    countryId: profile.countryId ?? (activeCountries.length === 1 ? (activeCountries[0]?.id ?? '') : ''),
    districtId: profile.districtId ?? '',
    place: profile.place,
    birthDates: Object.fromEntries(people.map((person) => [person.key, savedBirth(person)])),
    values: profile.values,
  }))
  const [pending, startTransition] = useTransition()

  const statusIds = lists.statuses.filter((item) => item.active || draft.lookingFor.includes(item.id)).map((item) => item.id)
  const districts = lists.districts.filter(
    (district) => (district.active || district.id === profile.districtId) && (!builtins.country || district.countryId === draft.countryId),
  )

  const edit = (change: Partial<Draft>) => {
    setMessage('')
    setDraft((current) => ({ ...current, ...change }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    // Only answers that changed are sent: an untouched field keeps its answer (or stays unanswered).
    const sections: { person: Person | null; slots: Slot[] }[] = [{ person: null, slots: layout.main }, ...layout.sections]
    const values: ProfileInput['values'] = sections.flatMap(({ person, slots }) =>
      slots.flatMap((slot) => {
        if (slot.type !== 'field' || slot.field.kind === 'photo') return []
        const key = valueKey(slot.field.id, person?.key ?? '')
        const value = draft.values[key]
        if (value === undefined || JSON.stringify(value) === JSON.stringify(profile.values[key])) return []
        return [{ fieldId: slot.field.id, substatusId: person?.substatusId ?? null, n: person?.n ?? 0, value }]
      }),
    )
    startTransition(async () => {
      const result = await saveProfileAction(owner.slug, {
        lookingFor: draft.lookingFor,
        countryId: draft.countryId || null,
        districtId: draft.districtId || null,
        place: draft.place,
        birthDates: builtins.age ? people.map((person) => ({ substatusId: person.substatusId, n: person.n, date: draft.birthDates[person.key] ?? '' })) : [],
        values,
      })
      setMessage(result?.error ?? t.profiles.saved)
    })
  }

  // One place in the profile, as an input (or the server-rendered node for the image, score, links).
  const render = (slot: Slot, person: Person | null) => {
    if (slot.type === 'field') {
      const key = valueKey(slot.field.id, person?.key ?? '')
      return slot.field.kind === 'photo' ? (
        <PhotoField
          key={key}
          owner={owner}
          field={slot.field}
          person={{ substatusId: person?.substatusId ?? null, n: person?.n ?? 0 }}
          label={slot.field.label}
          photo={profile.photoValues[key] ?? null}
        />
      ) : (
        <FieldInput key={key} field={slot.field} label={slot.field.label} value={draft.values[key]} onChange={(value) => edit({ values: { ...draft.values, [key]: value } })} />
      )
    }
    switch (slot.key) {
      case 'age': {
        const who = person ?? layout.mainPerson
        if (!who) return null
        return (
          <label key="age" className={fieldLabel}>
            {t.profiles.birthDate}
            <input
              type="date"
              value={draft.birthDates[who.key] ?? ''}
              max={todayKey()}
              onChange={(event) => edit({ birthDates: { ...draft.birthDates, [who.key]: event.target.value } })}
              className={`${control} h-11`}
            />
          </label>
        )
      }
      case 'lookingFor':
        return (
          <MultiSelect
            key="lookingFor"
            label={t.profiles.lookingFor}
            options={statusIds}
            format={(id) => lists.statuses.find((item) => item.id === id)?.label ?? ''}
            value={draft.lookingFor}
            onChange={(lookingFor) => edit({ lookingFor })}
            placeholder={t.profiles.choose}
          />
        )
      case 'country':
        return (
          <label key="country" className={fieldLabel}>
            {t.profiles.country}
            <select
              value={draft.countryId}
              onChange={(event) => {
                const countryId = event.target.value
                // A district belongs to one country: picking another country clears it.
                const keep = lists.districts.some((district) => district.id === draft.districtId && district.countryId === countryId)
                edit({ countryId, districtId: keep ? draft.districtId : '' })
              }}
              className={`${control} h-11`}
            >
              <option value="">{t.profiles.choose}</option>
              {activeCountries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.label}
                </option>
              ))}
            </select>
          </label>
        )
      case 'district':
        return (
          <label key="district" className={fieldLabel}>
            {t.profiles.district}
            <select value={draft.districtId} onChange={(event) => edit({ districtId: event.target.value })} className={`${control} h-11`} disabled={builtins.country && !draft.countryId}>
              <option value="">{t.profiles.choose}</option>
              {districts.map((district) => (
                <option key={district.id} value={district.id}>
                  {district.label}
                </option>
              ))}
            </select>
          </label>
        )
      case 'place':
        return (
          <label key="place" className={fieldLabel}>
            {t.profiles.place}
            <input value={draft.place} maxLength={PLACE_MAX} onChange={(event) => edit({ place: event.target.value })} className={`${control} h-11`} />
          </label>
        )
      default:
        return <Fragment key={slot.key}>{nodes[slot.key]}</Fragment>
    }
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      {layout.main.map((slot) => render(slot, null))}
      {layout.sections.map(({ person, slots }) => (
        <fieldset key={person.key} className="mt-2 grid gap-5">
          {layout.sections.length > 1 ? <legend className="mb-1 w-full border-b border-line pb-1 text-[17px] font-bold">{person.label}</legend> : null}
          {slots.map((slot) => render(slot, person))}
        </fieldset>
      ))}
      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 bg-canvas px-1 py-3">
        <button type="submit" disabled={pending} className={`${buttonClass('primary')} flex-1 disabled:opacity-40`}>
          {pending ? t.profiles.saving : t.profiles.save}
        </button>
        <p role="status" className={`text-[14px] ${message === t.profiles.saved ? 'text-accent' : 'text-danger'}`}>
          {pending ? '' : message}
        </p>
      </div>
    </form>
  )
}
