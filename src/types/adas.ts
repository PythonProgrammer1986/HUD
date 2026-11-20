export type AppView = 'cockpit' | 'methodology' | 'triplog';

export type InputSourceMode = 'simulator' | 'camera' | 'video';

export type CameraFacing = 'environment' | 'user';

export type RoadClassId =
  | 'school'
  | 'urban'
  | 'state_highway'
  | 'national_highway'
  | 'expressway';

export interface RoadClassProfile {
  id: RoadClassId;
  label: string;
  shortLabel: string;
  limitKmh: number;
  description: string;
}

export const INDIAN_ROAD_PROFILES: RoadClassProfile[] = [
  {
    id: 'school',
    label: 'School / Hospital Zone',
    shortLabel: 'School 25',
    limitKmh: 25,
    description: 'Strict pedestrian & speed-breaker zone near schools or hospitals.',
  },
  {
    id: 'urban',
    label: 'City / Municipal Road',
    shortLabel: 'Urban 40',
    limitKmh: 40,
    description: 'Dense mixed traffic with two-wheelers, auto-rickshaws, and intersections.',
  },
  {
    id: 'state_highway',
    label: 'State Highway (SH)',
    shortLabel: 'State Hwy 60',
    limitKmh: 60,
    description: 'Two-lane undivided roads with unmarked speed humps near villages.',
  },
  {
    id: 'national_highway',
    label: 'National Highway (NH)',
    shortLabel: 'Natl Hwy 80',
    limitKmh: 80,
    description: 'Divided carriageways with occasional wrong-side tractors or two-wheelers.',
  },
  {
    id: 'expressway',
    label: 'Expressway (NE)',
    shortLabel: 'Expressway 100',
    limitKmh: 100,
    description: 'Access-controlled high-speed corridor for four-wheelers.',
  },
];

export type HazardSeverity = 'nominal' | 'caution' | 'critical';

export type HazardCategory =
  | 'collision'
  | 'wrong_side'
  | 'cut_in'
  | 'lane_departure'
  | 'speed_breaker'
  | 'pothole'
  | 'speed_limit'
  | 'cattle';

export type IndianObjectLabel =
  | 'Two-Wheeler'
  | 'Auto-Rickshaw'
  | 'Car / SUV'
  | 'Heavy Vehicle'
  | 'Pedestrian'
  | 'Stray Cattle'
  | 'Bicycle'
  | 'Road Obstacle';

export interface DetectedObject {
  trackId: number;
  rawClass: string;
  indianLabel: IndianObjectLabel;
  source: 'neural' | 'motion';
  /** Normalized bounding box [x, y, width, height] in 0..1 viewport coordinates */
  bbox: [number, number, number, number];
  confidence: number;
  distanceMeters: number;
  ttcSeconds: number | null;
  lateralVelocity: number;
  inEgoCorridor: boolean;
  isWrongSide: boolean;
  isCutIn: boolean;
  risk: HazardSeverity;
  confirmedFrames?: number;
}

export interface LaneBoundaryLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

export interface LaneDetectionState {
  leftLine: LaneBoundaryLine | null;
  rightLine: LaneBoundaryLine | null;
  /** Normalized horizontal offset from lane center (-1 left .. 0 center .. +1 right) */
  centerOffset: number;
  departure: 'none' | 'left' | 'right';
  confidence: number;
}

export interface SurfaceHazard {
  id: string;
  type: 'speed_breaker' | 'pothole';
  xNorm: number;
  yNorm: number;
  widthNorm: number;
  heightNorm: number;
  distanceMeters: number;
  confidence: number;
  framesPersisted: number;
}

export interface SignDetection {
  detected: boolean;
  label: string;
  bbox: [number, number, number, number] | null;
  confidence: number;
}

export interface ActiveAlert {
  id: string;
  category: HazardCategory;
  severity: HazardSeverity;
  headline: string;
  subtext: string;
  timestamp: number;
}

export interface VisionFrameResult {
  objects: DetectedObject[];
  lanes: LaneDetectionState;
  surfaceHazards: SurfaceHazard[];
  signDetection: SignDetection;
  activeAlerts: ActiveAlert[];
  inferenceMs: number;
  fps: number;
  backend: string;
}

export type AccuracyProfile = 'balanced' | 'high_accuracy';

export interface CalibrationConfig {
  horizonY: number;
  hoodY: number;
  laneWidthNorm: number;
  sensitivity: number;
  alertCooldownSec: number;
  accuracyProfile: AccuracyProfile;
  voiceEnabled: boolean;
  chimesEnabled: boolean;
  hudMirror: boolean;
  showCalibrationOverlay: boolean;
  showNeuralBoxes: boolean;
  showLaneOverlay: boolean;
  showSurfaceOverlay: boolean;
}

export const DEFAULT_CALIBRATION: CalibrationConfig = {
  horizonY: 0.44,
  hoodY: 0.9,
  laneWidthNorm: 0.48,
  sensitivity: 0.72,
  alertCooldownSec: 5,
  accuracyProfile: 'high_accuracy',
  voiceEnabled: true,
  chimesEnabled: true,
  hudMirror: false,
  showCalibrationOverlay: false,
  showNeuralBoxes: true,
  showLaneOverlay: true,
  showSurfaceOverlay: true,
};

export type SimulatorScenario =
  | 'mixed_indian_road'
  | 'speed_breaker_zone'
  | 'auto_cutin'
  | 'wrong_side_hazard'
  | 'cattle_crossing';

export interface SimulatorControls {
  scenario: SimulatorScenario;
  targetSpeedKmh: number;
  laneDriftBias: number;
  paused: boolean;
}

export interface HazardEventRecord {
  id: string;
  timestamp: number;
  category: HazardCategory;
  severity: HazardSeverity;
  title: string;
  detail: string;
  speedKmh: number;
  metric: string;
}

export type TurnSignalState = 'none' | 'left' | 'right';

export type ModelLoadState = 'idle' | 'loading' | 'ready' | 'fallback';
