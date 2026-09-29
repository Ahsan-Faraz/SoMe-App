'use client'

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

// Long text field: grows with its content instead of scrolling inside itself.
export function GrowingTextarea({ className = '', value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight + 2}px`
  }, [value])

  return <textarea ref={ref} rows={2} value={value} {...props} className={`resize-none overflow-hidden ${className}`} />
}
