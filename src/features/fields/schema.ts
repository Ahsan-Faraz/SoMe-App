import type { Builtins, Choice, FieldDef, LayoutBuiltin, LayoutItem, StatusChoice } from './types'

// Pure helpers, shared by server and client.

export const activeLabels = (choices: readonly Choice[]): string[] => choices.filter((choice) => choice.active).map((choice) => choice.label)

// One person of a Status: (substatus, n), labelled "The Man", or "The Woman 2" when there are two.
// key is how answers and birth dates of this person are addressed on the client.
export type Person = { substatusId: string | null; n: number; label: string; key: string }

export const personKey = (substatusId: string | null, n: number): string => (substatusId ? `${substatusId}:${n}` : '')

// The people of a Status in order. A Status without substatuses is one person in the main section.
export function peopleOf(status: StatusChoice | undefined, substatuses: readonly Choice[]): Person[] {
  if (!status) return []
  if (status.slots.length === 0) return [{ substatusId: null, n: 0, label: '', key: '' }]
  return status.slots.flatMap((slot) => {
    const name = substatuses.find((item) => item.id === slot.substatusId)?.label ?? ''
    return Array.from({ length: slot.count }, (_, index) => ({
      substatusId: slot.substatusId,
      n: index + 1,
      label: slot.count > 1 ? `${name} ${index + 1}` : name,
      key: personKey(slot.substatusId, index + 1),
    }))
  })
}

// The fields a profile with this Status has (D4). No Status yet = no fields: it is picked first.
export function fieldsForStatus(fields: readonly FieldDef[], status: StatusChoice | undefined): FieldDef[] {
  if (!status) return []
  return fields.filter((field) => field.active && (field.statuses === null || field.statuses.includes(status.id)))
}

// The section a field shows in: the main one (person null), or this person's.
export function inSection(field: FieldDef, person: Person | null): boolean {
  if (!person || !person.substatusId) return field.substatuses === null
  return field.substatuses !== null && field.substatuses.includes(person.substatusId)
}

// One place in a profile, top to bottom: a field, or a basic field.
export type Slot = { type: 'field'; field: FieldDef } | { type: 'builtin'; key: LayoutBuiltin }

export type ProfileLayout = {
  main: Slot[] // the main section
  sections: { person: Person; slots: Slot[] }[] // one per person of the Status, in order
  mainPerson: Person | null // a Status without substatuses: one person, whose age is in the main section
}

// The profile in the community's order (layout): the basic fields it shows and the fields of this
// Status, the main section first, then each person's section with their age and their fields.
export function profileLayout(
  schema: { layout: readonly LayoutItem[]; fields: readonly FieldDef[]; builtins: Builtins; substatuses: readonly Choice[] },
  status: StatusChoice | undefined,
): ProfileLayout {
  const fields = new Map(fieldsForStatus(schema.fields, status).map((field) => [field.id, field]))
  const people = peopleOf(status, schema.substatuses)
  const mainPerson = people.find((person) => !person.substatusId) ?? null
  const slotsFor = (person: Person | null): Slot[] =>
    schema.layout.flatMap((item): Slot[] => {
      if (item.type === 'builtin') {
        if (!schema.builtins[item.key]) return []
        // Age is a person's: in their section, or in the main one for a single-person Status.
        if (item.key === 'age') return person || mainPerson ? [item] : []
        return person ? [] : [item]
      }
      const field = fields.get(item.id)
      return field && inSection(field, person) ? [{ type: 'field', field }] : []
    })

  return {
    main: slotsFor(null),
    sections: people.filter((person) => person.substatusId).map((person) => ({ person, slots: slotsFor(person) })),
    mainPerson,
  }
}

// The mock profiles (A27 swipe, until backend step 9) name their Status instead of its id.
export function statusByLabel(schema: { statuses: readonly StatusChoice[] }, label: string): StatusChoice | undefined {
  return label ? schema.statuses.find((status) => status.label === label) : undefined
}
