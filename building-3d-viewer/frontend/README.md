# Archisight Frontend

This is the React + Vite frontend for Archisight. It provides the Google satellite map, manual building tracing tools, roof selection controls, interactive Three.js model viewer, and GLB export.

The full project README is at [../../README.md](../../README.md).

## Main Files

- `src/App.jsx`: application state, map flow, manual tracing, roof selection handoff, and viewer navigation.
- `src/lib/api.js`: Axios client with production backend URL support.
- `src/components/MapComponent.jsx`: Google map, building markers, trace points, polygons, and rectangle assist.
- `src/components/BuildingInfo.jsx`: selected building details, trace controls, clear-all behavior, roof selector, and build button.
- `src/components/PlanViewer.jsx`: 3D model request, Three.js geometry, roof override, scene rendering, and GLB export.

## Environment

Create `.env` locally:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
VITE_API_BASE_URL=http://localhost:5000
```

For Cloudflare Pages, set the same variables in the project environment settings. In production, `VITE_API_BASE_URL` should point to the Render backend URL.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

The production output is written to `dist`.

## Deployment

Cloudflare Pages settings:

```txt
Root directory: building-3d-viewer/frontend
Build command: npm run build
Build output directory: dist
```

## Notes

- The frontend Google Maps key is visible in the browser, so restrict it by HTTP referrer.
- Do not commit `.env`.
- Backend secrets such as MongoDB and Anthropic keys must never be placed in frontend environment variables.
