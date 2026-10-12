import type { Choice, FieldDef, ProfileSchema, StatusChoice } from './types'

// Pure helpers, shared by server and client.

export const activeLabels = (choices: readonly Choice[]): string[] => choices.filter((choice) => choice.active).map((choice) => choice.label)

// The fields a profile with this Status has (D4). No Status yet = no fields: it is picked first.
export function fieldsForStatus(fields: readonly FieldDef[], status: StatusChoice | undefined): FieldDef[] {
  if (!status) return []
  return fields.filter((field) => field.active && (field.statuses === null || field.statuses.includes(status.id)))
}

// Status is still stored as its label on the mock profiles; step 3 stores the choice id.
export function statusByLabel(schema: Pick<ProfileSchema, 'statuses'>, label: string): StatusChoice | undefined {
  return label ? schema.statuses.find((status) => status.label === label) : undefined
}
