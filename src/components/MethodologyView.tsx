import { ArrowRight } from 'lucide-react';

interface MethodologyViewProps {
  onOpenCockpit: () => void;
}

const PIPELINE_STAGES = [
  {
    index: '01',
    title: 'Dual-Resolution Frame Ingestion',
    summary:
      'Streams webcam, uploaded dashcam clips, and the Indian Road Simulator into a 512×288 high-resolution neural canvas and a 320×180 spatial-CV grid locally with zero cloud round-trips.',
    specs: ['512×288 High-Accuracy neural feed', '320×180 pixel CV grid', 'Horizon & hood trapezoid calibration'],
  },
  {
    index: '02',
    title: 'Hybrid Neural + Foreground Obstacle Detection',
    summary:
      'Executes TensorFlow.js COCO-SSD (mobilenet_v2 or lite_mobilenet_v2 on WebGL) fused via IoU deduplication with a road-ROI foreground silhouette & edge detector for auto-rickshaws, two-wheelers, and cattle.',
    specs: ['Canopy + yellow/green Auto-Rickshaw check', 'Horizontal gradient neutral vehicle recall', 'Calibrated focal distance estimation (m)'],
  },
  {
    index: '03',
    title: 'Adaptive Lane Departure Warning (IRLS + Ridge Filter)',
    summary:
      'Uses per-row road baseline contrast and a symmetric top-hat ridge filter to isolate white/yellow markings under glare or dusk, followed by 2-pass IRLS outlier rejection and lane-width validation.',
    specs: ['Adaptive sunlight/dusk contrast', 'Top-hat ridge rejects car bumpers', 'Left/Right turn-signal suppression'],
  },
  {
    index: '04',
    title: 'Vehicle-Masked Speed Breaker & Pothole Scanner',
    summary:
      'Masks out tracked vehicle bounding boxes before scanning horizontal road bands for 3-band crest/shadow speed breakers and 4-sided rimmed potholes persisted across consecutive frames.',
    specs: ['Vehicle-box masking eliminates bumper false positives', 'Relative asphalt pothole thresholding', 'Multi-frame lock suppresses shadows'],
  },
  {
    index: '05',
    title: 'Coasting IoU Tracker, TTC & Wrong-Side Engine',
    summary:
      'Propagates confirmed tracks across up to 4 occluded frames using velocity prediction, measures dynamic lane-corridor overlap, and flags oncoming wrong-side riders and sudden cut-ins.',
    specs: ['4-frame coasting + box EMA smoothing', 'Dynamic lane-line ego corridor bounds', 'Cooldown-gated Web Audio + Voice alerts'],
  },
];

const INDIAN_HAZARDS = [
  {
    feature: 'Unmarked & Painted Speed Breakers',
    challenge: 'Many Indian residential, village-bypass, and highway approach humps lack yellow paint or warning signage.',
    solution: 'Horizontal band vertical-gradient continuity + bright-crest/dark-shadow pair scanning across the bottom road ROI.',
  },
  {
    feature: 'Potholes & Broken Shoulder Edges',
    challenge: 'Monsoon water-filled or deep asphalt craters appear abruptly inside wheel tracks.',
    solution: 'Localized dark depression clustering bounded by lighter rough rims with 3-frame temporal persistence.',
  },
  {
    feature: 'Auto-Rickshaws & Weaving Two-Wheelers',
    challenge: 'Dense lateral squeezing and sudden cut-ins violate strict Western lane discipline.',
    solution: 'Chroma-assisted Auto-Rickshaw classification + lateral inward velocity (Δx/Δt) cut-in detector.',
  },
  {
    feature: 'Wrong-Side Vehicles',
    challenge: 'Two-wheelers, autos, and tractors frequently travel counter-flow along highway shoulders and medians.',
    solution: 'Right-corridor overlap + headlight/high-expansion Δh/Δt tracking triggers immediate crimson warning.',
  },
  {
    feature: 'Stray Cattle & Unpredictable Crossings',
    challenge: 'Cows and stray animals resting on medians or crossing highways at dusk.',
    solution: 'Neural cattle mapping + light-silhouette shoulder crossing heuristics with early caution alerts.',
  },
  {
    feature: 'Speed Limit Monitoring (Indian Road Classes)',
    challenge: 'Varying caps across School Zones (25), Urban Roads (40), State Highways (60), NH (80), and Expressways (100).',
    solution: 'Live Geolocation speed tracking paired with Indian road-class presets and red-ring circular sign ROI detection.',
  },
];

export function MethodologyView({ onOpenCockpit }: MethodologyViewProps) {
  return (
    <main className="cockpit-scroll flex-1 overflow-y-auto bg-[#07090E] px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-10">
        {/* Header Block */}
        <div className="flex flex-col justify-between gap-6 border-b border-slate-800 pb-6 md:flex-row md:items-end">
          <div className="max-w-2xl space-y-2">
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-400">
              On-Device Browser Vision Architecture
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-slate-100">
              Detection Methodology &amp; Indian Road Feature Set
            </h1>
            <p className="text-sm leading-relaxed text-slate-400">
              Every frame from your camera, uploaded dashcam clip, or simulator runs 100% locally inside the browser using WebGL TensorFlow.js fused with deterministic spatial-gradient and temporal-motion vision pipelines.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCockpit}
            className="inline-flex items-center gap-2 self-start rounded-md bg-cyan-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Launch Live Cockpit
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* 5-Stage Pipeline Architecture */}
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-slate-100">
            Five-Stage Real-Time Processing Pipeline
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PIPELINE_STAGES.map((stage) => (
              <div
                key={stage.index}
                className="flex flex-col justify-between border border-slate-800 bg-[#111827] p-5"
              >
                <div className="space-y-2.5">
                  <div className="font-mono text-xs font-semibold text-cyan-400">
                    Stage {stage.index}
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-100">
                    {stage.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-400">
                    {stage.summary}
                  </p>
                </div>
                <ul className="mt-4 space-y-1 border-t border-slate-800 pt-3 text-[11px] font-mono text-slate-300">
                  {stage.specs.map((sp) => (
                    <li key={sp}>· {sp}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Indian Road Feature Matrix */}
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-slate-100">
            Indian Road Hazard Coverage Matrix
          </h2>
          <div className="overflow-x-auto border border-slate-800 bg-[#111827]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0B0E17] text-slate-400">
                  <th className="px-4 py-3 font-display font-semibold uppercase tracking-wider">
                    Feature / Hazard
                  </th>
                  <th className="px-4 py-3 font-display font-semibold uppercase tracking-wider">
                    Indian Road Challenge
                  </th>
                  <th className="px-4 py-3 font-display font-semibold uppercase tracking-wider">
                    On-Device Vision Solution
                  </th>
                </tr>
              </thead>
              <tbody>
                {INDIAN_HAZARDS.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-b border-slate-800/70 last:border-b-0"
                  >
                    <td className="px-4 py-3.5 font-semibold text-slate-100 whitespace-nowrap">
                      {row.feature}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 leading-relaxed">
                      {row.challenge}
                    </td>
                    <td className="px-4 py-3.5 text-cyan-300/90 leading-relaxed">
                      {row.solution}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
