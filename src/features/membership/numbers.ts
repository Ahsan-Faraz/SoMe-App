// Whole numbers only, as the profile-state fields are summed in the statistics.
export function wholeNumber(value: string) {
  return value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '')
}
