'use client'

import { useEffect, type RefObject } from 'react'

// Keeps a chat at its newest message while the reader is there (client feedback 261115: chats
// opened at the oldest messages on the iPhone). The first scroll to the bottom runs before pictures
// have loaded and before off-screen posts (content-visibility) have their real height, and a screen
// kept alive in the background is laid out again when it is shown. So whenever the list or the
// scroll box changes size, it goes back to the bottom, unless the reader has scrolled up to read.
// No timers: one ResizeObserver and one passive scroll listener per open chat.
export function useStickToBottom(scroller: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>, nearPx: number) {
  useEffect(() => {
    const element = scroller.current
    const inner = content.current
    if (!element || !inner) return
    let stuck = true
    const onScroll = () => {
      stuck = element.scrollHeight - element.scrollTop - element.clientHeight < nearPx
    }
    const observer = new ResizeObserver(() => {
      if (stuck) element.scrollTop = element.scrollHeight
    })
    observer.observe(element)
    observer.observe(inner)
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', onScroll)
    }
  }, [scroller, content, nearPx])
}
