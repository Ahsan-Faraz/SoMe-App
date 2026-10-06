'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { t } from '@/lib/i18n'

type GroupRow = { id: string; name: string; member: boolean }
type Saved = { community: boolean; groupAdmin: boolean; groups: string[] }

// Community admin: Settings (community member, group create/admin rights) + all groups.
// Group admin: only the groups they run — the caller passes just those, with settings off.
export function AssignGroups({ storageKey, settings, groups }: { storageKey: string; settings: boolean; groups: GroupRow[] }) {
  const [saved, setSaved] = useState<Saved>(() => ({ community: true, groupAdmin: false, groups: groups.filter((group) => group.member).map((group) => group.id) }))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Saved> | null
      if (raw) {
        setSaved((current) => ({
          community: typeof raw.community === 'boolean' ? raw.community : current.community,
          groupAdmin: typeof raw.groupAdmin === 'boolean' ? raw.groupAdmin : current.groupAdmin,
          groups: Array.isArray(raw.groups) ? raw.groups : current.groups,
        }))
      }
    } catch {
      // Keep the server membership when the saved value is unreadable.
    }
    setReady(true)
  }, [storageKey])

  useEffect(() => {
    if (ready) localStorage.setItem(storageKey, JSON.stringify(saved))
  }, [ready, storageKey, saved])

  const toggleGroup = (id: string) =>
    setSaved((current) => ({ ...current, groups: current.groups.includes(id) ? current.groups.filter((item) => item !== id) : [...current.groups, id] }))

  return (
    <div className="mx-auto grid max-w-2xl gap-8 px-4 pt-6 pb-10 sm:px-8">
      {settings ? (
        <Section title={t.groups.settings}>
          <Row label={t.groups.communityMember} checked={saved.community} onChange={(community) => setSaved((current) => ({ ...current, community }))} />
          <Row label={t.groups.groupAdmin} checked={saved.groupAdmin} onChange={(groupAdmin) => setSaved((current) => ({ ...current, groupAdmin }))} />
        </Section>
      ) : null}
      <Section title={t.groups.addToGroups}>
        {groups.map((group) => (
          <Row key={group.id} label={group.name} checked={saved.groups.includes(group.id)} onChange={() => toggleGroup(group.id)} icon={<Avatar name={group.name} seed={group.id} size="sm" />} />
        ))}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[22px] font-bold">{title}</h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">{children}</ul>
    </section>
  )
}

function Row({ label, checked, onChange, icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; icon?: ReactNode }) {
  return (
    <li>
      <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-hover">
        {icon}
        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{label}</span>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      </label>
    </li>
  )
}
