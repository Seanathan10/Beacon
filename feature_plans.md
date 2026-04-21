# Beacon — 20 Quick Wins Implementation Plan

Source: management request covering 20 features across 6 themes (Discovery, Social, Organization, Stats, QoL, Sharing). Total estimate ~36–46 hrs grouped into 6 shippable batches.

## Repo grounding

Key constraints discovered by inspecting the codebase (drives the batching below):

- `pin` table has **no `createdAt`** column.
- No bookmark, folder, visited, or reaction tables exist.
- `post.location` is a free-text string with **no lat/lng** columns.
- `Frontend/src/utils/theme.ts` auto-follows system theme but has **no manual override or persistence**.
- `SavedPlacesPanel.tsx` lists the user's own pins — it is **not** a bookmark system.

## Batching strategy

Each batch pairs user value with the schema it requires (no foundation-only batches that rot unused). Order ramps risk: frontend-only first, then schema deltas, then aggregate endpoints. Batches are sized so each can ship as one PR with its own tests and OpenAPI updates.

---

## Batch 1 — Quality-of-Life frontend (~6–8 hrs)

Zero schema, zero API. Confidence-builder with no migration risk.

| Feature | Plan |
|---|---|
| **Dark Mode toggle** | Extend `Frontend/src/utils/theme.ts`: add `getStoredTheme()` / `setStoredTheme()` reading `localStorage['beacon-theme']` with values `'light' \| 'dark' \| 'system'`. Change `initializeTheme` to prefer stored over system. 3-state toggle UI (sun / moon / auto) in `components/Sidebar.tsx`. Migrate CSS from `@media (prefers-color-scheme: dark)` to `[data-theme="dark"]` selectors on `html` so manual override actually works. |
| **Keyboard Shortcuts** | New `Frontend/src/hooks/useKeyboardShortcuts.ts` registering a global `keydown` listener. Bindings: `/` focus `SearchBar`, `c` open `NewPinModal`, `?` open new `ShortcutsHelpModal.tsx`. Ignore when event target is `input`, `textarea`, or `[contenteditable]`. Mount hook in `Home.tsx`. |
| **Saved Drafts** | In `NewPinModal.tsx`, debounce form state into `localStorage['beacon-pin-draft']`. On mount, hydrate if present and show "Restore draft?" banner. Clear on successful submit or explicit discard. |
| **Pin Cloning** | Add "Create Similar" button to `DetailedPinModal.tsx`. Opens `NewPinModal` with `title/description/tags/image` pre-filled and `lat/lng/address` blank (user re-picks location). Pass via prop, not global state. |

**Deliverable:** 1 PR, no backend changes, no OpenAPI changes.

---

## Batch 2 — Pin metadata & discovery (~6–8 hrs)

Bundles all `pin`-table migrations together so we don't revisit that schema twice.

### Schema migration (`Backend/database/create.sql` + one-off script for existing DBs)

- `pin.createdAt DATETIME DEFAULT CURRENT_TIMESTAMP` — backfill existing rows to `datetime('now', '-30 days')` so they aren't all "trending" on launch.
- New `pin_status (pinID, accountID, status TEXT CHECK(status IN ('visited','wishlist')), PRIMARY KEY (pinID, accountID))`.
- New `search_history (id, accountID, query, createdAt)` + index on `(accountID, createdAt DESC)`.

### Backend

- `routes/pins.ts`:
  - `GET /api/pins/trending?days=7` — order by `likes + 3*recency_score`, limit 20.
  - Accept `sort=distance&lat=&lng=` on the main list endpoint for Near Me Priority.
- New `routes/pinStatus.ts`: `PUT /api/pins/:id/status` body `{status}`, `DELETE /api/pins/:id/status`. Join into `GET /api/pins` response as `userStatus` for authed users.
- New `routes/search.ts`: `POST /api/search/history` (record), `GET /api/search/history` (last 10), `DELETE /api/search/history/:id`. Cap retention at last 50 per user.
- Add all endpoints to `openapi.yml`.

### Frontend

- `SearchBar.tsx`: dropdown below input showing recent queries; POST to history on submit.
- `Home.tsx`: sort dropdown (Recent / Trending / Near Me). Near Me uses `navigator.geolocation.getCurrentPosition`, cached for the session.
- `Pin.tsx` + `DetailedPinModal.tsx`: two toggle buttons for Visited (✓) and Wishlist (☆), optimistic update. Color marker differently when visited (gray overlay / checkmark).

**Tests:** Jest files for trending sort math, status endpoint auth, history retention cap.

---

## Batch 3 — Bookmarks, folders, homepage shortcuts, public collections (~8–10 hrs)

Largest batch. Chains the bookmark primitives through to shareable collection URLs.

### Schema

- `bookmark_folder (id, accountID, name VARCHAR(80), createdAt, isPublic INTEGER DEFAULT 0)`
- `bookmark (pinID, accountID, folderID NULL, createdAt, PRIMARY KEY (pinID, accountID))` — null folder = "uncategorized".

### Backend

- New `routes/bookmarks.ts`:
  - `GET/POST/DELETE /api/bookmarks`
  - `GET /api/bookmarks/folders`
  - `POST/PATCH/DELETE /api/bookmarks/folders/:id`
  - `PATCH /api/bookmarks/:pinID` to reassign between folders
- Extend `routes/share.ts`: `GET /api/share/collection/:folderID` — returns folder + pins if `isPublic=1`, else 404. No auth required.
- Add `GET /api/likes/user` to `routes/likes.ts` (needed for Liked tab — doesn't exist yet).
- OpenAPI spec for all.

### Frontend

- Rework `SavedPlacesPanel.tsx` into a tabbed sidebar section: **My Pins** (existing `/api/pins/user`), **Bookmarked** (`/api/bookmarks`), **Liked** (new `/api/likes/user`).
- Folder UI: inline dropdown on each bookmarked pin to reassign; "+ New folder" button; rename/delete via ⋯ menu.
- New `pages/PublicCollection.tsx` at route `/collection/:folderID` — mirrors `SharedItinerary.tsx`: read-only pin list + map.
- Share button on folder copies `https://beaconapp.live/collection/:id` if public, else prompts "Make this folder public?".

---

## Batch 4 — Social & engagement (~7–9 hrs)

### Schema

- `comment_reaction (commentID, accountID, emoji VARCHAR(8), PRIMARY KEY (commentID, accountID, emoji))`
- `post.latitude REAL`, `post.longitude REAL` — geocode `post.location` on insert (reuse LocationIQ or Google Routes key). One-time backfill script for existing rows.

### Backend

- `routes/comments.ts`:
  - `POST /api/comments/:id/reactions` body `{emoji}` (idempotent upsert)
  - `DELETE /api/comments/:id/reactions/:emoji`
  - Join reaction counts + user's own reactions into comment fetch.
- Derive badges in comment fetch — no schema needed:
  - `isCreator`: `comment.accountID == pin.creatorID`
  - `hasLiked`: exists-subquery on `likes`
  - Return as flags on the comment payload.
- `routes/posts.ts`: `GET /api/posts/nearby?bbox=minLng,minLat,maxLng,maxLat` using new post coords.
- OpenAPI for all of the above.

### Frontend

- `DetailedPinModal.tsx` comments section: emoji reaction picker (fixed set 👍 ❤️ 😂 😮 🔥), show counts, highlight user's own reactions. Badge pills next to username: "Creator", "Liked this".
- New `components/NearbyPostsDrawer.tsx` on `Home.tsx` showing posts inside current map viewport; refetch on `moveend` debounced 400ms.
- Extract `components/Comment.tsx` if still inline; give each `id={`comment-${id}`}` + a copy-link button that writes `?pin=X#comment-Y` to the clipboard. `DetailedPinModal` on open checks hash and scrolls.

---

## Batch 5 — Stats, gamification, activity (~7–9 hrs)

Mostly new aggregate endpoints; light frontend. No new tables except one column.

### Schema

- `account.lastSeenAt DATETIME` — updated on auth middleware hit.

### Backend — new `routes/stats.ts`

- `GET /api/me/stats` — returns `{pinsNearby, bookmarked, newSinceLastVisit, totalLikesReceived, totalCommentsReceived, influenceScore}`.
- `GET /api/me/activity?limit=50&before=...` — cursor-paginated union of:
  - pins created
  - comments made
  - likes received
  - comments received
  - upvotes received

  Implement as 5 `SELECT`s with `UNION ALL` ordered by timestamp. Cap each sub-select at `LIMIT 200` before union to keep it cheap.
- `GET /api/pins/:id/similar` — "Others Also Liked" collaborative filter: find accounts who liked this pin, return top 5 other pins they liked. One SQL with `GROUP BY pin.id ORDER BY COUNT(*) DESC`.

### Frontend

- `components/QuickStatsWidget.tsx` on Home sidebar — one card, one fetch.
- `pages/ActivityPage.tsx` at `/activity` — timeline with icons per event type, cursor paginated.
- `DetailedPinModal.tsx`: horizontal scroll carousel at bottom from `/pins/:id/similar`.
- Influence score surfaces on `QuickStatsWidget` + profile mini-badge.

---

## Batch 6 — Share polish (~2 hrs)

Small, ships last. Builds on collection URLs from Batch 3.

- `components/ShareMenu.tsx` — dropdown with:
  - Twitter intent URL
  - Facebook sharer URL
  - `navigator.share` if available
  - Copy-link fallback
- Mount on `DetailedPinModal.tsx`, `Post.tsx`, `SharedItinerary.tsx`, and `PublicCollection.tsx` (from Batch 3).
- No backend, no schema.

---

## Summary

| Batch | Schema delta | New endpoints | New frontend files | Hours |
|---|---|---|---|---|
| 1 QoL | — | — | 1 modal, 1 hook | 6–8 |
| 2 Pin metadata | `pin.createdAt`, `pin_status`, `search_history` | 5 | — (in-place edits) | 6–8 |
| 3 Bookmarks | `bookmark`, `bookmark_folder` | 8 | 1 page, panel rework | 8–10 |
| 4 Social | `comment_reaction`, `post.lat/lng` | 4 | 1 drawer, 1 comment cmpt | 7–9 |
| 5 Stats | `account.lastSeenAt` | 3 | 1 widget, 1 page | 7–9 |
| 6 Share | — | — | 1 menu cmpt | ~2 |
| **Total** | 5 new tables, 4 columns | ~20 | ~6 | **36–46** |

### Recommended order

**1 → 2 → 3 → 6 → 4 → 5**

- **1** validates the dev loop with no risk.
- **2** front-loads the only `pin` migration.
- **3** delivers the highest-visibility feature (bookmarks) before social complexity.
- **6** is a cheap win that capitalizes on 3's collection URLs.
- **4** and **5** are heaviest, so last when the team has most context.

### Risks to flag

- **`pin.createdAt` backfill** — existing pins have no real creation date. The `-30 days` heuristic will make Trending look odd for the first week post-deploy. Acceptable if surfaced.
- **Post geocoding (Batch 4)** — geocoding `post.location` strings will fail or be ambiguous on an estimated ~5% of rows. Plan for nullable coords + fallback to location-only posts that don't appear on the map.
- **Activity endpoint cost (Batch 5)** — union query scales poorly past ~10k rows per user. Fine for launch; flag for review when a user crosses that threshold.
- **Folders vs Collections overlap (Batch 3)** — "Bookmark Folders" and "Public Collections Preview" both imply a folder-as-shareable-collection model. Worth confirming with Product before building that this is the intended model (rather than, e.g., collections being a separate curated list distinct from folders).

### Feature-to-batch index

| # | Feature | Batch |
|---|---|---|
| 1 | Trending This Week | 2 |
| 2 | Near Me Priority | 2 |
| 3 | Search History | 2 |
| 4 | Others Also Liked Carousel | 5 |
| 5 | Homepage Shortcuts | 3 |
| 6 | User Badges | 4 |
| 7 | Comment Reactions | 4 |
| 8 | Nearby Posts Feed | 4 |
| 9 | Bookmark Folders | 3 |
| 10 | Pin Cloning | 1 |
| 11 | Saved Drafts | 1 |
| 12 | Quick Stats Widget | 5 |
| 13 | Activity Dashboard | 5 |
| 14 | Influence Score | 5 |
| 15 | Dark Mode | 1 |
| 16 | Visited vs Want-to-Visit | 2 |
| 17 | Keyboard Shortcuts | 1 |
| 18 | Quick Share Links | 6 |
| 19 | Public Collections Preview | 3 |
| 20 | Comment Permalinks | 4 |
