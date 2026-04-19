# Beacon — Changes & Bug Fixes

## Database
- Fixed `email` column in `account` table from `VARCHAR(20)` to `VARCHAR(254)` to actually fit email addresses.
- Added missing `post_upvote` junction table for deduplicating upvotes.
- Added `ON DELETE CASCADE` to `comment`, `likes`, and `post_upvote` so deleting a pin cleans up its related rows.
- Added 9 indexes on foreign key columns for faster queries.
- Added `likes INTEGER DEFAULT 0` and `PRIMARY KEY` constraint to the `likes` table.

## Backend — Security
- Fixed IDOR vulnerability in `updatePost`/`deletePost` where a `NULL` creatorID allowed any user to edit or delete ownerless posts.
- Removed `upvotes` as a directly writable field in `updatePost` — it can no longer be set to an arbitrary number by any user.
- Fixed CORS to return `cb(null, false)` for blocked origins instead of throwing an error that leaked origin info in the response body.
- Added startup check that exits the process if the `SECRET` environment variable is missing.
- Added `next: NextFunction` type (replacing bare `Function`) and explicit `Bearer <token>` format validation in the auth middleware.
- Added `.env` to `.gitignore` — the JWT secret and API keys were previously being committed to git.
- Added per-user rate limiting (20 req/min) on all trip/AI endpoints to prevent API quota exhaustion.
- Added periodic pruning of the in-memory rate limiter Map to prevent unbounded memory growth.

## Backend — Logic Bugs
- Fixed likes count in `getAllPins` to derive from the `likes` junction table instead of a stale denormalized `p.likes` column that was always 0.
- Fixed `upvotePost` to derive the upvote count from `COUNT(*) FROM post_upvote` instead of incrementing a denormalized column that drifted under concurrency.
- Fixed `getPin` to return `404` for non-existent pins instead of `200` with an empty array.
- Fixed `updatePin` to read the `description` field from the request body instead of `message`.
- Fixed carbon savings formula in trip planning — it was inverted, showing negative savings when eco options were better.
- Fixed `getLikes` double-counting — it was adding `p.likes` (base column) on top of the junction table count.
- Fixed `share` route to return `201` on creation instead of `200`.
- Added 512 KB payload size limit to `POST /api/share` to prevent storage exhaustion.
- Fixed Gemini model name from the invalid `"gemini-3-flash-preview"` to `"gemini-2.0-flash"`.
- Fixed flight carbon emission factors — all three distance tiers were incorrectly set to the same value.
- Moved the SSE trip stream endpoint to after the OpenAPI validator so its request body is actually validated.
- Added `clearRateLimitStoreForTesting()` export so tests can reset rate limit state between runs.

## Backend — Code Quality
- Restored the haversine great-circle distance function and `getPinsNearCoordinate`, wired up as `POST /api/pins/nearby`.
- Removed dead `getPinsNearCoordinate` export that was never registered as a route (replaced with a real route registration).
- Fixed `tsconfig.json` `moduleResolution` from `"node"` to `"node16"` to match the ESM `"type": "module"` package config.
- Deleted dead `flightService.ts` and `transitService.ts` files that were never imported anywhere.
- Removed the `axios` dependency that was only used by the deleted dead-code files.

## OpenAPI Spec
- Renamed `message` to `description` in the `POST /api/pins` and `PUT /api/pins/:id` request body schemas to match the actual handler.
- Removed `upvotes` from the `PUT /api/posts/:id` request body schema.
- Added `409` response documentation to `POST /api/posts/:id/upvote`.
- Fixed `POST /api/share` documented response from `200` to `201`.
- Added `POST /api/pins/nearby` endpoint definition with the haversine coordinate search.

## Frontend — Bug Fixes
- Fixed `PostsPage` — it was fetching and deleting from `/api/pins` instead of `/api/posts`, showing map pins on the community posts page.
- Fixed `PostsPage` crash from `JSON.parse(post.tags)` on CSV-formatted tag strings — backend already returns arrays.
- Fixed `Login.tsx` — it only stored `accessToken` and not `userEmail` or `userId`, leaving the app in a broken state after login.
- Fixed `Registration.tsx` — the submit handler only `console.log`'d credentials and never called the API; replaced with a real registration flow.
- Fixed broken second submit button in `Registration.tsx` that wrapped a `NavLink` inside a `<button type="submit">`.
- Fixed `DetailedPinModal` ownership check from `==` to `===`.
- Fixed `DetailedPinModal` save failure to show the user an alert instead of silently logging to console.
- Fixed Mapbox telemetry block to return `null` instead of `{ url: '' }` which caused a network error in mapbox-gl.
- Removed `import console from "console"` (a Node.js module) from the browser React component `NewPinModal.tsx`.
- Removed unused `import { data } from "react-router"` from `Pin.tsx`.
- Replaced the fully commented-out `App.tsx` with a clean empty export.

## Frontend — Features
- Added `name` field to `AuthModal` registration form — users can now set their display name when signing up.
- `AuthModal` now sends the `name` field to `POST /api/register`.

## Tests
- Added full unit test suite for all functions in `utils/carbon.ts` (`tests/carbon.test.ts`).
- Added rate limiting tests verifying the 11th auth request gets `429` with a `Retry-After` header (`tests/rate-limit.test.ts`).
- Added cascade delete integration test verifying comments and likes are removed when their pin is deleted.
- Added `POST /api/pins` description field aliasing test.
- Added `POST /api/share` payload size limit test (513 KB → 413).
- Added cross-user pin visibility test for `GET /api/pins`.
- Updated posts tests to reflect that `upvotes` is now derived from the junction table, not the denormalized column.
- Updated posts tests to reflect that null-creatorID posts correctly return `403` instead of allowing any user to edit them.
- Updated upvote tests to expect `409` on duplicate upvote attempts.

## Infrastructure
- Updated API URL from `api.truthnuke.tech` to `api.beaconapp.live` in `constants.ts` and `.env.production`.
- Removed `api.truthnuke.tech` from the backend CORS allowed origins list (a backend URL should not be in its own CORS list).
- Added `api.beaconapp.live` public hostname to the Cloudflare tunnel config and CNAME record to the `beaconapp.live` DNS zone.
