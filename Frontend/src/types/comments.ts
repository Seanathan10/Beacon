export interface CommentReaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}

export interface Comment {
  id: number;
  pinID: number;
  accountID: number;
  email: string;
  comment: string;
  createdAt: string;
  isCreator?: boolean;
  hasLiked?: boolean;
  reactions?: CommentReaction[];
}

export interface PostWithCoords {
  id: number;
  creatorID: number;
  title: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  category: string;
  tags: string[];
  message: string;
  image: string | null;
  upvotes: number;
  createdAt: string;
  // Optional fields some consumers read with fallbacks (not always present on
  // the nearby-posts payload).
  description?: string;
  color?: string;
  email?: string;
}
