import React from 'react';
import { GoogleMap, StreetViewPanorama } from '@react-google-maps/api';

const ROOF_OPTIONS = [
  { value: 'auto', label: 'Auto detect' },
  { value: 'flat', label: 'Flat' },
  { value: 'gabled', label: 'Triangle / Gabled' },
  { value: 'hipped', label: 'Hipped' },
  { value: 'pyramidal', label: 'Pyramidal' },
  { value: 'shed', label: 'Shed / Skillion' },
  { value: 'dome', label: 'Dome' },
  { value: 'cone', label: 'Cone / Spire' },
];

const BuildingPanel = ({
  building,
  solarStats,
  solarLoading,
  onGenerate,
  canGenerate = true,
  onClose,
  editMode,
  manualPointCount,
  hasTraceDraft,
  onStartTrace,
  onStartRectangle,
  onStopEditing,
  onUndoManualPoint,
  onClearManual,
  onRoofShapeChange,
}) => {
  if (!building) return null;

  const hasManualFootprint = manualPointCount >= 3;

  return (
    <div className="detail-panel animate-slide-in">
      <div className="detail-panel-header">
        <button className="close-btn" onClick={onClose}>✕</button>
        <h2>{building.name}</h2>
        <div className="address">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {building.address}
        </div>
      </div>

      <div className="detail-panel-body">
        {building.lat && building.lng && (
          <div style={{ width: '100%', height: '160px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
            <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={{ lat: building.lat, lng: building.lng }} zoom={14}>
              <StreetViewPanorama
                position={{ lat: building.lat, lng: building.lng }}
                visible={true}
                options={{
                  disableDefaultUI: true,
                  enableCloseButton: false,
                  clickToGo: false,
                  linksControl: false,
                  panControl: true,
                  zoomControl: false,
                }}
              />
            </GoogleMap>
          </div>
        )}

        {building.description && (
          <p className="detail-desc">{building.description}</p>
        )}

        <div className="manual-tools-card">
          <div className="manual-tools-head">
            <strong>Fallback Geometry Tools</strong>
            <span>{manualPointCount} point{manualPointCount === 1 ? '' : 's'}</span>
          </div>
          <p>
            If OSM polygons are weak or missing, trace the roof directly on the satellite map or use rectangle assist to mark opposite corners.
          </p>
          <div className="manual-tools-actions">
            <button type="button" className={`secondary-btn ${editMode === 'trace' ? 'active' : ''}`} onClick={onStartTrace}>
              Trace Footprint
            </button>
            <button type="button" className={`secondary-btn ${editMode === 'rectangle' ? 'active' : ''}`} onClick={onStartRectangle}>
              Rectangle Assist
            </button>
          </div>
          <div className="manual-tools-actions">
            <button type="button" className="secondary-btn" onClick={onStopEditing} disabled={!editMode}>
              Stop Editing
            </button>
            <button type="button" className="secondary-btn" onClick={onUndoManualPoint} disabled={!manualPointCount}>
              Undo Point
            </button>
            <button type="button" className="secondary-btn danger-soft" onClick={onClearManual} disabled={!hasTraceDraft}>
              Clear All
            </button>
          </div>
          {editMode === 'trace' && (
            <div className="manual-tools-note">Trace mode: click around the roof outline point by point.</div>
          )}
          {editMode === 'rectangle' && (
            <div className="manual-tools-note">Rectangle assist: click one corner, then the opposite corner on the satellite image.</div>
          )}
          {hasManualFootprint && (
            <div className="manual-tools-note">Manual polygon ready. It will override automatic lookup for the next 3D model build.</div>
          )}
        </div>

        {solarLoading && (
          <div className="solar-section-loading" style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <div className="spinner-ring" style={{ width: '14px', height: '14px', borderWidth: '1.5px' }}></div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Querying Google Solar footprint...
            </span>
          </div>
        )}

        {!solarLoading && solarStats && !solarStats.error && (
          <div className="solar-stats-card" style={{
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(99, 102, 241, 0.08))',
            border: '1px solid rgba(14, 165, 233, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent)' }}>
              <span style={{ fontSize: '1.1rem' }}>☀️</span>
              Google Solar Footprint
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Footprint Area
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {solarStats.buildingAreaMeters ? `${solarStats.buildingAreaMeters.toFixed(1)} m²` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                  Roof Area
                </span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {solarStats.roofAreaMeters ? `${solarStats.roofAreaMeters.toFixed(1)} m²` : '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="roof-choice-card">
          <div>
            <span>Roof Type</span>
            <strong>
              {building.roofShape
                ? ROOF_OPTIONS.find((option) => option.value === building.roofShape)?.label || building.roofShape
                : 'Auto detect'}
            </strong>
          </div>
          <select
            value={building.roofShape || 'auto'}
            onChange={(event) => onRoofShapeChange(event.target.value === 'auto' ? null : event.target.value)}
          >
            {ROOF_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="stats-row">
          <div className="stat-cell">
            <span className="stat-label">Floors</span>
            <span className="stat-val">{building.floors ?? '—'}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-label">Area (m²)</span>
            <span className="stat-val">
              {solarStats?.buildingAreaMeters
                ? solarStats.buildingAreaMeters.toFixed(0)
                : building.area
                  ? (building.area / 10.764).toFixed(0)
                  : '—'}
            </span>
          </div>
          <div className="stat-cell">
            <span className="stat-label">Year</span>
            <span className="stat-val">{building.yearBuilt ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="detail-panel-footer">
        <button className="generate-btn" onClick={() => onGenerate(building)} disabled={!canGenerate}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/>
          </svg>
          {canGenerate ? 'Build 3D Model' : 'Trace 3+ Points'}
        </button>
      </div>
    </div>
  );
};

export default BuildingPanel;
