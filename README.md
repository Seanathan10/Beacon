# Inspiration
Over the last decades, corporations have grown to encompass almost all of our lives. We'll get in our carbon dioxide-spewing vehicle, drive to a national gas station megachain to fill our cars full of gas, then drive to a corporate-owned national chain store to buy clothes, followed by a trip to a national megachain of restaurants for food, all while spending hours in traffic. When thinking of places to visit or where to go, these corporate megachains are often the first places we think of planning trips. Yet, looking around, we often see many cool new places popping up around cities every day that get overshadowed by these companies. These include locally sourced farmer's markets, quaint mom-and-pop shops, or trendy cafés touting fancy drinks such as matcha lattes. The simplicity of sharing or finding local attractions would allow users to easily find trendy or local popup spots near where they live, without needing the use of a car.

# What it does
Upon logging in, the user is greeted with a world map that has pins on it. Each pin represents a cool local point of interest, such as a small business or attraction. The user can click on the pin to see a picture of the location, read a description, and read other users' comments. The user can also comment on the pin themselves, leave a like on the pin, or bookmark it to view later. The user can also click on a location on the map, and place a pin in that spot, assigning it a name, uploading an image, and writing a description. This pin is then visible to all other users. On the map, the more likes a pin has, the larger its circle will be. When you zoom out on the map, the user is able to see a heatmap showing where popular hotspots are.

In addition, the user is able to plan trips to another city or country. They are able to input two destinations, and an AI assistant will help the user plan their trip by suggesting low-carbon methods of transportation, as well as create an itinerary for each day of their trip. It also provides insights as to how much more green the trip is compared to traditional transportation.

# How we built it
We used a combination of tech that we were familiar with, as well as some new technologies that we challenged ourselves with learning. Our stack consisted of the TypeScript language, using React.js + Vite for the frontend, Express.js and Node for the backend, and Sqlite3 driver for our database. We used the Mapbox API for the map functionality of the app, utilizing its location search APIs for quick address lookups. We used Google Gemini 3 Flash and the Google Maps API for itinerary planning, navigation, and flight suggestions.

# Challenges we ran into
While our group was familiar with most of the technologies we used for our project, we tread new ground by using new technologies we didn't have experience with, such as Mapbox. It took some time for us to get up to speed, especially since we were facing a lot of CORS issues with our backend and APIs early on. Furthermore, due to the fast paced environment of us working on overlapping code, we ran into a lot of merge conflicts, which slowed us down a lot and frustrated us. None of us had prior experience with Amadaeus or Google Maps, so we had a lot of trouble with getting flight tracking, carbon emission counting, and metro pathing to work until we got used to the APIs.

# Accomplishments that we're proud of
One thing we were proud of accomplishing was the bells and whistles of our map, along with the interactivity and responsiveness of the navigation. As the user pans around the map, the sidebar refreshes to include the top rated attractions in the current part of the map shown in the viewport. Furthermore, when they zoom out, the user can see a heatmap of which general areas have a lot of attractions, signified through a red overlay on the map which gets darker the more attractions are in that area. We learned how to use the Haversine formula to calculate the distance between two coordinates on a globe, which was really interesting and motivated us to learn more.

# What we learned
We learned how to use Mapbox, server-side Sqlite, and travel planning APIs. Before this hackathon, none of us had prior experience with navigation or flight tracking, and we learned a huge amount along the way. We're all proud of what we built and look forward to expanding on it the future.

# What's next for Beacon
We plan to further refine the AI travel guide. Users should be able to share their itinerary, invite others to it, and prompt the AI to find new places to visit next.


# Environment Configuration Setup

This document explains the environment-based backend configuration for the Beacon application.

## Overview

The application now automatically uses the correct backend URL based on the environment:

- **Development** (`pnpm dev`): Uses local backend at `http://localhost:3000`
- **Production** (`pnpm build`): Uses hosted backend at `https://api.truthnuke.tech`

## Changes Made

### Frontend Configuration Files

1. **`.env.development`** - Development environment configuration
   - Sets `VITE_API_BASE=` (empty string for relative URLs)
   - Vite dev server proxies `/api` and `/heartbeat` to `localhost:3000`

2. **`.env.production`** - Production environment configuration
   - Sets `VITE_API_BASE=https://api.truthnuke.tech`
   - Used when building for production

3. **`.env`** - Base configuration (fallback)
   - Contains default values and API tokens
   - Overridden by environment-specific files

4. **`.env.example`** - Template for developers
   - Shows required environment variables
   - No sensitive values (safe to commit)

### Code Changes

1. **`Frontend/constants.ts`** - Updated API URL logic
   ```typescript
   // Before: Checked for VITE_API_URL == "local" (unused variable)
   // After: Uses VITE_API_BASE with auto-detection
   export const BASE_API_URL = import.meta.env.VITE_API_BASE !== undefined
       ? import.meta.env.VITE_API_BASE
       : (import.meta.env.MODE === 'development' ? API_URL_DEV : API_URL_PROD);
   ```

2. **`Frontend/vite.config.ts`** - Enhanced proxy configuration
   - Added comments explaining the proxy
   - Added `secure: false` for local development
   - Added `envPrefix: 'VITE_'` for clarity

3. **`Frontend/.gitignore`** - Updated to protect secrets
   - Ignores `.env` and `.env.local` files
   - Keeps versioned environment templates (`.env.development`, `.env.production`)

4. **`Frontend/README.md`** - Comprehensive documentation
   - Explains environment configuration
   - Setup instructions for developers
   - How the system works

## How It Works

### Development Mode

When you run `pnpm dev`:

1. Vite loads `.env.development` (overrides `.env`)
2. `VITE_API_BASE` is set to empty string `""`
3. API calls become relative: `/api/pins`, `/heartbeat`, etc.
4. Vite dev server proxy intercepts these and forwards to `http://localhost:3000`
5. No CORS issues because frontend and backend appear to be on same origin

### Production Mode

When you run `pnpm build`:

1. Vite loads `.env.production` (overrides `.env`)
2. `VITE_API_BASE` is set to `https://api.truthnuke.tech`
3. API calls become absolute: `https://api.truthnuke.tech/api/pins`, etc.
4. Backend CORS allows requests from Vercel production and preview deployments

## Testing

### Test Development Mode

1. Start the backend:
   ```bash
   cd Backend
   pnpm dev
   ```

2. In another terminal, start the frontend:
   ```bash
   cd Frontend
   pnpm dev
   ```

3. Open `http://localhost:5173`

4. Open browser DevTools → Network tab

5. Trigger an API call (e.g., login)

6. Verify the request goes to:
   - Request URL: `http://localhost:5173/api/login`
   - But is proxied to: `http://localhost:3000/api/login`

### Test Production Build

1. Build the frontend:
   ```bash
   cd Frontend
   pnpm build
   ```

2. Preview the build:
   ```bash
   pnpm preview
   ```

3. Open `http://localhost:4173`

4. Open browser DevTools → Network tab

5. Trigger an API call

6. Verify the request goes directly to:
   - Request URL: `https://api.truthnuke.tech/api/login`

### Verify Environment Variables

You can check which environment is active:

```javascript
// In browser console
console.log('API Base:', import.meta.env.VITE_API_BASE);
console.log('Mode:', import.meta.env.MODE);
console.log('Dev:', import.meta.env.DEV);
console.log('Prod:', import.meta.env.PROD);
```

## Backend CORS Configuration

The backend already allows the necessary origins (in `Backend/index.ts`):

```typescript
const allowedOrigins = new Set<string>([
    "http://localhost:3000",
    "http://localhost:5173",  // Vite dev
    "http://localhost:4173",  // Vite preview
    "https://ch2026.vercel.app", // Vercel prod
]);
```

Plus any Vercel preview deployment URLs matching `https://*.vercel.app`.

## Troubleshooting

### "CORS blocked" error in development

**Cause**: Backend not running or proxy not working

**Solution**:
1. Ensure backend is running on `localhost:3000`
2. Check Vite proxy configuration in `vite.config.ts`
3. Restart Vite dev server

### API calls fail in production build preview

**Cause**: Trying to use production API from local preview

**Solution**:
- Either run the backend locally and temporarily set `VITE_API_BASE=` in `.env.production.local`
- Or accept that preview will connect to production API (for testing only)

### Environment variable not updating

**Cause**: Vite needs restart after `.env` file changes

**Solution**: Stop and restart `pnpm dev`

## Security Notes

1. **API Keys in `.env` files**: The current `.env` files contain actual API keys. For production:
   - Move secrets to `.env.local` (gitignored)
   - Use `.env.example` as template
   - Configure secrets via Vercel environment variables

2. **CORS Configuration**: Backend currently allows Vercel preview deployments. For production:
   - Tighten CORS to specific domains
   - Use environment-based CORS configuration

## Summary

✅ Development uses local backend automatically
✅ Production uses hosted backend automatically
✅ No manual configuration needed
✅ Environment files properly organized
✅ Documentation updated
✅ Secrets protected via `.gitignore`
