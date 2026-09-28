export type AlbumImage = { id: string; src: string; date: string; verified: boolean }

export type Album = { id: string; name: string; password: string; images: AlbumImage[] }
