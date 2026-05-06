# Beacon — Master Development Plan

**Last updated:** 2026-05-05  
**Test suite:** 389 passing / 0 failing (16 files)  
**Dev server:** `pnpm dev` → backend :3000, frontend :5173

---

## Project Overview

Beacon is a sustainable travel and local community discovery app with two core features:
1. **Map pins** — Users drop pins for local attractions with photos, tags, likes, comments, and status (visited/wishlist).
2. **AI trip planner** — Compares transport options (flight, train, drive) by carbon footprint, then generates a Gemini-based itinerary.

**Stack:** React 19 + Vite 7 + TypeScript + Tailwind + Mapbox GL (frontend) / Express 5 + TypeScript + SQLite3 (`DatabaseSync`) + JWT auth (backend). Monorepo via pnpm workspaces.

---

## Current Implementation Status

### Phase 1 — 20 Quick Wins: ✅ COMPLETE (20/20)

| # | Feature | Batch | Key Files |
|---|---------|-------|-----------|
| 1 | Dark Mode Toggle | 1 | `utils/theme.ts`, `ThemeToggle.tsx` |
| 2 | Keyboard Shortcuts | 1 | `hooks/useKeyboardShortcuts.ts`, `ShortcutsHelpModal.tsx` |
| 3 | Saved Drafts | 1 | `NewPinModal.tsx` (localStorage debounce) |
| 4 | Pin Cloning | 1 | `DetailedPinModal.tsx` → "Create Similar" button |
| 5 | Trending This Week | 2 | `GET /api/pins/trending` in `routes/pins.ts` |
| 6 | Near Me Priority | 2 | `GET /api/pins?sort=distance&lat=&lng=` |
| 7 | Search History | 2 | `routes/search.ts`, `SearchBar.tsx` |
| 8 | Visited vs Wishlist | 2 | `pin_status` table, `routes/pinStatus.ts` |
| 9 | Bookmark Folders | 3 | `bookmark_folder`+`bookmark` tables, `routes/bookmarks.ts` |
| 10 | Homepage Shortcuts | 3 | `SavedPlacesPanel.tsx` (tabbed: My Pins / Bookmarked / Liked) |
| 11 | Public Collections | 3 | `pages/PublicCollection.tsx`, `GET /api/share/collection/:folderID` |
| 12 | Comment Reactions | 4 | `comment_reaction` table, emoji picker in `DetailedPinModal.tsx` |
| 13 | Nearby Posts Feed | 4 | `NearbyPostsDrawer.tsx`, `GET /api/posts/nearby` |
| 14 | Comment Permalinks | 4 | Hash-based nav (`?pin=X#comment-Y`) in `DetailedPinModal.tsx` |
| 15 | User Badges | 4 | `isCreator` / `hasLiked` flags on comment payload |
| 16 | Post Geocoding | 4 | `post.latitude`, `post.longitude` columns |
| 17 | Influence Score | 5 | Derived field in `GET /api/me/stats` |
| 18 | Stats / Activity | 5 | `routes/stats.ts`, `QuickStatsWidget.tsx`, `pages/ActivityPage.tsx` |
| 19 | Others Also Liked | 5 | `GET /api/pins/:id/similar`, carousel in `DetailedPinModal.tsx` |
| 20 | Share Menu | 6 | `ShareMenu.tsx` mounted on DetailedPinModal, Post, SharedItinerary, PublicCollection |

### Phase 2 Batch 1 — User Profiles & Discovery: ✅ COMPLETE

| Feature | Key Files |
|---------|-----------|
| User profile pages | `pages/UserProfile.tsx` at `/profile/:userID` |
| Follower / following lists | `pages/FollowersList.tsx` (exports `FollowersList` + `FollowingList`) |
| Follow / unfollow | `routes/follows.ts`, `POST/DELETE /api/users/:userID/follow` |
| Edit profile modal | `components/EditProfileModal.tsx` |
| Profile feed | `GET /api/me/feed` (cursor-paginated pins from followed users) |
| Optional auth middleware | `auth.optional` in `routes/auth.ts` — profile routes are public |
| Creator links | Creator name in `DetailedPinModal.tsx` links to `/profile/:creatorID` |
| Following sidebar | 5 followed-user avatars in Sidebar discovery panel |
| Schema | `user_follow` table, `account.bio`, `account.avatar`, `account.profileVisibility` |

### Phase 2 Batches 2–8: ⬜ NOT STARTED

---

## Current Database Schema

### Tables in `Backend/database/create.sql` (authoritative)

```
account          id, name, email, password, bio, avatar, profileVisibility
user_follow      followerID, followingID, createdAt  [PK: (follower, following)]
pin              id, creatorID, lat, lng, title, address, description, tags, image, likes, createdAt
comment          id, pinID, accountID, comment, createdAt
likes            pinID, accountID  [PK: (pinID, accountID)]
post             id, creatorID, title, location, latitude, longitude, category, tags, message, image, upvotes, createdAt
post_upvote      postID, accountID  [PK: (postID, accountID)] — note: accountID FK missing ON DELETE CASCADE
pin_status       pinID, accountID, status ('visited'|'wishlist'), updatedAt
search_history   id, accountID, query, createdAt
itinerary        id, creatorID, data (JSON), createdAt
bookmark_folder  id, accountID, name, createdAt, isPublic
bookmark         pinID, accountID, folderID (nullable), createdAt
comment_reaction commentID, accountID, emoji, createdAt
```

**Known schema quirks:**
- `pin.likes` column exists but is never updated — likes are counted from the `likes` table. It's a dead column.
- `post_upvote.accountID` is missing `ON DELETE CASCADE` (all other FKs have it).
- `account.lastSeenAt` is mentioned in plans but not yet in the schema.

### Dev DB migration note
The test suite uses `:memory:` (always fresh from `create.sql`). The dev file DB (`database/database.db`) may lag behind `create.sql` after schema additions. When adding new tables/columns, apply them to the dev DB manually with `sqlite3 database/database.db "..."` in addition to updating `create.sql`.

---

## Current API Surface

### Auth
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/login` | — | Login, returns JWT cookie + token |
| POST | `/api/register` | — | Register, returns JWT cookie + token |
| POST | `/api/logout` | — | Clears auth cookie |

### Pins
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/pins` | ✓ | All pins (sort, distance, trending params) |
| GET | `/api/pins/trending` | ✓ | Top 20 by `likes + 3*recency_score` |
| GET | `/api/pins/user` | ✓ | Authenticated user's own pins |
| GET | `/api/pins/:id` | ✓ | Single pin |
| GET | `/api/pins/:id/similar` | ✓ | Collaborative "Others Also Liked" (top 10) |
| POST | `/api/pins` | ✓ | Create pin |
| POST | `/api/pins/nearby` | ✓ | Pins within 10 km radius |
| PUT | `/api/pins/:id` | ✓ | Update pin (owner only) |
| DELETE | `/api/pins/:id` | ✓ | Delete pin (owner only) |
| PUT | `/api/pins/:id/status` | ✓ | Set visited/wishlist |
| DELETE | `/api/pins/:id/status` | ✓ | Clear status |

### Comments
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/pins/:pinId/comments` | ✓ | Comments with reactions + badges |
| POST | `/api/pins/:pinId/comments` | ✓ | Add comment |
| PUT | `/api/comments/:commentId` | ✓ | Edit comment (owner only) |
| DELETE | `/api/comments/:commentId` | ✓ | Delete comment |
| POST | `/api/comments/:id/reactions` | ✓ | Add emoji reaction (upsert) |
| DELETE | `/api/comments/:id/reactions/:emoji` | ✓ | Remove reaction |

### Posts
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/posts` | ✓ | All posts |
| GET | `/api/posts/:id` | ✓ | Single post |
| GET | `/api/posts/nearby` | ✓ | Posts in bbox (`minLng,minLat,maxLng,maxLat`) |
| POST | `/api/posts` | ✓ | Create post |
| PUT | `/api/posts/:id` | ✓ | Update post |
| DELETE | `/api/posts/:id` | ✓ | Delete post |
| POST | `/api/posts/:id/upvote` | ✓ | Upvote post |

### Likes
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/likes/user` | ✓ | All pins liked by current user |
| GET | `/api/likes/:id` | ✓ | Like count for pin |
| POST | `/api/likes/:id` | ✓ | Like pin |
| DELETE | `/api/likes/:id` | ✓ | Unlike pin |

### Bookmarks
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/bookmarks` | ✓ | User's bookmarks |
| POST | `/api/bookmarks` | ✓ | Add bookmark |
| DELETE | `/api/bookmarks/:pinID` | ✓ | Remove bookmark |
| PATCH | `/api/bookmarks/:pinID` | ✓ | Move to folder |
| GET | `/api/bookmarks/folders` | ✓ | List folders |
| POST | `/api/bookmarks/folders` | ✓ | Create folder |
| PATCH | `/api/bookmarks/folders/:id` | ✓ | Rename/toggle public |
| DELETE | `/api/bookmarks/folders/:id` | ✓ | Delete folder (cascades bookmarks) |

### Search History
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/search/history` | ✓ | Last 10 queries |
| POST | `/api/search/history` | ✓ | Record query (capped at 50/user) |
| DELETE | `/api/search/history/:id` | ✓ | Delete entry |
| DELETE | `/api/search/history` | ✓ | Clear all history |

### Pin Status
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/pin-status` | ✓ | All user's pin statuses |

### User Profiles & Social
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/users/:userID` | optional | Profile (public without login) |
| GET | `/api/users/:userID/pins` | optional | User's public pins (respects privacy) |
| GET | `/api/users/:userID/followers` | optional | Paginated followers |
| GET | `/api/users/:userID/following` | optional | Paginated following |
| PATCH | `/api/me` | ✓ | Update bio, avatar, profileVisibility |
| POST | `/api/users/:userID/follow` | ✓ | Follow (idempotent) |
| DELETE | `/api/users/:userID/follow` | ✓ | Unfollow |
| GET | `/api/me/feed` | ✓ | Cursor-paginated feed from followed users |

### Stats & Activity
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/me/stats` | ✓ | Aggregate: pins, likes, visits, followers, influence |
| GET | `/api/me/activity` | ✓ | Last 30 days activity (pins, comments, visits) |

### Trip Planning
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/trip/plan` | ✓ | Full trip plan (rate-limited: 20/min) |
| POST | `/api/trip/plan/stream` | ✓ | Streaming trip plan |
| POST | `/api/trip/ask` | ✓ | Follow-up question on itinerary |
| POST | `/api/trip/generate-itinerary` | ✓ | Itinerary from user selections |
| POST | `/api/trip/local-route` | ✓ | Driving/transit directions |
| POST | `/api/trip/nearby-pins` | ✓ | Nearby pins for trip planning |

### Share
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET `/POST` | `/api/share/*` | see code | Share itinerary, get shared itinerary, public collection |

---

## Current Frontend Routes & Files

### Routes (`main.tsx`)
```
/                     Landing.tsx          Login / register
/home                 Home.tsx (lazy)      Map interface
/explore              PostsPage.tsx        Community posts feed
/shared/:id           SharedItinerary.tsx  View shared trip link
/collection/:folderID PublicCollection.tsx Read-only bookmark collection
/profile/:userID      UserProfile.tsx      User profile (tabs: Pins, Activity)
/users/:userID/followers  FollowersList.tsx
/users/:userID/following  FollowersList.tsx (FollowingList export)
/activity             ActivityPage.tsx     Personal 30-day activity timeline
```

### Key Components
```
Sidebar.tsx              Left sidebar: discovery panel + saved panel + trip tab
  └─ QuickStatsWidget    Stats card (pins, likes, visited, followers) + activity link
  └─ Following section   5 avatars from /api/me/feed when logged in
DetailedPinModal.tsx     Full pin view: edit, comments, reactions, similar pins, share
  └─ ShareMenu           Twitter / Facebook / native share / copy-link dropdown
  └─ Similar Pins        Horizontal scroll carousel from /api/pins/:id/similar
  └─ Creator link        @username → /profile/:creatorID
NewPinModal.tsx          Create pin (with draft auto-save to localStorage)
NearbyPostsDrawer.tsx    Posts in current map viewport, refetches on moveend (400ms debounce)
SearchBar.tsx            Search with recent history dropdown
ThemeToggle.tsx          3-state: light / dark / system
EmojiReactionPicker.tsx  👍 ❤️ 😂 😮 🔥 reactions on comments
ShareMenu.tsx            Reusable share dropdown (also in Post.tsx, SharedItinerary.tsx, PublicCollection.tsx)
EditProfileModal.tsx     Bio (300 char), avatar URL, visibility setting
```

---

## Test Coverage

**Total: 389 tests across 16 files**

| File | Tests | Coverage |
|------|-------|---------|
| `carbon.test.ts` | 46 | Carbon math, emission ratings, cost calculations |
| `posts.test.ts` | 39 | CRUD, upvotes, nearby posts |
| `comments.test.ts` | 37 | CRUD, reactions, badges (isCreator/hasLiked) |
| `pins.test.ts` | 35 | CRUD, auth checks, XSS, data integrity, **similar pins** |
| `validation.test.ts` | 32 | OpenAPI request validation |
| `bookmarks.test.ts` | 31 | Folder CRUD, bookmark CRUD, cascade delete |
| `trip.test.ts` | 26 | Trip service, Amadeus integration |
| `batch2.test.ts` | 25 | Trending, distance sort, pin status, search history |
| `likes.test.ts` | 24 | Like/unlike, liked-pins list |
| `share.test.ts` | 23 | Itinerary share, public collections |
| `auth.test.ts` | 16 | Register, login, JWT, rate limiting |
| `integration.test.ts` | 15 | Cross-feature flows |
| `users.test.ts` | 14 | Profiles, stats, activity, **auth.optional** |
| `cors.test.ts` | 10 | CORS origins |
| `follows.test.ts` | 9 | Follow/unfollow, idempotence, feed |
| `rate-limit.test.ts` | 8 | Auth + AI rate limiters |

---

## Phase 2 — Remaining Batches (2–8)

### Batch 2 — Advanced Pin Filtering (~6–8 hrs) ⬜

**Goal:** Persistent, powerful map filtering beyond sort order.

**Schema addition (optional — low priority):**
```sql
CREATE TABLE saved_filter (
  id TEXT PRIMARY KEY,
  accountID INTEGER NOT NULL,
  name VARCHAR(80),
  filters TEXT NOT NULL, -- JSON: {tags, minDate, maxDate, minRating, bookmarkStatus, creatorID}
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
);
```

**Backend — extend `GET /api/pins` (`routes/pins.ts`):**
- `tags=tag1,tag2` — OR logic within tags
- `minDate=YYYY-MM-DD&maxDate=YYYY-MM-DD` — filter by `createdAt`
- `minRating=N&maxRating=N` — rating based on likes/comments ratio (computed inline)
- `bookmarkStatus=bookmarked|wishlist|visited` — user's own status (auth required)
- `creatorID=123` — pins from a specific user
- All active filters combine with AND logic
- Optional new file `routes/savedFilters.ts`: GET/POST/DELETE saved filter presets

**Frontend — update `Home.tsx`:**
- Collapsible "Filter" panel below the sort dropdown
- Tag checkboxes (8–10 most common tags, fetched or hardcoded)
- Date range picker (use existing `DatePicker.tsx` component)
- Rating slider (0–5 stars)
- Bookmark status dropdown: All / Bookmarked / Wishlist / Visited
- "Apply" / "Clear" buttons
- Persist active filters to `localStorage['beacon-pin-filters']` for page reloads
- Optional: `SavedFiltersMenu.tsx` dropdown to name and recall filter presets

**Tests to write:**
- Tag OR logic (pins with any of the specified tags are returned)
- Multi-filter AND logic (tags + minDate both applied)
- Invalid date range handled gracefully (no crash)
- `bookmarkStatus` filter returns only pins with that user status
- Unauthenticated request with `bookmarkStatus` returns 401

---

### Batch 3 — Pin Recommendations Engine (~8–10 hrs) ⬜

**Goal:** Personalized pin discovery via collaborative + content-based filtering.

**No new schema required** — derived from existing `likes`, `pin_status`, `user_follow`, `pin` tables.

**Backend:**

New file: `services/recommendations.ts`
```
computeRecommendations(userID): Pin[]
  40% — pins by creators the user follows
  30% — pins with tags matching user's liked pins (content-based)
  20% — pins liked by users who visited the same places (collaborative)
  10% — trending pins in areas the user has visited
  Exclude: pins already visited, created, or bookmarked by this user
  Cache: 5-minute TTL (in-memory Map keyed by userID)
```

New file: `routes/recommendations.ts`
- `GET /api/pins/recommended` — returns 15 pins (cached or fresh). Requires auth.
- Spec: `routes/pins.ts` already has `GET /api/pins/recommended?tags=...` stub planned — consolidate here.

**Frontend:**
- `Home.tsx`: "Recommended For You" sidebar section (3–5 pin cards + "See more →")
- New page `pages/DiscoverPage.tsx` at `/discover` — full 15-pin grid, refresh button

**Tests to write:**
- Tag extraction from a user's liked pins
- Collaborative cohort query (users sharing 2+ visited pins)
- Exclusion of already-interacted pins
- Two users with different histories get different recommendations
- Unauthenticated request returns 401

---

### Batch 4 — Trip Comparison Tool (~7–9 hrs) ⬜

**Goal:** Side-by-side diff of two shared itineraries.

**Schema addition (optional — for saved comparisons):**
```sql
CREATE TABLE trip_comparison (
  id TEXT PRIMARY KEY,
  accountID INTEGER,
  itineraryID1 TEXT,
  itineraryID2 TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE,
  FOREIGN KEY (itineraryID1) REFERENCES itinerary(id) ON DELETE CASCADE,
  FOREIGN KEY (itineraryID2) REFERENCES itinerary(id) ON DELETE CASCADE
);
```

**Backend:**

New file: `routes/comparisons.ts`
- `POST /api/trip/compare` body `{itineraryID1, itineraryID2}` — returns:
  - Cost delta (flight + lodging + activities)
  - Carbon delta (flight + ground transport)
  - Day-by-day itinerary diff (highlight different activities / locations)
  - Transport method comparison
  - Shared days and locations (visualize overlap)
- Returns 404 if either itinerary not found or not publicly shared.

**Frontend:**
- New page `pages/TripComparisonPage.tsx` at `/trip/compare?a=:id1&b=:id2`
  - Two-column layout: left itinerary A, right itinerary B
  - Middle: callout boxes for cost/carbon diffs and transport method
  - Map: both routes overlaid in different colors
  - Day-aligned activity list with mismatches highlighted
- New component `components/TripComparisonSummary.tsx` — reusable cost/carbon/transport card
- Update `pages/SharedItinerary.tsx`: "Compare with another trip" button opens modal to paste a URL or pick from recent trips → navigates to `/trip/compare`

**Tests to write:**
- Cost delta calculation
- Carbon delta calculation
- 404 if either itinerary not found
- Day alignment logic (same destinations, different order)

---

### Batch 5 — Community Moderation & Reporting (~6–8 hrs) ⬜

**Goal:** Let users report content; give admins a moderation queue.

**Schema additions:**
```sql
CREATE TABLE report (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporterID INTEGER NOT NULL,
  reportedType TEXT NOT NULL CHECK(reportedType IN ('pin','post','comment')),
  reportedID INTEGER NOT NULL,
  reason TEXT CHECK(reason IN ('spam','offensive','misleading','harassment','other')),
  details VARCHAR(280),
  status TEXT DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed','resolved')),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolvedAt DATETIME,
  FOREIGN KEY (reporterID) REFERENCES account(id) ON DELETE SET NULL
);

CREATE TABLE mod_action (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modID INTEGER NOT NULL,
  actionType TEXT CHECK(actionType IN ('warn','delete','hide','undelete')),
  reportID INTEGER,
  targetType TEXT,
  targetID INTEGER,
  reason VARCHAR(280),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (modID) REFERENCES account(id)
);

-- Soft delete support for moderation
ALTER TABLE pin     ADD COLUMN isDeleted INTEGER DEFAULT 0;
ALTER TABLE post    ADD COLUMN isDeleted INTEGER DEFAULT 0;
ALTER TABLE comment ADD COLUMN isDeleted INTEGER DEFAULT 0;
```

**Backend:**

New file: `middleware/isAdmin.ts`
- Check `req.user.id` against `process.env.ADMIN_IDS` (comma-separated list).

New file: `routes/reports.ts`
- `POST /api/reports` — create report. Rate-limit: 10/hour per user.
- `GET /api/reports` — admin only. Paginated open reports with counts by reason.
- `PATCH /api/reports/:id` — admin only. Mark reviewed/dismissed or trigger mod action.

Update `routes/pins.ts`, `posts.ts`, `comments.ts`:
- All read endpoints must add `WHERE isDeleted = 0` to queries.
- Mod delete action sets `isDeleted = 1` instead of hard-deleting.

**Frontend:**

New component `components/ReportModal.tsx`:
- Triggered from the "..." menu on any pin, post, or comment.
- Dropdown: spam / offensive / misleading / harassment / other.
- Textarea: optional details (max 280 chars).
- Thank-you confirmation on submit.

New page `pages/AdminPanel.tsx` at `/admin/reports` (admin route):
- Table of open reports: type, reason, details, content preview, status.
- Click row → detail view with dismiss or delete options.
- Soft-delete marks report resolved and sets `isDeleted = 1` on target.

Update `Home.tsx` / `Sidebar.tsx`:
- Add "Report" option to the "..." menus on pins, posts, and comments.

**Tests to write:**
- Report creation rate limit (11th report in an hour is blocked)
- Soft-deleted pins/posts/comments excluded from all read endpoints
- Only admins can access `GET /api/reports`
- Mod action creates a `mod_action` log row and marks report resolved

---

### Batch 6 — Real-Time Notifications (~10–12 hrs) ⬜

**Goal:** Polling-based notifications for likes, comments, and follows (WebSocket deferred to Phase 3).

**Schema additions:**
```sql
CREATE TABLE notification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userID INTEGER NOT NULL,
  actorID INTEGER,
  type TEXT NOT NULL CHECK(type IN ('like','comment','follow','mention')),
  relatedType TEXT, -- 'pin', 'post', 'comment'
  relatedID INTEGER,
  message VARCHAR(200),
  isRead INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userID) REFERENCES account(id) ON DELETE CASCADE,
  FOREIGN KEY (actorID) REFERENCES account(id) ON DELETE SET NULL
);

ALTER TABLE account ADD COLUMN notificationPrefs TEXT
  DEFAULT '{"likes":true,"comments":true,"follows":true}';
```

**Backend:**

New file: `routes/notifications.ts`
- `GET /api/notifications` — unread notifications, max 20, sorted by recency.
- `PATCH /api/notifications/:id/read` — mark single notification as read.
- `DELETE /api/notifications/:id` — dismiss notification.

Update `routes/likes.ts`, `comments.ts`, `follows.ts` — on create, insert a notification row for the affected user.

Update `routes/auth.ts` `GET /api/auth/me` — include `unreadNotificationCount`.

**Frontend:**

New component `components/NotificationBell.tsx`:
- Icon in navbar with unread badge count.
- Dropdown on click: last 5 notifications + "See all" link.
- Each item: message, relative time, link to related content.
- Polls `GET /api/notifications` every 10 seconds; exponential backoff (10→30→60s) when no new items.

New page `pages/NotificationsPage.tsx` at `/notifications`:
- Full list, 20/page cursor-paginated.
- Filter tabs: All / Unread / Likes / Comments / Follows.
- "Mark all as read" button.

Update `main.tsx` to add `/notifications` route.

**Polling risk:** At high user counts (>100k), 10s polling generates significant DB load. Mitigate with exponential backoff. WebSocket upgrade is the Phase 3 path.

**Tests to write:**
- Notification row created on like, comment, and follow
- `GET /api/notifications` respects `isRead` filter
- Mark-as-read updates the flag
- Soft-deleted related content doesn't crash notification queries

---

### Batch 7 — Badge & Achievement System (~5–7 hrs) ⬜

**Goal:** Milestone-based gamification; badges awarded automatically.

**Schema additions:**
```sql
CREATE TABLE badge_definition (
  id TEXT PRIMARY KEY,       -- 'pins_10', 'likes_50', etc.
  name VARCHAR(100),
  description VARCHAR(200),
  icon VARCHAR(2000),        -- emoji or image URL
  criteria TEXT              -- JSON: {type, threshold}
);

CREATE TABLE user_badge (
  userID INTEGER,
  badgeID TEXT,
  awardedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userID, badgeID),
  FOREIGN KEY (userID) REFERENCES account(id) ON DELETE CASCADE,
  FOREIGN KEY (badgeID) REFERENCES badge_definition(id)
);
```

**Backend:**

New file: `services/badges.ts`
- `checkAndAwardBadges(userID): Promise<string[]>` — compute earned badges, insert new ones (idempotent via `INSERT OR IGNORE`), return newly awarded badge IDs.
- Badge criteria to implement:
  - `pins_10` — created 10+ pins
  - `likes_50` — received 50+ likes on own pins
  - `visited_25` — visited 25+ places
  - `commented_20` — left 20+ comments
  - `follower_10` — gained 10+ followers

New file: `routes/badges.ts`
- `GET /api/badges` — all badge definitions (no auth required).
- `GET /api/users/:userID/badges` — user's earned badges with award dates.

Call `checkAndAwardBadges` from:
- `routes/pins.ts` on pin create
- `routes/likes.ts` on like create (notify pin owner)
- `routes/pinStatus.ts` on `visited` status set
- `routes/follows.ts` on follow (notify the followed user)

**Frontend:**

Update `pages/UserProfile.tsx`:
- New "Badges" section/tab: grid of earned badge icons + names.
- Hover tooltip: badge description and award date.

New component `components/AchievementUnlockedToast.tsx`:
- Fires when `checkAndAwardBadges` returns new badge IDs.
- Message: "Achievement Unlocked! 🏆 {badge name} — {description}"
- Auto-dismisses after 5 seconds.

**Tests to write:**
- Badge criteria computation for each badge type
- User earns badge when threshold is first crossed
- `INSERT OR IGNORE` idempotence (earning same badge twice = 1 row)
- `GET /api/badges` returns all definitions without auth

---

### Batch 8 — Pin Import / Export (~6–8 hrs) ⬜

**Goal:** Bulk import and export pins for data portability.

**No new schema required.**

**Backend:**

New file: `routes/importExport.ts` (or split into `import.ts` and `export.ts`)

`POST /api/pins/import` — multipart form upload:
- Accept `.geojson` (GeoJSON FeatureCollection) or `.csv` (lat,lng,title,description,tags,image_url).
- Validate: lat/lng in range, title required, max 50 pins per import.
- Rate-limit: 10 imports/hour per user to prevent abuse.
- Return: `{imported: N, skipped: N, errors: [{row, reason}]}`.

`GET /api/pins/export?format=geojson|csv` — export current user's own pins:
- GeoJSON: standard FeatureCollection with all pin properties.
- CSV: one row per pin with headers.
- Response as file attachment (`Content-Disposition: attachment`).

New file: `services/importParser.ts`
- `parseGeoJSON(buffer: Buffer): ParsedPin[]`
- `parseCSV(buffer: Buffer): ParsedPin[]`

**Frontend:**

New component `components/ImportModal.tsx`:
- File input (accept `.geojson`, `.csv`).
- Preview step: "Found X pins. Continue?"
- Upload progress indication.
- Success state: "Imported 12 pins. View them on the map."

New component `components/ExportButton.tsx`:
- Format selector dropdown: GeoJSON / CSV.
- Triggers `GET /api/pins/export?format=...` download.

Update `Home.tsx`:
- "Import / Export" option in sidebar (or Sidebar "..." menu).
- After successful import: re-fetch pins and show toast.

**Tests to write:**
- GeoJSON parsing with valid + malformed input
- CSV parsing with missing / extra columns
- Import enforces 50-pin max limit
- Export returns valid GeoJSON FeatureCollection format
- Export returns valid CSV with correct headers

---

## Recommended Implementation Order (Phase 2 remaining)

**Batch 2 → 5 → 6 → 3 → 7 → 4 → 8**

Rationale:
- **2** (Filtering) — zero schema, immediate user value, low risk.
- **5** (Moderation) — operational safety; soft-delete schema affects Batches 6+ if we delay.
- **6** (Notifications) — depends on the follow graph (Batch 1 ✅) and comment/like actions already in place.
- **3** (Recommendations) — leverages the follow graph; defer until after moderation is stable.
- **7** (Badges) — lightweight; builds on likes and pin_status counts already queryable.
- **4** (Trip Comparison) — self-contained trip feature, lower cross-batch dependency.
- **8** (Import/Export) — utility; no blockers but lowest core-engagement impact.

---

## Estimated Hours

| Batch | Feature | Est. Hours |
|-------|---------|-----------|
| 2 | Advanced Pin Filtering | 6–8 |
| 3 | Pin Recommendations Engine | 8–10 |
| 4 | Trip Comparison Tool | 7–9 |
| 5 | Community Moderation & Reporting | 6–8 |
| 6 | Real-Time Notifications | 10–12 |
| 7 | Badge & Achievement System | 5–7 |
| 8 | Pin Import / Export | 6–8 |
| **Total** | | **48–62 hrs** |

---

## Known Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Dev DB drifts from `create.sql` | Medium | Apply manual migration to `database/database.db` when adding schema; tests always use `:memory:` so they don't catch this |
| `pin.createdAt` backfill (already deployed) | Low | Existing pins were backfilled to `datetime('now', '-30 days')`. The Trending endpoint will surface those pins artificially for the first week after a fresh deploy against a legacy DB. Acceptable; surfaced to users if needed. |
| Activity union query at scale | Medium | `GET /api/me/activity` is a 5-way `UNION ALL` ordered by timestamp. Fine at launch; flag for review when any user exceeds ~10k total rows across all sub-queries. Cache or paginate earlier if needed. |
| Privacy leak across endpoints | High | Private profiles (`profileVisibility='private'`) must be filtered on **every** endpoint that returns user-linked data — including `/api/pins/recommended`, `/api/me/feed`, and follower lists. Each new endpoint that touches user data must explicitly enforce the privacy check. Write a cross-endpoint privacy test. |
| Notification polling load at scale | Medium | Exponential backoff; plan WebSocket migration for Phase 3 |
| Recommendations cold-start (new users) | Low | Fall back to trending pins when follow graph is empty |
| Soft-delete migration (Batch 5) | Medium | All read endpoints in pins.ts / posts.ts / comments.ts must add `WHERE isDeleted = 0` — easy to miss one; write a test that creates a deleted object and confirms it's absent from every list endpoint |
| Recommendations cache invalidation | Low | 5-minute in-memory TTL is sufficient at current scale |
| Badge continent detection | Low | Deferred; current badge set (`pins_10`, `likes_50`, etc.) avoids geocoding |
| Import rate-limit bypass | Medium | Enforce file-size limit before parsing (reject >1 MB) in addition to the 50-pin row cap |

---

## Deferred Batches (Phase 2.5 — not scheduled)

These were in the original `feature_plans_2.md` but dropped from the active roadmap. Recorded here so the specs aren't lost.

### Batch 9 — Heatmap Customization (~5–7 hrs)

Filter and customize the Mapbox heatmap layer by time range, tags, and followed users.

**Schema (optional):**
```sql
CREATE TABLE heatmap_view (
  id TEXT PRIMARY KEY,
  accountID INTEGER,
  name VARCHAR(80),
  filters TEXT NOT NULL, -- JSON: {timeRange: '7d'|'30d'|'90d'|'all', tags: [...], userGroup: 'all'|'followed'}
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (accountID) REFERENCES account(id) ON DELETE CASCADE
);
```

**Backend:** `GET /api/pins/heatmap?timeRange=7d&tags=tag1,tag2&userGroup=all|followed` — return lat/lng array for heatmap rendering; filter by creation date, tags, and (if `followed`) only from creators the user follows.

**Frontend:** Collapsible "Heatmap" section in `Home.tsx` sidebar with time range dropdown, tag checkboxes, followed-only toggle, and "Save as view" button. Render via Mapbox heatmap layer; update on filter change.

**Tests:** Time range filtering, tag + userGroup combined filters.

---

### Batch 10 — Comment Threading (~8–10 hrs)

Nested replies instead of flat comment list; max 2 levels deep.

**Schema:**
```sql
ALTER TABLE comment ADD COLUMN parentCommentID INTEGER REFERENCES comment(id) ON DELETE CASCADE;
CREATE INDEX idx_comment_parentID ON comment(parentCommentID);
```

**Backend:** Update `POST /api/comments` to accept optional `parentCommentID`. Update `GET /api/pins/:id/comments` to return nested structure `{id, text, author, replies: [...]}`. Flatten any depth > 2 in the service layer before returning.

**Frontend:** Refactor `DetailedPinModal.tsx` comments section into a recursive `CommentThread` component. "Reply" button on each comment opens an inline textarea. Replies indented 20–40px.

**Tests:** Recursive fetch with replies, reply-to-reply (2 levels), delete parent cascades all replies, POST with `parentCommentID` creates correct hierarchy.

---

## Dev Workflow Reference

```bash
# Start both services
pnpm dev

# Backend tests (from Backend/)
pnpm test
pnpm test -- --testPathPattern=pins     # single file
pnpm test:coverage

# Frontend type-check + build
cd Frontend && pnpm build

# OpenAPI: all new routes must be added to Backend/openapi.yml
# express-openapi-validator validates every request at runtime

# SQLite dev DB location
Backend/database/database.db

# Apply new schema to dev DB (tests always use :memory: and don't need this)
sqlite3 Backend/database/database.db "ALTER TABLE ... / CREATE TABLE ..."
```
