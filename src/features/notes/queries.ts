import 'server-only'
import { getCommunity } from '@/features/communities/queries'
import { createClient } from '@/lib/supabase/server'
import type { Note } from './types'

const emptyNote: Note = { body: '', stars: 0, version: '' }

// B5: your private note about a member (notes table, readable by its author only: RLS). The same
// note opens from their profile ⭐, a DM ⭐ and swipe. One primary-key lookup; no note yet = empty.
export async function getNote(slug: string, authorId: string, subjectId: string): Promise<Note> {
  const community = await getCommunity(slug)
  if (!community) return emptyNote
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('notes')
    .select('body, stars, updated_at')
    .eq('community_id', community.id)
    .eq('author_id', authorId)
    .eq('subject_id', subjectId)
    .maybeSingle()
  if (error) throw error
  return data ? { body: data.body, stars: data.stars ?? 0, version: data.updated_at } : emptyNote
}
