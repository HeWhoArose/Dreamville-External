import React, { useState } from 'react';
import { Location } from '../types';
import { Compass, MapPin, Navigation, ShieldAlert, Sparkles, Footprints, Info, Check, X } from 'lucide-react';

interface WorldMapViewProps {
  locations: Record<string, Location>;
  activeLocationId: string;
  activeJourney?: any | null;
  isTraveling?: boolean;
  onRequestTravel: (targetLocationId: string) => void;
  onCancelTravel?: () => void;
  isProcessingAction: boolean;
  routeEdges?: any[];
}

export const WorldMapView: React.FC<WorldMapViewProps> = ({
  locations,
  activeLocationId,
  activeJourney,
  isTraveling,
  onRequestTravel,
  onCancelTravel,
  isProcessingAction,
  routeEdges = [],
}) => {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const locationList = Object.values(locations);
  const currentLocation = locations[activeLocationId];
  const selectedLocation = selectedLocationId ? locations[selectedLocationId] : currentLocation;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Active Journey Banner */}
      {isTraveling && activeJourney && (
        <div className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg animate-pulse">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-amber-400" />
              <h4 className="text-sm font-serif font-bold text-amber-200">
                Journey In Progress &mdash; Traveling to {locations[activeJourney.destinationLocationId]?.name || activeJourney.destinationLocationId}
              </h4>
            </div>
            <p className="text-xs font-mono text-stone-400">
              Origin: <span className="text-stone-300">{locations[activeJourney.originLocationId]?.name || activeJourney.originLocationId}</span> &bull; 
              Mode: <span className="text-stone-300">{activeJourney.mode}</span> &bull; 
              Distance: <span className="text-amber-300">{activeJourney.totalDistanceKm?.toFixed(1) || 0} km</span>
            </p>
          </div>
          {onCancelTravel && (
            <button
              id="cancel-journey-btn"
              disabled={isProcessingAction}
              onClick={onCancelTravel}
              className="px-4 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/60 border border-red-500/40 text-red-300 text-xs font-mono font-medium transition disabled:opacity-50"
            >
              Cancel Journey
            </button>
          )}
        </div>
      )}

      {/* Map Header / Legend */}
      <div className="bg-stone-900/60 rounded-2xl border border-stone-800 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-serif font-bold text-stone-100">
              Cartographic Projection — Canonical Living World
            </h3>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Current Position: <span className="text-amber-300 font-medium">{currentLocation?.name || 'Unknown'}</span> ({currentLocation?.region || 'Wilderness'})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-400 ring-4 ring-amber-400/20" />
            <span className="text-stone-300">Active Presence</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-stone-300">Reachable Route</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-stone-700" />
            <span className="text-stone-400">Discovered Waypoint</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-stone-900 border border-stone-800" />
            <span className="text-stone-600">Unknown Territory</span>
          </div>
        </div>
      </div>

      {/* Main Map + Inspector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stylized Canvas / Interactive Map Layout */}
        <div className="lg:col-span-2 relative w-full aspect-[16/10] min-h-[420px] max-h-[600px] bg-stone-950 rounded-2xl border border-stone-800 p-6 overflow-hidden shadow-inner flex items-center justify-center">
          {/* Background Grid Pattern */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(251, 191, 36, 0.4) 1px, transparent 0)',
              backgroundSize: '32px 32px',
            }}
          />

          {/* Concentric Ley Line circles */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-72 rounded-full border border-dashed border-stone-800/80" />
            <div className="w-[450px] h-[450px] rounded-full border border-dashed border-stone-800/50" />
            <div className="w-[620px] h-[620px] rounded-full border border-dashed border-stone-800/30" />
          </div>

          {/* Connecting Canonical Route Edges */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-stone-700/60 stroke-[1.5]">
            {routeEdges.map((edge) => {
              const fromLoc = locations[edge.fromLocationId];
              const toLoc = locations[edge.toLocationId];
              if (!fromLoc || !toLoc || !fromLoc.coordinates || !toLoc.coordinates) return null;
              return (
                <line
                  key={edge.id || `${edge.fromLocationId}_${edge.toLocationId}`}
                  x1={`${fromLoc.coordinates.x}%`}
                  y1={`${fromLoc.coordinates.y}%`}
                  x2={`${toLoc.coordinates.x}%`}
                  y2={`${toLoc.coordinates.y}%`}
                  strokeDasharray="4 4"
                  className={edge.accessible !== false ? 'stroke-emerald-600/60' : 'stroke-stone-700/40'}
                />
              );
            })}
          </svg>

          {/* Interactive Location Nodes */}
          {locationList.map((loc) => {
            const isCurrent = loc.id === activeLocationId;
            const isSelected = loc.id === (selectedLocationId || activeLocationId);
            const canTravel = !isCurrent && loc.accessible && !loc.id.startsWith('unknown_');
            const coords = loc.coordinates || { x: 50, y: 50 };

            return (
              <div
                key={loc.id}
                style={{
                  left: `${coords.x}%`,
                  top: `${coords.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                className="absolute z-10 flex flex-col items-center"
              >
                {/* Pulse ripple for current location */}
                {isCurrent && (
                  <span className="absolute -inset-2 rounded-full bg-amber-400/20 animate-ping" />
                )}

                <button
                  id={`map-node-${loc.id}`}
                  disabled={isProcessingAction}
                  onClick={() => setSelectedLocationId(loc.id)}
                  className={`relative flex items-center justify-center rounded-2xl p-3 transition group shadow-lg ${
                    isCurrent
                      ? 'bg-amber-500 text-stone-950 ring-4 ring-amber-400/30'
                      : isSelected
                      ? 'bg-amber-600/90 text-stone-100 ring-2 ring-amber-400'
                      : loc.id.startsWith('unknown_')
                      ? 'bg-stone-900/60 text-stone-600 border border-stone-800'
                      : canTravel
                      ? 'bg-stone-900 hover:bg-stone-800 text-amber-300 border border-amber-500/40 hover:border-amber-400 hover:scale-105'
                      : 'bg-stone-900 text-stone-500 border border-stone-800'
                  }`}
                  title={loc.name}
                >
                  {isCurrent ? (
                    <Navigation className="w-5 h-5 text-stone-950 animate-bounce" />
                  ) : loc.id.startsWith('unknown_') ? (
                    <ShieldAlert className="w-4 h-4 text-stone-600" />
                  ) : (
                    <MapPin className="w-4 h-4 text-amber-400/90 group-hover:text-amber-300" />
                  )}
                </button>

                {/* Node Label Banner */}
                <div className="mt-2 text-center pointer-events-none bg-stone-950/80 px-2 py-0.5 rounded border border-stone-800/80 backdrop-blur-xs max-w-[120px]">
                  <span className={`text-[11px] font-serif truncate block ${isCurrent ? 'text-amber-300 font-bold' : 'text-stone-300'}`}>
                    {loc.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Location Inspector & Travel Control Panel */}
        <div className="bg-stone-900/80 rounded-2xl border border-stone-800 p-6 flex flex-col justify-between shadow-xl backdrop-blur-md">
          {selectedLocation ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-stone-800 pb-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400">
                    {selectedLocation.region || 'Region'}
                  </span>
                  <h4 className="text-xl font-serif font-bold text-stone-100 mt-0.5">
                    {selectedLocation.name}
                  </h4>
                </div>
                {selectedLocation.id === activeLocationId && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-mono font-medium border border-amber-500/30">
                    Current Location
                  </span>
                )}
              </div>

              <div className="space-y-3 text-sm text-stone-300">
                <p className="leading-relaxed text-xs sm:text-sm text-stone-300">
                  {selectedLocation.description || 'No detailed cartographic records for this waypoint.'}
                </p>

                {selectedLocation.ambientSensory && (
                  <div className="p-3 rounded-xl bg-stone-950/60 border border-stone-800/80 text-xs text-stone-400 italic">
                    "{selectedLocation.ambientSensory}"
                  </div>
                )}

                <div className="pt-2 space-y-1 font-mono text-xs text-stone-400">
                  <p>Accessibility: <span className={selectedLocation.accessible ? 'text-emerald-400' : 'text-red-400'}>{selectedLocation.accessible ? 'Accessible' : 'Restricted / Unknown'}</span></p>
                  <p>Coordinates: X: {selectedLocation.coordinates?.x ?? 0}, Y: {selectedLocation.coordinates?.y ?? 0}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-stone-500 text-sm">
              Select a map waypoint to inspect canonical geography and initiate travel.
            </div>
          )}

          {/* Travel Execution Button */}
          <div className="pt-6 border-t border-stone-800">
            {selectedLocation && selectedLocation.id !== activeLocationId && !selectedLocation.id.startsWith('unknown_') && (
              <button
                id={`travel-to-${selectedLocation.id}`}
                disabled={isProcessingAction || !selectedLocation.accessible || isTraveling}
                onClick={() => onRequestTravel(selectedLocation.id)}
                className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-serif font-bold text-sm tracking-wide transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Footprints className="w-4 h-4" />
                <span>Initiate Travel to {selectedLocation.name}</span>
              </button>
            )}
            {selectedLocation && selectedLocation.id === activeLocationId && (
              <div className="text-center text-xs font-mono text-stone-500 py-2">
                You are currently stationed at this waypoint.
              </div>
            )}
            {selectedLocation && selectedLocation.id.startsWith('unknown_') && (
              <div className="text-center text-xs font-mono text-red-400 py-2">
                Territory is uncharted. Exploration required before travel.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
