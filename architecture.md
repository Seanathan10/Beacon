# Beacon — Architecture Diagrams

Mermaid diagrams describing the Beacon monorepo as it exists today (frontend service
layer + backend repository layer both in place). Render on GitHub, in VS Code with the
Mermaid extension, or at <https://mermaid.live>.

Contents:

1. [System context](#1-system-context)
2. [Frontend module structure](#2-frontend-module-structure)
3. [Backend request pipeline](#3-backend-request-pipeline)
4. [Backend layering: routes → repositories → SQLite](#4-backend-layering)
5. [Database ER model](#5-database-er-model)
6. [Sequence: dropping a pin](#6-sequence--dropping-a-pin)
7. [Sequence: two-phase trip planning over SSE](#7-sequence--two-phase-trip-planning)
8. [Deployment topology](#8-deployment-topology)

---

## 1. System context

```mermaid
graph TB
    User(["User — browser"])

    subgraph Vercel["Vercel — frontend"]
        SPA["React 19 SPA<br/>Vite 7 · TypeScript · Tailwind 4<br/>React Router v7"]
        Upload["/api/upload<br/>serverless function<br/>Frontend/api/upload.ts"]
    end

    subgraph API["api.beaconapp.live — Express 5 backend"]
        MW["Middleware chain<br/>helmet · CORS · CSRF · rate limit<br/>OpenAPI validator"]
        Routes["18 route modules<br/>Backend/routes/*"]
        Repos["14 repositories<br/>Backend/repositories/*"]
        Services["Domain services<br/>ai · amadeus · googleRoutes<br/>hotelService · challenges · notifications"]
        DB[("SQLite<br/>node:sqlite DatabaseSync<br/>beacon.db")]
    end

    subgraph Ext["External APIs"]
        Gemini["Gemini 2.0 Flash<br/>itineraries · trip Q and A"]
        Amadeus["Amadeus<br/>flights · IATA lookup"]
        GRoutes["Google Routes<br/>transit · driving"]
        GPlaces["Google Places<br/>eco-hotel search"]
        GGeo["Google Geocoding"]
        Nominatim["OSM Nominatim<br/>geocoding fallback"]
        LocationIQ["LocationIQ<br/>reverse geocode on pin drop"]
        Mapbox["Mapbox GL<br/>tiles · styles"]
        Blob["Vercel Blob<br/>pin images"]
        Plausible["Plausible Analytics"]
    end

    User --> SPA
    SPA -- "Mapbox GL JS" --> Mapbox
    SPA -- "reverse geocode" --> LocationIQ
    SPA -- "multipart image" --> Upload
    Upload -- "put pins/{ts}-{name}" --> Blob
    SPA -- "fetch /api/* · cookie auth" --> MW
    SPA -- "/metrics/* proxied" --> MW

    MW --> Routes
    Routes --> Repos
    Routes --> Services
    Repos --> DB
    Services --> DB

    Services --> Gemini
    Services --> Amadeus
    Services --> GRoutes
    Services --> GPlaces
    Services --> GGeo
    GGeo -. "on failure / no key" .-> Nominatim
    MW -- "proxy" --> Plausible

    classDef ext fill:#fef3c7,stroke:#d97706,color:#000
    classDef store fill:#dbeafe,stroke:#2563eb,color:#000
    class Gemini,Amadeus,GRoutes,GPlaces,GGeo,Nominatim,LocationIQ,Mapbox,Blob,Plausible ext
    class DB,Blob store
```

---

## 2. Frontend module structure

```mermaid
graph TD
    Main["main.tsx<br/>AuthProvider + RouterProvider<br/>createBrowserRouter · React.lazy<br/>initializeTheme()"]
    App["RouteBoundary<br/>ErrorBoundary + Suspense spinner<br/>wraps every lazy route"]

    subgraph Pages["src/pages — lazy-loaded except Landing"]
        Landing["Landing"]
        Home["Home.tsx<br/>Mapbox map · markers · sidebar"]
        Posts["PostsPage"]
        Trips["MyTrips · MyTripView<br/>SharedItinerary"]
        Social["UserProfile · ActivityPage<br/>FollowersList · FollowingList<br/>PublicCollection"]
        Misc["NotificationsPage<br/>SustainabilityPage"]
        Dead["Login · Registration<br/>unrouted — auth lives in AuthModal"]
    end

    subgraph Components["src/components"]
        Map["Pin · LocationPin · FilterPanel<br/>SearchBar · Sidebar"]
        Modals["NewPinModal · DetailedPinModal<br/>AuthModal · EditProfileModal"]
        Planner["TripPlanner<br/>SSE consumer"]
        Social2["Post · NearbyPostsDrawer<br/>EmojiReactionPicker · NotificationBell"]
    end

    subgraph Data["Data access"]
        Services["src/services/*<br/>pins · posts · comments · likes<br/>bookmarks · users · trips · search<br/>stats · challenges · notifications<br/>pinStatus · auth"]
        ApiClient["src/lib/api.ts<br/>fetch wrapper · credentials include<br/>JSON encode · ApiError"]
    end

    subgraph State["Cross-cutting state"]
        Auth["src/context/AuthContext<br/>isLoggedIn · userEmail · userId"]
        LS[("localStorage<br/>isLoggedIn · userEmail · userId<br/>beacon-pin-filters · beacon-theme<br/>beacon-pin-draft")]
        Theme["utils/theme.ts<br/>theme-changed CustomEvent"]
        Track["utils/analytics.ts<br/>window.plausible()"]
    end

    Constants["Frontend/constants.ts<br/>BASE_API_URL · Mapbox layer styles · colors"]

    Main --> App
    Main --> Auth
    App --> Pages
    Pages --> Components
    Pages --> Services
    Components --> Services
    Services --> ApiClient
    ApiClient --> Constants
    Auth <--> LS
    Pages --> Theme
    Pages --> Track
    Home --> Constants
    Planner -. "SSE via direct fetch<br/>/api/trip/plan/stream" .-> Constants

    classDef store fill:#dbeafe,stroke:#2563eb,color:#000
    class LS store
```

> A handful of files (7) still call `fetch()` directly — SSE streaming, the upload
> endpoint and a few legacy call sites — while 33 go through `services/*` → `lib/api.ts`.

---

## 3. Backend request pipeline

```mermaid
flowchart TD
    Req(["Incoming HTTP request"]) --> Helmet["helmet() — security headers"]
    Helmet --> Json["express.json — 10 MB limit"]
    Json --> Cookie["cookie-parser"]
    Cookie --> Cors["cors — allowlist:<br/>localhost:3000/5173 · beaconapp.live<br/>www · api · ch2026.vercel.app"]
    Cors --> Opt{"OPTIONS?"}
    Opt -- yes --> Pre(["204 preflight"])
    Opt -- no --> Csrf["Origin-based CSRF guard<br/>rejects cross-origin mutations"]
    Csrf --> Metrics{"path starts<br/>/metrics?"}
    Metrics -- yes --> Plaus["Plausible proxy<br/>bypasses OpenAPI validator"]
    Metrics -- no --> Val["express-openapi-validator<br/>validates against openapi.yml"]
    Val --> RL{"rate-limit tier"}

    RL -- "auth routes" --> RLa["10 req / 15 min per IP"]
    RL -- "trip routes" --> RLt["20 req / min per user or IP"]
    RL -- "write routes" --> RLw["120 req / min per user"]
    RL -- "share routes" --> RLs["100 req / min per IP"]

    RLa --> AuthMw
    RLt --> AuthMw
    RLw --> AuthMw
    RLs --> AuthMw

    AuthMw["auth.check / auth.optional<br/>verify JWT from accessToken cookie<br/>or Authorization: Bearer<br/>→ req.user = { id }"]
    AuthMw --> Handler["Route handler"]
    Handler --> Err["Global error handler"]
    Err --> Res(["HTTP response"])

    Store[("rateLimitStore<br/>Map&lt;key, {count, resetAt}&gt;<br/>cap 50k · sweep every 10 min")]
    RLa -.-> Store
    RLt -.-> Store
    RLw -.-> Store
    RLs -.-> Store

    classDef store fill:#dbeafe,stroke:#2563eb,color:#000
    class Store store
```

---

## 4. Backend layering

```mermaid
graph LR
    subgraph R["routes/ — HTTP controllers"]
        direction TB
        r1["auth · users · follows"]
        r2["pins · likes · pinStatus<br/>comments · posts"]
        r3["bookmarks · search<br/>stats · notifications"]
        r4["trip · trips · share"]
        r5["challenges · leaderboard<br/>plausible"]
    end

    subgraph S["services/ — external + domain logic"]
        direction TB
        s1["ai.ts — Gemini"]
        s2["amadeus.ts — flights"]
        s3["googleRoutes.ts — transit/drive"]
        s4["hotelService.ts — Places"]
        s5["challenges.ts — recordChallengeEvent"]
        s6["notifications.ts — fan-out"]
    end

    subgraph P["repositories/ — data access"]
        direction TB
        p1["pinRepo · likeRepo · pinStatusRepo<br/>commentRepo · postRepo"]
        p2["userRepo · followRepo<br/>bookmarkRepo · searchRepo"]
        p3["itineraryRepo · statsRepo<br/>challengeRepo · leaderboardRepo<br/>notificationRepo"]
    end

    subgraph U["utils/"]
        direction TB
        u1["carbon · tripCarbon"]
        u2["geocoding — Google → Nominatim"]
        u3["sanitize · ownership · visibility"]
        u4["pagination · logger · fetchWithTimeout"]
    end

    DBH["database/db.ts<br/>typed query() · transaction()<br/>startup migrations + seeds"]
    SQL["database/create.sql<br/>16 tables"]
    DB[("SQLite — DatabaseSync<br/>:memory: under Jest")]

    R --> P
    R --> S
    R --> U
    S --> U
    S --> P
    P --> DBH
    DBH --> DB
    SQL --> DBH

    classDef store fill:#dbeafe,stroke:#2563eb,color:#000
    class DB store
```

---

## 5. Database ER model

```mermaid
erDiagram
    account ||--o{ pin : creates
    account ||--o{ post : creates
    account ||--o{ comment : writes
    account ||--o{ likes : gives
    account ||--o{ pin_status : marks
    account ||--o{ bookmark : saves
    account ||--o{ bookmark_folder : owns
    account ||--o{ itinerary : saves
    account ||--o{ search_history : records
    account ||--o{ comment_reaction : reacts
    account ||--o{ post_upvote : upvotes
    account ||--o{ challenge_progress : progresses
    account ||--o{ user_follow : "follows / followed by"
    account ||--o{ notification : "recipient / actor"

    pin ||--o{ comment : has
    pin ||--o{ likes : receives
    pin ||--o{ pin_status : "visited / wishlist"
    pin ||--o{ bookmark : "saved in"
    post ||--o{ post_upvote : receives
    comment ||--o{ comment_reaction : has
    bookmark_folder ||--o{ bookmark : groups
    challenge ||--o{ challenge_progress : tracked_by

    account {
        int id PK
        string name
        string email UK
        string password "bcrypt · 12 rounds"
        string bio
        string avatar
        string profileVisibility "public|friends|private"
    }
    pin {
        int id PK
        int creatorID FK
        real latitude
        real longitude
        string title
        string address
        string description
        string tags
        string image
        int likes "denormalised counter"
        datetime createdAt
    }
    comment {
        int id PK
        int pinID FK
        int accountID FK
        string comment "max 280"
        datetime createdAt
    }
    comment_reaction {
        int commentID PK,FK
        int accountID PK,FK
        string emoji PK
        datetime createdAt
    }
    likes {
        int pinID PK,FK
        int accountID PK,FK
    }
    pin_status {
        int pinID PK,FK
        int accountID PK,FK
        string status "visited|wishlist"
        datetime updatedAt
    }
    post {
        int id PK
        int creatorID FK
        string title
        string location
        real latitude
        real longitude
        string category
        string tags
        string message
        string image
        int upvotes
        datetime createdAt
    }
    post_upvote {
        int postID PK,FK
        int accountID PK,FK
    }
    user_follow {
        int followerID PK,FK
        int followingID PK,FK
        datetime createdAt
    }
    itinerary {
        string id PK "UUID"
        int creatorID FK
        string title
        string data "full JSON snapshot"
        int isPublic
        real carbonKg
        real savedKg
        datetime createdAt
    }
    bookmark_folder {
        string id PK "UUID"
        int accountID FK
        string name
        int isPublic
        datetime createdAt
    }
    bookmark {
        int pinID PK,FK
        int accountID PK,FK
        string folderID FK "ON DELETE SET NULL"
        datetime createdAt
    }
    search_history {
        int id PK
        int accountID FK
        string query
        datetime createdAt
    }
    notification {
        int id PK
        int recipientID FK
        int actorID FK
        string type
        string entityType
        int entityID
        int isRead
        datetime createdAt
    }
    challenge {
        int id PK
        string code UK
        string title
        string description
        string metric
        real goal
        string icon
        int active
    }
    challenge_progress {
        int challengeID PK,FK
        int accountID PK,FK
        real progress
        datetime completedAt
        datetime updatedAt
    }
```

All foreign keys are `ON DELETE CASCADE` except `bookmark.folderID`, which is `SET NULL`.

---

## 6. Sequence — dropping a pin

```mermaid
sequenceDiagram
    actor U as User
    participant H as Home.tsx
    participant L as LocationIQ
    participant M as NewPinModal
    participant UP as /api/upload<br/>(Vercel fn)
    participant B as Vercel Blob
    participant API as Express /api/pins
    participant Repo as pinRepo
    participant DB as SQLite

    U->>H: click on map
    H->>L: reverseGeocode(lat, lng)
    L-->>H: address string
    H->>M: open with prefilled address
    U->>M: title, description, tags, image
    Note over M: draft autosaved to localStorage<br/>beacon-pin-draft (400 ms debounce)

    opt image attached
        M->>UP: POST multipart (≤ 4.5 MB, jpeg/png/gif/webp)
        UP->>B: put pins/{timestamp}-{filename}
        B-->>UP: blob URL
        UP-->>M: { url }
    end

    M->>API: POST /api/pins { lat, lng, title, address, description, tags, image }
    API->>API: CSRF guard → OpenAPI validate → writeRateLimit → auth.check
    API->>API: stripHtml(description), isValidUrl(image)
    API->>Repo: insertPin(...)
    Repo->>DB: INSERT INTO pin
    DB-->>Repo: rowid
    Repo-->>API: pin id
    API-->>H: 201 { id, ... }
    H->>H: append to allPins → rebuild GeoJSON
    H->>H: Mapbox re-renders circle layer
```

---

## 7. Sequence — two-phase trip planning

```mermaid
sequenceDiagram
    actor U as User
    participant TP as TripPlanner.tsx
    participant API as POST /api/trip/plan/stream
    participant Geo as geocoding.ts
    participant AM as Amadeus
    participant GR as Google Routes
    participant HS as Google Places
    participant PR as pinRepo
    participant AI as Gemini 2.0 Flash

    U->>TP: origin, destination, dates, party
    TP->>API: POST (text/event-stream, X-Accel-Buffering: no)

    API-->>TP: data: {stage:"initializing"}
    API->>Geo: geocode origin + destination
    Geo-->>API: coords (Google → Nominatim fallback)
    API-->>TP: data: {stage:"geocoding"}

    par fan-out
        API->>AM: searchFlights (nonstop + connecting, top 10)
        AM-->>API: flight options
    and
        API->>GR: searchTransit (train / bus)
        GR-->>API: transit options
    and
        API->>GR: searchDriving
        GR-->>API: driving route
    and
        API->>HS: searchEcoHotels (≤ 5)
        HS-->>API: hotels
    and
        API->>PR: pins within ~50 km (limit 30)<br/>radiusDeg = radiusKm / 111
        PR-->>API: community pins
    end

    API-->>TP: data: {stage:"flights"} … {stage:"transit"} … {stage:"driving"} … {stage:"hotels"} … {stage:"pins"}
    API-->>TP: data: {stage:"ready", options:{…}}
    Note over API,TP: any failure emits {stage:"error"}

    TP->>TP: carbon comparison per mode<br/>utils/carbon.ts factors
    U->>TP: pick transit + hotel + community pins

    TP->>AI: POST /api/trip/generate-itinerary
    AI-->>TP: schema-validated JSON<br/>{ summary, days[], sustainabilityTips[], carbonOffsetSuggestions[] }
    TP->>TP: render (react-markdown + remark-gfm + rehype-sanitize)

    opt save / share
        TP->>API: POST /api/trip/save → itinerary row (carbonKg, savedKg)
        API->>API: recordChallengeEvent → challenge_progress
        TP->>API: POST /api/share → UUID
        Note over TP: /shared/:uuid renders SharedItinerary<br/>immutable JSON snapshot
    end
```

**Carbon factors** (`Backend/utils/carbon.ts`), used for the mode comparison above:

| Mode | kg CO₂ / passenger-km |
|------|-----------------------|
| Flight short-haul (< 500 km) | 0.115 |
| Flight medium-haul (500–3700 km) | 0.100 |
| Flight long-haul (> 3700 km) | 0.090 |
| Electric rail | 0.041 |
| Diesel rail · urban bus | 0.089 |
| Subway / tram | 0.029 |
| Coach bus | 0.027 |
| Ferry | 0.019 |
| Car, average, solo | 0.210 |
| Car, electric | 0.053 |
| Carpool, 2 · 4 passengers | 0.105 · 0.0525 |
| Bicycle / walking | 0 |

Full table (including cable car, e-scooter and the transit fallback) in `Backend/utils/carbon.ts`.

---

## 8. Deployment topology

```mermaid
graph TB
    subgraph Client["Browser"]
        B["beaconapp.live"]
    end

    subgraph V["Vercel"]
        Static["Static SPA build<br/>Frontend/dist"]
        Rewrite["vercel.json rewrites<br>/metrics/* → backend<br/>.* → / (SPA fallback)"]
        Fn["api/upload.ts<br/>VercelRequest/Response"]
        Blob[("Vercel Blob store")]
    end

    subgraph Host["api.beaconapp.live — single Node instance"]
        Node["Express 5 + tsx<br/>GET /heartbeat → { status, timestamp }"]
        File[("beacon.db — SQLite file<br/>migrations run on startup")]
        Mem["In-memory rate limiter<br/>resets on redeploy · assumes 1 instance"]
    end

    Env["Backend .env<br/>SECRET (required) · PORT · NODE_ENV<br/>GEMINI_API_KEY · AMADEUS_CLIENT_ID/SECRET<br/>GOOGLE_MAPS_API_KEY"]
    EnvF["Frontend .env<br/>VITE_API_BASE · VITE_MAPBOX_ACCESS_TOKEN<br/>VITE_MAPBOX_SECRET_TOKEN · VITE_LOCATIONIQ_TOKEN"]

    B --> Static
    Static --> Rewrite
    Static --> Fn
    Fn --> Blob
    Rewrite --> Node
    B -- "XHR /api/* (prod: direct)" --> Node
    Node --> File
    Node --> Mem
    Env -.-> Node
    EnvF -.-> Static

    Dev["Local dev<br/>pnpm dev → Vite :5173 + backend :3000<br/>Vite proxies /api → localhost:3000"]
    Test["Jest + ts-jest<br/>24 test files · fresh :memory: DB per file<br/>TEST_LOGS=1 for console output"]

    classDef store fill:#dbeafe,stroke:#2563eb,color:#000
    class Blob,File store
```
