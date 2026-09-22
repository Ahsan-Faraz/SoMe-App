import { en } from './en'

export type Dictionary = typeof en

// Swedish comes later: add sv.ts typed as Dictionary and pick it here per community/user.
export const t: Dictionary = en
