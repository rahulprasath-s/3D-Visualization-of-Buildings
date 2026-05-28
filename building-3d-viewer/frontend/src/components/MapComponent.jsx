import React, { useEffect, useMemo, useState } from 'react';
import { GoogleMap, Marker, Polygon, Polyline } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '100%',
};

function buildRectangleFromCorners(first, second) {
  return [
    { lat: first.lat, lng: first.lng },
    { lat: first.lat, lng: second.lng },
    { lat: second.lat, lng: second.lng },
    { lat: second.lat, lng: first.lng },
  ];
}

function pathSignature(points = []) {
  return points
    .map((point) => `${Number(point.lat).toFixed(6)},${Number(point.lng).toFixed(6)}`)
    .join('|');
}

export default function MapComponent({
  center,
  selectedBuilding,
  onMapBuildingPick,
  onCenterChange,
  editMode,
  manualFootprint,
  manualHoles,
  manualTraceVersion,
  onManualFootprintChange,
  onManualHolesChange,
  rectangleAnchor,
  onRectangleAnchorChange,
}) {
  const [map, setMap] = useState(null);

  useEffect(() => {
    if (map && center) {
      const currentCenter = map.getCenter();
      if (!currentCenter) {
        map.panTo(center);
        return;
      }

      const latDelta = Math.abs(currentCenter.lat() - center.lat);
      const lngDelta = Math.abs(currentCenter.lng() - center.lng);
      if (latDelta > 0.0005 || lngDelta > 0.0005) {
        map.panTo(center);
      }
    }
  }, [center, map]);

  const manualPath = useMemo(
    () => manualFootprint.map((point) => ({ lat: point.lat, lng: point.lng })),
    [manualFootprint]
  );
  const manualHolePaths = useMemo(
    () => (manualHoles || []).map((hole) => hole.map((point) => ({ lat: point.lat, lng: point.lng }))),
    [manualHoles]
  );
  const manualPolygonPaths = useMemo(
    () => [manualPath, ...manualHolePaths.filter((hole) => hole.length >= 3)],
    [manualHolePaths, manualPath]
  );
  const manualPathKey = useMemo(
    () => `${manualTraceVersion}-${pathSignature(manualPath)}`,
    [manualPath, manualTraceVersion]
  );
  const manualPolygonKey = useMemo(
    () => `${manualTraceVersion}-${manualPolygonPaths.map(pathSignature).join('::')}`,
    [manualPolygonPaths, manualTraceVersion]
  );

  const handleMapClick = (event) => {
    const lat = event.latLng?.lat();
    const lng = event.latLng?.lng();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (editMode === 'trace-outer') {
      onManualFootprintChange([...manualFootprint, { lat, lng }]);
      return;
    }

    if (editMode === 'trace-hole') {
      const nextHoles = Array.isArray(manualHoles) ? manualHoles.map((hole) => [...hole]) : [];
      if (!nextHoles.length) {
        nextHoles.push([]);
      }
      nextHoles[nextHoles.length - 1].push({ lat, lng });
      onManualHolesChange(nextHoles);
      return;
    }

    if (editMode === 'rectangle') {
      if (!rectangleAnchor) {
        onRectangleAnchorChange({ lat, lng });
      } else {
        onManualFootprintChange(buildRectangleFromCorners(rectangleAnchor, { lat, lng }));
        onRectangleAnchorChange(null);
      }
      return;
    }

    onMapBuildingPick?.({ lat, lng });
  };

  const updateOuterPoint = (index, point) => {
    onManualFootprintChange(
      manualFootprint.map((current, currentIndex) => (currentIndex === index ? point : current))
    );
  };

  const updateHolePoint = (holeIndex, pointIndex, point) => {
    onManualHolesChange(
      manualHoles.map((hole, currentHoleIndex) => (
        currentHoleIndex === holeIndex
          ? hole.map((currentPoint, currentPointIndex) => (currentPointIndex === pointIndex ? point : currentPoint))
          : hole
      ))
    );
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={14}
        onLoad={(loadedMap) => setMap(loadedMap)}
        onIdle={() => {
          const currentCenter = map?.getCenter();
          if (currentCenter && onCenterChange) {
            onCenterChange({ lat: currentCenter.lat(), lng: currentCenter.lng() });
          }
        }}
        onClick={handleMapClick}
        options={{
          mapTypeId: 'satellite',
          disableDefaultUI: false,
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          draggableCursor: editMode ? 'crosshair' : undefined,
        }}
      >
        {selectedBuilding && (selectedBuilding._id.startsWith('gmaps') || selectedBuilding.isCustomTrace) && (
          <Marker
            position={{ lat: selectedBuilding.lat, lng: selectedBuilding.lng }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#818cf8',
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: '#fff',
            }}
          />
        )}

        {manualPath.length >= 2 && (
          <Polyline
            key={`manual-line-${manualPathKey}`}
            path={manualPath}
            options={{
              clickable: false,
              strokeColor: '#38bdf8',
              strokeOpacity: 1,
              strokeWeight: 3,
            }}
          />
        )}

        {manualPath.length >= 3 && (
          <Polygon
            key={`manual-polygon-${manualPolygonKey}`}
            paths={manualPolygonPaths}
            options={{
              clickable: false,
              fillColor: '#38bdf8',
              fillOpacity: 0.18,
              strokeColor: '#7dd3fc',
              strokeOpacity: 0.95,
              strokeWeight: 2,
            }}
          />
        )}

        {manualPath.map((point, index) => (
          <Marker
            key={`manual-${manualTraceVersion}-${index}`}
            position={point}
            draggable
            onDragEnd={(event) => {
              const lat = event.latLng?.lat();
              const lng = event.latLng?.lng();
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
              updateOuterPoint(index, { lat, lng });
            }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 5,
              fillColor: '#f59e0b',
              fillOpacity: 1,
              strokeWeight: 1.5,
              strokeColor: '#fff',
            }}
          />
        ))}

        {manualHolePaths.map((hole, holeIndex) => (
          <React.Fragment key={`manual-hole-${manualTraceVersion}-${holeIndex}-${pathSignature(hole)}`}>
            {hole.length >= 2 && (
              <Polyline
                key={`manual-hole-line-${manualTraceVersion}-${holeIndex}-${pathSignature(hole)}`}
                path={hole}
                options={{
                  clickable: false,
                  strokeColor: '#a78bfa',
                  strokeOpacity: 0.95,
                  strokeWeight: 3,
                }}
              />
            )}
            {hole.map((point, pointIndex) => (
              <Marker
                key={`manual-hole-${manualTraceVersion}-${holeIndex}-${pointIndex}`}
                position={point}
                draggable
                onDragEnd={(event) => {
                  const lat = event.latLng?.lat();
                  const lng = event.latLng?.lng();
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                  updateHolePoint(holeIndex, pointIndex, { lat, lng });
                }}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 5,
                  fillColor: '#a78bfa',
                  fillOpacity: 1,
                  strokeWeight: 1.5,
                  strokeColor: '#fff',
                }}
              />
            ))}
          </React.Fragment>
        ))}

        {rectangleAnchor && (
          <Marker
            key={`rectangle-anchor-${manualTraceVersion}`}
            position={rectangleAnchor}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: '#f97316',
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: '#fff',
            }}
          />
        )}
      </GoogleMap>
    </div>
  );
}
