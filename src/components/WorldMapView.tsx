import React from 'react';
import { Location } from '../types';
import { Compass, MapPin, Navigation, ShieldAlert, Sparkles, Footprints } from 'lucide-react';

interface WorldMapViewProps {
  locations: Record<string, Location>;
  activeLocationId: string;
  activeJourney?: any | null;
  isTraveling?: boolean;
  onRequestTravel: (targetLocationId: string) => void;
  onCancelTravel?: () => void;
  isProcessingAction: boolean;
}

export const WorldMapView: React.FC<WorldMapViewProps> = ({
  locations,
  activeLocationId,
  activeJourney,
  isTraveling,
  onRequestTravel,
  onCancelTravel,
  isProcessingAction,
}) => {
  const locationList = Object.values(locations);
  const currentLocation = locations[activeLocationId];

  return (
    <div className="space-y-6">
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
              Distance: <span className="text-amber-300">{activeJourney.totalDistanceKm} km</span>
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
              Cartographic Projection — Dreamville
            </h3>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Current Position: <span className="text-amber-300 font-medium">{currentLocation?.name}</span> ({currentLocation?.region})
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-amber-400 ring-4 ring-amber-400/20" />
            <span className="text-stone-300">Active Presence</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-stone-300">Accessible Route</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-stone-600" />
            <span className="text-stone-500">Outer Waypoints</span>
          </div>
        </div>
      </div>

      {/* Stylized Canvas / Interactive Map Layout */}
      <div className="relative w-full aspect-[16/10] min-h-[380px] max-h-[520px] bg-stone-950 rounded-2xl border border-stone-800 p-6 overflow-hidden shadow-inner flex items-center justify-center">
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

        {/* Connecting Ley Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-stone-800 stroke-[1.5] stroke-dasharray-[4_4]">
          {/* Coordinates mapping in percentages */}
          <line x1="50%" y1="50%" x2="55%" y2="25%" />
          <line x1="50%" y1="50%" x2="80%" y2="65%" />
          <line x1="50%" y1="50%" x2="30%" y2="75%" />
          <line x1="50%" y1="50%" x2="25%" y2="40%" />
          <line x1="25%" y1="40%" x2="30%" y2="75%" />
          <line x1="55%" y1="25%" x2="80%" y2="65%" />
        </svg>

        {/* Interactive Location Nodes */}
        {locationList.map((loc) => {
          const isCurrent = loc.id === activeLocationId;
          const canTravel = !isCurrent && loc.accessible;

          return (
            <div
              key={loc.id}
              style={{
                left: `${loc.coordinates.x}%`,
                top: `${loc.coordinates.y}%`,
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
                disabled={isProcessingAction || isCurrent}
                onClick={() => onRequestTravel(loc.id)}
                className={`relative flex items-center justify-center rounded-2xl p-2.5 transition group shadow-lg ${
                  isCurrent
                    ? 'bg-amber-500 text-stone-950 ring-4 ring-amber-400/30'
                    : canTravel
                    ? 'bg-stone-900 hover:bg-stone-800 text-amber-300 border border-amber-500/40 hover:border-amber-400 hover:scale-105'
                    : 'bg-stone-900 text-stone-600 border border-stone-800 cursor-not-allowed'
                }`}
                title={loc.name}
              >
                {isCurrent ? (
                  <Navigation className="w-5 h-5 text-stone-950 animate-bounce" />
                ) : (
                  <MapPin className="w-4 h-4 text-amber-400/80 group-hover:text-amber-300" />
                )}
              </button>

              {/* Node Label Banner */}
              <div className="mt-2 text-center pointer-events-none">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium font-serif whitespace-nowrap shadow-md ${
                    isCurrent
                      ? 'bg-amber-400 text-stone-950 font-bold'
                      : 'bg-stone-950/90 text-stone-200 border border-stone-800'
                  }`}
                >
                  {loc.name}
                </span>
                <span className="text-[10px] font-mono text-stone-500 block">
                  [{loc.coordinates.x}, {loc.coordinates.y}]
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Location Directory / Waypoint Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locationList.map((loc) => {
          const isCurrent = loc.id === activeLocationId;
          const canTravel = !isCurrent && loc.accessible;

          return (
            <div
              key={loc.id}
              className={`rounded-2xl p-4 border transition flex flex-col justify-between ${
                isCurrent
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-stone-900/60 border-stone-800'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-serif font-bold text-stone-100 text-sm">
                    {loc.name}
                  </h4>
                  {isCurrent ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400 text-stone-950 font-bold">
                      Current Site
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-stone-400 bg-stone-950 px-2 py-0.5 rounded border border-stone-850">
                      Accessible
                    </span>
                  )}
                </div>

                <p className="text-xs text-stone-400 line-clamp-2 mb-2 font-serif">
                  {loc.description}
                </p>

                <p className="text-[11px] text-stone-500 italic truncate mb-3">
                  "{loc.ambientSensory}"
                </p>
              </div>

              <div className="pt-3 border-t border-stone-800/80 flex items-center justify-between">
                <span className="text-[10px] font-mono text-stone-500">
                  Region: {loc.region}
                </span>
                {canTravel && (
                  <button
                    id={`travel-btn-${loc.id}`}
                    disabled={isProcessingAction}
                    onClick={() => onRequestTravel(loc.id)}
                    className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 text-amber-300 border border-amber-500/30 hover:border-amber-400 text-xs font-mono font-medium transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Footprints className="w-3.5 h-3.5" />
                    <span>Request Travel</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
