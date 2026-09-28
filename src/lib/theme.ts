// Light/dark theme. The choice lives in localStorage per device; "system" follows the OS.
export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_KEY = 'some:theme'
export const THEME_COLORS = { light: '#fafafa', dark: '#111214' } as const

// Runs in <head> before first paint so the page never flashes the wrong theme.
export const themeScript = `(function(){try{
var c=localStorage.getItem('${THEME_KEY}');
var m=window.matchMedia('(prefers-color-scheme: dark)');
function apply(){var d=c==='dark'||(c!=='light'&&m.matches);
document.documentElement.dataset.theme=d?'dark':'light';
var e=document.getElementById('theme-color');
if(!e){e=document.createElement('meta');e.name='theme-color';e.id='theme-color';document.head.appendChild(e)}
e.content=d?'${THEME_COLORS.dark}':'${THEME_COLORS.light}'}
apply();m.addEventListener('change',function(){c=localStorage.getItem('${THEME_KEY}');apply()});
}catch(e){}})()`

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

const listeners = new Set<() => void>()

// For useSyncExternalStore: every picker and toggle on the page stays in step.
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark'
}

export function applyTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {}
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  const meta = document.getElementById('theme-color')
  if (meta instanceof HTMLMetaElement) meta.content = dark ? THEME_COLORS.dark : THEME_COLORS.light
  for (const listener of listeners) listener()
}
