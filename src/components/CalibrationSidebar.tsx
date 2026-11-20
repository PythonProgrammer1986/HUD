import { useRef } from 'react';
import {
  Bell,
  Camera,
  Film,
  MonitorPlay,
  Pause,
  Play,
  RotateCcw,
  Upload,
  Volume2,
} from 'lucide-react';
import {
  CalibrationConfig,
  CameraFacing,
  INDIAN_ROAD_PROFILES,
  InputSourceMode,
  RoadClassId,
  SimulatorControls,
  SimulatorScenario,
  TurnSignalState,
} from '../types/adas';

interface CalibrationSidebarProps {
  sourceMode: InputSourceMode;
  onSelectSource: (mode: InputSourceMode) => void;
  roadClassId: RoadClassId;
  onSelectRoadClass: (id: RoadClassId) => void;
  calibration: CalibrationConfig;
  onUpdateCalibration: (patch: Partial<CalibrationConfig>) => void;
  onResetCalibration: () => void;
  simControls: SimulatorControls;
  onUpdateSimControls: (patch: Partial<SimulatorControls>) => void;
  onInjectSimHazard: (
    kind: 'speed_breaker' | 'pothole' | 'cut_in' | 'wrong_side' | 'cattle'
  ) => void;
  cameraDevices: MediaDeviceInfo[];
  selectedCameraId: string;
  onSelectCameraId: (id: string) => void;
  cameraFacing: CameraFacing;
  onSelectCameraFacing: (facing: CameraFacing) => void;
  activeCameraLabel: string;
  onVideoUpload: (file: File) => void;
  videoPlaying: boolean;
  onToggleVideoPlay: () => void;
  videoProgress: number;
  videoDuration: number;
  onSeekVideo: (sec: number) => void;
  useGpsSpeed: boolean;
  onToggleUseGpsSpeed: (val: boolean) => void;
  manualSpeedKmh: number;
  onChangeManualSpeed: (val: number) => void;
  turnSignal: TurnSignalState;
  onSetTurnSignal: (sig: TurnSignalState) => void;
  onTestAudio: () => void;
}

const SCENARIO_OPTIONS: { id: SimulatorScenario; label: string }[] = [
  { id: 'mixed_indian_road', label: 'Mixed Indian Traffic' },
  { id: 'speed_breaker_zone', label: 'Speed Breakers & Potholes' },
  { id: 'auto_cutin', label: 'Auto-Rickshaw Cut-In' },
  { id: 'wrong_side_hazard', label: 'Wrong-Side Two-Wheeler' },
  { id: 'cattle_crossing', label: 'Stray Cattle Crossing' },
];

export function CalibrationSidebar({
  sourceMode,
  onSelectSource,
  roadClassId,
  onSelectRoadClass,
  calibration,
  onUpdateCalibration,
  onResetCalibration,
  simControls,
  onUpdateSimControls,
  onInjectSimHazard,
  cameraDevices,
  selectedCameraId,
  onSelectCameraId,
  cameraFacing,
  onSelectCameraFacing,
  activeCameraLabel,
  onVideoUpload,
  videoPlaying,
  onToggleVideoPlay,
  videoProgress,
  videoDuration,
  onSeekVideo,
  useGpsSpeed,
  onToggleUseGpsSpeed,
  manualSpeedKmh,
  onChangeManualSpeed,
  turnSignal,
  onSetTurnSignal,
  onTestAudio,
}: CalibrationSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <aside className="cockpit-scroll flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-slate-800 bg-[#0B0E17] p-4 lg:w-80 lg:border-b-0 lg:border-r">
      {/* 1. Video Input Source */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs font-semibold tracking-wider uppercase text-slate-400">
            01. Camera &amp; Feed Source
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-800 bg-[#07090E] p-1">
          <button
            type="button"
            onClick={() => onSelectSource('simulator')}
            className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              sourceMode === 'simulator'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MonitorPlay className="h-3.5 w-3.5" aria-hidden="true" />
            Simulator
          </button>
          <button
            type="button"
            onClick={() => onSelectSource('camera')}
            className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              sourceMode === 'camera'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            Camera
          </button>
          <button
            type="button"
            onClick={() => onSelectSource('video')}
            className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              sourceMode === 'video'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Film className="h-3.5 w-3.5" aria-hidden="true" />
            Upload
          </button>
        </div>

        {/* Simulator Controls */}
        {sourceMode === 'simulator' && (
          <div className="space-y-3 border-t border-slate-800/80 pt-3">
            <div>
              <label
                htmlFor="sim-scenario"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Indian Road Scenario
              </label>
              <select
                id="sim-scenario"
                value={simControls.scenario}
                onChange={(e) =>
                  onUpdateSimControls({
                    scenario: e.target.value as SimulatorScenario,
                  })
                }
                className="w-full rounded-md border border-slate-800 bg-[#111827] px-2.5 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                {SCENARIO_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-300">Simulated Ego Speed</span>
                <span className="font-mono font-semibold tabular-nums text-cyan-300">
                  {simControls.targetSpeedKmh} km/h
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={115}
                step={1}
                value={simControls.targetSpeedKmh}
                onChange={(e) =>
                  onUpdateSimControls({ targetSpeedKmh: Number(e.target.value) })
                }
                className="cockpit-slider w-full"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-300">Lane Drift Test</span>
                <button
                  type="button"
                  onClick={() => onUpdateSimControls({ laneDriftBias: 0 })}
                  className="font-mono text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  Center ({simControls.laneDriftBias.toFixed(2)})
                </button>
              </div>
              <input
                type="range"
                min={-0.85}
                max={0.85}
                step={0.05}
                value={simControls.laneDriftBias}
                onChange={(e) =>
                  onUpdateSimControls({ laneDriftBias: Number(e.target.value) })
                }
                className="cockpit-slider w-full"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Inject Live Hazard into Feed
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSimControls({ paused: !simControls.paused })
                  }
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  {simControls.paused ? (
                    <>
                      <Play className="h-3 w-3" /> Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-3 w-3" /> Pause
                    </>
                  )}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onInjectSimHazard('speed_breaker')}
                  className="rounded border border-slate-800 bg-[#111827] px-2 py-1.5 text-left text-[11px] font-medium text-slate-200 hover:border-amber-500/50 hover:text-amber-300 cursor-pointer"
                >
                  + Speed Breaker
                </button>
                <button
                  type="button"
                  onClick={() => onInjectSimHazard('pothole')}
                  className="rounded border border-slate-800 bg-[#111827] px-2 py-1.5 text-left text-[11px] font-medium text-slate-200 hover:border-amber-500/50 hover:text-amber-300 cursor-pointer"
                >
                  + Pothole
                </button>
                <button
                  type="button"
                  onClick={() => onInjectSimHazard('cut_in')}
                  className="rounded border border-slate-800 bg-[#111827] px-2 py-1.5 text-left text-[11px] font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 cursor-pointer"
                >
                  + Auto Cut-In
                </button>
                <button
                  type="button"
                  onClick={() => onInjectSimHazard('wrong_side')}
                  className="rounded border border-slate-800 bg-[#111827] px-2 py-1.5 text-left text-[11px] font-medium text-slate-200 hover:border-rose-500/50 hover:text-rose-300 cursor-pointer"
                >
                  + Wrong-Side
                </button>
                <button
                  type="button"
                  onClick={() => onInjectSimHazard('cattle')}
                  className="col-span-2 rounded border border-slate-800 bg-[#111827] px-2 py-1.5 text-left text-[11px] font-medium text-slate-200 hover:border-amber-500/50 hover:text-amber-300 cursor-pointer"
                >
                  + Stray Cattle Crossing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Live Camera Controls */}
        {sourceMode === 'camera' && (
          <div className="space-y-3 border-t border-slate-800/80 pt-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Mobile Camera Direction</span>
                {activeCameraLabel && (
                  <span className="truncate max-w-[140px] font-mono text-[10px] text-cyan-400">
                    {activeCameraLabel}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectCameraFacing('environment')}
                  className={`min-h-[40px] rounded border px-2.5 text-xs font-medium cursor-pointer ${
                    cameraFacing === 'environment' && !selectedCameraId
                      ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-800 bg-[#111827] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Back Camera
                </button>
                <button
                  type="button"
                  onClick={() => onSelectCameraFacing('user')}
                  className={`min-h-[40px] rounded border px-2.5 text-xs font-medium cursor-pointer ${
                    cameraFacing === 'user' && !selectedCameraId
                      ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-800 bg-[#111827] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Front Camera
                </button>
              </div>
            </div>

            {cameraDevices.length > 0 && (
              <div>
                <label
                  htmlFor="camera-device"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  Specific Lens Override
                </label>
                <select
                  id="camera-device"
                  value={selectedCameraId}
                  onChange={(e) => onSelectCameraId(e.target.value)}
                  className="w-full min-h-[40px] rounded-md border border-slate-800 bg-[#111827] px-2.5 py-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">
                    Auto ({cameraFacing === 'environment' ? 'Back Camera' : 'Front Camera'})
                  </option>
                  {cameraDevices.map((dev, idx) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.label || `Camera ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-xs leading-relaxed text-slate-400">
              Mount phone on dashboard or windshield with the back camera facing the road ahead. Screen stays awake while active.
            </p>
          </div>
        )}

        {/* Video Upload Controls */}
        {sourceMode === 'video' && (
          <div className="space-y-3 border-t border-slate-800/80 pt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onVideoUpload(file);
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Choose Dashcam Clip (.mp4 / .webm)
            </button>

            {videoDuration > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={onToggleVideoPlay}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    {videoPlaying ? (
                      <>
                        <Pause className="h-3 w-3" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" /> Play
                      </>
                    )}
                  </button>
                  <span className="font-mono text-[11px] tabular-nums text-slate-400">
                    {videoProgress.toFixed(1)}s / {videoDuration.toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={videoDuration}
                  step={0.1}
                  value={videoProgress}
                  onChange={(e) => onSeekVideo(Number(e.target.value))}
                  className="cockpit-slider w-full"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Road Class Speed Limit & GPS Monitoring */}
      <div className="space-y-3 border-t border-slate-800 pt-4">
        <h2 className="font-display text-xs font-semibold tracking-wider uppercase text-slate-400">
          02. Speed Limit Profile
        </h2>
        <div className="grid grid-cols-2 gap-1.5">
          {INDIAN_ROAD_PROFILES.map((prof) => {
            const active = prof.id === roadClassId;
            return (
              <button
                key={prof.id}
                type="button"
                onClick={() => onSelectRoadClass(prof.id)}
                className={`rounded border px-2.5 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                    : 'border-slate-800 bg-[#111827] text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="truncate">{prof.shortLabel}</div>
              </button>
            );
          })}
        </div>

        {sourceMode !== 'simulator' && (
          <div className="space-y-2 pt-1">
            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
              <span>Use Live GPS Speed</span>
              <input
                type="checkbox"
                checked={useGpsSpeed}
                onChange={(e) => onToggleUseGpsSpeed(e.target.checked)}
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
            {!useGpsSpeed && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Manual Test Speed</span>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {manualSpeedKmh} km/h
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={120}
                  step={1}
                  value={manualSpeedKmh}
                  onChange={(e) => onChangeManualSpeed(Number(e.target.value))}
                  className="cockpit-slider w-full"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Alerts & Turn-Signal Suppression */}
      <div className="space-y-3 border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs font-semibold tracking-wider uppercase text-slate-400">
            03. Voice, Chimes &amp; Signals
          </h2>
          <button
            type="button"
            onClick={onTestAudio}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
          >
            <Bell className="h-3 w-3" /> Test Audio
          </button>
        </div>

        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
            <span className="inline-flex items-center gap-1.5">
              <Volume2 className="h-3.5 w-3.5 text-slate-400" />
              Spoken Voice Warnings
            </span>
            <input
              type="checkbox"
              checked={calibration.voiceEnabled}
              onChange={(e) =>
                onUpdateCalibration({ voiceEnabled: e.target.checked })
              }
              className="h-4 w-4 accent-cyan-500"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
            <span>Cockpit Caution/Urgent Chimes</span>
            <input
              type="checkbox"
              checked={calibration.chimesEnabled}
              onChange={(e) =>
                onUpdateCalibration({ chimesEnabled: e.target.checked })
              }
              className="h-4 w-4 accent-cyan-500"
            />
          </label>
        </div>

        <div>
          <div className="mb-1.5 text-xs text-slate-400">
            Turn-Signal LDW Suppression
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(['left', 'none', 'right'] as TurnSignalState[]).map((sig) => (
              <button
                key={sig}
                type="button"
                onClick={() => onSetTurnSignal(sig)}
                className={`rounded border py-1.5 text-xs font-medium cursor-pointer ${
                  turnSignal === sig
                    ? sig === 'none'
                      ? 'border-slate-600 bg-slate-800 text-slate-100'
                      : 'border-amber-500/70 bg-amber-500/20 text-amber-300'
                    : 'border-slate-800 bg-[#111827] text-slate-400 hover:text-slate-200'
                }`}
              >
                {sig === 'left' ? '◀ Left' : sig === 'right' ? 'Right ▶' : 'Off'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Vision ROI Calibration & HUD Layers */}
      <div className="space-y-3 border-t border-slate-800 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xs font-semibold tracking-wider uppercase text-slate-400">
            04. Camera Calibration &amp; HUD
          </h2>
          <button
            type="button"
            onClick={onResetCalibration}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>

        <div>
          <div className="mb-1.5 text-xs text-slate-300">
            Neural Vision Accuracy
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() =>
                onUpdateCalibration({ accuracyProfile: 'high_accuracy' })
              }
              className={`rounded border py-1.5 px-2 text-[11px] font-medium cursor-pointer ${
                calibration.accuracyProfile === 'high_accuracy'
                  ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-800 bg-[#111827] text-slate-400 hover:text-slate-200'
              }`}
            >
              High Accuracy (512p)
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateCalibration({ accuracyProfile: 'balanced' })
              }
              className={`rounded border py-1.5 px-2 text-[11px] font-medium cursor-pointer ${
                calibration.accuracyProfile === 'balanced'
                  ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-800 bg-[#111827] text-slate-400 hover:text-slate-200'
              }`}
            >
              Balanced Fast (384p)
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-300">Horizon Line Y</span>
              <span className="font-mono tabular-nums text-slate-400">
                {Math.round(calibration.horizonY * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.32}
              max={0.58}
              step={0.01}
              value={calibration.horizonY}
              onChange={(e) =>
                onUpdateCalibration({ horizonY: Number(e.target.value) })
              }
              className="cockpit-slider w-full"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-300">Car Hood Line Y</span>
              <span className="font-mono tabular-nums text-slate-400">
                {Math.round(calibration.hoodY * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.76}
              max={0.96}
              step={0.01}
              value={calibration.hoodY}
              onChange={(e) =>
                onUpdateCalibration({ hoodY: Number(e.target.value) })
              }
              className="cockpit-slider w-full"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-300">Detection Sensitivity</span>
              <span className="font-mono tabular-nums text-slate-400">
                {Math.round(calibration.sensitivity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.4}
              max={0.95}
              step={0.05}
              value={calibration.sensitivity}
              onChange={(e) =>
                onUpdateCalibration({ sensitivity: Number(e.target.value) })
              }
              className="cockpit-slider w-full"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-300">Voice Cooldown</span>
              <span className="font-mono tabular-nums text-slate-400">
                {calibration.alertCooldownSec}s
              </span>
            </div>
            <input
              type="range"
              min={3}
              max={10}
              step={1}
              value={calibration.alertCooldownSec}
              onChange={(e) =>
                onUpdateCalibration({
                  alertCooldownSec: Number(e.target.value),
                })
              }
              className="cockpit-slider w-full"
            />
          </div>
        </div>

        <div className="space-y-1.5 pt-1 text-xs text-slate-300">
          <label className="flex items-center justify-between cursor-pointer">
            <span>Show ROI Calibration Guides</span>
            <input
              type="checkbox"
              checked={calibration.showCalibrationOverlay}
              onChange={(e) =>
                onUpdateCalibration({
                  showCalibrationOverlay: e.target.checked,
                })
              }
              className="h-4 w-4 accent-cyan-500"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span>Lane Corridor Overlay</span>
            <input
              type="checkbox"
              checked={calibration.showLaneOverlay}
              onChange={(e) =>
                onUpdateCalibration({ showLaneOverlay: e.target.checked })
              }
              className="h-4 w-4 accent-cyan-500"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span>Object &amp; TTC Boxes</span>
            <input
              type="checkbox"
              checked={calibration.showNeuralBoxes}
              onChange={(e) =>
                onUpdateCalibration({ showNeuralBoxes: e.target.checked })
              }
              className="h-4 w-4 accent-cyan-500"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span>Speed Breaker / Pothole Markers</span>
            <input
              type="checkbox"
              checked={calibration.showSurfaceOverlay}
              onChange={(e) =>
                onUpdateCalibration({ showSurfaceOverlay: e.target.checked })
              }
              className="h-4 w-4 accent-cyan-500"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer">
            <span>Mirror Camera for Windshield</span>
            <input
              type="checkbox"
              checked={calibration.hudMirror}
              onChange={(e) =>
                onUpdateCalibration({ hudMirror: e.target.checked })
              }
              className="h-4 w-4 accent-cyan-500"
            />
          </label>
        </div>
      </div>
    </aside>
  );
}
