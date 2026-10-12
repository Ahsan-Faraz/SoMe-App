import type { ReactNode } from 'react'
import { ThemePicker } from '@/components/ThemePicker'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import type { ProfileSchema } from '@/features/fields/types'
import { t } from '@/lib/i18n'
import type { Profile } from '../types'
import { LinkedProfiles } from './LinkedProfiles'
import { Photos } from './Photos'
import { ProfileFields } from './ProfileFields'

export function ProfileView({
  community,
  profile,
  schema,
  section,
  linkBase = `/${community}/profiles`,
  admin,
}: {
  community: string
  profile: Profile
  schema: ProfileSchema // the community's Status list and fields
  section: string | null
  // Where linked profiles open: the normal profile, or the same admin view (A21/A22) for that person.
  linkBase?: string
  // A21/A22: the scope's application and member data, under the usual profile.
  admin?: ReactNode
}) {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-5 pb-12 sm:px-8 min-[52rem]:grid min-[52rem]:grid-cols-2 min-[52rem]:items-start min-[52rem]:gap-x-14 min-[52rem]:px-12 min-[52rem]:pt-8">
      <ProfileFields
        community={community}
        userId={profile.id}
        storageKey={`some:profile:${community}:${profile.id}`}
        own={profile.own}
        statuses={schema.statuses}
        // Retired fields stay out of profiles; their answers are kept in the database.
        fields={schema.fields.filter((field) => field.active)}
        status={profile.status}
        lookingFor={profile.lookingFor}
        about={profile.about}
        headline={profile.headline}
        media={
          <>
            <Photos main={profile.photo} community={community} userId={profile.id} own={profile.own} />
            <p className="mt-4 text-[14px] text-muted">
              {t.profiles.latestLogin}: <span className="font-semibold text-ink">{profile.lastLogin}</span>
            </p>
            <dl className="mt-3 grid text-[16px]">
              <Row label={t.profiles.score} value={String(profile.score)} />
              <Row label={t.profiles.age} value={String(profile.age)} />
              <Row label={t.profiles.district} value={profile.district} />
              <Row label={t.profiles.place} value={profile.place} />
            </dl>
            <LinkedProfiles community={community} userId={profile.id} own={profile.own} linked={profile.linked} linkedYou={profile.linkedYou} linkBase={linkBase} />
          </>
        }
      />
      {admin ? <div className="mt-8 min-[52rem]:col-span-2">{admin}</div> : null}
      {section || profile.own ? (
        <div className="mt-8 min-[52rem]:col-span-2">
          {section ? <p className="mb-4 rounded-xl bg-rail px-4 py-3 text-[16px] font-semibold">{section}</p> : null}
          {profile.own ? <ThemePicker className="min-[52rem]:max-w-sm" /> : null}
          {profile.own ? (
            <LogoutButton
              community={community}
              withLabel
              className="mt-5 flex h-14 w-full items-center gap-3 rounded-2xl border border-line px-4 text-left text-[16px] font-semibold text-danger hover:bg-hover min-[52rem]:max-w-xs"
            />
          ) : null}
        </div>
      ) : null}
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  )
}
