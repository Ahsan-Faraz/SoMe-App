// A DM button: opens the DM with that person. The DM page goes to the existing DM, or starts one on
// the first message (open_dm), so a profile needs no extra lookup to show the button.
export function dmHref(community: string, userId: string): string {
  return `/${community}/chats/dm/${userId}`
}
