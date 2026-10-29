// B3/B4 albums (D16). Album files are in the private bucket: others get links the server signs after
// the database says the album is open to them; a locked album shows a folder, never a photo.

// The list (album_list). cover: a signed thumbnail link; always null for a locked album.
export type AlbumCard = { id: string; name: string; locked: boolean; photos: number; cover: string | null }

// A photo in an album. src: a signed link to the full image (an hour). date: when a Taken in app
// photo was taken ('' for an upload).
export type AlbumPhoto = { id: string; src: string; width: number | null; height: number | null; verified: boolean; date: string }

// One album (album_view). access: 'owner', 'open' (no password, or opened within the hour) or
// 'locked' (photos empty until the password is given).
export type AlbumAccess = 'owner' | 'open' | 'locked'
export type AlbumDetail = { id: string; ownerId: string; name: string; locked: boolean; access: AlbumAccess; photos: AlbumPhoto[] }

// "From profile/album": a photo to copy into a chat or an ad (src: a link the phone can fetch).
export type PickedPhoto = { src: string; verified: boolean; date: string }
