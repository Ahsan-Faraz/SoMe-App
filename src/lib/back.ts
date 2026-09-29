// "?back=" lets a screen return to where it was opened from (a chat, group info…).
// Only paths inside the current community are accepted, never another site.
export function backFrom(value: string | string[] | undefined, community: string, fallback: string): string {
  const back = Array.isArray(value) ? value[0] : value
  return back?.startsWith(`/${community}/`) && !back.startsWith('//') ? back : fallback
}
