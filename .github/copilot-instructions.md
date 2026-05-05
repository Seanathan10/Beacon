# Beacon — Copilot Instructions

## Project Overview

**Beacon** is a sustainable travel planning and local discovery platform designed to help users discover and share local attractions, plan eco-friendly trips, and support small businesses and independent venues over corporate chains.

### Key Features

- **Interactive Map Interface** — Explore a world map with pins representing local points of interest (small businesses, attractions, cafés, farmer's markets, etc.)
- **Local Discovery** — Browse, comment on, like, and bookmark local attractions near your location
- **Community Contributions** — Users can create new pins with descriptions, images, and details that are visible to the entire community
- **Heatmap Visualization** — Zoom out to see a heatmap showing popular hotspots and attraction density by area
- **AI-Powered Trip Planner** — Plan trips between cities/countries with AI assistance that:
  - Suggests low-carbon transportation methods (flights, trains, buses)
  - Creates day-by-day itineraries
  - Calculates carbon savings vs. traditional transportation
  - Suggests local attractions at destinations
- **Community Posts** — Share and engage with travel stories, tips, and recommendations

### Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Mapbox GL, Tailwind CSS, React Router 7
- **Backend:** Express 5, TypeScript, Node.js
- **Database:** SQLite3 (serverless, file-based)
- **APIs Used:** Mapbox (location, mapping), Google Gemini 2.0 Flash (AI trip planning), LocationIQ (geocoding)
- **Package Manager:** pnpm 9 (monorepo workspace)

---

## How It Works

This is a monorepo containing a React + Vite frontend, Express + Node.js backend, and SQLite database.

## Build, Test, and Lint Commands

### Frontend (React + Vite)
```bash
cd Frontend

# Development (runs on http://localhost:5173, proxies /api to backend)
pnpm dev

# Production build
pnpm build

# Preview production build locally
pnpm preview

# Lint
pnpm lint
pnpm lint:fix
```

### Backend (Express + TypeScript)
```bash
cd Backend

# Development (runs on http://localhost:3000)
pnpm dev

# Production start
pnpm start

# Tests (full suite)
pnpm test

# Tests with logs visible (default suppresses logs)
pnpm test:logs

# Tests in watch mode (re-runs on file changes)
pnpm test:watch

# Single test file: pnpm test -- <pattern>, e.g.
pnpm test -- auth.test.ts

# Lint
pnpm lint
pnpm lint:fix
```

### Root
```bash
# Start both backend and frontend in parallel
pnpm dev

# Build frontend only
pnpm build

# Start backend only (production mode)
pnpm start
```

## High-Level Architecture

### Project Structure
- **Frontend/** — React 19 + TypeScript + Vite + Mapbox GL
- **Backend/** — Express 5 + TypeScript + SQLite3
- **GeoData/** — Geospatial data assets
- **database_backup/** — Database snapshots

### Frontend Key Directories
- **src/pages/** — Route pages (Home, Landing, Login, PostsPage, PublicCollection, SharedItinerary, AuthHook, etc.)
- **src/components/** — Reusable React components (Map integration, modals, UI)
- **src/utils/** — Helper functions (geocoding, theme)
- **src/types/** — TypeScript type definitions
- **src/assets/** — Static assets
- **constants.ts** — API URL configuration with environment detection

### Backend Key Directories
- **routes/** — API endpoints (auth, pins, posts, comments, likes, bookmarks, pinStatus, search, trip, share)
- **services/** — Business logic utilities (AI, Amadeus, Google Routes, hotels)
- **database/** — SQLite schema and migrations
- **tests/** — Jest test suite with setup helpers (14 test files)
- **types/** — Shared TypeScript definitions
- **utils/** — Utility functions (carbon, geocoding)

### Development Environment Setup
The application automatically switches between local and production backends:
- **Development** (`pnpm dev`): Uses `http://localhost:3000` via Vite proxy
- **Production** (`pnpm build`): Uses `https://api.beaconapp.live`

**Frontend environment files:**
- `.env` — Base configuration (committed)
- `.env.development` — Dev overrides (committed, `VITE_API_BASE=""` for proxy)
- `.env.production` — Production overrides (committed, `VITE_API_BASE=https://api.beaconapp.live`)
- `.env.local` — Local secrets (gitignored, for personal API keys)

**Backend environment:**
- Requires `SECRET` env var (JWT secret) at startup — process exits if missing
- Uses SQLite database in `database/` directory

### API Architecture
- **OpenAPI spec:** `Backend/openapi.yml` — single source of truth for endpoints
- **Request validation:** Express OpenAPI validator enforces schema compliance
- **Rate limiting:** Per-user (20 req/min) on trip/AI endpoints to prevent quota exhaustion
- **CORS:** Whitelist-based (backend, Vercel deployments, localhost dev)
- **JWT auth:** Bearer token in `Authorization` header, validated by middleware

### Database
- **SQLite3** — serverless, file-based
- **Schema:** `Backend/database/create.sql` (12 tables)
- **Cascade deletes:** Comments, likes, bookmarks, and reactions cascade when their parent is deleted
- **Foreign keys:** 18 relationships for referential integrity and cascade behavior
- **Junction tables:** `post_upvote`, `likes`, `bookmark`, `comment_reaction` for deduplication and relationships

## Key Conventions

### TypeScript & Typing
- **ESM modules** in both frontend and backend
- **Strict mode:** No implicit `any`
- **Relative imports OK** but no path aliases in backend (only frontend has `@` alias to `src/`)

### API Design
- **RESTful endpoints** — POST for mutations, GET for reads
- **Request body:** Data passed in JSON body, not URL params
- **Responses:**
  - 2xx on success (200 for updates, 201 for creation, 204 for deletes)
  - 4xx on client error (400 invalid, 401 auth, 403 forbidden, 404 not found, 409 conflict)
  - 5xx on server error
  - `Retry-After` header on 429 rate limit
  - `{ message: "..." }` JSON format for errors
- **Error messages:** Wrapped in `{ message: "..." }` JSON

### Backend Route Handlers
Pattern observed across all route files:
```typescript
// Handler function with typed params
export async function handler(req: Request, res: Response): Promise<void>

// Always respond to every path (no missed cases)
res.status(200).json({ data })  // or .send() for non-JSON
res.status(400).json({ message: "..." })
```

### Security Patterns
- **IDOR prevention:** Always check `req.user?.id` against resource owner before updating/deleting
- **No direct input to SQL:** Use parameterized queries (db library handles this)
- **JWT validation:** Middleware validates `Bearer <token>` format before route handler
- **Secrets in env vars:** Never hardcode API keys; use `.env.local` (gitignored)
- **Input sanitization:** Use dompurify for user content in posts/comments

### Frontend Component Patterns
- **React Router 7** for navigation (`<NavLink>`, `useNavigate()`)
- **Mapbox GL** for map rendering (use `react-map-gl` wrapper)
- **Modals:** Controlled via state (e.g., `<AuthModal isOpen={...} onClose={...} />`)
- **API calls:** Fetch from `BASE_API_URL` constant, handle errors explicitly
- **Local storage:** Store auth tokens (`accessToken`, `userId`, `userEmail`)

### Testing Conventions
- **Jest** with `ts-jest` preset
- **Test files:** `Backend/tests/*.test.ts` (convention: match route file name)
- **Test DB:** In-memory SQLite, created fresh per test suite
- **Helper utilities:** `Backend/tests/helpers/testApp.ts` provides `createTestApp()` and `createTestUser()`
- **Test logs:** Suppressed by default; enable with `TEST_LOGS=1 pnpm test:logs`
- **Supertest:** Use for HTTP assertions on the Express app
- **Setup file:** `Backend/tests/setup.ts` runs before all tests, initializes test DB

Example test structure:
```typescript
import request from 'supertest';
import { createTestApp } from './helpers/testApp';

let app: any;
beforeAll(async () => {
  app = await createTestApp();
});

describe('Endpoint Name', () => {
  it('should return 200 on success', async () => {
    const response = await request(app).post('/api/endpoint').send({...});
    expect(response.status).toBe(200);
  });
});
```

### Common Bug Patterns (Fixed in Recent Changes)
- **Stale denormalized columns:** Always derive counts from junction tables (e.g., upvotes from `post_upvote`)
- **Missing auth checks:** Verify `req.user?.id` matches resource owner
- **Type coercion:** Use `===` not `==` for comparisons
- **Console leaks:** No Node.js `console` imports in browser code
- **Unused imports:** Clean up before commit
- **CORS issues in dev:** Frontend proxy (`/api` → `http://localhost:3000`) handles this

### Linting & Code Quality
- **ESLint:** Configured in both frontend and backend
- **No path imports in backend:** Avoid complex module resolution; use relative paths
- **Auto-fix:** Run `pnpm lint:fix` to resolve most issues automatically
- **Pre-commit:** Hook up linting in CI/CD if needed (not currently configured locally)

### Known Limitations & Workarounds
- **Vite proxy CORS:** Only works in dev (`pnpm dev`). Production builds connect directly to hosted API.
- **In-memory rate limiter:** Periodic pruning prevents unbounded growth; doesn't persist across server restarts
- **Test DB:** Each test suite gets a fresh DB; manual cleanup not needed
- **Mapbox telemetry:** Return `null` (not `{ url: '' }`) in telemetry callback to avoid network errors
