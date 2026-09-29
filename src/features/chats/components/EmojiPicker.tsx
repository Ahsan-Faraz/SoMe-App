'use client'

import { useState } from 'react'
import { t } from '@/lib/i18n'

// Loaded only when "+" is tapped in the post menu. Common emoji as a grid; the input takes
// any other emoji from the phone's own emoji keyboard, so no emoji library is needed.
const groups = [
  '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😎 🤓 🥳 😏 😌 😴 🤔 🤗 🤭 🤫 😐 😑 😶 🙄 😬 😮 😯 😲 😳 🥺 😢 😭 😤 😠 😡 🤯 😱 😨 😰 🥵 🥶 🤢 🤮 🤧 😷 🤒 🤕 🥴 😵 🤠',
  '👍 👎 👏 🙌 🙏 🤝 👋 🤙 💪 👌 🤌 ✌️ 🤞 🤟 🤘 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🫶 👀 🧠 🫡',
  '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💯 ✨ ⭐ 🌟 🔥 💥 🎉 🎊 🏆 🥇 ✅ ❌ ❗ ❓ ⚡',
  '🚴 🚵 🚲 🛞 🏔️ ⛰️ 🌲 🌳 🌊 ☀️ 🌤️ ⛅ 🌧️ ⛈️ ❄️ 🌈 🌙 🗺️ 📍 🧭 ⏱️ 🕕 📅 📸 🎒 🧃 ☕ 🍺 🍕 🍔 🍩 🍎 🍌 🥤',
  '🐶 🐱 🐻 🦊 🐼 🐨 🐸 🦄 🐝 🦋 🐢 🐬 🐳 🦆 🦉 🌸 🌻 🌹 🍀 🍁',
].map((line) => line.split(' '))

const emojiPattern = /\p{Extended_Pictographic}/u

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [typed, setTyped] = useState('')

  return (
    <div className="px-2">
      <label className="mx-2 mb-2 flex h-11 items-center gap-2 rounded-xl bg-rail px-3">
        <input
          value={typed}
          onChange={(event) => {
            const first = [...new Intl.Segmenter().segment(event.target.value)].map((part) => part.segment).find((part) => emojiPattern.test(part))
            if (first) onPick(first)
            else setTyped(event.target.value)
          }}
          placeholder={t.chats.typeEmoji}
          aria-label={t.chats.typeEmoji}
          className="h-full flex-1 select-text bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
        />
      </label>
      <div className="grid max-h-[45dvh] grid-cols-8 overflow-y-auto overscroll-contain text-[26px] sm:grid-cols-10">
        {groups.flat().map((emoji) => (
          <button key={emoji} type="button" onClick={() => onPick(emoji)} className="grid aspect-square place-items-center rounded-xl hover:bg-hover">
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
