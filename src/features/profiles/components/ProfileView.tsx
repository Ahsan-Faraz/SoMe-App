import Link from 'next/link'
import type { ReactNode } from 'react'
import { ThemePicker } from '@/components/ThemePicker'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { personKey, profileLayout } from '@/features/fields/schema'
import type { ProfileSchema } from '@/features/fields/types'
import { t } from '@/lib/i18n'
import type { Owner } from '../photo'
import type { Profile } from '../types'
import { LinkedProfiles } from './LinkedProfiles'
import { Fact, ProfileAnswers, type BuiltinNodes } from './ProfileAnswers'
import { ProfileEditor } from './ProfileEditor'
import { ProfileImage } from './ProfileImage'

// A3/B1: one column, in the community's order (the profile builder's "Profile order"), with photos
// full width at their place. Status and the account facts stay at the top.
export function ProfileView({
  community,
  communityId,
  profile,
  schema,
  section,
  linkBase = `/${community}/profiles`,
  admin,
}: {
  community: string
  communityId: string
  profile: Profile
  schema: ProfileSchema // the community's lists, basic fields, fields and their order
  section: string | null
  // Where linked profiles open: the normal profile, or the same admin view (A21/A22) for that person.
  linkBase?: string
  // A21/A22: the scope's application and member data, under the usual profile.
  admin?: ReactNode
}) {
  const owner: Owner | null = profile.own ? { slug: community, communityId, userId: profile.id } : null
  const status = schema.statuses.find((item) => item.id === profile.statusId)
  const layout = profileLayout(schema, status)
  // The image loads first when it is at the top of the profile (it is then the largest paint).
  const imageFirst = layout.main[0]?.type === 'builtin' && layout.main[0].key === 'photo'

  const facts = (
    <dl className="grid grid-cols-2 gap-3 text-[14px]">
      <div>
        <dt className="text-muted">{t.profiles.latestLogin}</dt>
        <dd className="font-semibold">{profile.lastLogin || '—'}</dd>
      </div>
      {profile.memberSince ? (
        <div>
          <dt className="text-muted">{t.profiles.memberSince}</dt>
          <dd className="font-semibold">{profile.memberSince}</dd>
        </div>
      ) : null}
    </dl>
  )
  // Basic fields that are not form inputs on your own profile; on someone else's, all of them.
  const nodes: BuiltinNodes = {
    photo: <ProfileImage photo={profile.photo} owner={owner} eager={imageFirst} />,
    score: <Fact label={t.profiles.score} value={String(profile.score)} />,
    links: <LinkedProfiles community={community} userId={profile.id} own={profile.own} canEdit={profile.state === 'approved'} linked={profile.linked} linkBase={linkBase} />,
    ...(owner
      ? {}
      : {
          lookingFor: <Fact label={t.profiles.lookingFor} value={profile.lookingFor.join(', ') || '—'} />,
          country: <Fact label={t.profiles.country} value={profile.country || '—'} />,
          district: <Fact label={t.profiles.district} value={profile.district || '—'} />,
          place: <Fact label={t.profiles.place} value={profile.place || '—'} />,
        }),
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-5 pb-12 sm:px-8 sm:pt-8">
      {owner ? (
        <ProfileEditor owner={owner} profile={profile} lists={schema} facts={facts} nodes={nodes} />
      ) : (
        <ProfileAnswers
          top={
            <div className="mb-6 grid gap-4 rounded-2xl bg-sunken p-4">
              <Fact label={t.profiles.status} value={profile.status || '—'} />
              {facts}
            </div>
          }
          layout={layout}
          nodes={nodes}
          ages={Object.fromEntries(profile.people.map((person) => [personKey(person.substatusId, person.n), person.age]))}
          values={profile.values}
          photoValues={profile.photoValues}
        />
      )}
      {admin ? <div className="mt-8">{admin}</div> : null}
      {section || profile.own ? (
        <div className="mt-8">
          {section ? <p className="mb-4 rounded-xl bg-rail px-4 py-3 text-[16px] font-semibold">{section}</p> : null}
          {profile.own ? <ThemePicker className="sm:max-w-sm" /> : null}
          {profile.own ? (
            <LogoutButton
              community={community}
              withLabel
              className="mt-5 flex h-14 w-full items-center gap-3 rounded-2xl border border-line px-4 text-left text-[16px] font-semibold text-danger hover:bg-hover sm:max-w-xs"
            />
          ) : null}
          {profile.own ? (
            <Link href={`/${community}/account/delete`} className="mt-3 block w-fit text-[15px] font-semibold text-muted underline hover:text-danger">
              {t.account.title}
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
