import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalibrationSidebar } from './components/CalibrationSidebar';
import { HudViewport } from './components/HudViewport';
import { MethodologyView } from './components/MethodologyView';
import { TelemetryStrip } from './components/TelemetryStrip';
import { TopBar } from './components/TopBar';
import { TripLogView } from './components/TripLogView';
import { alertAudioEngine } from './engine/audioAlerts';
import { IndianRoadSimulator } from './engine/indianRoadSimulator';
import { OnDeviceVisionPipeline } from './engine/visionPipeline';
import {
  ActiveAlert,
  AppView,
  CalibrationConfig,
  DEFAULT_CALIBRATION,
  HazardCategory,
  HazardEventRecord,
  INDIAN_ROAD_PROFILES,
  InputSourceMode,
  ModelLoadState,
  RoadClassId,
  SimulatorControls,
  TurnSignalState,
  VisionFrameResult,
} from './types/adas';

const STORAGE_CALIBRATION_KEY = 'drivesight_india_calibration_v1';
const STORAGE_EVENTS_KEY = 'drivesight_india_events_v1';

const INITIAL_VISION_RESULT: VisionFrameResult = {
  objects: [],
  lanes: {
    leftLine: null,
    rightLine: null,
    centerOffset: 0,
    departure: 'none',
    confidence: 0,
  },
  surfaceHazards: [],
  signDetection: {
    detected: false,
    label: '',
    bbox: null,
    confidence: 0,
  },
  activeAlerts: [],
  inferenceMs: 0,
  fps: 0,
  backend: 'webgl',
};

function getSpokenWarning(alert: ActiveAlert, limitKmh: number): string {
  switch (alert.category) {
    case 'wrong_side':
      return 'Warning. Wrong side vehicle oncoming.';
    case 'cut_in':
      return 'Caution. Sudden lane cut in.';
    case 'collision':
      return 'Brake. Forward collision risk.';
    case 'cattle':
      return 'Caution. Stray cattle on road.';
    case 'lane_departure':
      return alert.headline.includes('LEFT')
        ? 'Left lane departure.'
        : 'Right lane departure.';
    case 'speed_breaker':
      return 'Speed breaker ahead. Slow down.';
    case 'pothole':
      return 'Pothole ahead.';
    case 'speed_limit':
      return `Speed limit ${limitKmh} exceeded.`;
    default:
      return alert.headline;
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('cockpit');
  const [windshieldMode, setWindshieldMode] = useState(false);
  const [sourceMode, setSourceMode] = useState<InputSourceMode>('simulator');
  const [roadClassId, setRoadClassId] = useState<RoadClassId>('state_highway');
  const [turnSignal, setTurnSignal] = useState<TurnSignalState>('none');

  const [calibration, setCalibration] = useState<CalibrationConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CALIBRATION_KEY);
      if (saved) return { ...DEFAULT_CALIBRATION, ...JSON.parse(saved) };
    } catch {
      // Ignore invalid stored config
    }
    return DEFAULT_CALIBRATION;
  });

  const [simControls, setSimControls] = useState<SimulatorControls>({
    scenario: 'mixed_indian_road',
    targetSpeedKmh: 52,
    laneDriftBias: 0,
    paused: false,
  });

  const [eventLog, setEventLog] = useState<HazardEventRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_EVENTS_KEY);
      if (saved) return JSON.parse(saved) as HazardEventRecord[];
    } catch {
      // Ignore invalid stored log
    }
    return [];
  });

  const [modelState, setModelState] = useState<ModelLoadState>('idle');
  const [visionResult, setVisionResult] =
    useState<VisionFrameResult>(INITIAL_VISION_RESULT);

  // Camera & Video Input State
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // Speed Monitoring State
  const [useGpsSpeed, setUseGpsSpeed] = useState(true);
  const [gpsSpeedKmh, setGpsSpeedKmh] = useState<number | null>(null);
  const [manualSpeedKmh, setManualSpeedKmh] = useState(48);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const visionEngineRef = useRef<OnDeviceVisionPipeline | null>(null);
  const simulatorRef = useRef<IndianRoadSimulator | null>(null);
  const lastLogTimeRef = useRef<Map<HazardCategory, number>>(new Map());

  const roadProfile = useMemo(
    () =>
      INDIAN_ROAD_PROFILES.find((r) => r.id === roadClassId) ??
      INDIAN_ROAD_PROFILES[2],
    [roadClassId]
  );

  const currentSpeedKmh =
    sourceMode === 'simulator'
      ? simControls.targetSpeedKmh
      : useGpsSpeed && gpsSpeedKmh !== null
        ? gpsSpeedKmh
        : manualSpeedKmh;

  const speedSourceLabel =
    sourceMode === 'simulator'
      ? 'Simulator Telemetry'
      : useGpsSpeed && gpsSpeedKmh !== null
        ? 'Live GPS Speed'
        : 'Manual / Test Speed';

  // Refs for animation loop so we don't restart RAF on every slider drag
  const loopStateRef = useRef({
    sourceMode,
    calibration,
    simControls,
    currentSpeedKmh,
    limitKmh: roadProfile.limitKmh,
    turnSignal,
  });

  useEffect(() => {
    loopStateRef.current = {
      sourceMode,
      calibration,
      simControls,
      currentSpeedKmh,
      limitKmh: roadProfile.limitKmh,
      turnSignal,
    };
  }, [
    sourceMode,
    calibration,
    simControls,
    currentSpeedKmh,
    roadProfile.limitKmh,
    turnSignal,
  ]);

  // Persist calibration & event log locally
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CALIBRATION_KEY, JSON.stringify(calibration));
    } catch {
      // Ignore quota errors
    }
  }, [calibration]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_EVENTS_KEY,
        JSON.stringify(eventLog.slice(0, 120))
      );
    } catch {
      // Ignore quota errors
    }
  }, [eventLog]);

  // Initialize Vision Pipeline & Neural Model once
  useEffect(() => {
    const pipeline = new OnDeviceVisionPipeline();
    visionEngineRef.current = pipeline;
    simulatorRef.current = new IndianRoadSimulator();

    void pipeline.initModel((state) => {
      setModelState(state);
    }, calibration.accuracyProfile);

    return () => {
      alertAudioEngine.stopAll();
    };
  }, []);

  // Unlock audio on first pointer interaction
  useEffect(() => {
    const unlock = () => alertAudioEngine.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // Live GPS Speed Watch when in Camera/Video mode
  useEffect(() => {
    if (
      sourceMode === 'simulator' ||
      !useGpsSpeed ||
      typeof navigator === 'undefined' ||
      !('geolocation' in navigator)
    ) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (typeof pos.coords.speed === 'number' && pos.coords.speed >= 0) {
          setGpsSpeedKmh(Math.round(pos.coords.speed * 3.6));
        }
      },
      () => {
        setGpsSpeedKmh(null);
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 5000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [sourceMode, useGpsSpeed]);

  // Manage Live Camera Stream
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (sourceMode !== 'camera') {
      stopCameraStream();
      setCameraError(null);
      return;
    }

    let cancelled = false;
    async function startCamera() {
      setCameraError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Browser camera API is unavailable in this context.');
        }

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: selectedCameraId
            ? { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setCameraDevices(videoInputs);
        if (!selectedCameraId && videoInputs[0]) {
          setSelectedCameraId(videoInputs[0].deviceId);
        }

        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.loop = false;
          await videoEl.play();
        }
        visionEngineRef.current?.resetTracking();
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Camera permission was denied or no camera was detected.';
        setCameraError(msg);
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      stopCameraStream();
    };
  }, [sourceMode, selectedCameraId, stopCameraStream]);

  // Manage Uploaded Video Playback
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (sourceMode === 'video') {
      videoEl.srcObject = null;
      if (uploadedVideoUrl) {
        videoEl.src = uploadedVideoUrl;
        videoEl.loop = true;
        videoEl.onloadedmetadata = () => {
          setVideoDuration(videoEl.duration || 0);
          void videoEl.play().then(() => setVideoPlaying(true)).catch(() => {});
        };
        videoEl.ontimeupdate = () => {
          setVideoProgress(videoEl.currentTime || 0);
        };
        visionEngineRef.current?.resetTracking();
      }
    } else if (sourceMode === 'simulator') {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    }
  }, [sourceMode, uploadedVideoUrl]);

  // Main Real-Time Vision & Simulator Loop
  useEffect(() => {
    let rafId = 0;
    let lastSimTime = performance.now();
    let lastCvTime = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);

      const {
        sourceMode: mode,
        calibration: cfg,
        simControls: sim,
        currentSpeedKmh: speed,
        limitKmh: limit,
        turnSignal: sig,
      } = loopStateRef.current;

      const dtSec = Math.max(0.01, (now - lastSimTime) / 1000);
      lastSimTime = now;

      let activeFrameSource: HTMLCanvasElement | HTMLVideoElement | null = null;

      if (mode === 'simulator') {
        const simCanvas = simCanvasRef.current;
        const simEngine = simulatorRef.current;
        if (simCanvas && simEngine) {
          const ctx = simCanvas.getContext('2d');
          if (ctx) {
            simEngine.stepAndRender(
              ctx,
              simCanvas.width,
              simCanvas.height,
              dtSec,
              sim
            );
            activeFrameSource = simCanvas;
          }
        }
      } else {
        const vid = videoRef.current;
        if (vid && vid.readyState >= 2 && vid.videoWidth > 0) {
          activeFrameSource = vid;
        }
      }

      // Run CV pipeline at ~24 FPS (every ~42ms) to keep React HUD crisp
      if (
        activeFrameSource &&
        visionEngineRef.current &&
        now - lastCvTime >= 42
      ) {
        lastCvTime = now;
        const result = visionEngineRef.current.processFrame(
          activeFrameSource,
          cfg,
          speed,
          limit,
          sig
        );
        setVisionResult(result);

        // Dispatch Audio Warnings & Persist Hazard Events (rate-limited)
        for (const alert of result.activeAlerts) {
          const phrase = getSpokenWarning(alert, limit);
          alertAudioEngine.trigger(alert.category, alert.severity, phrase, {
            voiceEnabled: cfg.voiceEnabled,
            chimesEnabled: cfg.chimesEnabled,
            cooldownSec: cfg.alertCooldownSec,
          });

          const lastLogged = lastLogTimeRef.current.get(alert.category) ?? 0;
          if (now - lastLogged >= 3500) {
            lastLogTimeRef.current.set(alert.category, now);
            const record: HazardEventRecord = {
              id: `${alert.id}-${now}`,
              timestamp: now,
              category: alert.category,
              severity: alert.severity,
              title: alert.headline,
              detail: alert.subtext,
              speedKmh: speed,
              metric:
                alert.category === 'lane_departure'
                  ? `${Math.round(Math.abs(result.lanes.centerOffset) * 100)}% drift`
                  : alert.category === 'speed_limit'
                    ? `Cap ${limit} km/h`
                    : `${result.fps} FPS`,
            };
            setEventLog((prev) => [record, ...prev].slice(0, 150));
          }
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleSelectSource = (mode: InputSourceMode) => {
    alertAudioEngine.unlock();
    setSourceMode(mode);
    visionEngineRef.current?.resetTracking();
  };

  const handleVideoUpload = (file: File) => {
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }
    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);
    setSourceMode('video');
  };

  const handleToggleVideoPlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      void vid.play().then(() => setVideoPlaying(true));
    } else {
      vid.pause();
      setVideoPlaying(false);
    }
  };

  const handleSeekVideo = (sec: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = sec;
    setVideoProgress(sec);
  };

  const handleExportCsv = () => {
    if (eventLog.length === 0) return;
    const headers = ['Timestamp', 'Severity', 'Category', 'Title', 'Detail', 'Speed_kmh', 'Metric'];
    const rows = eventLog.map((e) => [
      new Date(e.timestamp).toISOString(),
      e.severity,
      e.category,
      `"${e.title.replace(/"/g, '""')}"`,
      `"${e.detail.replace(/"/g, '""')}"`,
      Math.round(e.speedKmh).toString(),
      `"${e.metric.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `drivesight-india-trip-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#07090E] text-slate-100">
      {!windshieldMode && (
        <TopBar
          activeView={activeView}
          onSelectView={setActiveView}
          windshieldMode={windshieldMode}
          onToggleWindshieldMode={() => {
            alertAudioEngine.unlock();
            setActiveView('cockpit');
            setWindshieldMode((v) => !v);
          }}
        />
      )}

      {activeView === 'cockpit' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {!windshieldMode && (
              <CalibrationSidebar
                sourceMode={sourceMode}
                onSelectSource={handleSelectSource}
                roadClassId={roadClassId}
                onSelectRoadClass={setRoadClassId}
                calibration={calibration}
                onUpdateCalibration={(patch) =>
                  setCalibration((prev) => ({ ...prev, ...patch }))
                }
                onResetCalibration={() => setCalibration(DEFAULT_CALIBRATION)}
                simControls={simControls}
                onUpdateSimControls={(patch) =>
                  setSimControls((prev) => ({ ...prev, ...patch }))
                }
                onInjectSimHazard={(kind) => {
                  alertAudioEngine.unlock();
                  simulatorRef.current?.injectHazard(kind);
                }}
                cameraDevices={cameraDevices}
                selectedCameraId={selectedCameraId}
                onSelectCameraId={setSelectedCameraId}
                onVideoUpload={handleVideoUpload}
                videoPlaying={videoPlaying}
                onToggleVideoPlay={handleToggleVideoPlay}
                videoProgress={videoProgress}
                videoDuration={videoDuration}
                onSeekVideo={handleSeekVideo}
                useGpsSpeed={useGpsSpeed}
                onToggleUseGpsSpeed={setUseGpsSpeed}
                manualSpeedKmh={manualSpeedKmh}
                onChangeManualSpeed={setManualSpeedKmh}
                turnSignal={turnSignal}
                onSetTurnSignal={setTurnSignal}
                onTestAudio={() => alertAudioEngine.playTestBeep('caution')}
              />
            )}

            <HudViewport
              canvasRef={scratchCanvasRef}
              videoRef={videoRef}
              simCanvasRef={simCanvasRef}
              sourceMode={sourceMode}
              visionResult={visionResult}
              calibration={calibration}
              currentSpeedKmh={currentSpeedKmh}
              roadProfile={roadProfile}
              speedSourceLabel={speedSourceLabel}
              modelState={modelState}
              cameraError={cameraError}
              hasUploadedVideo={Boolean(uploadedVideoUrl)}
              windshieldMode={windshieldMode}
              turnSignal={turnSignal}
              onToggleWindshieldMode={() => setWindshieldMode((v) => !v)}
              onToggleMirror={() =>
                setCalibration((prev) => ({
                  ...prev,
                  hudMirror: !prev.hudMirror,
                }))
              }
              onToggleVoice={() =>
                setCalibration((prev) => ({
                  ...prev,
                  voiceEnabled: !prev.voiceEnabled,
                }))
              }
              onSetTurnSignal={setTurnSignal}
              onSwitchToSimulator={() => handleSelectSource('simulator')}
            />
          </div>

          {!windshieldMode && (
            <TelemetryStrip
              visionResult={visionResult}
              eventLog={eventLog}
              onExportCsv={handleExportCsv}
              onClearLog={() => setEventLog([])}
            />
          )}
        </div>
      )}

      {activeView === 'methodology' && !windshieldMode && (
        <MethodologyView onOpenCockpit={() => setActiveView('cockpit')} />
      )}

      {activeView === 'triplog' && !windshieldMode && (
        <TripLogView
          eventLog={eventLog}
          onExportCsv={handleExportCsv}
          onClearLog={() => setEventLog([])}
        />
      )}
    </div>
  );
}
