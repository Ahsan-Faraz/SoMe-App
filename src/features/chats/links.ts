// A DM button: the existing DM with that person, or a new DM with them (the chat is made on the first message).
export function dmHref(community: string, userId: string, chatId: string | null): string {
  return chatId ? `/${community}/chats/${chatId}` : `/${community}/chats/dm/${userId}`
}
