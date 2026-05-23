# Project Notes For Codex

These notes are for future Codex sessions and maintainers. They are intentionally more implementation-focused than the public README.

For user-facing setup and deployment instructions, start with [README.md](./README.md). For the technical architecture guide, see [3D_BUILDING_VISUALIZATION_GUIDE.md](./3D_BUILDING_VISUALIZATION_GUIDE.md).

## Current Product

Archisight is a full-stack building visualization prototype. The main user flow is now 3D model generation, not the earlier SVG-only concept.

The app can:

1. Show a Google satellite map.
2. Load seeded buildings from MongoDB.
3. Search buildings through Google Places Autocomplete.
4. Allow manual building tracing without searching first.
5. Clear or undo trace points.
6. Select roof type before model generation.
7. Generate 3D building massing from manual footprints, OSM geometry, building-part data, or approximation fallback.
8. Render the result with React Three Fiber and Three.js.
9. Override roof type in the viewer.
10. Export the displayed model as `.glb`.

## Actual Structure

Top level:

- `README.md`: public project overview, setup, deployment, and GitHub-facing description.
- `3D_BUILDING_VISUALIZATION_GUIDE.md`: technical architecture and modeling guide.
- `PROJECT_NOTES_FOR_CODEX.md`: this internal implementation note.
- `.gitignore`: ignores real `.env` files, build outputs, logs, and dependencies.
- `building-3d-viewer/frontend`: React + Vite client.
- `building-3d-viewer/backend`: Express + MongoDB API.

Frontend:

- `src/App.jsx`: main state orchestration, selected building, tracing state, back/forward navigation, roof choice handoff, and map/model transitions.
- `src/lib/api.js`: shared Axios client. Uses `VITE_API_BASE_URL` in production.
- `src/components/MapComponent.jsx`: Google map, markers, custom trace points, polygon overlay, rectangle assist, and center tracking.
- `src/components/BuildingInfo.jsx`: right-side building panel, manual tracing controls, clear-all behavior, roof selector, stats, and build button.
- `src/components/PlanViewer.jsx`: backend model request, procedural Three.js geometry, roof override dropdown, scene rendering, and GLB export.
- `vite.config.js`: local `/api` proxy to backend.

Backend:

- `server.js`: Express app, CORS with `CLIENT_ORIGIN`, JSON parsing, MongoDB connection, and route registration.
- `routes/buildings.js`: building list APIs, solar stats API, OSM/Nominatim lookup, manual footprint handling, model generation, roof inference, archetypal landmark parts, and legacy AI generation helpers.
- `models/Building.js`: Mongoose schema.
- `seed.js`: inserts seeded Nuremberg landmark data.

## Runtime Details

Frontend environment:

- `VITE_GOOGLE_MAPS_API_KEY`: browser key for Google Maps JavaScript API.
- `VITE_API_BASE_URL`: backend origin in production, for example Render.

Backend environment:

- `MONGODB_URI`: MongoDB Atlas or local MongoDB connection string.
- `GOOGLE_MAPS_API_KEY`: server key for Google Solar API.
- `ANTHROPIC_API_KEY`: used by legacy AI plan-generation routes.
- `ANTHROPIC_MODEL`: optional Claude model override.
- `CLIENT_ORIGIN`: allowed frontend origin for CORS.
- `PORT`: Render supplies this automatically, local fallback is `5000`.

## Current Modeling Logic

The backend resolves building geometry in this order:

1. `manualFootprint` from the frontend when at least three points exist.
2. OSM/Nominatim building polygon lookup.
3. OSM building-part data when available.
4. Landmark archetype splitting for churches, castles, and stations when parts are missing.
5. Approximation fallback when no external polygon matches.

Roof inference uses:

- Explicit `roofShape` from the frontend.
- OSM `roof:shape`, `roof:height`, `roof:levels`, `roof:orientation`, and `roof:direction`.
- Building type heuristics.
- Footprint ratio heuristics.

The frontend can override roof shape after generation with local geometry regeneration in `PlanViewer.jsx`.

## Important Implementation Notes

- Manual tracing is now a first-class flow. It creates a synthetic custom building with `_id` like `manual-trace-*`.
- `Clear All` uses `manualTraceVersion` to force stale Google Maps overlays to remount.
- `selectedForViewer` uses the centroid of manual footprint points so generated models are centered near the traced polygon.
- The backend accepts roof hints through `building.roofShape`.
- `.env` files should never be committed. `.env.example` files should stay committed.
- The frontend Google key is not secret once shipped to a browser, but it must be restricted by HTTP referrer.
- The Anthropic key and MongoDB URI must stay backend-only.

## Verification Commands

Frontend build:

```bash
cd building-3d-viewer/frontend
npm run build
```

Backend syntax checks:

```bash
cd building-3d-viewer/backend
node --check server.js
node --check routes/buildings.js
```

## Deployment Notes

Cloudflare Pages:

- Root directory: `building-3d-viewer/frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Environment: `VITE_GOOGLE_MAPS_API_KEY`, `VITE_API_BASE_URL`

Render:

- Root directory: `building-3d-viewer/backend`
- Build command: `npm install`
- Start command: `npm start`
- Environment: `MONGODB_URI`, `GOOGLE_MAPS_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `CLIENT_ORIGIN`

MongoDB:

- Use MongoDB Atlas for production.
- Render free tier usually needs Atlas Network Access to allow `0.0.0.0/0` unless using a plan with stable outbound IP.

## Likely Next Work

1. Add editable floors, wall height, and roof height controls.
2. Add draggable trace-point editing.
3. Improve procedural roof meshes for dome/cone/pyramidal roofs.
4. Add model screenshots or PNG export.
5. Add clearer health endpoint for Render uptime checks.
6. Add API tests around manual footprint and roof-shape model generation.
