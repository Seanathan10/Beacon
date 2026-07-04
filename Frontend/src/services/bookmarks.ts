import { api } from "@/lib/api";
import type { Bookmark, BookmarkFolder } from "@/types/bookmarks";

/** Typed wrappers for bookmarks and bookmark folders. */

export const getBookmarks = () => api.get<Bookmark[]>("/api/bookmarks");
export const addBookmark = (pinID: number, folderID?: string | null) =>
    api.post("/api/bookmarks", { pinID, folderID: folderID ?? null });
export const deleteBookmark = (pinID: number | string) => api.delete(`/api/bookmarks/${pinID}`);
export const updateBookmark = (pinID: number | string, folderID: string | null) =>
    api.patch(`/api/bookmarks/${pinID}`, { folderID });

export const getFolders = () => api.get<BookmarkFolder[]>("/api/bookmarks/folders");
export const createFolder = (name: string, isPublic = false) =>
    api.post<BookmarkFolder>("/api/bookmarks/folders", { name, isPublic });
export const updateFolder = (id: string, body: { name?: string; isPublic?: boolean }) =>
    api.patch(`/api/bookmarks/folders/${id}`, body);
export const deleteFolder = (id: string) => api.delete(`/api/bookmarks/folders/${id}`);
