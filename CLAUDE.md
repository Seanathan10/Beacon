# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Beacon is a sustainable travel and local community discovery app. It has two main features:
1. A map-based social layer where users drop pins for local attractions with photos, tags, likes, and comments.
2. An AI-powered trip planner that compares transport options (flight, train, drive) by carbon footprint, then generates a Gemini-based itinerary.

## Monorepo Layout

pnpm workspaces with two packages:

- `Frontend/` — React 19 + Vite 7 + TypeScript + Tailwind CSS 4 + Mapbox GL
- `Backend/` — Express 5 + TypeScript + SQLite3 (`DatabaseSync`) + JWT auth + Google GenAI SDK

## Commands

**Root (runs both services in parallel):**
```bash
pnpm dev        # start backend + frontend concurrently
pnpm build      # production build of frontend
pnpm start      # start backend server
```

**Backend (`cd Backend`):**
```bash
pnpm dev              # tsx watch mode on localhost:3000
pnpm test             # Jest (all tests)
pnpm test -- --testPathPattern=auth   # run a single test file
pnpm test:watch       # watch mode
pnpm test:coverage    # coverage report
pnpm lint             # ESLint
pnpm lint:fix         # auto-fix
```

**Frontend (`cd Frontend`):**
```bash
pnpm dev          # Vite dev server on localhost:5173
pnpm build        # production build to dist/
pnpm preview      # preview production build
pnpm lint         # ESLint
pnpm lint:fix
```

## Environment Variables

**Backend** (`.env`, gitignored):
```
SECRET                   # JWT signing secret — process exits on startup if missing
PORT                     # default 3000
NODE_ENV                 # development | production | test
GEMINI_API_KEY
AMADEUS_CLIENT_ID
AMADEUS_CLIENT_SECRET
GOOGLE_MAPS_API_KEY
```

**Frontend** (see `Frontend/.env.example`):
```
VITE_MAPBOX_SECRET_TOKEN
VITE_MAPBOX_ACCESS_TOKEN
VITE_LOCATIONIQ_TOKEN
VITE_API_BASE            # empty string in dev (proxy), api.beaconapp.live in prod
```

## Architecture

### Request flow

Frontend makes requests to `/api/*`. In dev, Vite proxies these to `localhost:3000`. In prod the frontend points directly at `https://api.beaconapp.live`.

All API routes go through `Backend/index.ts` → individual route files in `Backend/routes/`. The `auth.check` middleware attaches `req.user` (JWT-verified) to protected routes.

### Database

SQLite with the synchronous `DatabaseSync` API (built-in Node.js, no wrapper). The helper in `Backend/database/db.ts` exposes a typed `query()` function. Schema lives in `Backend/database/create.sql` (7 tables: `account`, `pin`, `comment`, `likes`, `post`, `post_upvote`, `itinerary`). Tests use an in-memory `:memory:` database initialized from the same schema file.

### Auth

JWT stored in an httpOnly cookie. `bcrypt` with 12 rounds for passwords. Custom in-memory rate limiter (not express-rate-limit): 10 req/15 min per IP for auth, 20 req/min per user for AI trip endpoints.

### OpenAPI validation

`Backend/openapi.yml` defines the full API surface. `express-openapi-validator` validates every incoming request at runtime — if you add a new route, add its spec to the YAML too.

### AI / trip planning

`Backend/services/ai.ts` calls Gemini 2.0 Flash to generate itineraries. `Backend/services/amadeus.ts` handles flight search and carbon calculations. `Backend/services/googleRoutes.ts` handles transit/driving directions. Carbon emission logic lives in `Backend/utils/carbon.ts`.

### Frontend pages

- `Frontend/src/pages/Home.tsx` — main map interface (largest component, ~34 KB); Mapbox GL map, pin markers, sidebar, modals
- `Frontend/src/pages/Landing.tsx` — login / register
- `Frontend/src/pages/PostsPage.tsx` — community feed
- `Frontend/src/pages/SharedItinerary.tsx` — view a shared trip link

`Frontend/constants.ts` has `BASE_API_URL`, Mapbox layer styles, and color constants.

### Testing

Jest with ts-jest. `Backend/tests/setup.ts` creates a fresh in-memory SQLite DB before each test file and tears it down after. 13 test files cover auth, pins, posts, comments, likes, trip planning, carbon math, validation, and rate limiting. Set `TEST_LOGS=1` to see console output during a test run.
