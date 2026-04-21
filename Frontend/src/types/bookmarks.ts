/**
 * TypeScript type definitions for Bookmark system
 */

export interface Bookmark {
  pinID: number;
  folderID: string | null;
  createdAt: string;
  creatorID: number;
  email: string;
  latitude: number;
  longitude: number;
  title?: string;
  address?: string;
  description?: string;
  image?: string;
  tags?: string;
  pinCreatedAt: string;
  likes: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  isPublic: number;
  createdAt: string;
  pinCount: number;
}

export interface PublicCollection {
  folder: {
    id: string;
    name: string;
    createdAt: string;
    pinCount: number;
  };
  pins: Bookmark[];
}
