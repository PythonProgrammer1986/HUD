import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import {
  AccuracyProfile,
  ActiveAlert,
  CalibrationConfig,
  DetectedObject,
  HazardSeverity,
  IndianObjectLabel,
  LaneDetectionState,
  ModelLoadState,
  SignDetection,
  SurfaceHazard,
  TurnSignalState,
  VisionFrameResult,
} from '../types/adas';

interface TrackedState {
  trackId: number;
  rawClass: string;
  indianLabel: IndianObjectLabel;
  source: 'neural' | 'motion';
  bbox: [number, number, number, number];
  confidence: number;
  smoothH: number;
  smoothCx: number;
  dHdt: number;
  lateralVelocity: number;
  lastSeenAt: number;
  wrongSideFrames: number;
  confirmedFrames: number;
  missedFrames: number;
}

interface RawCandidate {
  rawClass: string;
  source: 'neural' | 'motion';
  bbox: [number, number, number, number];
  confidence: number;
}

interface SurfaceCandidate {
  type: 'speed_breaker' | 'pothole';
  xNorm: number;
  yNorm: number;
  widthNorm: number;
  heightNorm: number;
  confidence: number;
  framesPersisted: number;
  lastSeenFrame: number;
}

const PROC_W = 320;
const PROC_H = 180;
const NEURAL_W_HIGH = 512;
const NEURAL_H_HIGH = 288;
const NEURAL_W_BALANCED = 384;
const NEURAL_H_BALANCED = 216;

const CLASS_HEIGHT_CONSTANT: Record<IndianObjectLabel, number> = {
  'Two-Wheeler': 2.25,
  'Auto-Rickshaw': 2.55,
  'Car / SUV': 2.5,
  'Heavy Vehicle': 3.6,
  Pedestrian: 2.15,
  'Stray Cattle': 2.2,
  Bicycle: 2.05,
  'Road Obstacle': 2.4,
};

function computeIoU(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const ax1 = a[0];
  const ay1 = a[1];
  const ax2 = a[0] + a[2];
  const ay2 = a[1] + a[3];

  const bx1 = b[0];
  const by1 = b[1];
  const bx2 = b[0] + b[2];
  const by2 = b[1] + b[3];

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

export class OnDeviceVisionPipeline {
  private model: cocoSsd.ObjectDetection | null = null;
  private modelState: ModelLoadState = 'idle';
  private activeProfile: AccuracyProfile = 'high_accuracy';
  private backendName = 'cpu';

  private procCanvas: HTMLCanvasElement;
  private procCtx: CanvasRenderingContext2D;
  private neuralCanvas: HTMLCanvasElement;
  private neuralCtx: CanvasRenderingContext2D;

  private isInferring = false;
  private lastNeuralCandidates: RawCandidate[] = [];
  private lastNeuralAt = 0;

  private tracks: TrackedState[] = [];
  private nextTrackId = 1;
  private frameCounter = 0;
  private lastFrameTime = performance.now();
  private smoothedFps = 30;

  private smoothLeftLane: { xTop: number; xBot: number; conf: number } | null = null;
  private smoothRightLane: { xTop: number; xBot: number; conf: number } | null = null;
  private smoothCenterOffset = 0;
  private surfaceMemory: SurfaceCandidate[] = [];
  private onStateChangeCb?: (state: ModelLoadState, backend: string) => void;

  constructor() {
    this.procCanvas = document.createElement('canvas');
    this.procCanvas.width = PROC_W;
    this.procCanvas.height = PROC_H;
    const ctx = this.procCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to create offscreen processing canvas context.');
    }
    this.procCtx = ctx;

    this.neuralCanvas = document.createElement('canvas');
    this.neuralCanvas.width = NEURAL_W_HIGH;
    this.neuralCanvas.height = NEURAL_H_HIGH;
    const nCtx = this.neuralCanvas.getContext('2d', { willReadFrequently: false });
    if (!nCtx) {
      throw new Error('Failed to create neural inference canvas context.');
    }
    this.neuralCtx = nCtx;
  }

  public getModelState(): { state: ModelLoadState; backend: string } {
    return { state: this.modelState, backend: this.backendName };
  }

  public async initModel(
    onStateChange?: (state: ModelLoadState, backend: string) => void,
    profile: AccuracyProfile = 'high_accuracy'
  ): Promise<void> {
    if (onStateChange) this.onStateChangeCb = onStateChange;
    if (
      (this.modelState === 'loading' || this.modelState === 'ready') &&
      this.activeProfile === profile
    ) {
      return;
    }

    this.activeProfile = profile;
    this.neuralCanvas.width =
      profile === 'high_accuracy' ? NEURAL_W_HIGH : NEURAL_W_BALANCED;
    this.neuralCanvas.height =
      profile === 'high_accuracy' ? NEURAL_H_HIGH : NEURAL_H_BALANCED;

    this.modelState = 'loading';
    this.onStateChangeCb?.('loading', this.backendName);

    try {
      await tf.ready();
      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      this.backendName = tf.getBackend() || 'cpu';

      const base = profile === 'high_accuracy' ? 'mobilenet_v2' : 'lite_mobilenet_v2';
      const loaded = await cocoSsd.load({ base });
      this.model?.dispose();
      this.model = loaded;
      this.modelState = 'ready';
      this.onStateChangeCb?.('ready', this.backendName);
    } catch {
      // Fallback gracefully if model weights cannot be fetched
      this.model = null;
      this.modelState = 'fallback';
      this.backendName = 'canvas-cv';
      this.onStateChangeCb?.('fallback', this.backendName);
    }
  }

  public setAccuracyProfile(profile: AccuracyProfile): void {
    if (profile !== this.activeProfile) {
      void this.initModel(this.onStateChangeCb, profile);
    }
  }

  public resetTracking(): void {
    this.tracks = [];
    this.surfaceMemory = [];
    this.smoothLeftLane = null;
    this.smoothRightLane = null;
    this.smoothCenterOffset = 0;
    this.lastNeuralCandidates = [];
  }

  public processFrame(
    source: HTMLVideoElement | HTMLCanvasElement,
    config: CalibrationConfig,
    currentSpeedKmh: number,
    speedLimitKmh: number,
    turnSignal: TurnSignalState
  ): VisionFrameResult {
    if (config.accuracyProfile !== this.activeProfile) {
      this.setAccuracyProfile(config.accuracyProfile);
    }

    const tStart = performance.now();
    this.frameCounter++;
    const dtSec = Math.max(0.016, Math.min(0.15, (tStart - this.lastFrameTime) / 1000));
    this.lastFrameTime = tStart;
    const instFps = 1 / dtSec;
    this.smoothedFps = this.smoothedFps * 0.88 + instFps * 0.12;

    // 1. Draw compact 320x180 frame for deterministic pixel CV
    this.procCtx.drawImage(source, 0, 0, PROC_W, PROC_H);
    const imgData = this.procCtx.getImageData(0, 0, PROC_W, PROC_H);
    const pixels = imgData.data;

    // 2. Non-blocking higher-resolution TF.js COCO-SSD inference
    const neuralInterval = config.accuracyProfile === 'high_accuracy' ? 95 : 130;
    if (this.model && !this.isInferring && tStart - this.lastNeuralAt > neuralInterval) {
      this.isInferring = true;
      this.lastNeuralAt = tStart;
      const nw = this.neuralCanvas.width;
      const nh = this.neuralCanvas.height;
      this.neuralCtx.drawImage(source, 0, 0, nw, nh);

      const minScore = Math.max(0.26, 0.58 - config.sensitivity * 0.34);
      this.model
        .detect(this.neuralCanvas, 15, minScore)
        .then((preds) => {
          this.lastNeuralCandidates = preds
            .filter((p) =>
              [
                'person',
                'bicycle',
                'car',
                'motorcycle',
                'bus',
                'truck',
                'cow',
                'horse',
                'sheep',
                'dog',
              ].includes(p.class)
            )
            .map((p) => ({
              rawClass: p.class,
              source: 'neural' as const,
              bbox: [
                Math.max(0, p.bbox[0] / nw),
                Math.max(0, p.bbox[1] / nh),
                Math.min(1, p.bbox[2] / nw),
                Math.min(1, p.bbox[3] / nh),
              ],
              confidence: p.score,
            }));
        })
        .catch(() => {
          // Ignore transient inference frame error
        })
        .finally(() => {
          this.isInferring = false;
        });
    }

    // 3. Lane Departure Detection (Adaptive Contrast + Symmetric Ridge + 2-Pass IRLS)
    const lanes = this.detectLanes(pixels, config, turnSignal);

    // 4. Deterministic Road-ROI Foreground Obstacle Detector (catches auto-rickshaws & non-COCO vehicles)
    const roiObstacles = this.detectRoadForegroundObstacles(pixels, config);

    // Fuse neural + ROI candidates via IoU deduplication
    const fusedCandidates: RawCandidate[] = [...this.lastNeuralCandidates];
    for (const roiCand of roiObstacles) {
      const overlapsNeural = this.lastNeuralCandidates.some(
        (n) => computeIoU(n.bbox, roiCand.bbox) > 0.24
      );
      if (!overlapsNeural) {
        fusedCandidates.push(roiCand);
      }
    }

    // 5. Update Coasting Temporal IoU Tracker (TTC, Dynamic Lane Corridor, Wrong-Side, Cut-In)
    const objects = this.updateTracker(
      fusedCandidates,
      pixels,
      config,
      lanes,
      dtSec,
      tStart
    );

    // 6. Vehicle-Masked Unmarked Speed Breaker & Pothole Surface Scanner
    const surfaceHazards = this.detectSurfaceHazards(pixels, config, objects);

    // 7. Red-Ring Circular Speed Limit Sign ROI Scanner
    const signDetection = this.detectRedSpeedSign(pixels);

    // 8. Build Prioritized Alerts
    const activeAlerts = this.buildActiveAlerts(
      objects,
      lanes,
      surfaceHazards,
      currentSpeedKmh,
      speedLimitKmh
    );

    const inferenceMs = Math.max(1, performance.now() - tStart);

    return {
      objects,
      lanes,
      surfaceHazards,
      signDetection,
      activeAlerts,
      inferenceMs,
      fps: Math.round(this.smoothedFps),
      backend: this.backendName,
    };
  }

  private classifyIndianObject(
    cand: RawCandidate,
    pixels: Uint8ClampedArray
  ): IndianObjectLabel {
    const [bx, by, bw, bh] = cand.bbox;
    const aspect = bw / Math.max(0.01, bh);

    if (cand.rawClass === 'motorcycle') return 'Two-Wheeler';
    if (cand.rawClass === 'bicycle') return 'Bicycle';
    if (cand.rawClass === 'person') return 'Pedestrian';
    if (['cow', 'horse', 'sheep', 'dog'].includes(cand.rawClass)) return 'Stray Cattle';
    if (cand.rawClass === 'bus' || cand.rawClass === 'truck') return 'Heavy Vehicle';

    // Sample lower 45% (body) and upper 40% (canopy) for Auto-Rickshaw vs Two-Wheeler vs Cattle
    const x0 = Math.max(0, Math.floor(bx * PROC_W));
    const x1 = Math.min(PROC_W - 1, Math.floor((bx + bw) * PROC_W));
    const y0 = Math.max(0, Math.floor((by + bh * 0.42) * PROC_H));
    const y1 = Math.min(PROC_H - 1, Math.floor((by + bh * 0.88) * PROC_H));

    let yellowCount = 0;
    let redCount = 0;
    let brightNeutralCount = 0;
    let sampleCount = 0;

    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const idx = (y * PROC_W + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        sampleCount++;
        if (r > 150 && g > 115 && b < 95) yellowCount++;
        if (r > 155 && g < 85 && b < 85) redCount++;
        if (r > 175 && g > 170 && b > 160 && Math.abs(r - b) < 25) brightNeutralCount++;
      }
    }

    let darkCanopyCount = 0;
    let topSamples = 0;
    const ty0 = Math.max(0, Math.floor(by * PROC_H));
    const ty1 = Math.min(PROC_H - 1, Math.floor((by + bh * 0.42) * PROC_H));
    for (let y = ty0; y <= ty1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const idx = (y * PROC_W + x) * 4;
        const luma =
          pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
        topSamples++;
        if (luma < 60) darkCanopyCount++;
      }
    }

    const yellowRatio = sampleCount > 0 ? yellowCount / sampleCount : 0;
    const redRatio = sampleCount > 0 ? redCount / sampleCount : 0;
    const lightRatio = sampleCount > 0 ? brightNeutralCount / sampleCount : 0;
    const darkCanopyRatio = topSamples > 0 ? darkCanopyCount / topSamples : 0;

    if (
      (yellowRatio > 0.12 && aspect >= 0.55 && aspect <= 1.25) ||
      (yellowRatio > 0.08 && darkCanopyRatio > 0.35 && aspect <= 1.15)
    ) {
      return 'Auto-Rickshaw';
    }
    if (aspect < 0.72) {
      return redRatio > 0.1 ? 'Two-Wheeler' : 'Two-Wheeler';
    }
    if (cand.rawClass === 'roi_obstacle' && lightRatio > 0.28 && aspect > 0.85 && aspect < 1.38) {
      return 'Stray Cattle';
    }
    if (cand.rawClass === 'car') return 'Car / SUV';
    return 'Car / SUV';
  }

  private detectRoadForegroundObstacles(
    pixels: Uint8ClampedArray,
    config: CalibrationConfig
  ): RawCandidate[] {
    const yStart = Math.max(10, Math.floor((config.horizonY - 0.1) * PROC_H));
    const yEnd = Math.min(PROC_H - 12, Math.floor((config.hoodY - 0.06) * PROC_H));
    const xStart = Math.floor(PROC_W * 0.1);
    const xEnd = Math.floor(PROC_W * 0.9);

    // Estimate road asphalt baseline luminance from lower-center strip
    let roadSum = 0;
    let roadCount = 0;
    const baseY0 = Math.floor((config.horizonY + (config.hoodY - config.horizonY) * 0.58) * PROC_H);
    const baseY1 = Math.floor((config.hoodY - 0.08) * PROC_H);
    for (let y = baseY0; y < baseY1; y += 3) {
      for (let x = Math.floor(PROC_W * 0.36); x < Math.floor(PROC_W * 0.64); x += 4) {
        const idx = (y * PROC_W + x) * 4;
        roadSum += pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
        roadCount++;
      }
    }
    const roadMean = roadCount > 0 ? roadSum / roadCount : 42;

    const cols = 42;
    const colW = (xEnd - xStart) / cols;
    const activeCols: { col: number; minY: number; maxY: number; density: number }[] = [];

    for (let c = 0; c < cols; c++) {
      const cx0 = Math.floor(xStart + c * colW);
      const cx1 = Math.floor(cx0 + colW);
      let hits = 0;
      let total = 0;
      let minY = yEnd;
      let maxY = yStart;

      for (let y = yStart; y < yEnd; y += 2) {
        let rowHit = false;
        for (let x = cx0; x < cx1; x += 2) {
          const idx = (y * PROC_W + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const luma = r * 0.299 + g * 0.587 + b * 0.114;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);

          // Also measure local horizontal gradient to catch dark/silver neutral vehicles
          const rIdx = (y * PROC_W + Math.min(PROC_W - 1, x + 2)) * 4;
          const rLuma =
            pixels[rIdx] * 0.299 + pixels[rIdx + 1] * 0.587 + pixels[rIdx + 2] * 0.114;
          const hEdge = Math.abs(luma - rLuma);

          const isVehicleSignal =
            (chroma > 26 && Math.abs(luma - roadMean) > 14) ||
            (y < config.horizonY * PROC_H + 14 && luma < 72 && chroma < 24) ||
            (luma > roadMean + 42 && chroma > 16) ||
            (hEdge > 28 && Math.abs(luma - roadMean) > 20 && y < config.hoodY * PROC_H - 18);

          if (isVehicleSignal) {
            rowHit = true;
            break;
          }
        }
        total++;
        if (rowHit) {
          hits++;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      const density = total > 0 ? hits / total : 0;
      const spanH = maxY - minY;
      if (density > 0.15 && spanH > 16 && maxY > config.horizonY * PROC_H + 4) {
        activeCols.push({ col: c, minY, maxY, density });
      }
    }

    const boxes: RawCandidate[] = [];
    let group: typeof activeCols = [];
    for (let i = 0; i < activeCols.length; i++) {
      const curr = activeCols[i];
      if (group.length === 0 || curr.col - group[group.length - 1].col <= 1) {
        group.push(curr);
      } else {
        this.pushGroupBox(group, xStart, colW, boxes);
        group = [curr];
      }
    }
    if (group.length > 0) {
      this.pushGroupBox(group, xStart, colW, boxes);
    }

    return boxes.slice(0, 6);
  }

  private pushGroupBox(
    group: { col: number; minY: number; maxY: number; density: number }[],
    xStart: number,
    colW: number,
    out: RawCandidate[]
  ): void {
    if (group.length < 2) return;
    const minCol = group[0].col;
    const maxCol = group[group.length - 1].col;
    const minY = Math.min(...group.map((g) => g.minY));
    const maxY = Math.max(...group.map((g) => g.maxY));
    const x = (xStart + minCol * colW) / PROC_W;
    const w = ((maxCol - minCol + 1) * colW) / PROC_W;
    const y = minY / PROC_H;
    const h = (maxY - minY) / PROC_H;

    if (w > 0.45 && h < 0.14) return;
    if (h < 0.09 || w < 0.035) return;

    const avgDensity = group.reduce((s, g) => s + g.density, 0) / group.length;
    out.push({
      rawClass: 'roi_obstacle',
      source: 'motion',
      bbox: [x, y, w, h],
      confidence: Math.min(0.89, 0.52 + avgDensity * 0.7),
    });
  }

  private updateTracker(
    candidates: RawCandidate[],
    pixels: Uint8ClampedArray,
    config: CalibrationConfig,
    lanes: LaneDetectionState,
    dtSec: number,
    now: number
  ): DetectedObject[] {
    const matchedTrackIds = new Set<number>();
    const nextTracks: TrackedState[] = [];

    for (const cand of candidates) {
      const indianLabel = this.classifyIndianObject(cand, pixels);
      const cx = cand.bbox[0] + cand.bbox[2] * 0.5;
      const h = cand.bbox[3];

      let bestTrack: TrackedState | null = null;
      let bestScore = 0;

      for (const tr of this.tracks) {
        if (matchedTrackIds.has(tr.trackId)) continue;
        // Predict track forward using velocity for tighter IoU matching
        const predCx = tr.smoothCx + tr.lateralVelocity * dtSec;
        const iou = computeIoU(tr.bbox, cand.bbox);
        const dist = Math.abs(cx - predCx);
        const score = iou > 0.16 ? iou : dist < 0.085 ? 0.22 - dist : 0;
        if (score > bestScore) {
          bestScore = score;
          bestTrack = tr;
        }
      }

      if (bestTrack) {
        matchedTrackIds.add(bestTrack.trackId);
        const rawDHdt = (h - bestTrack.smoothH) / dtSec;
        const rawLatVel = (cx - bestTrack.smoothCx) / dtSec;
        const smoothH = bestTrack.smoothH * 0.62 + h * 0.38;
        const smoothCx = bestTrack.smoothCx * 0.58 + cx * 0.42;
        const dHdt = bestTrack.dHdt * 0.72 + rawDHdt * 0.28;
        const lateralVelocity = bestTrack.lateralVelocity * 0.65 + rawLatVel * 0.35;

        // Smooth bounding box coordinates to eliminate HUD jitter
        const sb: [number, number, number, number] = [
          bestTrack.bbox[0] * 0.45 + cand.bbox[0] * 0.55,
          bestTrack.bbox[1] * 0.45 + cand.bbox[1] * 0.55,
          bestTrack.bbox[2] * 0.45 + cand.bbox[2] * 0.55,
          bestTrack.bbox[3] * 0.45 + cand.bbox[3] * 0.55,
        ];

        const hasHeadlightOrRedOncoming = this.hasOncomingSignal(sb, pixels);
        const inRightCorridor = cx >= 0.45 && cx <= 0.74;
        const rapidApproach = dHdt > 0.028;
        const wrongSideFrames =
          inRightCorridor && (rapidApproach || hasHeadlightOrRedOncoming)
            ? bestTrack.wrongSideFrames + 1
            : Math.max(0, bestTrack.wrongSideFrames - 1);

        nextTracks.push({
          trackId: bestTrack.trackId,
          rawClass: cand.source === 'neural' ? cand.rawClass : bestTrack.rawClass,
          indianLabel: cand.source === 'neural' ? indianLabel : bestTrack.indianLabel,
          source: cand.source === 'neural' ? 'neural' : bestTrack.source,
          bbox: sb,
          confidence: Math.max(cand.confidence, bestTrack.confidence * 0.92),
          smoothH,
          smoothCx,
          dHdt,
          lateralVelocity,
          lastSeenAt: now,
          wrongSideFrames,
          confirmedFrames: bestTrack.confirmedFrames + 1,
          missedFrames: 0,
        });
      } else {
        nextTracks.push({
          trackId: this.nextTrackId++,
          rawClass: cand.rawClass,
          indianLabel,
          source: cand.source,
          bbox: cand.bbox,
          confidence: cand.confidence,
          smoothH: h,
          smoothCx: cx,
          dHdt: 0,
          lateralVelocity: 0,
          lastSeenAt: now,
          wrongSideFrames: 0,
          confirmedFrames: 1,
          missedFrames: 0,
        });
      }
    }

    // Coast recently lost confirmed tracks for up to 4 frames to survive transient occlusions
    for (const tr of this.tracks) {
      if (matchedTrackIds.has(tr.trackId)) continue;
      if (tr.confirmedFrames >= 2 && tr.missedFrames < 4) {
        const predCx = Math.max(0.05, Math.min(0.95, tr.smoothCx + tr.lateralVelocity * dtSec));
        const predH = Math.max(0.04, Math.min(0.8, tr.smoothH + tr.dHdt * dtSec));
        const dx = predCx - tr.smoothCx;
        nextTracks.push({
          ...tr,
          bbox: [
            Math.max(0, Math.min(0.95, tr.bbox[0] + dx)),
            tr.bbox[1],
            tr.bbox[2],
            predH,
          ],
          smoothCx: predCx,
          smoothH: predH,
          missedFrames: tr.missedFrames + 1,
          confidence: tr.confidence * 0.9,
        });
      }
    }

    this.tracks = nextTracks;

    const evalCorridorBounds = (yBottom: number): [number, number] => {
      if (lanes.leftLine && lanes.rightLine) {
        const l = lanes.leftLine;
        const r = lanes.rightLine;
        const tL = Math.max(0, Math.min(1, (yBottom - l.y2) / Math.max(0.05, l.y1 - l.y2)));
        const tR = Math.max(0, Math.min(1, (yBottom - r.y2) / Math.max(0.05, r.y1 - r.y2)));
        const lx = l.x2 + (l.x1 - l.x2) * tL;
        const rx = r.x2 + (r.x1 - r.x2) * tR;
        if (rx - lx > 0.12) {
          return [lx - 0.02, rx + 0.02];
        }
      }
      const fallbackHalf = config.laneWidthNorm * 0.42;
      return [0.5 - fallbackHalf, 0.5 + fallbackHalf];
    };

    return this.tracks
      .filter((tr) => tr.source === 'neural' || tr.confirmedFrames >= 2)
      .map((tr) => {
        const k = CLASS_HEIGHT_CONSTANT[tr.indianLabel] ?? 2.4;
        const distanceMeters = Math.max(
          2.5,
          Math.min(85, Number((k / Math.max(0.04, tr.smoothH)).toFixed(1)))
        );

        const ttcSeconds =
          tr.dHdt > 0.014 ? Number(Math.min(12, tr.smoothH / tr.dHdt).toFixed(1)) : null;

        const cx = tr.smoothCx;
        const yBot = tr.bbox[1] + tr.bbox[3];
        const [corrLeft, corrRight] = evalCorridorBounds(yBot);
        const inEgoCorridor = cx >= corrLeft && cx <= corrRight;

        const isWrongSide =
          tr.wrongSideFrames >= 3 &&
          (tr.indianLabel === 'Two-Wheeler' ||
            tr.indianLabel === 'Auto-Rickshaw' ||
            tr.indianLabel === 'Car / SUV');

        const movingInwardFromLeft = cx < 0.48 && tr.lateralVelocity > 0.06;
        const movingInwardFromRight = cx > 0.52 && tr.lateralVelocity < -0.06;
        const isCutIn =
          tr.confirmedFrames >= 2 &&
          (movingInwardFromLeft || movingInwardFromRight) &&
          distanceMeters < 26 &&
          cx >= corrLeft - 0.16 &&
          cx <= corrRight + 0.16;

        let risk: HazardSeverity = 'nominal';
        if (
          isWrongSide ||
          (tr.confirmedFrames >= 2 &&
            inEgoCorridor &&
            ((ttcSeconds !== null && ttcSeconds < 2.1) || distanceMeters < 10.5)) ||
          (isCutIn && distanceMeters < 16)
        ) {
          risk = 'critical';
        } else if (
          isCutIn ||
          (inEgoCorridor && distanceMeters < 20) ||
          (tr.indianLabel === 'Stray Cattle' && distanceMeters < 28)
        ) {
          risk = 'caution';
        }

        return {
          trackId: tr.trackId,
          rawClass: tr.rawClass,
          indianLabel: tr.indianLabel,
          source: tr.source,
          bbox: tr.bbox,
          confidence: tr.confidence,
          distanceMeters,
          ttcSeconds,
          lateralVelocity: tr.lateralVelocity,
          inEgoCorridor,
          isWrongSide,
          isCutIn,
          risk,
          confirmedFrames: tr.confirmedFrames,
        };
      });
  }

  private hasOncomingSignal(
    bbox: [number, number, number, number],
    pixels: Uint8ClampedArray
  ): boolean {
    const x0 = Math.max(0, Math.floor((bbox[0] + bbox[2] * 0.2) * PROC_W));
    const x1 = Math.min(PROC_W - 1, Math.floor((bbox[0] + bbox[2] * 0.8) * PROC_W));
    const y0 = Math.max(0, Math.floor((bbox[1] + bbox[3] * 0.18) * PROC_H));
    const y1 = Math.min(PROC_H - 1, Math.floor((bbox[1] + bbox[3] * 0.72) * PROC_H));

    let headlightOrWarning = 0;
    let total = 0;
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const idx = (y * PROC_W + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        total++;
        if ((r > 225 && g > 215 && b > 135) || (r > 180 && g < 75 && b < 75)) {
          headlightOrWarning++;
        }
      }
    }
    return total > 0 && headlightOrWarning / total > 0.07;
  }

  private detectLanes(
    pixels: Uint8ClampedArray,
    config: CalibrationConfig,
    turnSignal: TurnSignalState
  ): LaneDetectionState {
    const yTop = Math.floor((config.horizonY + 0.04) * PROC_H);
    const yBot = Math.floor((config.hoodY - 0.05) * PROC_H);

    const leftPts: { x: number; y: number }[] = [];
    const rightPts: { x: number; y: number }[] = [];

    for (let y = yTop; y <= yBot; y += 2) {
      const progress = (y - yTop) / Math.max(1, yBot - yTop);
      const halfSpan = Math.floor(PROC_W * (0.14 + progress * 0.34));
      const xMin = Math.max(5, Math.floor(PROC_W * 0.5 - halfSpan));
      const xMax = Math.min(PROC_W - 6, Math.floor(PROC_W * 0.5 + halfSpan));

      // Per-row local asphalt baseline in center 30% of lane
      let rowSum = 0;
      let rowCount = 0;
      const cMin = Math.floor(PROC_W * 0.38);
      const cMax = Math.floor(PROC_W * 0.62);
      for (let rx = cMin; rx <= cMax; rx += 6) {
        const rIdx = (y * PROC_W + rx) * 4;
        rowSum +=
          pixels[rIdx] * 0.299 + pixels[rIdx + 1] * 0.587 + pixels[rIdx + 2] * 0.114;
        rowCount++;
      }
      const rowRoadMean = rowCount > 0 ? rowSum / rowCount : 45;
      const adaptiveWhiteThreshold = Math.max(92, rowRoadMean + 38);

      for (let x = xMin; x <= xMax; x += 2) {
        const idx = (y * PROC_W + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const luma = r * 0.299 + g * 0.587 + b * 0.114;

        const isAdaptiveWhite = luma > adaptiveWhiteThreshold && Math.abs(r - b) < 38;
        const isYellowLine = r > 140 && g > 120 && b < 105 && r - b > 36;
        if (!isAdaptiveWhite && !isYellowLine) continue;

        // Symmetric Ridge (Top-Hat) Filter: bright line flanked by darker asphalt on BOTH sides
        const leftIdx = (y * PROC_W + (x - 4)) * 4;
        const rightIdx = (y * PROC_W + (x + 4)) * 4;
        const lL =
          pixels[leftIdx] * 0.299 + pixels[leftIdx + 1] * 0.587 + pixels[leftIdx + 2] * 0.114;
        const lR =
          pixels[rightIdx] * 0.299 + pixels[rightIdx + 1] * 0.587 + pixels[rightIdx + 2] * 0.114;

        const ridgeScore = 2 * luma - lL - lR;
        if ((luma - lL > 20 && luma - lR > 20) || ridgeScore > 46) {
          if (x < PROC_W * 0.5) {
            leftPts.push({ x, y });
          } else {
            rightPts.push({ x, y });
          }
        }
      }
    }

    const fitLine = (
      pts: { x: number; y: number }[],
      expectedSign: -1 | 1
    ): { xTop: number; xBot: number; conf: number } | null => {
      if (pts.length < 7) return null;

      const regress = (subset: { x: number; y: number }[]) => {
        let sumY = 0;
        let sumX = 0;
        let sumYY = 0;
        let sumXY = 0;
        for (const p of subset) {
          sumY += p.y;
          sumX += p.x;
          sumYY += p.y * p.y;
          sumXY += p.x * p.y;
        }
        const n = subset.length;
        const denom = n * sumYY - sumY * sumY;
        if (Math.abs(denom) < 1e-4) return null;
        const m = (n * sumXY - sumX * sumY) / denom;
        const c = (sumX - m * sumY) / n;
        return { m, c };
      };

      const pass1 = regress(pts);
      if (!pass1) return null;

      // Pass 2: Iterative outlier rejection (tighten residual to 9px)
      const inliers1 = pts.filter((p) => Math.abs(p.x - (pass1.m * p.y + pass1.c)) < 11);
      if (inliers1.length < 6) return null;
      const pass2 = regress(inliers1);
      if (!pass2) return null;

      if (expectedSign === -1 && (pass2.m > -0.2 || pass2.m < -2.45)) return null;
      if (expectedSign === 1 && (pass2.m < 0.2 || pass2.m > 2.45)) return null;

      const inliers2 = inliers1.filter((p) => Math.abs(p.x - (pass2.m * p.y + pass2.c)) < 7);
      const finalPts = inliers2.length >= 6 ? inliers2 : inliers1;
      const pass3 = regress(finalPts);
      if (!pass3) return null;

      const xTop = (pass3.m * yTop + pass3.c) / PROC_W;
      const xBot = (pass3.m * yBot + pass3.c) / PROC_W;
      if (xTop < 0.05 || xTop > 0.95 || xBot < -0.15 || xBot > 1.15) return null;

      return {
        xTop,
        xBot,
        conf: Math.min(1, finalPts.length / 24),
      };
    };

    let rawLeft = fitLine(leftPts, -1);
    let rawRight = fitLine(rightPts, 1);

    // Lane width sanity validation when both sides fit
    if (rawLeft && rawRight) {
      const botSpan = rawRight.xBot - rawLeft.xBot;
      if (botSpan < 0.22 || botSpan > 0.9) {
        if (rawLeft.conf < rawRight.conf) rawLeft = null;
        else rawRight = null;
      }
    }

    const alpha = 0.26;
    if (rawLeft) {
      this.smoothLeftLane = this.smoothLeftLane
        ? {
            xTop: this.smoothLeftLane.xTop * (1 - alpha) + rawLeft.xTop * alpha,
            xBot: this.smoothLeftLane.xBot * (1 - alpha) + rawLeft.xBot * alpha,
            conf: this.smoothLeftLane.conf * 0.7 + rawLeft.conf * 0.3,
          }
        : rawLeft;
    } else if (this.smoothLeftLane) {
      this.smoothLeftLane.conf *= 0.86;
      if (this.smoothLeftLane.conf < 0.14) this.smoothLeftLane = null;
    }

    if (rawRight) {
      this.smoothRightLane = this.smoothRightLane
        ? {
            xTop: this.smoothRightLane.xTop * (1 - alpha) + rawRight.xTop * alpha,
            xBot: this.smoothRightLane.xBot * (1 - alpha) + rawRight.xBot * alpha,
            conf: this.smoothRightLane.conf * 0.7 + rawRight.conf * 0.3,
          }
        : rawRight;
    } else if (this.smoothRightLane) {
      this.smoothRightLane.conf *= 0.86;
      if (this.smoothRightLane.conf < 0.14) this.smoothRightLane = null;
    }

    const yTopNorm = yTop / PROC_H;
    const yBotNorm = yBot / PROC_H;

    let rawOffset = 0;
    if (this.smoothLeftLane && this.smoothRightLane) {
      const laneCenter = (this.smoothLeftLane.xBot + this.smoothRightLane.xBot) * 0.5;
      const halfWidth = Math.max(0.12, (this.smoothRightLane.xBot - this.smoothLeftLane.xBot) * 0.5);
      rawOffset = Math.max(-1, Math.min(1, (0.5 - laneCenter) / halfWidth));
    } else if (this.smoothLeftLane) {
      const expectedCenter = this.smoothLeftLane.xBot + config.laneWidthNorm * 0.48;
      rawOffset = Math.max(-1, Math.min(1, (0.5 - expectedCenter) / (config.laneWidthNorm * 0.48)));
    } else if (this.smoothRightLane) {
      const expectedCenter = this.smoothRightLane.xBot - config.laneWidthNorm * 0.48;
      rawOffset = Math.max(-1, Math.min(1, (0.5 - expectedCenter) / (config.laneWidthNorm * 0.48)));
    }

    // Smooth lateral offset to prevent chatter across dashed markings
    this.smoothCenterOffset = this.smoothCenterOffset * 0.7 + rawOffset * 0.3;

    const threshold = 0.4 - config.sensitivity * 0.15;
    let departure: 'none' | 'left' | 'right' = 'none';
    if (this.smoothCenterOffset < -threshold && turnSignal !== 'left') {
      departure = 'left';
    } else if (this.smoothCenterOffset > threshold && turnSignal !== 'right') {
      departure = 'right';
    }

    const conf =
      ((this.smoothLeftLane?.conf ?? 0) + (this.smoothRightLane?.conf ?? 0)) * 0.5;

    return {
      leftLine: this.smoothLeftLane
        ? {
            x1: this.smoothLeftLane.xBot,
            y1: yBotNorm,
            x2: this.smoothLeftLane.xTop,
            y2: yTopNorm,
            confidence: this.smoothLeftLane.conf,
          }
        : null,
      rightLine: this.smoothRightLane
        ? {
            x1: this.smoothRightLane.xBot,
            y1: yBotNorm,
            x2: this.smoothRightLane.xTop,
            y2: yTopNorm,
            confidence: this.smoothRightLane.conf,
          }
        : null,
      centerOffset: Number(this.smoothCenterOffset.toFixed(2)),
      departure,
      confidence: Number(conf.toFixed(2)),
    };
  }

  private detectSurfaceHazards(
    pixels: Uint8ClampedArray,
    config: CalibrationConfig,
    objects: DetectedObject[]
  ): SurfaceHazard[] {
    const yStart = Math.floor(
      (config.horizonY + (config.hoodY - config.horizonY) * 0.44) * PROC_H
    );
    const yEnd = Math.floor((config.hoodY - 0.05) * PROC_H);
    const xStart = Math.floor(PROC_W * 0.24);
    const xEnd = Math.floor(PROC_W * 0.76);
    const spanW = xEnd - xStart;

    const isInsideVehicleBox = (pxNorm: number, pyNorm: number): boolean => {
      for (const obj of objects) {
        const [bx, by, bw, bh] = obj.bbox;
        if (
          pxNorm >= bx - 0.02 &&
          pxNorm <= bx + bw + 0.02 &&
          pyNorm >= by &&
          pyNorm <= by + bh + 0.03
        ) {
          return true;
        }
      }
      return false;
    };

    const currentDetections: Omit<SurfaceCandidate, 'framesPersisted' | 'lastSeenFrame'>[] = [];

    // Estimate mean road brightness outside vehicle boxes
    let roadSum = 0;
    let roadSamples = 0;
    for (let y = yStart; y < yEnd; y += 3) {
      const pyNorm = y / PROC_H;
      for (let x = xStart; x < xEnd; x += 4) {
        if (isInsideVehicleBox(x / PROC_W, pyNorm)) continue;
        const idx = (y * PROC_W + x) * 4;
        roadSum += pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
        roadSamples++;
      }
    }
    const roadMean = roadSamples > 0 ? roadSum / roadSamples : 40;

    // 1. Speed breaker scan: wide horizontal 3-band crest/shadow ridge excluding vehicle boxes
    let bestBreakerY = -1;
    let bestBreakerScore = 0;

    for (let y = yStart + 3; y < yEnd - 3; y += 2) {
      const pyNorm = y / PROC_H;
      let horizontalRidgeHits = 0;
      let yellowHits = 0;
      let unmaskedChecks = 0;

      for (let x = xStart; x < xEnd; x += 3) {
        if (isInsideVehicleBox(x / PROC_W, pyNorm)) continue;
        const idx = (y * PROC_W + x) * 4;
        const idxUp = ((y - 2) * PROC_W + x) * 4;
        const idxDn = ((y + 3) * PROC_W + x) * 4;

        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        const lUp =
          pixels[idxUp] * 0.299 + pixels[idxUp + 1] * 0.587 + pixels[idxUp + 2] * 0.114;
        const lDn =
          pixels[idxDn] * 0.299 + pixels[idxDn + 1] * 0.587 + pixels[idxDn + 2] * 0.114;

        // Unmarked speed breaker crest signature: brighter top slope + darker shadow lip underneath
        const hasCrestShadowPair = luma > roadMean + 10 && luma - lDn > 16;
        const vertGrad = Math.abs(lUp - lDn) + Math.abs(luma - lDn);
        if ((vertGrad > 24 && luma > roadMean + 12) || hasCrestShadowPair) {
          horizontalRidgeHits++;
        }
        if (r > 160 && g > 130 && b < 95) {
          yellowHits++;
        }
        unmaskedChecks++;
      }

      if (unmaskedChecks >= 16) {
        const ratio = (horizontalRidgeHits + yellowHits * 0.7) / unmaskedChecks;
        if (ratio > 0.4 && ratio > bestBreakerScore) {
          bestBreakerScore = ratio;
          bestBreakerY = y;
        }
      }
    }

    if (bestBreakerY > 0) {
      const yNorm = bestBreakerY / PROC_H;
      currentDetections.push({
        type: 'speed_breaker',
        xNorm: 0.26,
        yNorm: yNorm - 0.02,
        widthNorm: 0.48,
        heightNorm: 0.045,
        confidence: Math.min(0.96, bestBreakerScore),
      });
    }

    // 2. Adaptive Pothole Scan: dark crater cavity bounded on 4 sides by brighter asphalt rim
    const darkThreshold = Math.min(34, roadMean * 0.54);
    for (let y = yStart + 5; y < yEnd - 5; y += 4) {
      const pyNorm = y / PROC_H;
      for (let x = xStart + 12; x < xEnd - 12; x += 6) {
        const pxNorm = x / PROC_W;
        if (isInsideVehicleBox(pxNorm, pyNorm)) continue;

        const idx = (y * PROC_W + x) * 4;
        const luma =
          pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
        if (luma < darkThreshold) {
          const leftIdx = (y * PROC_W + (x - 10)) * 4;
          const rightIdx = (y * PROC_W + (x + 10)) * 4;
          const topIdx = ((y - 4) * PROC_W + x) * 4;
          const botIdx = ((y + 4) * PROC_W + x) * 4;

          const lL =
            pixels[leftIdx] * 0.299 + pixels[leftIdx + 1] * 0.587 + pixels[leftIdx + 2] * 0.114;
          const lR =
            pixels[rightIdx] * 0.299 + pixels[rightIdx + 1] * 0.587 + pixels[rightIdx + 2] * 0.114;
          const lT =
            pixels[topIdx] * 0.299 + pixels[topIdx + 1] * 0.587 + pixels[topIdx + 2] * 0.114;
          const lB =
            pixels[botIdx] * 0.299 + pixels[botIdx + 1] * 0.587 + pixels[botIdx + 2] * 0.114;

          if (
            lL > roadMean * 1.06 &&
            lR > roadMean * 1.06 &&
            (lT > roadMean * 1.02 || lB > roadMean * 1.02)
          ) {
            const xNorm = (x - 14) / PROC_W;
            const yNorm = (y - 5) / PROC_H;
            const alreadyAdded = currentDetections.some(
              (d) => d.type === 'pothole' && Math.abs(d.yNorm - yNorm) < 0.06
            );
            if (!alreadyAdded) {
              currentDetections.push({
                type: 'pothole',
                xNorm,
                yNorm,
                widthNorm: Math.min(0.16, (spanW / PROC_W) * 0.28),
                heightNorm: 0.05,
                confidence: 0.82,
              });
            }
          }
        }
      }
    }

    // Multi-frame temporal persistence
    const nextMemory: SurfaceCandidate[] = [];
    for (const det of currentDetections) {
      const match = this.surfaceMemory.find(
        (m) =>
          m.type === det.type &&
          Math.abs(m.yNorm - det.yNorm) < 0.09 &&
          Math.abs(m.xNorm - det.xNorm) < 0.15
      );
      if (match) {
        nextMemory.push({
          ...det,
          framesPersisted: match.framesPersisted + 1,
          lastSeenFrame: this.frameCounter,
        });
      } else {
        nextMemory.push({
          ...det,
          framesPersisted: 1,
          lastSeenFrame: this.frameCounter,
        });
      }
    }
    this.surfaceMemory = nextMemory;

    const minFrames = config.sensitivity > 0.72 ? 2 : 3;
    return this.surfaceMemory
      .filter((m) => m.framesPersisted >= minFrames)
      .map((m, i) => {
        const relY = Math.max(
          0.05,
          Math.min(1, (m.yNorm - config.horizonY) / Math.max(0.1, config.hoodY - config.horizonY))
        );
        const distanceMeters = Math.max(3, Math.round(4 + (1 - relY) * 28));
        return {
          id: `${m.type}-${i}-${Math.round(m.yNorm * 100)}`,
          type: m.type,
          xNorm: m.xNorm,
          yNorm: m.yNorm,
          widthNorm: m.widthNorm,
          heightNorm: m.heightNorm,
          distanceMeters,
          confidence: m.confidence,
          framesPersisted: m.framesPersisted,
        };
      });
  }

  private detectRedSpeedSign(pixels: Uint8ClampedArray): SignDetection {
    const regions = [
      { x0: 6, x1: Math.floor(PROC_W * 0.28), y0: 16, y1: Math.floor(PROC_H * 0.5) },
      { x0: Math.floor(PROC_W * 0.72), x1: PROC_W - 6, y0: 16, y1: Math.floor(PROC_H * 0.5) },
    ];

    for (const reg of regions) {
      let minX = reg.x1;
      let maxX = reg.x0;
      let minY = reg.y1;
      let maxY = reg.y0;
      let redHits = 0;

      for (let y = reg.y0; y < reg.y1; y += 2) {
        for (let x = reg.x0; x < reg.x1; x += 2) {
          const idx = (y * PROC_W + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          if (r > 140 && r > g * 1.5 && r > b * 1.5) {
            redHits++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (redHits >= 10) {
        const w = maxX - minX;
        const h = maxY - minY;
        const ratio = w / Math.max(1, h);
        if (w >= 8 && h >= 8 && ratio >= 0.65 && ratio <= 1.45) {
          return {
            detected: true,
            label: 'Mandatory Sign Zone',
            bbox: [
              Math.max(0, (minX - 2) / PROC_W),
              Math.max(0, (minY - 2) / PROC_H),
              (w + 4) / PROC_W,
              (h + 4) / PROC_H,
            ],
            confidence: Math.min(0.94, 0.58 + redHits * 0.015),
          };
        }
      }
    }

    return { detected: false, label: '', bbox: null, confidence: 0 };
  }

  private buildActiveAlerts(
    objects: DetectedObject[],
    lanes: LaneDetectionState,
    surfaceHazards: SurfaceHazard[],
    currentSpeedKmh: number,
    speedLimitKmh: number
  ): ActiveAlert[] {
    const alerts: ActiveAlert[] = [];
    const now = Date.now();

    const wrongSide = objects.find((o) => o.isWrongSide);
    if (wrongSide) {
      alerts.push({
        id: `wrong-${wrongSide.trackId}`,
        category: 'wrong_side',
        severity: 'critical',
        headline: 'WRONG-SIDE VEHICLE ONCOMING',
        subtext: `${wrongSide.indianLabel} at ${wrongSide.distanceMeters}m in right lane`,
        timestamp: now,
      });
    }

    const cutIn = objects.find((o) => o.isCutIn);
    if (cutIn) {
      alerts.push({
        id: `cutin-${cutIn.trackId}`,
        category: 'cut_in',
        severity: cutIn.risk === 'critical' ? 'critical' : 'caution',
        headline: 'SUDDEN LANE CUT-IN',
        subtext: `${cutIn.indianLabel} merging into ego path (${cutIn.distanceMeters}m)`,
        timestamp: now,
      });
    }

    const collisionObj = objects
      .filter((o) => o.inEgoCorridor && o.risk === 'critical' && !o.isWrongSide)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

    if (collisionObj) {
      const isCattle = collisionObj.indianLabel === 'Stray Cattle';
      alerts.push({
        id: `col-${collisionObj.trackId}`,
        category: isCattle ? 'cattle' : 'collision',
        severity: 'critical',
        headline: isCattle ? 'STRAY CATTLE IN PATH' : 'FORWARD COLLISION RISK',
        subtext: `${collisionObj.indianLabel} ${collisionObj.distanceMeters}m${
          collisionObj.ttcSeconds ? ` · TTC ${collisionObj.ttcSeconds}s` : ''
        }`,
        timestamp: now,
      });
    }

    const cattleCaution = objects.find(
      (o) => o.indianLabel === 'Stray Cattle' && o.risk === 'caution'
    );
    if (cattleCaution) {
      alerts.push({
        id: `cattle-${cattleCaution.trackId}`,
        category: 'cattle',
        severity: 'caution',
        headline: 'CATTLE NEAR ROAD SHOULDER',
        subtext: `Keep speed controlled · ${cattleCaution.distanceMeters}m ahead`,
        timestamp: now,
      });
    }

    if (lanes.departure !== 'none') {
      alerts.push({
        id: `ldw-${lanes.departure}`,
        category: 'lane_departure',
        severity: 'caution',
        headline:
          lanes.departure === 'left'
            ? 'LEFT LANE DEPARTURE'
            : 'RIGHT LANE DEPARTURE',
        subtext: `Lateral drift ${Math.round(Math.abs(lanes.centerOffset) * 100)}% from center`,
        timestamp: now,
      });
    }

    const breaker = surfaceHazards.find((s) => s.type === 'speed_breaker');
    if (breaker) {
      alerts.push({
        id: `sb-${breaker.id}`,
        category: 'speed_breaker',
        severity: 'caution',
        headline: 'SPEED BREAKER AHEAD',
        subtext: `Slow down · Hump detected ~${breaker.distanceMeters}m ahead`,
        timestamp: now,
      });
    }

    const pothole = surfaceHazards.find((s) => s.type === 'pothole');
    if (pothole) {
      alerts.push({
        id: `ph-${pothole.id}`,
        category: 'pothole',
        severity: 'caution',
        headline: 'POTHOLE IN EGO PATH',
        subtext: `Surface depression ~${pothole.distanceMeters}m ahead`,
        timestamp: now,
      });
    }

    if (currentSpeedKmh > speedLimitKmh + 5) {
      alerts.push({
        id: 'speed-critical',
        category: 'speed_limit',
        severity: 'critical',
        headline: `SPEED LIMIT ${speedLimitKmh} EXCEEDED`,
        subtext: `Current ${Math.round(currentSpeedKmh)} km/h (+${Math.round(
          currentSpeedKmh - speedLimitKmh
        )} km/h over)`,
        timestamp: now,
      });
    } else if (currentSpeedKmh > speedLimitKmh) {
      alerts.push({
        id: 'speed-caution',
        category: 'speed_limit',
        severity: 'caution',
        headline: `APPROACHING LIMIT (${speedLimitKmh} km/h)`,
        subtext: `Current ${Math.round(currentSpeedKmh)} km/h`,
        timestamp: now,
      });
    }

    return alerts;
  }
}
