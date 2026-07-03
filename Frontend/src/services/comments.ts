import { api } from "@/lib/api";
import type { Comment } from "@/types/comments";

/** Typed wrappers for pin-comment and comment-reaction endpoints. */

export const getPinComments = (pinId: number | string, opts?: RequestInit) =>
    api.get<Comment[]>(`/api/pins/${pinId}/comments`, opts);

export const createComment = (pinId: number | string, comment: string) =>
    api.post<Comment>(`/api/pins/${pinId}/comments`, { comment });

export const deleteComment = (commentId: number | string) =>
    api.delete(`/api/comments/${commentId}`);

export const addCommentReaction = (commentId: number | string, emoji: string) =>
    api.post(`/api/comments/${commentId}/reactions`, { emoji });

export const removeCommentReaction = (commentId: number | string, emoji: string) =>
    api.delete(`/api/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`);
