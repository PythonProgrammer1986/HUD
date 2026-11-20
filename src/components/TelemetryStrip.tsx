import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { HazardEventRecord, VisionFrameResult } from '../types/adas';

interface TelemetryStripProps {
  visionResult: VisionFrameResult;
  eventLog: HazardEventRecord[];
  onExportCsv: () => void;
  onClearLog: () => void;
}

type LogFilter = 'all' | 'critical' | 'lane' | 'surface';

export function TelemetryStrip({
  visionResult,
  eventLog,
  onExportCsv,
  onClearLog,
}: TelemetryStripProps) {
  const [filter, setFilter] = useState<LogFilter>('all');

  const filteredEvents = eventLog.filter((ev) => {
    if (filter === 'all') return true;
    if (filter === 'critical') return ev.severity === 'critical';
    if (filter === 'lane') return ev.category === 'lane_departure';
    return (
      ev.category === 'speed_breaker' ||
      ev.category === 'pothole' ||
      ev.category === 'speed_limit'
    );
  });

  const offsetPct = Math.round(visionResult.lanes.centerOffset * 100);
  const offsetDir =
    offsetPct < -3 ? `${Math.abs(offsetPct)}% L` : offsetPct > 3 ? `${offsetPct}% R` : '0% CTR';

  return (
    <section className="flex min-h-[320px] shrink-0 flex-col border-t border-slate-800 bg-[#0B0E17] lg:h-52 lg:min-h-0 lg:flex-row">
      {/* Left 4-Metric Tabular Telemetry Summary */}
      <div className="grid grid-cols-2 border-b border-slate-800 lg:w-96 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex flex-col justify-center border-r border-slate-800/80 px-4 py-2.5 lg:border-b">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Vision Rate
          </span>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold tabular-nums text-slate-100">
              {visionResult.fps}
            </span>
            <span className="font-mono text-xs text-slate-400">FPS</span>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-cyan-400">
            {visionResult.inferenceMs.toFixed(1)} ms/frame
          </span>
        </div>

        <div className="flex flex-col justify-center border-r border-slate-800/80 px-4 py-2.5 lg:border-r-0 lg:border-b">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Tracked Actors
          </span>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold tabular-nums text-slate-100">
              {visionResult.objects.length}
            </span>
            <span className="font-mono text-xs text-slate-400">OBJ</span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            {visionResult.surfaceHazards.length} surface hits
          </span>
        </div>

        <div className="flex flex-col justify-center border-r border-slate-800/80 px-4 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Lane Offset
          </span>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span
              className={`font-mono text-xl font-bold tabular-nums ${
                visionResult.lanes.departure !== 'none'
                  ? 'text-amber-400'
                  : 'text-slate-100'
              }`}
            >
              {offsetDir}
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            {visionResult.lanes.departure === 'none'
              ? '● Nominal'
              : `▲ Drift ${visionResult.lanes.departure}`}
          </span>
        </div>

        <div className="flex flex-col justify-center px-4 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Logged Events
          </span>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-bold tabular-nums text-slate-100">
              {eventLog.length}
            </span>
            <span className="font-mono text-xs text-slate-400">TOTAL</span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            {eventLog.filter((e) => e.severity === 'critical').length} critical
          </span>
        </div>
      </div>

      {/* Right Live Hazard Event Stream */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-2">
          <div className="flex items-center gap-1 rounded bg-[#07090E] p-0.5">
            {(
              [
                { id: 'all', label: 'All Events' },
                { id: 'critical', label: 'Critical' },
                { id: 'lane', label: 'Lane Drift' },
                { id: 'surface', label: 'Breakers & Speed' },
              ] as { id: LogFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-slate-800 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onExportCsv}
              disabled={eventLog.length === 0}
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40 whitespace-nowrap cursor-pointer"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={onClearLog}
              disabled={eventLog.length === 0}
              className="inline-flex items-center gap-1 rounded border border-slate-800 px-2 py-1 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 disabled:opacity-40 whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Clear
            </button>
          </div>
        </div>

        <div className="cockpit-scroll flex-1 overflow-y-auto px-4 py-1">
          {filteredEvents.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              No hazard events logged yet. Trigger a hazard in the Road Simulator or drive with live camera feed.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <tbody>
                {filteredEvents.slice(0, 40).map((ev) => {
                  const timeStr = new Date(ev.timestamp).toLocaleTimeString('en-IN', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  return (
                    <tr
                      key={ev.id}
                      className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-900/50"
                    >
                      <td className="w-20 py-1.5 pr-3 font-mono tabular-nums text-slate-400">
                        {timeStr}
                      </td>
                      <td className="w-24 py-1.5 pr-3 font-mono font-semibold whitespace-nowrap">
                        {ev.severity === 'critical' ? (
                          <span className="text-rose-400">✖ Critical</span>
                        ) : (
                          <span className="text-amber-400">▲ Caution</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 font-medium text-slate-200">
                        {ev.title}
                        <span className="ml-2 text-slate-400 font-normal">
                          · {ev.detail}
                        </span>
                      </td>
                      <td className="w-24 py-1.5 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {Math.round(ev.speedKmh)} km/h
                      </td>
                      <td className="w-28 py-1.5 pl-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {ev.metric}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
