// Profile status = profile type. It decides which profile fields are shown (see fields.ts),
// and is what "Looking for" picks from on profiles, ads and both filters.
export const STATUSES = ['Man', 'Woman', 'Other', 'Couple MF', 'Couple MM', 'Couple FF'] as const

// Until districts come from the community settings table.
export const DISTRICTS = ['Stockholm', 'Södermalm', 'Nacka', 'Solna', 'Årsta'] as const

export const MAX_STARS = 5
export const MAX_SCORE = 100
export const MAX_LINKED = 3

// "District, Place" — once when they are the same.
export function whereLabel(district: string, place: string) {
  return !place || place === district ? district : `${district}, ${place}`
}
