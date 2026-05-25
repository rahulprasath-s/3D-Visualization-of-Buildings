import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Grid, Html } from '@react-three/drei';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as THREE from 'three';
import api from '../lib/api';

const ROOF_OPTIONS = [
  { value: 'auto', label: 'Auto Detect' },
  { value: 'flat', label: 'Flat' },
  { value: 'gabled', label: 'Triangle / Gabled' },
  { value: 'hipped', label: 'Hipped' },
  { value: 'pyramidal', label: 'Pyramidal' },
  { value: 'shed', label: 'Shed / Skillion' },
  { value: 'dome', label: 'Dome' },
  { value: 'cone', label: 'Cone / Spire' },
];

function roofProfile(shape, ridgeAxis, roofShape, roofHeight, bounds) {
  if (!roofHeight || roofShape === 'flat') {
    return shape.clone();
  }

  const next = shape.clone();
  const nx = bounds.maxX - bounds.minX || 1;
  const nz = bounds.maxZ - bounds.minZ || 1;

  if (roofShape === 'gabled') {
    const ridgeAlongX = ridgeAxis === 'x';
    const crossMin = ridgeAlongX ? bounds.minZ : bounds.minX;
    const crossSize = ridgeAlongX ? nz : nx;
    const crossValue = ridgeAlongX ? shape.y : shape.x;
    const distance = Math.abs((((crossValue - crossMin) / crossSize) * 2) - 1);
    next.y = Math.max(0, roofHeight * (1 - distance));
    return next;
  }

  if (roofShape === 'hipped' || roofShape === 'pyramidal') {
    const dx = Math.abs((((shape.x - bounds.minX) / nx) * 2) - 1);
    const dz = Math.abs((((shape.y - bounds.minZ) / nz) * 2) - 1);
    next.y = Math.max(0, roofHeight * (1 - Math.max(dx, dz)));
    return next;
  }

  if (roofShape === 'shed' || roofShape === 'skillion') {
    const slopeAlongX = ridgeAxis === 'x';
    const slopeMin = slopeAlongX ? bounds.minX : bounds.minZ;
    const slopeSize = slopeAlongX ? nx : nz;
    const slopeValue = slopeAlongX ? shape.x : shape.y;
    next.y = Math.max(0, roofHeight * ((slopeValue - slopeMin) / slopeSize));
    return next;
  }

  if (roofShape === 'cone' || roofShape === 'dome') {
    const dx = (((shape.x - bounds.minX) / nx) * 2) - 1;
    const dz = (((shape.y - bounds.minZ) / nz) * 2) - 1;
    const radial = Math.min(1, Math.sqrt((dx * dx) + (dz * dz)));
    next.y = Math.max(0, roofHeight * (1 - radial));
    return next;
  }

  return next;
}

function estimateRoofHeight(wallHeight, shape) {
  if (shape === 'flat') return 0;
  if (shape === 'dome') return Math.max(3.5, Number((wallHeight * 0.24).toFixed(1)));
  if (shape === 'cone' || shape === 'pyramidal') return Math.max(3, Number((wallHeight * 0.28).toFixed(1)));
  if (shape === 'shed' || shape === 'skillion') return Math.max(2, Number((wallHeight * 0.16).toFixed(1)));
  return Math.max(2.5, Number((wallHeight * 0.22).toFixed(1)));
}

function applyRoofOverride(model, roofChoice) {
  if (!model || roofChoice === 'auto') return model;

  const parts = (model.parts || []).map((part) => {
    const wallHeight = part.metrics?.wallHeightMeters || model.metrics?.wallHeightMeters || 9;
    const roofHeight = estimateRoofHeight(wallHeight, roofChoice);

    return {
      ...part,
      metrics: {
        ...part.metrics,
        roofHeightMeters: roofHeight,
        totalHeightMeters: Number((wallHeight + roofHeight).toFixed(1)),
      },
      roof: {
        ...part.roof,
        shape: roofChoice,
        source: 'manual override',
      },
    };
  });

  const primaryPart = parts[0];
  const wallHeight = primaryPart?.metrics?.wallHeightMeters || model.metrics?.wallHeightMeters || 9;
  const roofHeight = primaryPart?.metrics?.roofHeightMeters ?? estimateRoofHeight(wallHeight, roofChoice);

  return {
    ...model,
    parts,
    metrics: {
      ...model.metrics,
      roofHeightMeters: roofHeight,
      totalHeightMeters: Number((wallHeight + roofHeight).toFixed(1)),
    },
    roof: {
      ...model.roof,
      shape: roofChoice,
      source: 'manual override',
    },
  };
}

function createPartArtifact(part) {
  const footprint = part?.footprint || [];
  if (footprint.length < 3) return null;

  const wallHeight = part.metrics.wallHeightMeters;
  const roofHeight = part.metrics.roofHeightMeters;
  const ridgeAxis = part.roof.ridgeAxis;
  const roofShape = part.roof.shape;

  const shapePoints = footprint.map((point) => new THREE.Vector2(point.x, -point.z));
  const shape = new THREE.Shape(shapePoints);

  const bodyGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: wallHeight,
    bevelEnabled: false,
  });
  bodyGeometry.rotateX(-Math.PI / 2);
  bodyGeometry.computeVertexNormals();

  const xs = footprint.map((point) => point.x);
  const zs = footprint.map((point) => point.z);
  const bounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };

  let roofGeometry = null;
  if (roofHeight > 0) {
    roofGeometry = new THREE.ShapeGeometry(shape);
    const position = roofGeometry.attributes.position;

    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = -position.getY(index);
      const profiled = roofProfile(
        new THREE.Vector3(x, 0, z),
        ridgeAxis,
        roofShape,
        roofHeight,
        bounds
      );
      position.setZ(index, profiled.y);
    }

    roofGeometry.rotateX(-Math.PI / 2);
    roofGeometry.translate(0, wallHeight, 0);
    roofGeometry.computeVertexNormals();
  }

  return { bodyGeometry, roofGeometry, bounds, part };
}

function createBuildingArtifacts(model) {
  const parts = Array.isArray(model?.parts) && model.parts.length ? model.parts : [];
  if (!parts.length) return null;

  const partArtifacts = parts.map(createPartArtifact).filter(Boolean);
  if (!partArtifacts.length) return null;

  const xs = partArtifacts.flatMap(({ part }) => part.footprint.map((point) => point.x));
  const zs = partArtifacts.flatMap(({ part }) => part.footprint.map((point) => point.z));
  const maxHeight = Math.max(...partArtifacts.map(({ part }) => part.metrics.totalHeightMeters));

  return {
    parts: partArtifacts,
    bounds: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    },
    labelPosition: [0, maxHeight + 4, 0],
  };
}

function createViewerSettings(artifacts) {
  const bounds = artifacts?.bounds;
  if (!bounds) {
    return {
      cameraPosition: [36, 28, 36],
      gridSize: 160,
      fogFar: 180,
      maxDistance: 180,
    };
  }

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const footprintSpan = Math.max(width, depth, 40);
  const cameraDistance = Math.max(54, footprintSpan * 1.45);

  return {
    cameraPosition: [
      Number((cameraDistance * 0.72).toFixed(1)),
      Number((cameraDistance * 0.56).toFixed(1)),
      Number((cameraDistance * 0.72).toFixed(1)),
    ],
    gridSize: Math.max(160, Math.ceil((footprintSpan * 2.6) / 20) * 20),
    fogFar: Math.max(180, footprintSpan * 4),
    maxDistance: Math.max(240, footprintSpan * 5),
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sanitizeFilename(value) {
  return String(value || 'building-model').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'building-model';
}

function BuildingMesh({ artifacts, model }) {
  if (!artifacts) return null;

  const { parts, bounds, labelPosition } = artifacts;

  return (
    <group>
      {parts.map(({ bodyGeometry, roofGeometry, part }, index) => (
        <group key={part.id || index}>
          <mesh geometry={bodyGeometry} castShadow receiveShadow>
            <meshStandardMaterial
              color={index === 0 ? '#d9ccb2' : '#cbb89a'}
              roughness={0.88}
              metalness={0.05}
            />
            <Edges color="#f8fafc" opacity={0.24} transparent threshold={20} />
          </mesh>

          {roofGeometry && (
            <mesh geometry={roofGeometry} castShadow receiveShadow>
              <meshStandardMaterial color={part.roof.shape === 'dome' ? '#b59673' : '#bda883'} roughness={0.76} metalness={0.04} />
              <Edges color="#dbeafe" opacity={0.3} transparent threshold={20} />
            </mesh>
          )}
        </group>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[Math.max(80, (bounds.maxX - bounds.minX) + 30), Math.max(80, (bounds.maxZ - bounds.minZ) + 30)]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      <Html position={labelPosition} center distanceFactor={12}>
        <div className="floating-building-label">{model.building.name}</div>
      </Html>
    </group>
  );
}

const Viewer = ({ building, onBack }) => {
  const [state, setState] = useState('loading');
  const [model, setModel] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [roofChoice, setRoofChoice] = useState('auto');

  useEffect(() => {
    let cancelled = false;

    const loadModel = async () => {
      setState('loading');
      setModel(null);
      setErrorMsg('');
      setRoofChoice('auto');

      try {
        const endpoint = building.isOsm
          ? '/api/buildings/direct/model-3d'
          : `/api/buildings/${building._id}/model-3d`;

        const response = await api.post(endpoint, building);
        if (cancelled) return;

        setModel(response.data.model);
        setState('done');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err.response?.data?.message || err.message || 'Unknown error');
        setState('error');
      }
    };

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [building]);

  const displayModel = useMemo(() => applyRoofOverride(model, roofChoice), [model, roofChoice]);
  const artifacts = useMemo(() => (displayModel ? createBuildingArtifacts(displayModel) : null), [displayModel]);
  const viewerSettings = useMemo(() => createViewerSettings(artifacts), [artifacts]);

  const handleExportGlb = async () => {
    if (!artifacts || !displayModel) return;

    setExporting(true);
    try {
      const exportRoot = new THREE.Group();
      exportRoot.name = displayModel.building.name || 'Building';

      artifacts.parts.forEach(({ bodyGeometry, roofGeometry, part }, index) => {
        const bodyMesh = new THREE.Mesh(
          bodyGeometry.clone(),
          new THREE.MeshStandardMaterial({ color: index === 0 ? '#d9ccb2' : '#cbb89a', roughness: 0.88, metalness: 0.05 })
        );
        bodyMesh.name = part.kind || `BuildingPart${index + 1}`;
        exportRoot.add(bodyMesh);

        if (!roofGeometry) return;

        const roofMesh = new THREE.Mesh(
          roofGeometry.clone(),
          new THREE.MeshStandardMaterial({ color: '#bda883', roughness: 0.76, metalness: 0.04 })
        );
        roofMesh.name = `${part.kind || `BuildingPart${index + 1}`}Roof`;
        exportRoot.add(roofMesh);
      });

      const exporter = new GLTFExporter();
      const arrayBuffer = await new Promise((resolve, reject) => {
        exporter.parse(
          exportRoot,
          (result) => resolve(result),
          (error) => reject(error),
          { binary: true }
        );
      });

      downloadBlob(new Blob([arrayBuffer], { type: 'model/gltf-binary' }), `${sanitizeFilename(displayModel.building.name)}.glb`);
    } catch (error) {
      setErrorMsg(error.message || 'Failed to export GLB.');
      setState('error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="plan-view model-view">
      <div className="plan-view-header">
        <button className="back-btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to Map
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{building?.name}</h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{building?.address}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="model-chip">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
              <path d="m3.3 7 8.7 5 8.7-5" />
              <path d="M12 22V12" />
            </svg>
            Real 3D Massing
          </span>
        </div>

        <div className="viewer-actions">
          <label className="roof-select-control">
            <span>Roof</span>
            <select value={roofChoice} onChange={(event) => setRoofChoice(event.target.value)} disabled={state !== 'done'}>
              {ROOF_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button className="secondary-btn export-btn" onClick={handleExportGlb} disabled={state !== 'done' || exporting}>
            {exporting ? 'Exporting…' : 'Export GLB'}
          </button>
          <span className="model-badge">
            {model?.source?.detection ? 'Satellite-detected footprint' : (model?.source?.provider || 'OSM + Height Estimate')}
          </span>
        </div>
      </div>

      <div className="plan-canvas model-canvas">
        {state === 'loading' && (
          <div className="plan-loading">
            <div className="spinner-ring"></div>
            <p>Fetching real footprint, estimated height, and roof profile…</p>
            <span className="model-label">Automatic lookup will fall back to your traced footprint when available</span>
          </div>
        )}

        {state === 'error' && (
          <div className="plan-error">
            <svg className="error-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><circle cx="12" cy="16" r="0.5" fill="currentColor" />
            </svg>
            <h3>3D Model Failed</h3>
            <p>{errorMsg}</p>
            {building.manualFootprint?.length < 3 && (
              <p>Try drawing the footprint manually on the map, then rebuild the model.</p>
            )}
          </div>
        )}

        {state === 'done' && displayModel && artifacts && (
          <div className="model-stage">
            <Canvas shadows camera={{ position: viewerSettings.cameraPosition, fov: 42 }}>
              <color attach="background" args={['#050913']} />
              <fog attach="fog" args={['#050913', 55, viewerSettings.fogFar]} />
              <ambientLight intensity={0.55} color="#cbd5e1" />
              <directionalLight
                position={[18, 28, 14]}
                intensity={1.3}
                color="#fff7ed"
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
              />
              <directionalLight position={[-12, 10, -18]} intensity={0.45} color="#7dd3fc" />

              <group>
                <BuildingMesh artifacts={artifacts} model={displayModel} />
                <Grid
                  args={[viewerSettings.gridSize, viewerSettings.gridSize]}
                  cellColor="#12304a"
                  sectionColor="#1d4f73"
                  position={[0, -0.01, 0]}
                  infiniteGrid
                  fadeDistance={viewerSettings.gridSize}
                  fadeStrength={1.2}
                />
              </group>

              <OrbitControls
                makeDefault
                enablePan
                enableDamping
                minDistance={12}
                maxDistance={viewerSettings.maxDistance}
                maxPolarAngle={Math.PI / 2.05}
              />
            </Canvas>

            <div className="model-overlay-card">
              <div className="metric-grid">
                <div>
                  <span>Footprint</span>
                  <strong>{displayModel.metrics.footprintAreaMeters} m²</strong>
                </div>
                <div>
                  <span>Wall Height</span>
                  <strong>{displayModel.metrics.wallHeightMeters} m</strong>
                </div>
                <div>
                  <span>Total Height</span>
                  <strong>{displayModel.metrics.totalHeightMeters} m</strong>
                </div>
                <div>
                  <span>Roof</span>
                  <strong>{displayModel.roof.shape}</strong>
                </div>
                <div>
                  <span>Parts</span>
                  <strong>{displayModel.parts?.length || 1}</strong>
                </div>
              </div>
              <p>
                Width {displayModel.metrics.widthMeters} m · Depth {displayModel.metrics.depthMeters} m · Levels {displayModel.metrics.levels}
              </p>
              <p>
                Type {displayModel.building.type} · Street View refinement {displayModel.source?.refinementHints?.streetViewCandidate ? 'available' : 'unavailable'}
              </p>
              {displayModel.source?.detection && (
                <p>
                  Satellite contour confidence {displayModel.source.detection.confidence} · Circularity {displayModel.source.detection.circularity}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Viewer;
