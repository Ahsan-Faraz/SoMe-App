import 'server-only'
import { mockGroupMembers, mockGroups, mockInfoPosts, mockProfiles } from '@/mocks/data'
import type { GroupForm, GroupInfo, GroupMember, InfoPost } from './types'

export const INFO_POST_COUNT = 3

export async function listGroupNames(): Promise<{ id: string; name: string }[]> {
  return mockGroups.map(({ id, name }) => ({ id, name }))
}

export async function getGroup(groupId: string): Promise<GroupForm | null> {
  const group = mockGroups.find((item) => item.id === groupId)
  if (!group) return null
  return { ...group, headline: group.headline }
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const ids = mockGroupMembers[groupId] ?? []
  return ids.flatMap((id) => {
    const profile = mockProfiles.find((item) => item.id === id)
    return profile ? [{ id: profile.id, username: profile.username }] : []
  })
}

// G3: name, headline and — when the group allows it or the viewer is admin — the member list.
export async function getGroupInfo(groupId: string, isAdmin: boolean): Promise<GroupInfo | null> {
  const group = mockGroups.find((item) => item.id === groupId)
  if (!group) return null
  const showMembers = group.memberList || isAdmin
  return {
    id: group.id,
    name: group.name,
    headline: group.headline,
    members: showMembers ? await listGroupMembers(group.id) : null,
    infoHeadlines: infoPostsFor(group.id).map((post) => post.headline),
  }
}

// B2: one of the three info posts.
export async function getInfoPost(groupId: string, n: number): Promise<InfoPost | null> {
  const group = mockGroups.find((item) => item.id === groupId)
  const post = group ? infoPostsFor(group.id)[n - 1] : undefined
  if (!group || !post) return null
  return { groupName: group.name, n, ...post }
}

function infoPostsFor(groupId: string) {
  return (mockInfoPosts[groupId] ?? mockInfoPosts.default ?? []).slice(0, INFO_POST_COUNT)
}

export async function listPeopleToAdd(groupId: string): Promise<GroupMember[]> {
  const already = new Set(mockGroupMembers[groupId] ?? [])
  return mockProfiles.filter((profile) => !already.has(profile.id)).map(({ id, username }) => ({ id, username }))
}
