# Project Notes For Codex

## Purpose

This repository contains a small full-stack app for exploring buildings in Nuremberg and generating AI-created architectural visualizations from map-selected locations.

The current product experience is:

1. Load seeded buildings from MongoDB.
2. Show them on a Google satellite map.
3. Let the user search additional buildings with Google Places Autocomplete.
4. Fetch Google Solar building footprint stats for the selected location when possible.
5. Send building context to Anthropic on the backend to generate a 2D SVG site/roof outline.
6. Render the generated SVG in the frontend.

Despite the project name, the main active flow right now is 2D plan generation, not a polished 3D viewer flow.

## Actual Structure

Top-level:

- `3D_BUILDING_VISUALIZATION_GUIDE.md`: conceptual implementation guide, not a strict description of the current codebase.
- `building-3d-viewer/frontend`: React + Vite client.
- `building-3d-viewer/backend`: Express + MongoDB API.

Frontend key files:

- `building-3d-viewer/frontend/src/App.jsx`: main app state and orchestration.
- `building-3d-viewer/frontend/src/components/MapComponent.jsx`: Google map with markers.
- `building-3d-viewer/frontend/src/components/BuildingInfo.jsx`: side panel with Street View and building stats.
- `building-3d-viewer/frontend/src/components/PlanViewer.jsx`: generates and renders SVG plans.
- `building-3d-viewer/frontend/src/components/Viewer3D.jsx`: older/unused Three.js model viewer.
- `building-3d-viewer/frontend/vite.config.js`: proxies `/api` to backend.

Backend key files:

- `building-3d-viewer/backend/server.js`: Express app bootstrapping and Mongo connection.
- `building-3d-viewer/backend/routes/buildings.js`: seeded building APIs, solar stats API, Anthropic generation endpoints.
- `building-3d-viewer/backend/models/Building.js`: Mongoose schema.
- `building-3d-viewer/backend/seed.js`: inserts seeded Nuremberg building data.

## Runtime Model

Frontend:

- Uses `@react-google-maps/api` for the map, autocomplete, and Street View.
- Uses `axios` for all API requests.
- Loads Google Maps via `VITE_GOOGLE_MAPS_API_KEY`.
- Fetches `/api/buildings` on mount.
- When a building is selected, fetches `/api/buildings/solar-stats?lat=...&lng=...`.
- When the user clicks "Draft Footprint Outline", `PlanViewer` calls:
  - `/api/buildings/:id/generate-plan` for seeded Mongo buildings
  - `/api/buildings/direct/generate-plan` for Google Places results

Backend:

- Uses Express 5, Mongoose, Axios, and Anthropic SDK.
- Connects to MongoDB with `MONGODB_URI`, defaulting to `mongodb://localhost:27017/buildings_3d`.
- Uses `GOOGLE_MAPS_API_KEY` server-side for the Solar API.
- Uses `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL` for SVG/HTML generation.

AI generation:

- `make2DPrompt()` builds a detailed SVG drafting prompt and includes solar-derived dimensions when available.
- `make3DPrompt()` builds an A-Frame HTML prompt for massing-style 3D output.
- The frontend currently auto-generates only the 2D plan flow.

## Important Observations

1. The top-level guide is broader and older than the implementation.
   It mentions Leaflet, generic 3D architecture, and an idealized structure that does not exactly match this repo.

2. There is a port mismatch right now.
   `frontend/vite.config.js` proxies `/api` to `http://localhost:3001`, but `backend/server.js` defaults to port `5000`.

3. `Viewer3D.jsx` appears to be legacy or unused.
   The current app routes into `PlanViewer` and does not expose a real 3D mode in the UI.

4. Some dependencies are likely leftovers.
   The frontend still includes `react-leaflet`, `leaflet`, `@react-three/fiber`, `@react-three/drei`, and `three`, but the primary user path uses Google Maps and SVG generation.

5. `backend/package.json` is minimal.
   There is no `start`, `dev`, or seed script yet, which will make local startup less convenient.

6. The app is Nuremberg-specific by default.
   Seed data, default coordinates, and UX copy assume Nuremberg, Germany.

## Current User Flow In Code

1. `App.jsx` loads Google Maps JS and seeded buildings.
2. The left sidebar lists seeded buildings and exposes Google Places search.
3. `MapComponent.jsx` shows markers and pans/zooms to the selected building.
4. `BuildingInfo.jsx` shows Street View, building metadata, and solar footprint stats.
5. `PlanViewer.jsx` immediately requests an SVG plan and injects it into the page with `dangerouslySetInnerHTML`.

## Risks / Likely Next Fixes

- Fix the frontend/backend port mismatch.
- Add backend npm scripts for running and seeding.
- Decide whether to keep or remove the dormant 3D viewer path.
- Decide whether the product should stay Nuremberg-focused or become location-agnostic.
- Validate generated SVG/HTML output handling if this is exposed beyond trusted internal/demo use.

## Fast Start Mental Model

Think of this project as:

"A React map UI for selecting real buildings, enriched with Google Solar footprint data, then sent to Anthropic to draft a visually styled architectural SVG outline."

That is the clearest summary of the code as it exists today.
