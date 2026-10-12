// The Status and District lists are the community's own, from the profile builder (features/fields).

export const MAX_STARS = 5
export const MAX_SCORE = 100
export const MAX_LINKED = 3

// "District, Place" — once when they are the same.
export function whereLabel(district: string, place: string) {
  return !place || place === district ? district : `${district}, ${place}`
}
