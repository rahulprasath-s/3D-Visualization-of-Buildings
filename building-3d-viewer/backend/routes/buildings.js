const express = require('express');
const router = express.Router();
const Building = require('../models/Building');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { PNG } = require('pngjs');
const EARTH_RADIUS_METERS = 6378137;

// ── Shared helpers ────────────────────────────────────────────────────────────
const getClient = () => {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('Anthropic API key is missing in .env');
  return new Anthropic({ apiKey });
};
const getModel = () => (process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5').trim();

function buildBuildingContext(b) {
  const floors = b.floors || 2;
  const area   = b.area   || 10000;
  const year   = b.yearBuilt || 1900;
  const name   = (b.name || 'Unknown Building').trim();
  const isHistoric = year < 1950;
  const lc = name.toLowerCase();
  const isChurch  = lc.includes('church') || lc.includes('kirche') || lc.includes('dom') || lc.includes('münster') || lc.includes('cathedral');
  const isCastle  = lc.includes('castle') || lc.includes('burg')   || lc.includes('fortress') || lc.includes('schloss');
  const isMuseum  = lc.includes('museum') || lc.includes('galerie') || lc.includes('gallery');
  const isStation = lc.includes('station') || lc.includes('bahnhof');
  const isTheatre = lc.includes('theatre') || lc.includes('theater') || lc.includes('opera') || lc.includes('concert');
  const type = isChurch ? 'CHURCH / CATHEDRAL'
             : isCastle ? 'CASTLE / FORTRESS'
             : isMuseum ? 'MUSEUM / GALLERY'
             : isStation ? 'RAILWAY STATION'
             : isTheatre ? 'THEATRE / OPERA HOUSE'
             : 'CIVIC / GENERAL BUILDING';
  return { floors, area, year, name, isHistoric, type };
}

function make3DPrompt(b) {
  const { floors, area, year, name, isHistoric, type } = buildBuildingContext(b);
  const fp = Math.max(6, Math.round(Math.sqrt(area / 10)));
  const camX = Math.round(fp * 1.5);
  const camY = Math.round(floors * 3);
  const camZ = Math.round(fp * 2.5);
  const labelH = floors * 3 + 3;
  const labelW = Math.max(10, name.length * 0.7);

  return `You are an expert 3D architectural visualizer.
Generate a COMPLETE, self-contained A-Frame HTML page (<!DOCTYPE html>...) that shows a 3D exterior massing model of this building — like a cardboard architectural scale model.

Building: ${name}
Address: ${b.address || 'Nuremberg, Germany'}
Type: ${type}
Floors: ${floors} (each floor = 3 units tall → total height = ${floors * 3} units)
Footprint: approx ${fp} × ${fp} units
Year: ${year} (${isHistoric ? 'HISTORIC' : 'MODERN'})

REQUIREMENTS:
1. DOCTYPE html, head with title "${name}", body with margin:0
2. Script: <script src="https://aframe.io/releases/1.4.0/aframe.min.js"></script>
3. <a-scene renderer="antialias: true; shadowMapEnabled: true">
4. <a-sky color="#0d1117"></a-sky>
5. Ground: <a-plane position="0 0 0" rotation="-90 0 0" width="200" height="200" color="#161b22" shadow="receive: true"></a-plane>
6. ALL building geometry uses color="#e8dcc8" roughness="0.9" metalness="0" shadow="cast: true; receive: false"
   Roof elements: color="#c9b99a"
7. Build the OUTER SHELL only (no interior, no window holes):
   - ${type === 'CHURCH / CATHEDRAL' ? 'Tall central nave box, two front towers higher than nave, a-cone spires on towers, thin cross on top made of two a-box' : ''}
   - ${type === 'CASTLE / FORTRESS' ? 'Wide thick base box, 4 corner a-cylinder towers taller than walls, small a-box battlements along top edges' : ''}
   - ${type === 'MUSEUM / GALLERY' ? 'Long main rectangular body, two side wings, a-cylinder columns at front entrance' : ''}
   - ${type === 'RAILWAY STATION' ? 'Wide rectangular base, taller a-box in center for the main hall, symmetrical lower wings on each side' : ''}
   - ${type === 'THEATRE / OPERA HOUSE' ? 'Wide rectangular base, central dome (a-sphere half) or pitched a-cone roof, decorative front facade blocks' : ''}
   - ${type === 'CIVIC / GENERAL BUILDING' ? `Stack of ${floors} floor boxes (each 3 units tall), slight width setback every 2 floors for visual interest` : ''}
8. Lights:
   <a-light type="ambient" color="#c8d8e8" intensity="0.5"></a-light>
   <a-light type="directional" color="#fff8e8" intensity="1.2" position="10 15 8" cast-shadow="true"></a-light>
   <a-light type="directional" color="#4fc3f7" intensity="0.4" position="-8 5 -5"></a-light>
9. Camera with look-controls (drag to orbit) and wasd-controls:
   <a-entity camera look-controls wasd-controls position="${camX} ${camY} ${camZ}" rotation="-20 35 0"></a-entity>
10. Floating label: <a-text value="${name}" position="0 ${labelH} 0" align="center" color="#4fc3f7" width="${labelW}"></a-text>
11. Center building at world origin (0,0,0), bottom at y=0

OUTPUT: Only the complete raw HTML file. No markdown fences, no explanation.`;
}

function make2DPrompt(b) {
  const { floors, area, year, name, type } = buildBuildingContext(b);
  
  // Extract solarStats if provided in the body or building object
  const solar = b.solarStats || {};
  const hasSolar = solar.buildingAreaMeters !== undefined && solar.buildingAreaMeters !== null;
  const areaMeters = hasSolar ? solar.buildingAreaMeters : (area / 10.764);
  const roofAreaMeters = hasSolar ? solar.roofAreaMeters : null;

  let solarInfoSection = '';
  if (hasSolar) {
    solarInfoSection = `
PHYSICAL DIMENSIONS (From Google Solar API):
- Building Ground Footprint Area: EXACTLY ${areaMeters.toFixed(1)} square meters (m²).
- Total Roof Surface Area: ${roofAreaMeters ? roofAreaMeters.toFixed(1) + ' square meters (m²)' : 'N/A'}.

SCALING REQUIREMENT:
The building ground footprint area is exactly ${areaMeters.toFixed(1)} m². You MUST draw the top-down outline to represent this scale correctly relative to the full 900x700 viewBox.
1. Calibrate the scale bar in the bottom-left of the SVG to match this size (e.g., "10m" representing a corresponding width).
2. Display the footprint area value prominently in the drawing's title/metadata block.`;
  } else {
    solarInfoSection = `
PHYSICAL DIMENSIONS (Estimated):
- Building Footprint Area: ~${areaMeters.toFixed(1)} m² (~${area} sq ft).
- Please scale your outline representation accordingly.`;
  }

  return `You are an expert architectural site planner and drafter.
Generate a complete, valid, self-contained SVG showing a realistic top-down architectural OUTLINE and SITE PLAN for:

Building: ${name}
Address: ${b.address || 'Nuremberg, Germany'}
Type: ${type}
Floors: ${floors}, Year: ${year}
Amenities: ${(b.amenities || []).join(', ') || 'none listed'}${solarInfoSection}

CRITICAL RULES - WHAT NOT TO DRAW:
- DO NOT draw any interior floor plan! Absolutely NO rooms (bedroom, kitchen, office), NO interior walls, NO doors, NO interior windows, NO furniture, and NO interior room labels. The interior must be completely empty or solid, as we only care about the outer footprint, roof structure, and surrounding property context.

WHAT YOU MUST DRAW (REQUIREMENTS):
1. Background: Dark blue rect (#0a1128) covering the entire 900x700 viewBox.
2. Title & Metadata Block:
   - A neat technical drawing border.
   - A clean title card in the top-left or bottom-left corner with high-tech borders, containing:
     - "BUILDING OUTLINE & SITE BLUEPRINT" in bold white.
     - Building Name: "${name}"
     - "Footprint Area: ${areaMeters.toFixed(1)} m²"
     - "Roof Surface Area: ${roofAreaMeters ? roofAreaMeters.toFixed(1) + ' m²' : 'N/A'}"
     - "Type: ${type} | Floors: ${floors}"
3. Realistic Outer Footprint & Shape:
   - Draw the outer footprint polygon of the building using thick stroke="#4fc3f7" stroke-width="4" and a solid dark fill (like #102a43 or #0d1b2a) or semi-transparent fill.
   - Make the outer shape highly realistic and interesting based on the building type. For example:
     - "CHURCH / CATHEDRAL": Draw a beautiful transept/latin-cross shaped outline with buttress projections.
     - "CASTLE / FORTRESS": Draw a thick rectangular block with circular tower bastions at the corners and battlements outlines.
     - "MUSEUM / CIVIC": Draw a symmetric H-shape, U-shape, or elegant rectangular wing configuration with a central courtyard.
     - "GENERAL BUILDING": Draw a modern L-shape, T-shape, or angled block outline.
4. Realistic Roof Geometry (Inside the building outline):
   - Draw realistic roof ridges, hip lines, valley lines, and pitch contours using thinner lines stroke="#818cf8" stroke-width="1.5".
   - Include slope directional arrows or subtle roof shading (gradients or hatches) to realistically convey the roof slopes.
5. Surrounding Property & Site Context:
   - Plot Boundary: Draw a dashed outer boundary line stroke="#475569" stroke-dasharray="6,4" outlining the property lot.
   - Access Driveway & Walkway: Draw a paved driveway and walkways stroke="#334155" fill="#1e293b" connecting the road to the building's main entrances.
   - Landscaping elements: Simple outline curves for garden beds, small stylized circle icons for trees, and hatch lines for grassy areas.
6. Dimension Lines & Measurements:
   - Draw thin architectural dimension lines with ticks (arrowheads or tick marks) parallel to the main sides of the building.
   - Label the exact length and width of the building in meters (e.g. "Length: 24.5 m", "Width: 16.2 m") alongside the dimension lines in white monospaced font-size="11".
7. Drafting Accents:
   - Scale bar in the bottom-left corner calibrated in meters.
   - An elegant compass rose / north arrow in the bottom-right corner showing orientation.

OUTPUT: Only the raw SVG starting with <svg. No markdown, no backticks, no explanation.`;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function projectToLocalMeters(lat, lng, originLat, originLng) {
  const cosLat = Math.cos(toRadians(originLat));
  return {
    x: (lng - originLng) * toRadians(1) * EARTH_RADIUS_METERS * cosLat,
    y: (lat - originLat) * toRadians(1) * EARTH_RADIUS_METERS,
  };
}

function localMetersToLatLng(x, y, originLat, originLng) {
  const cosLat = Math.cos(toRadians(originLat)) || Number.EPSILON;
  return {
    lat: originLat + ((y / EARTH_RADIUS_METERS) * (180 / Math.PI)),
    lng: originLng + ((x / (EARTH_RADIUS_METERS * cosLat)) * (180 / Math.PI)),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function polygonPerimeter(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let perimeter = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    perimeter += Math.hypot(next.x - current.x, next.y - current.y);
  }

  return perimeter;
}

function polygonBounds(points) {
  if (!Array.isArray(points) || !points.length) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function computePolygonMetrics(projected, holeProjected = []) {
  if (!Array.isArray(projected) || projected.length < 3) {
    return {
      area: 0,
      perimeter: 0,
      circularity: 0,
      width: 0,
      height: 0,
      vertexCount: 0,
      holeCount: 0,
    };
  }

  const bounds = polygonBounds(projected);
  const outerArea = polygonArea(projected);
  const holeArea = holeProjected.reduce((sum, hole) => sum + polygonArea(hole), 0);
  const area = Math.max(0, outerArea - holeArea);
  const perimeter = polygonPerimeter(projected) + holeProjected.reduce((sum, hole) => sum + polygonPerimeter(hole), 0);
  const circularity = perimeter > 0
    ? (4 * Math.PI * area) / (perimeter * perimeter)
    : 0;

  return {
    area,
    perimeter,
    circularity,
    width: bounds.width,
    height: bounds.height,
    vertexCount: projected.length,
    holeCount: holeProjected.length,
  };
}

function latLngToWorldPixel(lat, lng, zoom) {
  const scale = 256 * (2 ** zoom);
  const sinLat = clamp(Math.sin(toRadians(lat)), -0.9999, 0.9999);

  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - (Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI))) * scale,
  };
}

function worldPixelToLatLng(x, y, zoom) {
  const scale = 256 * (2 ** zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - ((2 * Math.PI * y) / scale);
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { lat, lng };
}

function pixelToLatLng(px, py, centerLat, centerLng, zoom, width, height) {
  const centerWorld = latLngToWorldPixel(centerLat, centerLng, zoom);
  const worldX = centerWorld.x + (px - (width / 2));
  const worldY = centerWorld.y + (py - (height / 2));
  return worldPixelToLatLng(worldX, worldY, zoom);
}

function approximateMetersPerPixel(lat, zoom, scale = 1) {
  return (156543.03392 * Math.cos(toRadians(lat))) / (2 ** zoom) / scale;
}

function distanceMeters(aLat, aLng, bLat, bLng) {
  const a = projectToLocalMeters(aLat, aLng, aLat, aLng);
  const b = projectToLocalMeters(bLat, bLng, aLat, aLng);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += (current.x * next.y) - (next.x * current.y);
  }
  return Math.abs(area) / 2;
}

function polygonCentroid(points) {
  let signedArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const cross = (current.x * next.y) - (next.x * current.y);
    signedArea += cross;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }

  if (Math.abs(signedArea) < 1e-6) {
    const avg = points.reduce((acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }), { x: 0, y: 0 });
    return { x: avg.x / points.length, y: avg.y / points.length };
  }

  return {
    x: cx / (3 * signedArea),
    y: cy / (3 * signedArea),
  };
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersects) inside = !inside;
  }
  return inside;
}

function closePolygon(points) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat === last.lat && first.lng === last.lng) return points.slice(0, -1);
  return points;
}

function normalizeRingGeometry(geometry = []) {
  return closePolygon(
    geometry
      .map(point => ({ lat: point.lat, lng: point.lon }))
      .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
  );
}

function extractWayFootprint(element) {
  let outerGeometry = Array.isArray(element.geometry) ? element.geometry : [];
  let innerGeometries = [];

  if (Array.isArray(element.members)) {
    const outerMember = element.members.find(member =>
      member.role === 'outer'
      && Array.isArray(member.geometry)
      && member.geometry.length >= 3
    );

    if (outerMember) {
      outerGeometry = outerMember.geometry;
    }

    innerGeometries = element.members
      .filter(member =>
        member.role === 'inner'
        && Array.isArray(member.geometry)
        && member.geometry.length >= 3
      )
      .map(member => normalizeRingGeometry(member.geometry))
      .filter(ring => ring.length >= 3);
  }

  const polygon = normalizeRingGeometry(outerGeometry);

  return {
    polygon,
    holes: innerGeometries,
  };
}

function chooseBestFootprint(elements, lat, lng) {
  const candidates = elements
    .map(element => {
      const { polygon, holes } = extractWayFootprint(element);
      if (polygon.length < 3) return null;

      const projected = polygon.map(point => projectToLocalMeters(point.lat, point.lng, lat, lng));
      const holeProjected = holes
        .map(hole => hole.map(point => projectToLocalMeters(point.lat, point.lng, lat, lng)))
        .filter(hole => hole.length >= 3);
      const center = polygonCentroid(projected);
      const containsSelection = pointInPolygon({ x: 0, y: 0 }, projected)
        && !holeProjected.some(hole => pointInPolygon({ x: 0, y: 0 }, hole));
      const areaMeters = computePolygonMetrics(projected, holeProjected).area;
      const centroidDistance = Math.hypot(center.x, center.y);

      return {
        polygon,
        holes,
        projected,
        holeProjected,
        center,
        containsSelection,
        areaMeters,
        centroidDistance,
        tags: element.tags || {},
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftIsPrimary = isPrimaryBuildingCandidate(left.tags);
      const rightIsPrimary = isPrimaryBuildingCandidate(right.tags);
      if (leftIsPrimary !== rightIsPrimary) {
        return leftIsPrimary ? -1 : 1;
      }
      if (left.containsSelection !== right.containsSelection) {
        return left.containsSelection ? -1 : 1;
      }
      if (Math.abs(left.centroidDistance - right.centroidDistance) > 0.01) {
        return left.centroidDistance - right.centroidDistance;
      }
      return Math.abs(left.areaMeters) - Math.abs(right.areaMeters);
    });

  return candidates[0] || null;
}

function isBuildingPartElement(element) {
  return Boolean(element?.tags?.['building:part']);
}

function isPrimaryBuildingCandidate(tags = {}) {
  const buildingTag = String(tags.building || '').trim().toLowerCase();
  const buildingPartTag = String(tags['building:part'] || '').trim().toLowerCase();

  if (buildingPartTag) return false;
  if (!buildingTag) return true;

  return buildingTag !== 'no';
}

function buildElementCandidate(element, lat, lng) {
  const { polygon, holes } = extractWayFootprint(element);
  if (polygon.length < 3) return null;

  const projected = polygon.map(point => projectToLocalMeters(point.lat, point.lng, lat, lng));
  const holeProjected = holes
    .map(hole => hole.map(point => projectToLocalMeters(point.lat, point.lng, lat, lng)))
    .filter(hole => hole.length >= 3);
  const center = polygonCentroid(projected);
  const containsSelection = pointInPolygon({ x: 0, y: 0 }, projected)
    && !holeProjected.some(hole => pointInPolygon({ x: 0, y: 0 }, hole));
  const areaMeters = computePolygonMetrics(projected, holeProjected).area;
  const centroidDistance = Math.hypot(center.x, center.y);

  return {
    polygon,
    holes,
    projected,
    holeProjected,
    center,
    containsSelection,
    areaMeters,
    centroidDistance,
    tags: element.tags || {},
  };
}

function chooseBuildingParts(elements, lat, lng, mainCandidate) {
  if (!mainCandidate) return [];

  const mainXs = mainCandidate.projected.map(point => point.x);
  const mainYs = mainCandidate.projected.map(point => point.y);
  const minX = Math.min(...mainXs);
  const maxX = Math.max(...mainXs);
  const minY = Math.min(...mainYs);
  const maxY = Math.max(...mainYs);
  const margin = Math.max(maxX - minX, maxY - minY, 10) * 0.35;

  return elements
    .filter(isBuildingPartElement)
    .map(element => buildElementCandidate(element, lat, lng))
    .filter(Boolean)
    .filter(candidate => {
      const withinBounds = candidate.center.x >= (minX - margin)
        && candidate.center.x <= (maxX + margin)
        && candidate.center.y >= (minY - margin)
        && candidate.center.y <= (maxY + margin);

      return withinBounds && candidate.areaMeters <= (mainCandidate.areaMeters * 1.2);
    })
    .sort((left, right) => right.areaMeters - left.areaMeters);
}

function buildCandidateFromPolygon(polygon, lat, lng, extra = {}) {
  if (!Array.isArray(polygon) || polygon.length < 3) return null;

  const cleaned = closePolygon(
    polygon.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
  );
  if (cleaned.length < 3) return null;

  const projected = cleaned.map(point => projectToLocalMeters(point.lat, point.lng, lat, lng));
  const holes = Array.isArray(extra.holes)
    ? extra.holes
      .map(hole => closePolygon(
        hole.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      ))
      .filter(hole => hole.length >= 3)
    : [];
  const holeProjected = holes
    .map(hole => hole.map(point => projectToLocalMeters(point.lat, point.lng, lat, lng)))
    .filter(hole => hole.length >= 3);
  const center = polygonCentroid(projected);
  const containsSelection = pointInPolygon({ x: 0, y: 0 }, projected)
    && !holeProjected.some(hole => pointInPolygon({ x: 0, y: 0 }, hole));
  const metrics = computePolygonMetrics(projected, holeProjected);

  return {
    polygon: cleaned,
    holes,
    projected,
    holeProjected,
    center,
    containsSelection,
    areaMeters: metrics.area,
    centroidDistance: Math.hypot(center.x, center.y),
    ...extra,
  };
}

function chooseBestCandidate(candidates) {
  return candidates
    .filter(Boolean)
    .sort((left, right) => {
      const leftIsPrimary = isPrimaryBuildingCandidate(left.tags);
      const rightIsPrimary = isPrimaryBuildingCandidate(right.tags);
      if (leftIsPrimary !== rightIsPrimary) {
        return leftIsPrimary ? -1 : 1;
      }
      if (left.containsSelection !== right.containsSelection) {
        return left.containsSelection ? -1 : 1;
      }
      if (Math.abs(left.centroidDistance - right.centroidDistance) > 0.01) {
        return left.centroidDistance - right.centroidDistance;
      }
      return Math.abs(left.areaMeters) - Math.abs(right.areaMeters);
    })[0] || null;
}

function getStaticMapsApiKey() {
  return (process.env.GOOGLE_MAPS_API_KEY || '').trim();
}

function getPixelColor(png, x, y) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return null;
  }

  const index = ((Math.floor(y) * png.width) + Math.floor(x)) * 4;
  return {
    r: png.data[index],
    g: png.data[index + 1],
    b: png.data[index + 2],
    a: png.data[index + 3],
  };
}

function rgbDistance(left, right) {
  const dr = left.r - right.r;
  const dg = left.g - right.g;
  const db = left.b - right.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function sampleCenterReferenceColor(png, centerX, centerY) {
  const samples = [];

  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      const color = getPixelColor(png, centerX + dx, centerY + dy);
      if (color && color.a > 0) {
        samples.push(color);
      }
    }
  }

  if (!samples.length) {
    return {
      average: { r: 128, g: 128, b: 128 },
      spread: 24,
    };
  }

  const average = samples.reduce((acc, sample) => ({
    r: acc.r + sample.r,
    g: acc.g + sample.g,
    b: acc.b + sample.b,
  }), { r: 0, g: 0, b: 0 });

  average.r /= samples.length;
  average.g /= samples.length;
  average.b /= samples.length;

  const spread = samples.reduce((acc, sample) => acc + rgbDistance(sample, average), 0) / samples.length;

  return { average, spread };
}

function growSatelliteMask(png, centerX, centerY, options = {}) {
  const { average, spread } = sampleCenterReferenceColor(png, centerX, centerY);
  const width = png.width;
  const height = png.height;
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const mask = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels * 2);
  let head = 0;
  let tail = 0;

  const threshold = clamp(36 + (spread * 2.4), 34, 96);
  const brightnessThreshold = clamp(20 + spread, 18, 52);
  const maxRegionPixels = options.maxRegionPixels || Math.floor(totalPixels * 0.25);

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width) + x;
    if (visited[index]) return;
    visited[index] = 1;
    queue[tail] = x;
    queue[tail + 1] = y;
    tail += 2;
  };

  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      push(centerX + dx, centerY + dy);
    }
  }

  let regionPixels = 0;
  let sumX = 0;
  let sumY = 0;

  while (head < tail && regionPixels < maxRegionPixels) {
    const x = queue[head];
    const y = queue[head + 1];
    head += 2;

    const color = getPixelColor(png, x, y);
    if (!color || color.a === 0) continue;

    const brightness = (color.r + color.g + color.b) / 3;
    const averageBrightness = (average.r + average.g + average.b) / 3;
    const distance = rgbDistance(color, average);

    if (distance > threshold || Math.abs(brightness - averageBrightness) > brightnessThreshold) {
      continue;
    }

    const index = (y * width) + x;
    if (mask[index]) continue;

    mask[index] = 1;
    regionPixels += 1;
    sumX += x;
    sumY += y;

    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
    push(x + 1, y + 1);
    push(x - 1, y - 1);
    push(x + 1, y - 1);
    push(x - 1, y + 1);
  }

  return {
    mask,
    regionPixels,
    centroidX: regionPixels ? (sumX / regionPixels) : centerX,
    centroidY: regionPixels ? (sumY / regionPixels) : centerY,
    threshold,
    spread,
  };
}

function extractRadialBoundary(maskData, width, height, centroidX, centroidY) {
  const boundary = [];
  const seen = new Set();
  const maxRadius = Math.hypot(width, height);

  const maskAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return maskData[(Math.floor(y) * width) + Math.floor(x)];
  };

  for (let step = 0; step < 48; step += 1) {
    const angle = (step / 48) * Math.PI * 2;
    let lastInside = null;

    for (let radius = 0; radius <= maxRadius; radius += 1) {
      const x = Math.round(centroidX + (Math.cos(angle) * radius));
      const y = Math.round(centroidY + (Math.sin(angle) * radius));

      if (!maskAt(x, y)) {
        if (lastInside) {
          const key = `${lastInside.x},${lastInside.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            boundary.push(lastInside);
          }
        }
        break;
      }

      lastInside = { x, y };
    }
  }

  return boundary;
}

function buildSatelliteCandidateFromMask(maskResult, lat, lng, zoom, width, height, building = {}) {
  const boundaryPixels = extractRadialBoundary(
    maskResult.mask,
    width,
    height,
    maskResult.centroidX,
    maskResult.centroidY
  );

  if (boundaryPixels.length < 8) {
    return null;
  }

  const polygon = boundaryPixels.map(point => pixelToLatLng(point.x, point.y, lat, lng, zoom, width, height));
  const candidate = buildCandidateFromPolygon(polygon, lat, lng, {
    tags: {
      building: 'satellite-detected',
      'roof:shape': building.roofShape || null,
    },
    sourceProvider: 'Google Static Maps satellite detection',
  });

  if (!candidate) return null;

  const metrics = computePolygonMetrics(candidate.projected);
  const pixelAreaMeters = maskResult.regionPixels * (approximateMetersPerPixel(lat, zoom, 2) ** 2);
  candidate.detection = {
    confidence: Number(clamp(
      0.35
        + Math.min(0.35, boundaryPixels.length / 80)
        + Math.min(0.2, maskResult.regionPixels / 18000)
        + Math.min(0.15, metrics.circularity),
      0,
      0.98
    ).toFixed(2)),
    circularity: Number(metrics.circularity.toFixed(3)),
    sampledPoints: boundaryPixels.length,
    pixelAreaMeters: Number(pixelAreaMeters.toFixed(1)),
    threshold: Number(maskResult.threshold.toFixed(1)),
  };

  return candidate;
}

async function fetchSatelliteDetectedFootprint(building, lat, lng) {
  const apiKey = getStaticMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key is missing on the server');
  }

  const zoom = 20;
  const width = 1280;
  const height = 1280;
  const url = 'https://maps.googleapis.com/maps/api/staticmap';

  const response = await axios.get(url, {
    params: {
      center: `${lat},${lng}`,
      zoom,
      size: '640x640',
      scale: 2,
      maptype: 'satellite',
      format: 'png32',
      key: apiKey,
      style: 'feature:all|element:labels|visibility:off',
    },
    responseType: 'arraybuffer',
    timeout: 20000,
  });

  const png = PNG.sync.read(Buffer.from(response.data));
  const centerX = Math.floor(png.width / 2);
  const centerY = Math.floor(png.height / 2);
  const metersPerPixel = approximateMetersPerPixel(lat, zoom, 2);
  const expectedAreaMeters = building?.solarStats?.buildingAreaMeters
    || building?.solarStats?.buildingGroundAreaMeters
    || null;
  const maxRegionPixels = expectedAreaMeters
    ? Math.max(1800, Math.round((expectedAreaMeters * 2.8) / (metersPerPixel * metersPerPixel)))
    : Math.round((png.width * png.height) * 0.12);

  const maskResult = growSatelliteMask(png, centerX, centerY, { maxRegionPixels });
  if (maskResult.regionPixels < 300) {
    throw new Error('Satellite detector could not isolate a strong roof region.');
  }

  const candidate = buildSatelliteCandidateFromMask(maskResult, lat, lng, zoom, width, height, building);
  if (!candidate) {
    throw new Error('Satellite detector could not trace a usable roof outline.');
  }

  return candidate;
}

function relativeAreaError(area, expected) {
  if (!expected || !area) return Number.POSITIVE_INFINITY;
  return Math.abs(area - expected) / expected;
}

function shouldPreferSatelliteCandidate(building, primaryCandidate, satelliteCandidate) {
  if (!satelliteCandidate?.detection) return false;
  if (!primaryCandidate) return satelliteCandidate.detection.confidence >= 0.5;

  const primaryMetrics = computePolygonMetrics(primaryCandidate.projected);
  const satelliteMetrics = computePolygonMetrics(satelliteCandidate.projected);
  const expectedArea = building?.solarStats?.buildingAreaMeters
    || building?.solarStats?.buildingGroundAreaMeters
    || null;

  if (expectedArea) {
    const primaryError = relativeAreaError(primaryCandidate.areaMeters, expectedArea);
    const satelliteError = relativeAreaError(satelliteCandidate.areaMeters, expectedArea);

    if ((satelliteError + 0.12) < primaryError && satelliteCandidate.detection.confidence >= 0.55) {
      return true;
    }
  }

  if (
    primaryMetrics.vertexCount <= 5
    && satelliteMetrics.vertexCount >= 12
    && satelliteMetrics.circularity > (primaryMetrics.circularity + 0.18)
    && satelliteCandidate.detection.confidence >= 0.58
  ) {
    return true;
  }

  if (
    satelliteMetrics.circularity >= 0.72
    && primaryMetrics.circularity <= 0.56
    && satelliteCandidate.detection.confidence >= 0.6
  ) {
    return true;
  }

  return false;
}

async function fetchOverpassFootprint(lat, lng) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
  ];
  const radii = [80, 150, 300];
  let lastError = null;

  for (const radius of radii) {
    const overpassQuery = `
[out:json][timeout:25];
(
  way["building"](around:${radius},${lat},${lng});
  relation["building"](around:${radius},${lat},${lng});
  way["building:part"](around:${radius},${lat},${lng});
  relation["building:part"](around:${radius},${lat},${lng});
);
out geom tags center;`;

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          params: { data: overpassQuery },
          headers: {
            Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en',
            'User-Agent': 'Archisight/1.0 (local development)',
          },
          timeout: 20000,
        });

        const elements = response.data?.elements || [];
        const match = chooseBestFootprint(elements, lat, lng);
        if (match) {
          match.parts = chooseBuildingParts(elements, lat, lng, match);
          match.sourceProvider = 'OpenStreetMap / Overpass';
          return match;
        }
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError || new Error('No mapped building footprint was found near this location.');
}

function geoJsonRingToPolygon(ring = []) {
  return closePolygon(
    ring
      .map(([candidateLng, candidateLat]) => ({
        lat: candidateLat,
        lng: candidateLng,
      }))
      .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
  );
}

function extractGeoJsonFootprint(geojson) {
  if (!geojson || !geojson.type || !Array.isArray(geojson.coordinates)) return null;

  let polygonRings = null;
  if (geojson.type === 'Polygon') {
    polygonRings = geojson.coordinates;
  } else if (geojson.type === 'MultiPolygon') {
    polygonRings = geojson.coordinates[0] || null;
  }

  if (!Array.isArray(polygonRings) || !polygonRings.length) return null;

  const polygon = geoJsonRingToPolygon(polygonRings[0] || []);
  const holes = polygonRings
    .slice(1)
    .map(geoJsonRingToPolygon)
    .filter(ring => ring.length >= 3);

  if (polygon.length < 3) return null;

  return { polygon, holes };
}

async function fetchNominatimFootprint(building, lat, lng) {
  const query = [building.name, building.address].filter(Boolean).join(', ').trim();
  if (!query) {
    throw new Error('No building name or address available for footprint lookup.');
  }

  const response = await axios.get('https://nominatim.openstreetmap.org/search', {
    params: {
      q: query,
      format: 'jsonv2',
      polygon_geojson: 1,
      limit: 8,
      viewbox: `${lng - 0.01},${lat + 0.01},${lng + 0.01},${lat - 0.01}`,
      bounded: 1,
    },
    headers: {
      Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en',
      'User-Agent': 'Archisight/1.0 (local development)',
    },
    timeout: 20000,
  });

  const results = Array.isArray(response.data) ? response.data : [];
  const candidates = results.map(result => {
    const footprint = extractGeoJsonFootprint(result.geojson);
    if (!footprint) return null;

    return buildCandidateFromPolygon(footprint.polygon, lat, lng, {
      holes: footprint.holes,
      tags: {
        building: result.type || result.class || 'building',
      },
      sourceProvider: 'Nominatim building polygon',
    });
  });

  const match = chooseBestCandidate(candidates);
  if (!match) {
    throw new Error('No Nominatim building polygon matched this search.');
  }

  return match;
}

async function fetchNominatimReverseFootprint(lat, lng) {
  const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
    params: {
      lat,
      lon: lng,
      format: 'jsonv2',
      polygon_geojson: 1,
      zoom: 18,
    },
    headers: {
      Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en',
      'User-Agent': 'Archisight/1.0 (local development)',
    },
    timeout: 20000,
  });

  const result = response.data || {};
  const footprint = extractGeoJsonFootprint(result.geojson);
  if (!footprint) {
    throw new Error('No Nominatim reverse polygon matched this location.');
  }

  const match = buildCandidateFromPolygon(footprint.polygon, lat, lng, {
    holes: footprint.holes,
    tags: {
      building: result.type || result.category || 'building',
    },
    sourceProvider: 'Nominatim reverse polygon',
  });

  if (!match) {
    throw new Error('No usable Nominatim reverse polygon matched this location.');
  }

  return match;
}

function manualFootprintToCandidate(building, lat, lng) {
  const footprint = Array.isArray(building.manualFootprint) ? building.manualFootprint : [];
  const holes = Array.isArray(building.manualHoles) ? building.manualHoles : [];
  const candidate = buildCandidateFromPolygon(footprint, lat, lng, {
    holes,
    tags: {
      building: 'manual',
      'building:levels': building.floors || null,
      height: building.height || null,
      'roof:shape': building.roofShape || null,
      'roof:height': building.roofHeight || null,
    },
    sourceProvider: 'Manual footprint',
  });

  if (!candidate) {
    throw new Error('Manual footprint must contain at least 3 valid points.');
  }

  return candidate;
}

function estimateApproximateAreaMeters(building) {
  if (building?.solarStats?.buildingAreaMeters) {
    return Math.max(120, Number(building.solarStats.buildingAreaMeters));
  }
  if (building?.area) {
    return Math.max(120, Number(building.area) / 10.764);
  }
  return 400;
}

function makeApproximateFootprintCandidate(building, lat, lng) {
  const areaMeters = estimateApproximateAreaMeters(building);
  const width = Math.sqrt(areaMeters * 1.25);
  const depth = areaMeters / width;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  const polygon = [
    localMetersToLatLng(-halfWidth, halfDepth, lat, lng),
    localMetersToLatLng(halfWidth, halfDepth, lat, lng),
    localMetersToLatLng(halfWidth, -halfDepth, lat, lng),
    localMetersToLatLng(-halfWidth, -halfDepth, lat, lng),
  ];

  return buildCandidateFromPolygon(polygon, lat, lng, {
    tags: {
      building: 'approximate',
      'building:levels': building.floors || null,
      height: building.height || null,
      'roof:shape': building.roofShape || null,
      'roof:height': building.roofHeight || null,
    },
    sourceProvider: 'Approximation fallback',
  });
}

async function fetchBuildingFootprint(building, lat, lng) {
  if (Array.isArray(building.manualFootprint) && building.manualFootprint.length >= 3) {
    return manualFootprintToCandidate(building, lat, lng);
  }

  let overpassCandidate = null;
  try {
    overpassCandidate = await fetchOverpassFootprint(lat, lng);
  } catch (overpassError) {
    try {
      const nominatimCandidate = await fetchNominatimFootprint(building, lat, lng);

      try {
        const satelliteCandidate = await fetchSatelliteDetectedFootprint(building, lat, lng);
        if (shouldPreferSatelliteCandidate(building, nominatimCandidate, satelliteCandidate)) {
          return satelliteCandidate;
        }
      } catch (satelliteError) {
        // Ignore satellite failures and preserve the stronger map-data fallback.
      }

      return nominatimCandidate;
    } catch (nominatimError) {
      try {
        const reverseCandidate = await fetchNominatimReverseFootprint(lat, lng);

        try {
          const satelliteCandidate = await fetchSatelliteDetectedFootprint(building, lat, lng);
          if (shouldPreferSatelliteCandidate(building, reverseCandidate, satelliteCandidate)) {
            return satelliteCandidate;
          }
        } catch (satelliteError) {
          // Ignore satellite failures and preserve the stronger map-data fallback.
        }

        return reverseCandidate;
      } catch (reverseError) {
        try {
          const satelliteCandidate = await fetchSatelliteDetectedFootprint(building, lat, lng);
          if (satelliteCandidate) {
            return satelliteCandidate;
          }
        } catch (satelliteError) {
          // Ignore satellite failures and continue to geometric approximation fallback.
        }

        const approximate = makeApproximateFootprintCandidate(building, lat, lng);
        if (approximate) {
          return approximate;
        }

        throw reverseError.message
          ? new Error(reverseError.message)
          : (nominatimError.message ? new Error(nominatimError.message) : overpassError);
      }
    }
  }

  if (overpassCandidate) {
    try {
      const satelliteCandidate = await fetchSatelliteDetectedFootprint(building, lat, lng);
      if (shouldPreferSatelliteCandidate(building, overpassCandidate, satelliteCandidate)) {
        return satelliteCandidate;
      }
    } catch (satelliteError) {
      // Ignore satellite failures and preserve the stronger OSM footprint.
    }

    return overpassCandidate;
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderFootprintSvg(building, footprint, requestedLat, requestedLng) {
  const width = 900;
  const height = 700;
  const framePadding = 70;
  const usableWidth = width - (framePadding * 2);
  const usableHeight = height - (framePadding * 2);

  const xs = footprint.projected.map(point => point.x);
  const ys = footprint.projected.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min(usableWidth / spanX, usableHeight / spanY);

  const offsetX = (width - (spanX * scale)) / 2;
  const offsetY = (height - (spanY * scale)) / 2;

  const svgPoints = footprint.projected.map(point => ({
    x: offsetX + ((point.x - minX) * scale),
    y: height - (offsetY + ((point.y - minY) * scale)),
  }));

  const pathData = svgPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ') + ' Z';
  const footprintWidthMeters = spanX.toFixed(1);
  const footprintHeightMeters = spanY.toFixed(1);
  const footprintAreaMeters = footprint.areaMeters.toFixed(1);
  const label = escapeXml(building.name || 'Selected Building');
  const address = escapeXml(building.address || '');
  const sourceLabel = 'Source: OpenStreetMap building geometry';
  const selectionOffset = distanceMeters(
    requestedLat,
    requestedLng,
    footprint.polygon[0].lat,
    footprint.polygon[0].lng
  );

  const scaleBarMeters = Math.max(5, Math.round((Math.max(spanX, spanY) / 5) / 5) * 5);
  const scaleBarWidth = scaleBarMeters * scale;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <rect width="${width}" height="${height}" fill="#08111f" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="#18324d" stroke-width="2" rx="18" />
  <rect x="48" y="48" width="292" height="134" fill="rgba(9,20,36,0.92)" stroke="#25557c" stroke-width="1.5" rx="14" />
  <text x="68" y="82" fill="#dbeafe" font-family="Inter, sans-serif" font-size="18" font-weight="700">Measured Building Footprint</text>
  <text x="68" y="108" fill="#7dd3fc" font-family="Inter, sans-serif" font-size="14">${label}</text>
  <text x="68" y="128" fill="#94a3b8" font-family="Inter, sans-serif" font-size="11">${address}</text>
  <text x="68" y="150" fill="#e2e8f0" font-family="JetBrains Mono, monospace" font-size="11">Area ${footprintAreaMeters} m² | Width ${footprintWidthMeters} m | Height ${footprintHeightMeters} m</text>
  <text x="68" y="168" fill="#64748b" font-family="Inter, sans-serif" font-size="10">${sourceLabel}</text>

  <path d="${pathData}" fill="rgba(56, 189, 248, 0.16)" stroke="#38bdf8" stroke-width="4" stroke-linejoin="round" />
  <path d="${pathData}" fill="none" stroke="rgba(224, 242, 254, 0.35)" stroke-width="1.5" stroke-dasharray="8 5" />

  <line x1="${offsetX.toFixed(1)}" y1="${height - offsetY + 18}" x2="${(offsetX + (spanX * scale)).toFixed(1)}" y2="${height - offsetY + 18}" stroke="#94a3b8" stroke-width="1.5" />
  <line x1="${offsetX.toFixed(1)}" y1="${height - offsetY + 10}" x2="${offsetX.toFixed(1)}" y2="${height - offsetY + 26}" stroke="#94a3b8" stroke-width="1.5" />
  <line x1="${(offsetX + (spanX * scale)).toFixed(1)}" y1="${height - offsetY + 10}" x2="${(offsetX + (spanX * scale)).toFixed(1)}" y2="${height - offsetY + 26}" stroke="#94a3b8" stroke-width="1.5" />
  <text x="${(offsetX + ((spanX * scale) / 2)).toFixed(1)}" y="${height - offsetY + 44}" fill="#e2e8f0" font-family="JetBrains Mono, monospace" font-size="12" text-anchor="middle">Width ${footprintWidthMeters} m</text>

  <line x1="${offsetX - 18}" y1="${(height - offsetY - (spanY * scale)).toFixed(1)}" x2="${offsetX - 18}" y2="${(height - offsetY).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />
  <line x1="${offsetX - 26}" y1="${(height - offsetY - (spanY * scale)).toFixed(1)}" x2="${offsetX - 10}" y2="${(height - offsetY - (spanY * scale)).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />
  <line x1="${offsetX - 26}" y1="${(height - offsetY).toFixed(1)}" x2="${offsetX - 10}" y2="${(height - offsetY).toFixed(1)}" stroke="#94a3b8" stroke-width="1.5" />
  <text x="${offsetX - 36}" y="${(height - offsetY - ((spanY * scale) / 2)).toFixed(1)}" fill="#e2e8f0" font-family="JetBrains Mono, monospace" font-size="12" text-anchor="middle" transform="rotate(-90 ${offsetX - 36} ${(height - offsetY - ((spanY * scale) / 2)).toFixed(1)})">Height ${footprintHeightMeters} m</text>

  <rect x="60" y="${height - 92}" width="${Math.max(scaleBarWidth, 24).toFixed(1)}" height="10" fill="#38bdf8" rx="2" />
  <rect x="${(60 + Math.max(scaleBarWidth, 24)).toFixed(1)}" y="${height - 92}" width="${Math.max(scaleBarWidth, 24).toFixed(1)}" height="10" fill="#0f172a" stroke="#38bdf8" stroke-width="1" rx="2" />
  <text x="60" y="${height - 102}" fill="#cbd5e1" font-family="JetBrains Mono, monospace" font-size="11">${scaleBarMeters}m scale bar</text>

  <line x1="${width - 92}" y1="${height - 118}" x2="${width - 92}" y2="${height - 70}" stroke="#38bdf8" stroke-width="3" />
  <polygon points="${width - 92},${height - 136} ${width - 102},${height - 114} ${width - 82},${height - 114}" fill="#38bdf8" />
  <text x="${width - 92}" y="${height - 146}" fill="#e2e8f0" font-family="JetBrains Mono, monospace" font-size="12" text-anchor="middle">N</text>

  <text x="${width - 300}" y="${height - 40}" fill="#64748b" font-family="Inter, sans-serif" font-size="10">Selection anchored near mapped footprint (${selectionOffset.toFixed(1)} m from first polygon node)</text>
</svg>`;
}

function parsePositiveNumber(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!normalized) return null;
  const parsed = Number(normalized[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseYear(value) {
  if (value === undefined || value === null) return null;

  const match = String(value).match(/\b(1[6-9]\d{2}|20\d{2}|2100)\b/);
  if (!match) return null;

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function estimateBuildingLevels(tags, building) {
  return parsePositiveNumber(tags['building:levels'])
    || parsePositiveNumber(tags.levels)
    || parsePositiveNumber(building.floors)
    || 3;
}

function estimateRoofLevels(tags) {
  return parsePositiveNumber(tags['roof:levels']) || 0;
}

function estimateHeightMeters(tags, building) {
  const explicitHeight = parsePositiveNumber(tags.height);
  if (explicitHeight) return explicitHeight;

  const levels = estimateBuildingLevels(tags, building);
  const minLevelHeight = 3.2;
  const inferred = levels * minLevelHeight;
  return Math.max(8, Number(inferred.toFixed(1)));
}

function estimateRoofHeightMeters(tags, buildingHeightMeters) {
  const explicitRoofHeight = parsePositiveNumber(tags['roof:height']);
  if (explicitRoofHeight) return explicitRoofHeight;

  const roofLevels = estimateRoofLevels(tags);
  if (roofLevels) return Number((roofLevels * 2.6).toFixed(1));

  const roofShape = String(tags['roof:shape'] || '').toLowerCase();
  if (['gabled', 'hipped', 'pyramidal', 'dome', 'cone', 'shed', 'skillion'].includes(roofShape)) {
    return Math.max(2.5, Number((buildingHeightMeters * 0.18).toFixed(1)));
  }

  return 0;
}

function normalizeRoofShape(tags) {
  const roofShape = String(tags['roof:shape'] || '').toLowerCase();
  if (['gabled', 'half-hipped', 'saltbox'].includes(roofShape)) return 'gabled';
  if (roofShape === 'pyramidal') return 'pyramidal';
  if (roofShape === 'hipped') return 'hipped';
  if (['shed', 'skillion'].includes(roofShape)) return 'shed';
  if (['dome', 'cone'].includes(roofShape)) return roofShape;
  return 'flat';
}

function inferRoofShape(tags, buildingContext, widthMeters, depthMeters, isPart) {
  const explicit = normalizeRoofShape(tags);
  if (explicit !== 'flat' || tags['roof:shape']) {
    return explicit;
  }

  const ratio = Math.max(widthMeters, depthMeters) / Math.max(1, Math.min(widthMeters, depthMeters));

  if (buildingContext.type === 'CHURCH / CATHEDRAL') {
    return ratio > 1.5 ? 'gabled' : 'hipped';
  }
  if (buildingContext.type === 'CASTLE / FORTRESS') {
    return isPart ? 'cone' : 'hipped';
  }
  if (buildingContext.type === 'RAILWAY STATION') {
    return 'gabled';
  }
  if (buildingContext.type === 'THEATRE / OPERA HOUSE') {
    return ratio < 1.25 ? 'dome' : 'hipped';
  }
  if (buildingContext.type === 'MUSEUM / GALLERY') {
    return ratio > 1.4 ? 'gabled' : 'hipped';
  }
  return ratio > 1.8 ? 'gabled' : 'flat';
}

function inferRidgeAxis(tags, widthMeters, depthMeters) {
  const orientation = String(tags['roof:orientation'] || '').toLowerCase();
  if (orientation === 'along') {
    return widthMeters >= depthMeters ? 'x' : 'z';
  }
  if (orientation === 'across') {
    return widthMeters >= depthMeters ? 'z' : 'x';
  }

  const direction = parsePositiveNumber(tags['roof:direction']);
  if (direction !== null) {
    const normalized = ((direction % 180) + 180) % 180;
    return (normalized > 45 && normalized < 135) ? 'z' : 'x';
  }

  return widthMeters >= depthMeters ? 'x' : 'z';
}

function inferRoofHeightMeters(tags, wallHeightMeters, roofShape, buildingContext) {
  const explicit = estimateRoofHeightMeters(tags, wallHeightMeters);
  if (explicit > 0) return explicit;

  if (roofShape === 'flat') return 0;
  if (roofShape === 'dome') return Math.max(3.5, Number((wallHeightMeters * 0.24).toFixed(1)));
  if (roofShape === 'cone') return Math.max(3, Number((wallHeightMeters * 0.28).toFixed(1)));
  if (roofShape === 'pyramidal') return Math.max(3, Number((wallHeightMeters * 0.24).toFixed(1)));
  if (roofShape === 'shed') return Math.max(2, Number((wallHeightMeters * 0.16).toFixed(1)));
  if (buildingContext.type === 'CHURCH / CATHEDRAL') {
    return Math.max(3, Number((wallHeightMeters * 0.22).toFixed(1)));
  }
  if (buildingContext.type === 'RAILWAY STATION') {
    return Math.max(2.4, Number((wallHeightMeters * 0.18).toFixed(1)));
  }
  return Math.max(2, Number((wallHeightMeters * 0.16).toFixed(1)));
}

function determinePartKind(tags, buildingContext, index) {
  const explicit = String(tags['building:part'] || '').toLowerCase();
  if (explicit) return explicit;
  if (buildingContext.type === 'CHURCH / CATHEDRAL' && index > 0) return 'chapel';
  if (buildingContext.type === 'CASTLE / FORTRESS' && index > 0) return 'tower';
  return index === 0 ? 'main' : 'wing';
}

function buildPartModel(candidate, building, buildingContext, origin, index = 0) {
  const tags = candidate.tags || {};
  const centered = candidate.projected.map(point => ({
    x: Number((point.x - origin.x).toFixed(3)),
    z: Number((point.y - origin.y).toFixed(3)),
  }));
  const centeredHoles = (candidate.holeProjected || []).map(hole => (
    hole.map(point => ({
      x: Number((point.x - origin.x).toFixed(3)),
      z: Number((point.y - origin.y).toFixed(3)),
    }))
  ));

  const xs = centered.map(point => point.x);
  const zs = centered.map(point => point.z);
  const widthMeters = Math.max(...xs) - Math.min(...xs);
  const depthMeters = Math.max(...zs) - Math.min(...zs);
  const wallHeightMeters = estimateHeightMeters(tags, building);
  const roofShape = inferRoofShape(tags, buildingContext, widthMeters, depthMeters, index > 0);
  const ridgeAxis = inferRidgeAxis(tags, widthMeters, depthMeters);
  const roofHeightMeters = inferRoofHeightMeters(tags, wallHeightMeters, roofShape, buildingContext);
  const levels = estimateBuildingLevels(tags, building);

  return {
    id: `${building._id || building.name || 'building'}-part-${index}`,
    kind: determinePartKind(tags, buildingContext, index),
    footprint: centered,
    holes: centeredHoles,
    metrics: {
      footprintAreaMeters: Number(candidate.areaMeters.toFixed(1)),
      widthMeters: Number(widthMeters.toFixed(1)),
      depthMeters: Number(depthMeters.toFixed(1)),
      wallHeightMeters,
      roofHeightMeters,
      totalHeightMeters: Number((wallHeightMeters + roofHeightMeters).toFixed(1)),
      levels,
    },
    roof: {
      shape: roofShape,
      ridgeAxis,
      direction: tags['roof:direction'] || null,
      orientation: tags['roof:orientation'] || null,
    },
    tags: {
      building: tags.building || null,
      buildingPart: tags['building:part'] || null,
      height: tags.height || null,
      buildingLevels: tags['building:levels'] || null,
      roofShape: tags['roof:shape'] || null,
      roofHeight: tags['roof:height'] || null,
      roofLevels: tags['roof:levels'] || null,
    },
  };
}

function rectangleProjectedPolygon(centerX, centerY, width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    { x: centerX - halfWidth, y: centerY + halfDepth },
    { x: centerX + halfWidth, y: centerY + halfDepth },
    { x: centerX + halfWidth, y: centerY - halfDepth },
    { x: centerX - halfWidth, y: centerY - halfDepth },
  ];
}

function candidateFromProjectedPolygon(projected, tags = {}) {
  return {
    projected,
    center: polygonCentroid(projected),
    containsSelection: false,
    areaMeters: polygonArea(projected),
    centroidDistance: 0,
    tags,
  };
}

function synthesizeChurchParts(mainCandidate) {
  const xs = mainCandidate.projected.map(point => point.x);
  const ys = mainCandidate.projected.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const depth = maxY - minY;
  const longAlongY = depth >= width;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  if (longAlongY) {
    return [
      candidateFromProjectedPolygon(
        rectangleProjectedPolygon(cx, cy, width * 0.42, depth * 0.9),
        { 'building:part': 'nave', 'roof:shape': 'gabled', 'roof:orientation': 'along' }
      ),
      candidateFromProjectedPolygon(
        rectangleProjectedPolygon(cx, cy + (depth * 0.18), width * 0.82, depth * 0.18),
        { 'building:part': 'transept', 'roof:shape': 'gabled', 'roof:orientation': 'across' }
      ),
      candidateFromProjectedPolygon(
        rectangleProjectedPolygon(cx - (width * 0.2), minY + (depth * 0.12), width * 0.18, depth * 0.2),
        { 'building:part': 'tower', 'roof:shape': 'cone', 'building:levels': 4 }
      ),
      candidateFromProjectedPolygon(
        rectangleProjectedPolygon(cx + (width * 0.2), minY + (depth * 0.12), width * 0.18, depth * 0.2),
        { 'building:part': 'tower', 'roof:shape': 'cone', 'building:levels': 4 }
      ),
    ];
  }

  return [
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(cx, cy, width * 0.9, depth * 0.42),
      { 'building:part': 'nave', 'roof:shape': 'gabled', 'roof:orientation': 'along' }
    ),
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(cx + (width * 0.18), cy, width * 0.18, depth * 0.82),
      { 'building:part': 'transept', 'roof:shape': 'gabled', 'roof:orientation': 'across' }
    ),
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(minX + (width * 0.12), cy - (depth * 0.2), width * 0.2, depth * 0.18),
      { 'building:part': 'tower', 'roof:shape': 'cone', 'building:levels': 4 }
    ),
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(minX + (width * 0.12), cy + (depth * 0.2), width * 0.2, depth * 0.18),
      { 'building:part': 'tower', 'roof:shape': 'cone', 'building:levels': 4 }
    ),
  ];
}

function synthesizeCastleParts(mainCandidate) {
  const xs = mainCandidate.projected.map(point => point.x);
  const ys = mainCandidate.projected.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const depth = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const towerSize = Math.min(width, depth) * 0.18;

  return [
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(cx, cy, width * 0.82, depth * 0.78),
      { 'building:part': 'hall', 'roof:shape': 'hipped' }
    ),
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(minX + towerSize, minY + towerSize, towerSize, towerSize),
      { 'building:part': 'tower', 'roof:shape': 'cone', 'building:levels': 5 }
    ),
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(maxX - towerSize, minY + towerSize, towerSize, towerSize),
      { 'building:part': 'tower', 'roof:shape': 'cone', 'building:levels': 5 }
    ),
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(minX + towerSize, maxY - towerSize, towerSize, towerSize),
      { 'building:part': 'tower', 'roof:shape': 'cone', 'building:levels': 5 }
    ),
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(maxX - towerSize, maxY - towerSize, towerSize, towerSize),
      { 'building:part': 'tower', 'roof:shape': 'cone', 'building:levels': 5 }
    ),
  ];
}

function synthesizeStationParts(mainCandidate) {
  const xs = mainCandidate.projected.map(point => point.x);
  const ys = mainCandidate.projected.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const depth = maxY - minY;
  const longAlongY = depth >= width;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  if (longAlongY) {
    return [
      candidateFromProjectedPolygon(
        rectangleProjectedPolygon(cx, cy, width * 0.48, depth * 0.9),
        { 'building:part': 'hall', 'roof:shape': 'gabled', 'roof:orientation': 'along', 'building:levels': 4 }
      ),
      candidateFromProjectedPolygon(
        rectangleProjectedPolygon(cx - (width * 0.24), cy, width * 0.24, depth * 0.82),
        { 'building:part': 'wing', 'roof:shape': 'hipped', 'building:levels': 2 }
      ),
      candidateFromProjectedPolygon(
        rectangleProjectedPolygon(cx + (width * 0.24), cy, width * 0.24, depth * 0.82),
        { 'building:part': 'wing', 'roof:shape': 'hipped', 'building:levels': 2 }
      ),
    ];
  }

  return [
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(cx, cy, width * 0.9, depth * 0.48),
      { 'building:part': 'hall', 'roof:shape': 'gabled', 'roof:orientation': 'along', 'building:levels': 4 }
    ),
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(cx, cy - (depth * 0.24), width * 0.82, depth * 0.24),
      { 'building:part': 'wing', 'roof:shape': 'hipped', 'building:levels': 2 }
    ),
    candidateFromProjectedPolygon(
      rectangleProjectedPolygon(cx, cy + (depth * 0.24), width * 0.82, depth * 0.24),
      { 'building:part': 'wing', 'roof:shape': 'hipped', 'building:levels': 2 }
    ),
  ];
}

function synthesizeLandmarkParts(mainCandidate, buildingContext) {
  if (buildingContext.type === 'CHURCH / CATHEDRAL') {
    return synthesizeChurchParts(mainCandidate);
  }
  if (buildingContext.type === 'CASTLE / FORTRESS') {
    return synthesizeCastleParts(mainCandidate);
  }
  if (buildingContext.type === 'RAILWAY STATION') {
    return synthesizeStationParts(mainCandidate);
  }
  return [];
}

function build3DModelData(building, footprint) {
  const tags = footprint.tags || {};
  const buildingContext = buildBuildingContext(building);
  const origin = polygonCentroid(footprint.projected);
  const sourceParts = (footprint.parts && footprint.parts.length)
    ? footprint.parts
    : synthesizeLandmarkParts(footprint, buildingContext);
  const parts = [footprint, ...sourceParts]
    .map((candidate, index) => buildPartModel(candidate, building, buildingContext, origin, index));
  const primaryPart = parts[0];
  const heuristicPartsUsed = !footprint.parts?.length && sourceParts.length > 0;

  return {
    building: {
      name: building.name,
      address: building.address,
      lat: Number(building.lat),
      lng: Number(building.lng),
      type: buildingContext.type,
    },
    footprint: primaryPart.footprint,
    parts,
    metrics: {
      footprintAreaMeters: primaryPart.metrics.footprintAreaMeters,
      widthMeters: primaryPart.metrics.widthMeters,
      depthMeters: primaryPart.metrics.depthMeters,
      wallHeightMeters: primaryPart.metrics.wallHeightMeters,
      roofHeightMeters: primaryPart.metrics.roofHeightMeters,
      totalHeightMeters: primaryPart.metrics.totalHeightMeters,
      levels: primaryPart.metrics.levels,
    },
    roof: primaryPart.roof,
    source: {
      provider: footprint.sourceProvider || 'OpenStreetMap / Overpass',
      detection: footprint.detection || null,
      refinementHints: {
        streetViewCandidate: Boolean(building.lat && building.lng),
        imageAnalysisSuggested: buildingContext.type === 'CHURCH / CATHEDRAL' || parts.length > 1,
        heuristicPartsUsed,
      },
      tags: {
        building: tags.building || null,
        height: tags.height || null,
        buildingLevels: tags['building:levels'] || null,
        roofShape: tags['roof:shape'] || null,
        roofHeight: tags['roof:height'] || null,
        roofLevels: tags['roof:levels'] || null,
        roofDirection: tags['roof:direction'] || null,
        roofOrientation: tags['roof:orientation'] || null,
      },
    },
  };
}

async function buildFootprintSvg(building) {
  const lat = Number(building.lat ?? building.coordinates?.coordinates?.[1]);
  const lng = Number(building.lng ?? building.coordinates?.coordinates?.[0]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Building coordinates are required to derive the real footprint.');
  }

  const footprint = await fetchBuildingFootprint(building, lat, lng);
  return renderFootprintSvg(building, footprint, lat, lng);
}

async function build3DModel(building) {
  const lat = Number(building.lat ?? building.coordinates?.coordinates?.[1]);
  const lng = Number(building.lng ?? building.coordinates?.coordinates?.[0]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Building coordinates are required to derive the 3D model.');
  }

  const footprint = await fetchBuildingFootprint(building, lat, lng);
  return build3DModelData({ ...building, lat, lng }, footprint);
}

async function reverseGeocodeLocation(lat, lng) {
  const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
    params: {
      lat,
      lon: lng,
      format: 'jsonv2',
      addressdetails: 1,
      zoom: 18,
    },
    headers: {
      Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en',
      'User-Agent': 'Archisight/1.0 (local development)',
    },
    timeout: 20000,
  });

  return response.data || {};
}

function inferBuildingName(tags = {}, reverseResult = {}) {
  const directName = [
    tags.name,
    tags['name:en'],
    tags.operator,
    reverseResult.name,
    reverseResult.namedetails?.name,
    reverseResult.address?.building,
    reverseResult.address?.amenity,
    reverseResult.address?.attraction,
    reverseResult.address?.office,
  ]
    .map((value) => String(value || '').trim())
    .find(Boolean);

  if (directName) return directName;

  const road = reverseResult.address?.road || reverseResult.address?.pedestrian || reverseResult.address?.footway;
  const houseNumber = reverseResult.address?.house_number;
  if (road) {
    return houseNumber ? `${road} ${houseNumber}` : road;
  }

  return 'Selected Building';
}

function inferBuildingAddress(reverseResult = {}, fallbackName = 'Selected Building') {
  const displayName = String(reverseResult.display_name || '').trim();
  if (displayName) return displayName;

  const road = reverseResult.address?.road || reverseResult.address?.pedestrian || reverseResult.address?.footway;
  const houseNumber = reverseResult.address?.house_number;
  const city = reverseResult.address?.city || reverseResult.address?.town || reverseResult.address?.village;
  const postcode = reverseResult.address?.postcode;

  const firstLine = [road, houseNumber].filter(Boolean).join(' ').trim();
  const secondLine = [postcode, city].filter(Boolean).join(' ').trim();
  const joined = [firstLine, secondLine].filter(Boolean).join(', ').trim();

  return joined || fallbackName;
}

function collectBuildingAmenities(tags = {}) {
  return [
    tags.building,
    tags.amenity,
    tags.tourism,
    tags.shop,
    tags.office,
    tags.historic,
    tags['roof:shape'],
  ].filter(Boolean);
}

function buildResolvedBuildingFromSelection(lat, lng, candidate, reverseResult) {
  const tags = candidate?.tags || {};
  const centroid = candidate
    ? localMetersToLatLng(candidate.center.x, candidate.center.y, lat, lng)
    : { lat, lng };
  const name = inferBuildingName(tags, reverseResult);
  const address = inferBuildingAddress(reverseResult, name);
  const floors = Math.max(1, Math.round(estimateBuildingLevels(tags, {})));
  const areaMeters = candidate?.areaMeters ? Number(candidate.areaMeters.toFixed(1)) : null;
  const areaSqFt = areaMeters ? Number((areaMeters * 10.764).toFixed(1)) : null;
  const yearBuilt = parseYear(tags.start_date)
    || parseYear(tags.construction_date)
    || parseYear(tags.year_built)
    || parseYear(tags['building:date']);
  const roofShape = tags['roof:shape'] || null;
  const sourceLabel = candidate?.sourceProvider || 'Reverse geocoding';

  return {
    _id: `resolved-${Date.now()}`,
    name,
    address,
    lat: centroid.lat,
    lng: centroid.lng,
    floors,
    area: areaSqFt,
    yearBuilt,
    amenities: collectBuildingAmenities(tags),
    description: `Resolved from a map click using ${sourceLabel}.`,
    roofShape,
    isOsm: true,
    clickResolved: true,
  };
}

async function resolveClickedBuilding(lat, lng) {
  let candidate = null;

  try {
    candidate = await fetchOverpassFootprint(lat, lng);
  } catch (overpassError) {
    try {
      candidate = await fetchNominatimReverseFootprint(lat, lng);
    } catch (reverseError) {
      candidate = null;
    }
  }

  const reverseResult = await reverseGeocodeLocation(lat, lng).catch(() => ({}));
  return buildResolvedBuildingFromSelection(lat, lng, candidate, reverseResult);
}

// ── SOLAR API endpoint ────────────────────────────────────────────────────────
router.get('/solar-stats', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    const apiKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'Google Maps API key is missing on the server' });
    }

    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&key=${apiKey}`;
    const solarRes = await axios.get(url);

    if (solarRes.data && solarRes.data.solarPotential) {
      const sp = solarRes.data.solarPotential;
      const buildingStats = sp.buildingStats || {};
      const wholeRoofStats = sp.wholeRoofStats || {};

      res.json({
        success: true,
        data: {
          buildingAreaMeters: buildingStats.areaMeters2 || null,
          buildingGroundAreaMeters: buildingStats.groundAreaMeters2 || null,
          roofAreaMeters: wholeRoofStats.areaMeters2 || null,
          roofGroundAreaMeters: wholeRoofStats.groundAreaMeters2 || null,
        }
      });
    } else {
      res.json({
        success: false,
        message: 'No solar/building insights found in Google data.',
        fallback: true
      });
    }
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res.json({
        success: false,
        message: 'Google Solar API data is not available for this location.',
        fallback: true
      });
    }
    console.error('Solar API error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || 'Error querying Solar API',
      fallback: true
    });
  }
});

// ── DIRECT endpoints (custom/OSM buildings — body contains building data) ──────
// IMPORTANT: These MUST be declared before /:id routes

router.post('/resolve-location', async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);

    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required.' });
    }

    const building = await resolveClickedBuilding(parsedLat, parsedLng);
    res.json({ success: true, data: building });
  } catch (err) {
    console.error('Resolve location error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'Failed to resolve the clicked building.' });
  }
});

router.post('/direct/generate-3d', async (req, res) => {
  try {
    const b = req.body;
    if (!b || !b.name) return res.status(400).json({ success: false, message: 'Building name is required' });
    const anthropic = getClient();
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 4096,
      messages: [{ role: 'user', content: make3DPrompt(b) }],
    });
    let html = msg.content[0].text.trim();
    html = html.replace(/^```[\w]*\n?/m, '').replace(/```\s*$/m, '').trim();
    res.json({ success: true, html });
  } catch (err) {
    console.error('3D direct error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/direct/model-3d', async (req, res) => {
  try {
    const b = req.body;
    if (!b || !b.name) return res.status(400).json({ success: false, message: 'Building name is required' });
    const model = await build3DModel(b);
    res.json({ success: true, model });
  } catch (err) {
    console.error('3D model direct error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/direct/generate-plan', async (req, res) => {
  try {
    const b = req.body;
    if (!b || !b.name) return res.status(400).json({ success: false, message: 'Building name is required' });
    const svg = await buildFootprintSvg(b);
    res.json({ success: true, svg });
  } catch (err) {
    console.error('Footprint direct error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET all seeded buildings ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const buildings = await Building.find({});
    res.json({ success: true, data: buildings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET single seeded building ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) return res.status(404).json({ success: false, message: 'Building not found' });
    res.json({ success: true, data: building });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST generate 3D for seeded building (by MongoDB id) ─────────────────────
router.post('/:id/generate-3d', async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) return res.status(404).json({ success: false, message: 'Building not found' });
    const anthropic = getClient();
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 4096,
      messages: [{ role: 'user', content: make3DPrompt(building) }],
    });
    let html = msg.content[0].text.trim();
    html = html.replace(/^```[\w]*\n?/m, '').replace(/```\s*$/m, '').trim();
    res.json({ success: true, html });
  } catch (err) {
    console.error('3D id error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/model-3d', async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) return res.status(404).json({ success: false, message: 'Building not found' });

    const buildingData = {
      ...building.toObject(),
      lat: building.coordinates?.coordinates?.[1],
      lng: building.coordinates?.coordinates?.[0],
    };

    const model = await build3DModel(buildingData);
    res.json({ success: true, model });
  } catch (err) {
    console.error('3D model id error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST generate 2D for seeded building (by MongoDB id) ─────────────────────
router.post('/:id/generate-plan', async (req, res) => {
  try {
    const building = await Building.findById(req.params.id);
    if (!building) return res.status(404).json({ success: false, message: 'Building not found' });

    const buildingData = {
      ...building.toObject(),
      lat: building.coordinates?.coordinates?.[1],
      lng: building.coordinates?.coordinates?.[0],
    };

    const svg = await buildFootprintSvg(buildingData);
    res.json({ success: true, svg });
  } catch (err) {
    console.error('Footprint id error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
