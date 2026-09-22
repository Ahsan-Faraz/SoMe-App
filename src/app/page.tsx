import Link from 'next/link'
import { buttonClass } from '@/components/ui/Button'

export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-content-center gap-6 p-6 text-center">
      <p className="text-neutral-600">Open the link to your community to continue.</p>
      <Link href="/biking-stockholm" className={buttonClass('secondary')}>
        Demo: Biking Stockholm
      </Link>
    </main>
  )
}
