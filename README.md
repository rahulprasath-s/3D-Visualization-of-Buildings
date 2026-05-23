# Archisight

Archisight is a full-stack web app for finding or manually tracing a building on a satellite map and generating a realistic 3D massing model from its footprint. It supports automatic building lookup, manual footprint tracing, estimated height, roof-shape selection, and GLB export.

## What It Does

- Search buildings with Google Places.
- Select seeded landmark buildings from MongoDB.
- Trace any visible building footprint directly on the satellite map.
- Clear, undo, and redraw manual footprint points.
- Generate a 3D model from OSM geometry, manual tracing, or approximation fallback.
- Estimate building height, levels, roof height, and roof profile.
- Choose roof styles such as flat, gabled, hipped, pyramidal, shed, dome, and cone.
- Use Google Solar data when available for footprint and roof-area context.

## Repository Structure

```txt
.
├── README.md
├── 3D_BUILDING_VISUALIZATION_GUIDE.md
├── PROJECT_NOTES_FOR_CODEX.md
└── building-3d-viewer
    ├── frontend
    │   ├── src
    │   │   ├── App.jsx
    │   │   ├── lib/api.js
    │   │   └── components
    │   │       ├── MapComponent.jsx
    │   │       ├── BuildingInfo.jsx
    │   │       └── PlanViewer.jsx
    │   ├── .env.example
    │   └── package.json
    └── backend
        ├── server.js
        ├── routes/buildings.js
        ├── models/Building.js
        ├── seed.js
        ├── .env.example
        └── package.json
```

## Documentation

- [3D_BUILDING_VISUALIZATION_GUIDE.md](./3D_BUILDING_VISUALIZATION_GUIDE.md): technical architecture, model-generation flow, data strategy, and deployment notes.
- [PROJECT_NOTES_FOR_CODEX.md](./PROJECT_NOTES_FOR_CODEX.md): internal development notes for Codex and future implementation work.
- [building-3d-viewer/frontend/README.md](./building-3d-viewer/frontend/README.md): frontend-specific setup and build notes.

## Environment Variables

Create local `.env` files from the examples. Do not commit real `.env` files.

Frontend: `building-3d-viewer/frontend/.env`

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
VITE_API_BASE_URL=http://localhost:5000
```

Backend: `building-3d-viewer/backend/.env`

```env
MONGODB_URI=mongodb://localhost:27017/buildings_3d
GOOGLE_MAPS_API_KEY=your_google_server_key
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-haiku-4-5
CLIENT_ORIGIN=http://localhost:5173
PORT=5000
```

## Run Locally

Install backend dependencies:

```bash
cd building-3d-viewer/backend
npm install
npm start
```

Install frontend dependencies:

```bash
cd building-3d-viewer/frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Optional Seed Data

The backend includes seeded building data for Nuremberg landmarks.

```bash
cd building-3d-viewer/backend
node seed.js
```

## Production Deployment

Frontend on Cloudflare Pages:

```txt
Root directory: building-3d-viewer/frontend
Build command: npm run build
Build output directory: dist
```

Cloudflare environment variables:

```env
VITE_GOOGLE_MAPS_API_KEY=your_restricted_browser_key
VITE_API_BASE_URL=https://your-render-backend.onrender.com
```

Backend on Render:

```txt
Root directory: building-3d-viewer/backend
Build command: npm install
Start command: npm start
```

Render environment variables:

```env
MONGODB_URI=your_mongodb_atlas_connection_string
GOOGLE_MAPS_API_KEY=your_server_google_key
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-haiku-4-5
CLIENT_ORIGIN=https://your-cloudflare-pages-domain.pages.dev
```

## API Key Safety

- The frontend Google Maps key is visible in the browser, so restrict it by HTTP referrer.
- Keep `MONGODB_URI`, `ANTHROPIC_API_KEY`, and backend Google keys only in backend environment variables.
- Do not commit `.env` files.
- Keep `.env.example` files committed so setup remains clear without exposing secrets.

## Current Status

Archisight is a working prototype focused on realistic building massing from map-derived or hand-traced footprints. The most important next improvements are stronger roof geometry, richer building-part reconstruction, and optional image-assisted refinement.
