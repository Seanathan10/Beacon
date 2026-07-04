import { api } from "@/lib/api";
import type { Bookmark, BookmarkFolder } from "@/types/bookmarks";

/** Typed wrappers for bookmarks and bookmark folders. */

export const getBookmarks = () => api.get<Bookmark[]>("/api/bookmarks");
export const getFolders = () => api.get<BookmarkFolder[]>("/api/bookmarks/folders");
