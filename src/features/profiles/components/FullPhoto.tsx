import { photoLabel, photoLabelClass } from '@/lib/photo-label'
import type { ProfilePhoto } from '../types'

// A profile photo across the profile's full width, at its place among the fields. The browser picks
// the thumbnail or the full file for the screen; width/height keep the page from jumping as it loads.
// Every photo says "Taken in app" or "Uploaded", with its date and time (D16, D18).
export function FullPhoto({ photo, alt, eager = false }: { photo: ProfilePhoto; alt: string; eager?: boolean }) {
  return (
    <figure>
      <a href={photo.src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-sunken">
        {/* Storage files, already resized on upload and cached for a year: no image optimizer round trip. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.src}
          srcSet={photo.thumb === photo.src ? undefined : `${photo.thumb} 256w, ${photo.src} ${photo.width ?? 1600}w`}
          sizes="(min-width: 42rem) 40rem, 100vw"
          width={photo.width ?? undefined}
          height={photo.height ?? undefined}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          className="mx-auto h-auto max-h-[85dvh] w-full object-contain"
        />
      </a>
      <figcaption className={`mt-1.5 text-[13px] ${photoLabelClass(photo.verified)}`}>{photoLabel(photo.verified, photo.date)}</figcaption>
    </figure>
  )
}
