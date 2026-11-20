import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { HazardCategory, HazardEventRecord } from '../types/adas';

interface TripLogViewProps {
  eventLog: HazardEventRecord[];
  onExportCsv: () => void;
  onClearLog: () => void;
}

const CATEGORY_LABELS: Record<HazardCategory, string> = {
  collision: 'Forward Collision',
  wrong_side: 'Wrong-Side Vehicle',
  cut_in: 'Sudden Cut-In',
  lane_departure: 'Lane Departure',
  speed_breaker: 'Speed Breaker',
  pothole: 'Pothole',
  speed_limit: 'Speed Limit',
  cattle: 'Stray Cattle',
};

export function TripLogView({
  eventLog,
  onExportCsv,
  onClearLog,
}: TripLogViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | HazardCategory>('all');

  const filtered =
    selectedCategory === 'all'
      ? eventLog
      : eventLog.filter((e) => e.category === selectedCategory);

  const criticalCount = eventLog.filter((e) => e.severity === 'critical').length;
  const cautionCount = eventLog.filter((e) => e.severity === 'caution').length;
  const breakerCount = eventLog.filter((e) => e.category === 'speed_breaker').length;
  const laneCount = eventLog.filter((e) => e.category === 'lane_departure').length;

  return (
    <main className="cockpit-scroll flex-1 overflow-y-auto bg-[#07090E] px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-400">
              Local Session Telemetry
            </p>
            <h1 className="font-display text-2xl font-bold text-slate-100">
              Trip Hazard &amp; Driving Event Log
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportCsv}
              disabled={eventLog.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40 whitespace-nowrap cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export Trip CSV
            </button>
            <button
              type="button"
              onClick={onClearLog}
              disabled={eventLog.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear Log
            </button>
          </div>
        </div>

        {/* 4 Summary Metrics */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs text-slate-400">Critical Hazards</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-rose-400">
              {criticalCount}
            </div>
          </div>
          <div className="border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs text-slate-400">Caution Advisories</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-400">
              {cautionCount}
            </div>
          </div>
          <div className="border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs text-slate-400">Speed Breakers</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
              {breakerCount}
            </div>
          </div>
          <div className="border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs text-slate-400">Lane Departures</div>
            <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-100">
              {laneCount}
            </div>
          </div>
        </div>

        {/* Category Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`rounded px-3 py-1.5 text-xs font-medium cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                : 'bg-[#111827] text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            All Categories ({eventLog.length})
          </button>
          {(Object.keys(CATEGORY_LABELS) as HazardCategory[]).map((cat) => {
            const count = eventLog.filter((e) => e.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded px-3 py-1.5 text-xs font-medium cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'bg-[#111827] text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto border border-slate-800 bg-[#111827]">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              No recorded events match this filter yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0B0E17] text-slate-400">
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 text-right font-medium">Speed</th>
                  <th className="px-4 py-3 text-right font-medium">Metric</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => (
                  <tr
                    key={ev.id}
                    className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-900/60"
                  >
                    <td className="px-4 py-2.5 font-mono tabular-nums text-slate-400">
                      {new Date(ev.timestamp).toLocaleTimeString('en-IN', {
                        hour12: false,
                      })}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      {ev.severity === 'critical' ? (
                        <span className="text-rose-400">✖ Critical</span>
                      ) : (
                        <span className="text-amber-400">▲ Caution</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">
                      {CATEGORY_LABELS[ev.category]}
                    </td>
                    <td className="px-4 py-2.5 text-slate-200">
                      {ev.title}{' '}
                      <span className="text-slate-400">· {ev.detail}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-200">
                      {Math.round(ev.speedKmh)} km/h
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-400">
                      {ev.metric}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
