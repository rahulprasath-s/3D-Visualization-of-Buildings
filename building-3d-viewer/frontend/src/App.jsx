import React, { useEffect, useRef, useState } from 'react';
import { useJsApiLoader, Autocomplete } from '@react-google-maps/api';
import api from './lib/api';
import MapComponent from './components/MapComponent';
import BuildingPanel from './components/BuildingInfo';
import PlanViewer from './components/PlanViewer';
import './index.css';

const LIBRARIES = ['places'];

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function getFootprintCentroid(points) {
  if (!Array.isArray(points) || points.length === 0) return null;

  const totals = points.reduce(
    (acc, point) => ({
      lat: acc.lat + Number(point.lat || 0),
      lng: acc.lng + Number(point.lng || 0),
    }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: totals.lat / points.length,
    lng: totals.lng / points.length,
  };
}

function createCustomTraceBuilding(center) {
  const now = Date.now();

  return {
    _id: `manual-trace-${now}`,
    name: 'Custom Traced Building',
    address: 'Manual footprint from satellite map',
    lat: center.lat,
    lng: center.lng,
    floors: 3,
    area: 0,
    yearBuilt: new Date().getFullYear(),
    amenities: ['manual-footprint'],
    description: 'Trace the roof outline on the map, then build a 3D model from your exact polygon.',
    isOsm: true,
    isCustomTrace: true,
  };
}

export default function App() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const [selected, setSelected] = useState(null);
  const [solarStats, setSolarStats] = useState(null);
  const [solarLoading, setSolarLoading] = useState(false);
  const [mapPickLoading, setMapPickLoading] = useState(false);
  const [appState, setAppState] = useState('loading');
  const [mapCenter, setMapCenter] = useState({ lat: 49.4521, lng: 11.0767 });
  const [editMode, setEditMode] = useState(null);
  const [manualFootprint, setManualFootprint] = useState([]);
  const [manualHoles, setManualHoles] = useState([]);
  const [manualTraceVersion, setManualTraceVersion] = useState(0);
  const [rectangleAnchor, setRectangleAnchor] = useState(null);
  const [backStack, setBackStack] = useState([]);
  const [forwardStack, setForwardStack] = useState([]);

  const autocompleteRef = useRef(null);
  const suppressHistoryRef = useRef(false);
  const didInitHistoryRef = useRef(false);

  const snapshotCurrentState = () => ({
    appState,
    selected,
    mapCenter,
    editMode,
    manualFootprint,
    manualHoles,
    rectangleAnchor,
  });

  const restoreSnapshot = (snapshot) => {
    suppressHistoryRef.current = true;
    setAppState(snapshot.appState);
    setSelected(snapshot.selected);
    setMapCenter(snapshot.mapCenter);
    setEditMode(snapshot.editMode);
    setManualFootprint(snapshot.manualFootprint || []);
    setManualHoles(snapshot.manualHoles || []);
    setRectangleAnchor(snapshot.rectangleAnchor || null);
  };

  const transitionTo = (updater) => {
    if (suppressHistoryRef.current) return;

    const previous = cloneSnapshot(snapshotCurrentState());
    updater();
    setBackStack((current) => [...current, previous]);
    setForwardStack([]);
  };

  const goBack = () => {
    if (!backStack.length) return;

    const previous = backStack[backStack.length - 1];
    const current = cloneSnapshot(snapshotCurrentState());
    setBackStack((stack) => stack.slice(0, -1));
    setForwardStack((stack) => [...stack, current]);
    restoreSnapshot(previous);
  };

  const goForward = () => {
    if (!forwardStack.length) return;

    const next = forwardStack[forwardStack.length - 1];
    const current = cloneSnapshot(snapshotCurrentState());
    setForwardStack((stack) => stack.slice(0, -1));
    setBackStack((stack) => [...stack, current]);
    restoreSnapshot(next);
  };

  useEffect(() => {
    setAppState('map');
  }, []);

  useEffect(() => {
    if (appState !== 'loading' && !didInitHistoryRef.current) {
      didInitHistoryRef.current = true;
      setBackStack([]);
      setForwardStack([]);
    }
  }, [appState]);

  useEffect(() => {
    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
    }
  }, [appState, selected, mapCenter, editMode, manualFootprint, manualHoles, rectangleAnchor]);

  useEffect(() => {
    if (!selected) {
      setSolarStats(null);
      setEditMode(null);
      setManualFootprint([]);
      setManualHoles([]);
      setRectangleAnchor(null);
      return;
    }

    if (selected.isCustomTrace) {
      setSolarStats(null);
      setSolarLoading(false);
      return;
    }

    const lat = selected.lat;
    const lng = selected.lng;
    if (!lat || !lng) {
      setSolarStats(null);
      return;
    }

    setSolarLoading(true);
    setSolarStats(null);

    api.get('/api/buildings/solar-stats', { params: { lat, lng } })
      .then((res) => {
        if (res.data.success) {
          setSolarStats(res.data.data);
        } else {
          setSolarStats({ error: res.data.message || 'No solar data available' });
        }
      })
      .catch((err) => {
        setSolarStats({ error: err.response?.data?.message || err.message || 'Failed to query Solar API' });
      })
      .finally(() => {
        setSolarLoading(false);
      });
  }, [selected?._id, selected?.lat, selected?.lng]);

  const onPlaceChanged = () => {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();
    if (!place || !place.geometry) {
      alert('Please select a specific building or location from the Google dropdown suggestions!');
      return;
    }

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();

    const building = {
      _id: `gmaps-${place.place_id || Date.now()}`,
      name: place.name || 'Unknown Building',
      address: place.formatted_address || 'Nuremberg, Germany',
      lat,
      lng,
      floors: 3,
      area: 15000,
      yearBuilt: 1980,
      amenities: place.types || [],
      description: `Google Places Data: ${place.name || place.formatted_address}`,
      isOsm: true,
    };

    transitionTo(() => {
      setEditMode(null);
      setRectangleAnchor(null);
      setManualFootprint([]);
      setManualHoles([]);
      setMapCenter({ lat, lng });
      setSelected(building);
      setAppState('map');
    });
  };

  const handleMapBuildingPick = async ({ lat, lng }) => {
    if (mapPickLoading) return;

    setMapPickLoading(true);

    try {
      const response = await api.post('/api/buildings/resolve-location', { lat, lng });
      const building = response.data?.data;

      if (!building) {
        throw new Error('No building could be resolved from that map click.');
      }

      transitionTo(() => {
        setEditMode(null);
        setRectangleAnchor(null);
        setManualFootprint([]);
        setManualHoles([]);
        setMapCenter({ lat: building.lat, lng: building.lng });
        setSelected(building);
        setAppState('plan');
      });
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to resolve a building from that click.');
    } finally {
      setMapPickLoading(false);
    }
  };

  const handleMapCenterChange = (nextCenter) => {
    setMapCenter((current) => {
      const latDelta = Math.abs(current.lat - nextCenter.lat);
      const lngDelta = Math.abs(current.lng - nextCenter.lng);
      return latDelta < 0.000001 && lngDelta < 0.000001 ? current : nextCenter;
    });
  };

  const handleStartCustomTrace = () => {
    transitionTo(() => {
      setSelected(createCustomTraceBuilding(mapCenter));
      setManualFootprint([]);
      setManualHoles([]);
      setManualTraceVersion((version) => version + 1);
      setRectangleAnchor(null);
      setEditMode('trace-outer');
      setAppState('map');
    });
  };

  const manualCentroid = getFootprintCentroid(manualFootprint);
  const selectedForViewer = selected
    ? {
        ...selected,
        ...(manualCentroid ? { lat: manualCentroid.lat, lng: manualCentroid.lng } : {}),
        solarStats,
        manualFootprint: manualFootprint.length >= 3 ? manualFootprint : undefined,
        manualHoles: manualHoles.filter((hole) => hole.length >= 3),
      }
    : null;

  const statusText = mapPickLoading
    ? 'Resolving clicked building · Extracting address and footprint'
    : 'Powered by Google Maps, Street View, OSM geometry, manual tracing, and approximation fallback';

  const renderTopbar = (statusText) => (
    <div className="topbar">
      <div className="topbar-nav">
        <button type="button" className="nav-btn" onClick={goBack} disabled={!backStack.length} aria-label="Go back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button type="button" className="nav-btn" onClick={goForward} disabled={!forwardStack.length} aria-label="Go forward">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="topbar-logo">
        <div className="logo-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
          </svg>
        </div>
        <h1>Archisight</h1>
      </div>

      <div className="topbar-status">
        <div className="dot"></div>
        {statusText}
      </div>
    </div>
  );

  if (loadError) {
    return <div className="app-loading" style={{ color: 'red' }}>Error loading Google Maps API</div>;
  }

  if (!isLoaded || appState === 'loading') {
    return (
      <div className="app-loading">
        <div className="spinner-ring"></div>
        <p>Loading Google Maps & Archisight…</p>
      </div>
    );
  }

  if (appState === 'plan' && selectedForViewer) {
    return (
      <div className="app">
        {renderTopbar('3D massing pipeline · Building from footprint, height, and roof rules')}
        <PlanViewer
          building={selectedForViewer}
          onBack={() => transitionTo(() => setAppState('map'))}
        />
      </div>
    );
  }

  return (
    <div className="app">
      {renderTopbar(statusText)}

        <div className="main-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h2>Search any building</h2>

            <div className="search-box" style={{ position: 'relative' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <Autocomplete
                onLoad={(autoComplete) => { autocompleteRef.current = autoComplete; }}
                onPlaceChanged={onPlaceChanged}
                options={{
                  bounds: new window.google.maps.LatLngBounds(
                    new window.google.maps.LatLng(49.40, 11.00),
                    new window.google.maps.LatLng(49.50, 11.15)
                  ),
                }}
              >
                <input
                  type="text"
                  placeholder="Search Google Places…"
                  style={{ width: '100%' }}
                />
              </Autocomplete>
            </div>

            <button
              type="button"
              className={`trace-any-card ${selected?.isCustomTrace ? 'active' : ''}`}
              onClick={handleStartCustomTrace}
            >
              <span className="trace-any-kicker">Manual Mode</span>
              <span className="trace-any-title">Trace Any Building</span>
              <span className="trace-any-meta">Or click any building directly to auto-resolve it</span>
            </button>
          </div>
        </aside>

        <div className="content-area" style={{ display: 'flex', flexDirection: 'column' }}>
          <MapComponent
            center={mapCenter}
            selectedBuilding={selected}
            onMapBuildingPick={handleMapBuildingPick}
            onCenterChange={handleMapCenterChange}
            editMode={editMode}
            manualFootprint={manualFootprint}
            manualHoles={manualHoles}
            manualTraceVersion={manualTraceVersion}
            onManualFootprintChange={setManualFootprint}
            onManualHolesChange={setManualHoles}
            rectangleAnchor={rectangleAnchor}
            onRectangleAnchorChange={setRectangleAnchor}
          />
          {selected && (
            <BuildingPanel
              building={selected}
              solarStats={solarStats}
              solarLoading={solarLoading}
              onGenerate={() => transitionTo(() => setAppState('plan'))}
              canGenerate={!selected.isCustomTrace || manualFootprint.length >= 3}
              onClose={() => {
                transitionTo(() => {
                  setSelected(null);
                  setEditMode(null);
                  setManualFootprint([]);
                  setManualHoles([]);
                  setRectangleAnchor(null);
                });
              }}
              editMode={editMode}
              manualPointCount={manualFootprint.length}
              holeCount={manualHoles.filter((hole) => hole.length >= 3).length}
              hasTraceDraft={manualFootprint.length > 0 || manualHoles.some((hole) => hole.length > 0) || Boolean(rectangleAnchor)}
              onStartTrace={() => transitionTo(() => {
                setEditMode('trace-outer');
                setRectangleAnchor(null);
              })}
              onStartHoleTrace={() => transitionTo(() => {
                setManualHoles((current) => (
                  current.length && current[current.length - 1].length === 0
                    ? current
                    : [...current, []]
                ));
                setEditMode('trace-hole');
                setRectangleAnchor(null);
              })}
              onStartRectangle={() => transitionTo(() => {
                setEditMode('rectangle');
                setRectangleAnchor(null);
              })}
              onStopEditing={() => transitionTo(() => {
                setEditMode(null);
                setRectangleAnchor(null);
              })}
              onUndoManualPoint={() => {
                if (editMode === 'trace-hole') {
                  setManualHoles((current) => {
                    if (!current.length) return current;
                    const next = current.map((hole) => [...hole]);
                    const lastIndex = next.length - 1;
                    next[lastIndex] = next[lastIndex].slice(0, -1);
                    if (next[lastIndex].length === 0) {
                      next.pop();
                    }
                    return next;
                  });
                  return;
                }

                setManualFootprint((current) => current.slice(0, -1));
              }}
              onClearManual={() => {
                setManualFootprint([]);
                setManualHoles([]);
                setManualTraceVersion((version) => version + 1);
                setRectangleAnchor(null);
                setEditMode(null);
              }}
              onRoofShapeChange={(roofShape) => {
                setSelected((current) => current ? { ...current, roofShape } : current);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
