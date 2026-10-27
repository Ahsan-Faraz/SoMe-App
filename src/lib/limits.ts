// Length and size limits shared by forms and Server Actions.
// Each one mirrors a `check` constraint in supabase/migrations; the database is the last line of defence.

export const COMMUNITY_SLUG = /^[a-z0-9-]{2,40}$/

export const USERNAME_MIN = 3
export const USERNAME_MAX = 32
export const PASSWORD_MIN = 8 // Supabase Auth's minimum must not be higher
export const OTP_PATTERN = /^\d{6,10}$/ // email codes; Supabase sends 6 digits by default
export const REAL_NAME_MAX = 80
export const PLACE_MAX = 80
export const NAME_MAX = 80 // group and album names
export const HEADLINE_MAX = 120 // info posts, events, ads
export const GROUP_HEADLINE_MAX = 200
export const MESSAGE_MAX = 8000
export const LONG_TEXT_MAX = 4000 // application text and message, admin notes, ad and event bodies
export const FIELD_TEXT_MAX = 32000 // profile answers, info post bodies, private notes
export const SHORT_TEXT_MAX = 200 // a short text answer when its field sets no limit (save_profile)

// Profile builder
export const LIST_LABEL_MAX = 40 // a Status or District name
export const FIELD_LABEL_MAX = 80 // a profile field's name and its choices
export const CHOICES_MAX = 200 // choices in one list or field

export const MAIN_PHOTOS_MAX = 3
export const LINKED_PROFILES_MAX = 3
export const LINK_COMMENT_MAX = 60 // a short comment next to a linked profile
export const SCORE_MAX = 100
export const STARS_MAX = 5
export const FILTER_TEXT_MAX = 80 // a text in the profile filter (save_search_filter)

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_FULL_PX = 1600
export const IMAGE_THUMB_PX = 256
