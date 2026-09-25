import Image from 'next/image'
import type { ReactNode } from 'react'
import type { Community } from '@/features/communities/types'

export function AuthShell({
  community,
  src,
  alt,
  title,
  children,
}: {
  community: Community
  src: string
  alt: string
  title: string
  children: ReactNode
}) {
  return (
    <main className="grid w-full gap-8 px-5 pt-8 pb-12 sm:px-8 min-[52rem]:min-h-[calc(100dvh-3.5rem)] min-[52rem]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] min-[52rem]:items-center min-[52rem]:gap-12 min-[52rem]:p-6 lg:gap-20 [&>*]:min-w-0">
      <aside className="relative hidden h-[calc(100dvh-6.5rem)] max-h-[40rem] min-h-[26rem] overflow-hidden rounded-3xl min-[52rem]:block">
        <Image src={src} alt={alt} fill priority sizes="45vw" className="object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-8 pt-28 pb-8 text-white">
          <p className="text-[28px] leading-tight font-bold">{community.name}</p>
          <p className="mt-2 max-w-sm text-[16px] text-white/90">{community.headline}</p>
        </div>
      </aside>
      <div className="w-full min-[52rem]:mx-auto min-[52rem]:max-w-md">
        <h2 className="mb-6 hidden text-[28px] leading-tight font-bold min-[52rem]:block">{title}</h2>
        {children}
      </div>
    </main>
  )
}
