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

export default function MapComponent({
  center,
  selectedBuilding,
  seedBuildings,
  onSelect,
  onMapBuildingPick,
  onCenterChange,
  editMode,
  manualFootprint,
  manualTraceVersion,
  onManualFootprintChange,
  rectangleAnchor,
  onRectangleAnchorChange,
}) {
  const [map, setMap] = useState(null);

  useEffect(() => {
    if (map && center) {
      map.panTo(center);
      map.setZoom(18);
    }
  }, [center, map]);

  const manualPath = useMemo(
    () => manualFootprint.map((point) => ({ lat: point.lat, lng: point.lng })),
    [manualFootprint]
  );

  const handleMapClick = (event) => {
    const lat = event.latLng?.lat();
    const lng = event.latLng?.lng();
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (editMode === 'trace') {
      onManualFootprintChange([...manualFootprint, { lat, lng }]);
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
        {seedBuildings.map((building) => {
          const lat = building.coordinates?.coordinates?.[1] || 0;
          const lng = building.coordinates?.coordinates?.[0] || 0;
          const isSelected = selectedBuilding?._id === building._id;

          return (
            <Marker
              key={building._id}
              position={{ lat, lng }}
              onClick={() => onSelect(building)}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: isSelected ? 8 : 6,
                fillColor: isSelected ? '#818cf8' : '#4fc3f7',
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: '#fff',
              }}
            />
          );
        })}

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
            key={`manual-line-${manualTraceVersion}-${manualPath.length}`}
            path={manualPath}
            options={{
              strokeColor: '#38bdf8',
              strokeOpacity: 1,
              strokeWeight: 3,
            }}
          />
        )}

        {manualPath.length >= 3 && (
          <Polygon
            key={`manual-polygon-${manualTraceVersion}-${manualPath.length}`}
            path={manualPath}
            options={{
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
