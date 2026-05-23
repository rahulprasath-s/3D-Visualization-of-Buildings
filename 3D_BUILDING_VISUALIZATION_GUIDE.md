# 3D Building Visualization Guide

This guide explains the technical design behind Archisight: how a building is selected or traced, how the backend resolves footprint geometry, and how the frontend renders a 3D model with roof controls and GLB export.

For a user-facing project overview, use [README.md](./README.md). For internal agent notes, use [PROJECT_NOTES_FOR_CODEX.md](./PROJECT_NOTES_FOR_CODEX.md).

## Product Flow

1. The user opens the React app and views a Google satellite map.
2. The user either searches for a building, selects a seeded building, or starts manual tracing.
3. The app stores the selected building context and optional manual footprint polygon.
4. The user can choose a roof type before building the model.
5. The frontend posts the building context to the backend 3D model endpoint.
6. The backend resolves geometry from manual tracing, OSM/Nominatim, building parts, or approximation fallback.
7. The frontend renders the 3D massing model with Three.js and React Three Fiber.
8. The user can adjust the roof type in the viewer and export the result as `.glb`.

## Architecture

```txt
Browser
  |
  | React + Vite
  | Google Maps + satellite view
  | Manual tracing + roof controls
  v
Express API
  |
  | MongoDB seeded buildings
  | Google Solar API
  | OSM/Nominatim geometry lookup
  | Manual footprint fallback
  v
3D model JSON
  |
  | React Three Fiber
  | Three.js geometry
  | GLTFExporter
  v
Interactive 3D model + GLB download
```

## Frontend Responsibilities

The frontend lives in `building-3d-viewer/frontend`.

Key files:

- `src/App.jsx`: app state, selected building, map mode, tracing state, back/forward navigation, and model handoff.
- `src/components/MapComponent.jsx`: Google satellite map, seeded markers, manual trace points, polygons, rectangle assist, and map center tracking.
- `src/components/BuildingInfo.jsx`: selected building panel, tracing tools, roof selector, solar stats, and build action.
- `src/components/PlanViewer.jsx`: 3D model request, Three.js geometry creation, roof override controls, scene rendering, and GLB export.
- `src/lib/api.js`: Axios client with `VITE_API_BASE_URL` support for production deployments.

Important frontend behavior:

- Manual tracing works without searching for a building.
- A custom traced building is created from the current map location.
- Manual footprints override automatic lookup once at least three points exist.
- The visible `Roof Type` selector sends a backend roof hint before generation.
- The viewer roof dropdown can override roof geometry after generation.
- GLB export uses the currently displayed geometry.

## Backend Responsibilities

The backend lives in `building-3d-viewer/backend`.

Key files:

- `server.js`: Express setup, CORS, JSON parsing, MongoDB connection, and route mounting.
- `routes/buildings.js`: building APIs, Google Solar lookup, OSM/Nominatim lookup, geometry fallback, model generation, and legacy AI plan routes.
- `models/Building.js`: MongoDB building schema.
- `seed.js`: local seed data for Nuremberg buildings.

The backend model pipeline prioritizes geometry in this order:

1. Manual footprint polygon from the frontend.
2. OSM building polygon or building-part data.
3. Broader OSM lookup strategies.
4. Landmark archetype synthesis for certain building classes.
5. Approximation fallback around the selected coordinate.

## Geometry Model

The backend returns model JSON rather than a baked 3D file. This keeps the model interactive and lightweight in the browser.

Typical shape:

```json
{
  "building": {
    "name": "Custom Traced Building",
    "type": "GENERAL BUILDING"
  },
  "metrics": {
    "footprintAreaMeters": 420.5,
    "wallHeightMeters": 9.6,
    "roofHeightMeters": 2.5,
    "totalHeightMeters": 12.1
  },
  "roof": {
    "shape": "gabled",
    "ridgeAxis": "x"
  },
  "parts": [
    {
      "footprint": [{ "x": 0, "z": 0 }],
      "metrics": {},
      "roof": {}
    }
  ]
}
```

## Roof Strategy

Archisight supports both automatic roof inference and manual roof selection.

Automatic inference uses:

- OSM tags such as `roof:shape`, `roof:height`, `roof:levels`, `roof:orientation`, and `roof:direction`.
- Building class heuristics for churches, castles, stations, museums, theatres, and general buildings.
- Footprint aspect ratio to choose sensible defaults.

Manual roof options:

- `flat`
- `gabled`
- `hipped`
- `pyramidal`
- `shed`
- `dome`
- `cone`

The frontend transforms those roof choices into Three.js roof geometry using profile functions in `PlanViewer.jsx`.

## Deployment Model

Recommended deployment:

- Frontend: Cloudflare Pages.
- Backend: Render Web Service.
- Database: MongoDB Atlas.

Production connection:

```txt
Cloudflare Pages frontend
  VITE_API_BASE_URL=https://your-render-backend.onrender.com

Render backend
  CLIENT_ORIGIN=https://your-cloudflare-pages-domain.pages.dev
  MONGODB_URI=mongodb+srv://...
```

## API Key Rules

- Frontend Google Maps key belongs in Cloudflare environment variables and must be restricted by HTTP referrer.
- Backend Google key belongs only in Render environment variables.
- Anthropic and MongoDB secrets belong only in Render environment variables.
- Local `.env` files are ignored by Git.

## Known Limitations

- Roof geometry is currently procedural and approximate.
- Manual tracing depends on the user's visible satellite interpretation.
- OSM building-part data is inconsistent by location.
- Google Solar data is available only where Google provides coverage.
- Render free services may sleep after inactivity.

## Suggested Next Improvements

1. Add editable floor count and roof height controls.
2. Improve dome and cone geometry with smoother mesh generation.
3. Add draggable trace points after drawing.
4. Add screenshot or thumbnail export.
5. Add an optional Street View or image-analysis refinement layer.
