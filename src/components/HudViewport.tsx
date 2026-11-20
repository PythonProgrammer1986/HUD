import { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  FlipHorizontal2,
  Minimize2,
  Navigation,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CalibrationConfig,
  InputSourceMode,
  ModelLoadState,
  RoadClassProfile,
  TurnSignalState,
  VisionFrameResult,
} from '../types/adas';

interface HudViewportProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  simCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sourceMode: InputSourceMode;
  visionResult: VisionFrameResult;
  calibration: CalibrationConfig;
  currentSpeedKmh: number;
  roadProfile: RoadClassProfile;
  speedSourceLabel: string;
  modelState: ModelLoadState;
  cameraError: string | null;
  hasUploadedVideo: boolean;
  windshieldMode: boolean;
  turnSignal: TurnSignalState;
  onToggleWindshieldMode: () => void;
  onToggleMirror: () => void;
  onToggleVoice: () => void;
  onSetTurnSignal: (sig: TurnSignalState) => void;
  onSwitchToSimulator: () => void;
}

export function HudViewport({
  canvasRef,
  videoRef,
  simCanvasRef,
  sourceMode,
  visionResult,
  calibration,
  currentSpeedKmh,
  roadProfile,
  speedSourceLabel,
  modelState,
  cameraError,
  hasUploadedVideo,
  windshieldMode,
  turnSignal,
  onToggleWindshieldMode,
  onToggleMirror,
  onToggleVoice,
  onSetTurnSignal,
  onSwitchToSimulator,
}: HudViewportProps) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  // Render AR HUD Overlays whenever visionResult updates
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    const w = overlay.width;
    const h = overlay.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Calibration ROI Trapezoid
    if (calibration.showCalibrationOverlay) {
      const hy = calibration.horizonY * h;
      const by = calibration.hoodY * h;
      const topHalf = w * calibration.laneWidthNorm * 0.22;
      const botHalf = w * calibration.laneWidthNorm * 0.85;

      ctx.save();
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - topHalf, hy);
      ctx.lineTo(w * 0.5 + topHalf, hy);
      ctx.lineTo(w * 0.5 + botHalf, by);
      ctx.lineTo(w * 0.5 - botHalf, by);
      ctx.closePath();
      ctx.stroke();

      // Horizon and hood guide lines
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(w, hy);
      ctx.moveTo(0, by);
      ctx.lineTo(w, by);
      ctx.stroke();

      ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillText(`HORIZON Y: ${Math.round(calibration.horizonY * 100)}%`, 16, hy - 6);
      ctx.fillText(`HOOD LINE: ${Math.round(calibration.hoodY * 100)}%`, 16, by - 6);
      ctx.restore();
    }

    // 2. Lane Corridor & Departure Warning Overlay
    if (calibration.showLaneOverlay) {
      const { lanes } = visionResult;
      const left = lanes.leftLine;
      const right = lanes.rightLine;

      if (left && right) {
        ctx.save();
        const isDep = lanes.departure !== 'none';
        ctx.fillStyle = isDep
          ? 'rgba(245, 158, 11, 0.14)'
          : 'rgba(6, 182, 212, 0.11)';
        ctx.beginPath();
        ctx.moveTo(left.x1 * w, left.y1 * h);
        ctx.lineTo(left.x2 * w, left.y2 * h);
        ctx.lineTo(right.x2 * w, right.y2 * h);
        ctx.lineTo(right.x1 * w, right.y1 * h);
        ctx.closePath();
        ctx.fill();

        // Draw left lane line
        ctx.strokeStyle =
          lanes.departure === 'left'
            ? '#ef4444'
            : left.confidence > 0.4
              ? '#06b6d4'
              : 'rgba(6,182,212,0.45)';
        ctx.lineWidth = lanes.departure === 'left' ? 4 : 2.5;
        ctx.beginPath();
        ctx.moveTo(left.x1 * w, left.y1 * h);
        ctx.lineTo(left.x2 * w, left.y2 * h);
        ctx.stroke();

        // Draw right lane line
        ctx.strokeStyle =
          lanes.departure === 'right'
            ? '#ef4444'
            : right.confidence > 0.4
              ? '#06b6d4'
              : 'rgba(6,182,212,0.45)';
        ctx.lineWidth = lanes.departure === 'right' ? 4 : 2.5;
        ctx.beginPath();
        ctx.moveTo(right.x1 * w, right.y1 * h);
        ctx.lineTo(right.x2 * w, right.y2 * h);
        ctx.stroke();
        ctx.restore();
      } else {
        // Draw single detected boundary if only one side is visible
        const drawSingle = (
          line: NonNullable<typeof left>,
          color: string
        ) => {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(line.x1 * w, line.y1 * h);
          ctx.lineTo(line.x2 * w, line.y2 * h);
          ctx.stroke();
          ctx.restore();
        };
        if (left) {
          drawSingle(left, lanes.departure === 'left' ? '#ef4444' : '#06b6d4');
        }
        if (right) {
          drawSingle(right, lanes.departure === 'right' ? '#ef4444' : '#06b6d4');
        }
      }
    }

    // 3. Speed Breaker & Pothole Surface Markers
    if (calibration.showSurfaceOverlay) {
      for (const surf of visionResult.surfaceHazards) {
        const sx = surf.xNorm * w;
        const sy = surf.yNorm * h;
        const sw = surf.widthNorm * w;
        const sh = surf.heightNorm * h;

        ctx.save();
        if (surf.type === 'speed_breaker') {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.24)';
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.fillRect(sx, sy, sw, sh);
          ctx.strokeRect(sx, sy, sw, sh);

          const label = `SPEED BREAKER · ~${surf.distanceMeters}m`;
          ctx.font = '700 12px "JetBrains Mono", monospace';
          const tw = ctx.measureText(label).width + 14;
          ctx.fillStyle = '#07090e';
          ctx.fillRect(sx + sw * 0.5 - tw * 0.5, sy - 22, tw, 18);
          ctx.fillStyle = '#fbbf24';
          ctx.fillText(label, sx + sw * 0.5 - tw * 0.5 + 7, sy - 9);
        } else {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(sx, sy, sw, sh);
          ctx.fillStyle = '#07090e';
          ctx.fillRect(sx, sy - 19, 128, 16);
          ctx.fillStyle = '#fbbf24';
          ctx.font = '700 11px "JetBrains Mono", monospace';
          ctx.fillText(`POTHOLE · ~${surf.distanceMeters}m`, sx + 5, sy - 7);
        }
        ctx.restore();
      }
    }

    // 4. Object Detection Corner-Bracket Bounding Boxes
    if (calibration.showNeuralBoxes) {
      for (const obj of visionResult.objects) {
        const bx = obj.bbox[0] * w;
        const by = obj.bbox[1] * h;
        const bw = obj.bbox[2] * w;
        const bh = obj.bbox[3] * h;

        const color =
          obj.risk === 'critical'
            ? '#ef4444'
            : obj.risk === 'caution'
              ? '#f59e0b'
              : '#06b6d4';

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = obj.risk === 'critical' ? 2.6 : 1.8;

        // Corner brackets (HUD reticle look)
        const cLen = Math.min(18, bw * 0.28, bh * 0.28);
        ctx.beginPath();
        // Top-left
        ctx.moveTo(bx, by + cLen);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + cLen, by);
        // Top-right
        ctx.moveTo(bx + bw - cLen, by);
        ctx.lineTo(bx + bw, by);
        ctx.lineTo(bx + bw, by + cLen);
        // Bottom-right
        ctx.moveTo(bx + bw, by + bh - cLen);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx + bw - cLen, by + bh);
        // Bottom-left
        ctx.moveTo(bx + cLen, by + bh);
        ctx.lineTo(bx, by + bh);
        ctx.lineTo(bx, by + bh - cLen);
        ctx.stroke();

        // Subtle inner tint for critical hazards
        if (obj.risk === 'critical') {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
          ctx.fillRect(bx, by, bw, bh);
        }

        // Tag label above box
        const flags: string[] = [];
        if (obj.isWrongSide) flags.push('WRONG-SIDE');
        if (obj.isCutIn) flags.push('CUT-IN');
        const flagStr = flags.length > 0 ? ` [${flags.join('/')}]` : '';
        const ttcStr = obj.ttcSeconds ? ` · ${obj.ttcSeconds}s` : '';
        const tag = `${obj.indianLabel} ${obj.distanceMeters}m${ttcStr}${flagStr}`;

        ctx.font = '600 11px "JetBrains Mono", monospace';
        const tagW = ctx.measureText(tag).width + 10;
        const tagX = Math.max(4, Math.min(w - tagW - 4, bx));
        const tagY = Math.max(20, by - 4);

        ctx.fillStyle = 'rgba(7, 9, 14, 0.88)';
        ctx.fillRect(tagX, tagY - 16, tagW, 17);
        ctx.fillStyle = color;
        ctx.fillText(tag, tagX + 5, tagY - 4);
        ctx.restore();
      }

      // Red Speed Sign ROI Box
      if (visionResult.signDetection.detected && visionResult.signDetection.bbox) {
        const [sx, sy, sw, sh] = visionResult.signDetection.bbox;
        ctx.save();
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx * w, sy * h, sw * w, sh * h);
        ctx.fillStyle = 'rgba(7, 9, 14, 0.88)';
        ctx.fillRect(sx * w, sy * h - 18, 118, 16);
        ctx.fillStyle = '#fca5a5';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.fillText('SIGN ROI DETECTED', sx * w + 4, sy * h - 6);
        ctx.restore();
      }
    }
  }, [visionResult, calibration]);

  const topAlert =
    visionResult.activeAlerts.find((a) => a.severity === 'critical') ||
    visionResult.activeAlerts[0] ||
    null;

  const isSpeedingCritical = currentSpeedKmh > roadProfile.limitKmh + 5;
  const isSpeedingCaution =
    !isSpeedingCritical && currentSpeedKmh > roadProfile.limitKmh;

  const sourceLabel =
    sourceMode === 'simulator'
      ? 'Indian Road Simulator'
      : sourceMode === 'camera'
        ? 'Live Dash Camera'
        : 'Dashcam Video Replay';

  const modelLabel =
    modelState === 'ready'
      ? `TF.js ${visionResult.backend.toUpperCase()} + ROI CV`
      : modelState === 'loading'
        ? 'Loading Neural Weights...'
        : 'Deterministic ROI CV';

  return (
    <section
      className={`relative flex flex-1 flex-col overflow-hidden bg-[#05070B] ${
        windshieldMode ? 'h-full w-full' : 'min-h-[400px]'
      }`}
    >
      {/* Main Media + AR Overlay Stage */}
      <div
        className={`relative flex flex-1 items-center justify-center overflow-hidden ${
          calibration.hudMirror ? 'scale-x-[-1]' : ''
        }`}
      >
        {/* Source Layers */}
        <canvas
          ref={simCanvasRef}
          width={1280}
          height={720}
          className={`h-full w-full object-contain ${
            sourceMode === 'simulator' ? 'block' : 'hidden'
          }`}
        />

        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full object-contain ${
            sourceMode !== 'simulator' ? 'block' : 'hidden'
          }`}
        />

        {/* Hidden capture canvas used when needed */}
        <canvas ref={canvasRef} width={640} height={360} className="hidden" />

        {/* Transparent AR Overlay Canvas aligned over the stage */}
        <canvas
          ref={overlayRef}
          width={1280}
          height={720}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />

        {/* Top Measured Contrast Scrim */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />

        {/* Bottom Measured Contrast Scrim */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        {/* Empty / Error State Overlays */}
        {sourceMode === 'camera' && cameraError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#07090E]/90 p-6">
            <div className="max-w-md border border-slate-800 bg-[#111827] p-6 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-400" />
              <h3 className="font-display text-lg font-semibold text-slate-100">
                Camera Feed Unavailable
              </h3>
              <p className="mt-2 text-sm text-slate-400">{cameraError}</p>
              <button
                type="button"
                onClick={onSwitchToSimulator}
                className="mt-4 rounded-md bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
              >
                Switch to Road Simulator
              </button>
            </div>
          </div>
        )}

        {sourceMode === 'video' && !hasUploadedVideo && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="border border-slate-800 bg-[#111827]/95 px-6 py-5 text-center">
              <p className="font-display text-base font-semibold text-slate-100">
                No Dashcam Clip Loaded
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Select an .mp4 or .webm dashcam recording in the left panel to analyze real road footage.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Unmirrored HUD Readouts Layer (kept readable even if camera view is mirrored) */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
        {/* Top HUD Strip */}
        <div className="flex items-start justify-between gap-4">
          {/* Top-Left Source & Pipeline Telemetry (Zero-pill unboxed metadata) */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
              <span>{sourceLabel}</span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span className="font-mono text-cyan-300">{modelLabel}</span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span className="font-mono tabular-nums text-slate-300">
                {visionResult.fps} FPS
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
              <span>{roadProfile.label}</span>
              <span aria-hidden="true">·</span>
              <span>
                Lanes:{' '}
                {visionResult.lanes.leftLine || visionResult.lanes.rightLine
                  ? `${Math.round(visionResult.lanes.confidence * 100)}% Lock`
                  : 'Searching'}
              </span>
              {turnSignal !== 'none' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400 font-semibold">
                    {turnSignal === 'left' ? '◀ Left Indicator (LDW Suppressed)' : 'Right Indicator ▶ (LDW Suppressed)'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Top-Right Speedometer + Indian Speed Limit Sign */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] font-medium text-slate-400">
                {speedSourceLabel}
              </div>
              <div className="flex items-baseline justify-end gap-1.5">
                <span
                  className={`font-mono text-3xl sm:text-4xl font-bold tabular-nums leading-none ${
                    isSpeedingCritical
                      ? 'text-rose-400'
                      : isSpeedingCaution
                        ? 'text-amber-400'
                        : 'text-slate-100'
                  }`}
                >
                  {Math.round(currentSpeedKmh)}
                </span>
                <span className="font-mono text-xs text-slate-400">km/h</span>
              </div>
            </div>

            {/* Authentic Indian Red-Ring Circular Speed Limit Sign */}
            <div
              className={`flex h-13 w-13 shrink-0 items-center justify-center rounded-full border-[5px] bg-white font-mono text-lg font-bold tabular-nums text-slate-950 ${
                isSpeedingCritical
                  ? 'border-red-600 ring-2 ring-red-500/70'
                  : 'border-red-600'
              }`}
              title={`Active Speed Limit: ${roadProfile.limitKmh} km/h`}
            >
              {roadProfile.limitKmh}
            </div>
          </div>
        </div>

        {/* Bottom HUD Area: Priority Active Hazard Banner & Windshield Quick Controls */}
        <div className="flex flex-col items-center gap-3">
          {topAlert ? (
            <div
              role="status"
              aria-live="polite"
              className={`flex max-w-xl items-center gap-3 border px-4 py-2.5 ${
                topAlert.severity === 'critical'
                  ? 'border-rose-500/80 bg-rose-950/90 text-rose-100'
                  : 'border-amber-500/70 bg-amber-950/90 text-amber-100'
              }`}
            >
              <ShieldAlert
                className={`h-5 w-5 shrink-0 ${
                  topAlert.severity === 'critical'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="font-display text-sm font-bold tracking-wide">
                  {topAlert.headline}
                </div>
                <div className="text-xs text-slate-200/90">{topAlert.subtext}</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 border border-slate-800/80 bg-[#07090E]/75 px-3.5 py-1.5 text-xs text-slate-300">
              <Navigation className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
              <span>Path Nominal · Monitoring Lanes, Traffic &amp; Road Surface</span>
            </div>
          )}

          {/* Large Touch-Friendly Controls Bar inside Windshield HUD mode */}
          {windshieldMode && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 border border-slate-800 bg-[#0B0E17]/90 p-2">
              <button
                type="button"
                onClick={() =>
                  onSetTurnSignal(turnSignal === 'left' ? 'none' : 'left')
                }
                className={`min-h-[44px] px-4 text-xs font-semibold cursor-pointer ${
                  turnSignal === 'left'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                ◀ Left Signal
              </button>
              <button
                type="button"
                onClick={() =>
                  onSetTurnSignal(turnSignal === 'right' ? 'none' : 'right')
                }
                className={`min-h-[44px] px-4 text-xs font-semibold cursor-pointer ${
                  turnSignal === 'right'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                Right Signal ▶
              </button>
              <button
                type="button"
                onClick={onToggleVoice}
                className="inline-flex min-h-[44px] items-center gap-2 bg-slate-800 px-4 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                {calibration.voiceEnabled ? (
                  <>
                    <Volume2 className="h-4 w-4 text-cyan-400" /> Voice On
                  </>
                ) : (
                  <>
                    <VolumeX className="h-4 w-4 text-slate-400" /> Voice Muted
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onToggleMirror}
                className={`inline-flex min-h-[44px] items-center gap-2 px-4 text-xs font-semibold cursor-pointer ${
                  calibration.hudMirror
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <FlipHorizontal2 className="h-4 w-4" /> Mirror HUD
              </button>
              <button
                type="button"
                onClick={onToggleWindshieldMode}
                className="inline-flex min-h-[44px] items-center gap-2 border border-slate-700 bg-slate-900 px-4 text-xs font-semibold text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                <Minimize2 className="h-4 w-4" /> Exit HUD
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
