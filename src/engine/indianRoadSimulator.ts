import { SimulatorControls, SimulatorScenario } from '../types/adas';

export interface SimActor {
  id: number;
  kind: 'auto' | 'two_wheeler' | 'car' | 'cattle' | 'wrong_side_bike';
  /** z distance ahead in meters (6m .. 75m) */
  z: number;
  /** lateral road position (-1.5 far left shoulder .. 0 ego center .. +1.5 oncoming lane) */
  xLane: number;
  targetXLane: number;
  /** speed relative to ground in km/h (negative = coming toward ego) */
  speedKmh: number;
  widthM: number;
  heightM: number;
  color: string;
}

export interface SimSurfaceFeature {
  id: number;
  kind: 'speed_breaker' | 'pothole';
  marked: boolean;
  z: number;
  xLane: number;
}

export interface SimSign {
  id: number;
  limit: number;
  z: number;
  side: 'left' | 'right';
}

export class IndianRoadSimulator {
  private actors: SimActor[] = [];
  private surfaces: SimSurfaceFeature[] = [];
  private signs: SimSign[] = [];
  private nextId = 1;
  private roadPhase = 0;
  private spawnTimer = 0;
  private surfaceTimer = 0;
  private signTimer = 3.5;
  private currentScenario: SimulatorScenario = 'mixed_indian_road';

  constructor() {
    this.seedScenario('mixed_indian_road');
  }

  public setScenario(scenario: SimulatorScenario): void {
    if (this.currentScenario !== scenario) {
      this.currentScenario = scenario;
      this.seedScenario(scenario);
    }
  }

  public injectHazard(
    kind: 'speed_breaker' | 'pothole' | 'cut_in' | 'wrong_side' | 'cattle'
  ): void {
    if (kind === 'speed_breaker') {
      this.surfaces.push({
        id: this.nextId++,
        kind: 'speed_breaker',
        marked: Math.random() > 0.55,
        z: 36,
        xLane: 0,
      });
    } else if (kind === 'pothole') {
      this.surfaces.push({
        id: this.nextId++,
        kind: 'pothole',
        marked: false,
        z: 34,
        xLane: (Math.random() - 0.5) * 0.45,
      });
    } else if (kind === 'cut_in') {
      this.actors.push({
        id: this.nextId++,
        kind: Math.random() > 0.45 ? 'auto' : 'two_wheeler',
        z: 24,
        xLane: -0.92,
        targetXLane: -0.08,
        speedKmh: 26,
        widthM: 1.35,
        heightM: 1.65,
        color: '#eab308',
      });
    } else if (kind === 'wrong_side') {
      this.actors.push({
        id: this.nextId++,
        kind: 'wrong_side_bike',
        z: 52,
        xLane: 0.28,
        targetXLane: 0.16,
        speedKmh: -38,
        widthM: 0.9,
        heightM: 1.45,
        color: '#ef4444',
      });
    } else if (kind === 'cattle') {
      this.actors.push({
        id: this.nextId++,
        kind: 'cattle',
        z: 38,
        xLane: -1.15,
        targetXLane: 0.15,
        speedKmh: 4,
        widthM: 1.4,
        heightM: 1.35,
        color: '#d6d3d1',
      });
    }
  }

  private seedScenario(scenario: SimulatorScenario): void {
    this.actors = [];
    this.surfaces = [];
    this.signs = [
      { id: this.nextId++, limit: 60, z: 45, side: 'left' },
    ];

    if (scenario === 'mixed_indian_road') {
      this.actors.push(
        {
          id: this.nextId++,
          kind: 'auto',
          z: 30,
          xLane: -0.45,
          targetXLane: -0.15,
          speedKmh: 28,
          widthM: 1.4,
          heightM: 1.7,
          color: '#eab308',
        },
        {
          id: this.nextId++,
          kind: 'car',
          z: 50,
          xLane: 0.12,
          targetXLane: 0.1,
          speedKmh: 42,
          widthM: 1.8,
          heightM: 1.5,
          color: '#94a3b8',
        }
      );
      this.surfaces.push({
        id: this.nextId++,
        kind: 'speed_breaker',
        marked: false,
        z: 42,
        xLane: 0,
      });
    } else if (scenario === 'speed_breaker_zone') {
      this.surfaces.push(
        { id: this.nextId++, kind: 'speed_breaker', marked: false, z: 32, xLane: 0 },
        { id: this.nextId++, kind: 'pothole', marked: false, z: 48, xLane: -0.18 }
      );
    } else if (scenario === 'auto_cutin') {
      this.actors.push({
        id: this.nextId++,
        kind: 'auto',
        z: 26,
        xLane: -0.88,
        targetXLane: 0.0,
        speedKmh: 28,
        widthM: 1.4,
        heightM: 1.7,
        color: '#eab308',
      });
    } else if (scenario === 'wrong_side_hazard') {
      this.actors.push({
        id: this.nextId++,
        kind: 'wrong_side_bike',
        z: 56,
        xLane: 0.24,
        targetXLane: 0.12,
        speedKmh: -40,
        widthM: 0.95,
        heightM: 1.45,
        color: '#f97316',
      });
    } else if (scenario === 'cattle_crossing') {
      this.actors.push({
        id: this.nextId++,
        kind: 'cattle',
        z: 40,
        xLane: -1.1,
        targetXLane: 0.25,
        speedKmh: 3,
        widthM: 1.45,
        heightM: 1.35,
        color: '#e7e5e4',
      });
    }
  }

  public stepAndRender(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dtSec: number,
    controls: SimulatorControls
  ): void {
    this.setScenario(controls.scenario);

    const egoSpeedMs = (controls.targetSpeedKmh * 1000) / 3600;
    const activeDt = controls.paused ? 0 : Math.min(dtSec, 0.08);

    if (!controls.paused) {
      this.roadPhase += egoSpeedMs * activeDt;
      this.spawnTimer += activeDt;
      this.surfaceTimer += activeDt;
      this.signTimer += activeDt;

      // Periodic scenario spawns
      if (this.spawnTimer > 3.8 && this.actors.length < 4) {
        this.spawnTimer = 0;
        this.spawnScenarioActor(controls.scenario);
      }
      if (this.surfaceTimer > 5.2 && this.surfaces.length < 2) {
        this.surfaceTimer = 0;
        if (
          controls.scenario === 'speed_breaker_zone' ||
          controls.scenario === 'mixed_indian_road'
        ) {
          const isBreaker = Math.random() > 0.38;
          this.surfaces.push({
            id: this.nextId++,
            kind: isBreaker ? 'speed_breaker' : 'pothole',
            marked: isBreaker ? Math.random() > 0.6 : false,
            z: 58,
            xLane: isBreaker ? 0 : (Math.random() - 0.5) * 0.45,
          });
        }
      }
      if (this.signTimer > 8.5) {
        this.signTimer = 0;
        this.signs.push({
          id: this.nextId++,
          limit: controls.scenario === 'speed_breaker_zone' ? 30 : 60,
          z: 66,
          side: 'left',
        });
      }

      // Advance actors
      for (const actor of this.actors) {
        const actorSpeedMs = (actor.speedKmh * 1000) / 3600;
        const closingMs = egoSpeedMs - actorSpeedMs;
        actor.z -= closingMs * activeDt;
        const dx = actor.targetXLane - actor.xLane;
        actor.xLane += dx * Math.min(1, activeDt * 1.45);
      }
      this.actors = this.actors.filter((a) => a.z > 4.5 && a.z < 92);

      // Advance surface hazards & signs
      for (const surf of this.surfaces) {
        surf.z -= egoSpeedMs * activeDt;
      }
      this.surfaces = this.surfaces.filter((s) => s.z > 3.5);

      for (const sign of this.signs) {
        sign.z -= egoSpeedMs * activeDt;
      }
      this.signs = this.signs.filter((s) => s.z > 4.0);
    }

    // Perspective projection helper
    const horizonY = height * 0.43;
    const roadBottomY = height;
    const vanishX = width * 0.5 - controls.laneDriftBias * width * 0.08;
    const egoOffsetNorm = controls.laneDriftBias; // -1..+1

    const project = (xLane: number, z: number) => {
      const clampedZ = Math.max(2.8, z);
      const scale = 9.2 / clampedZ; // perspective scaling
      const y = horizonY + (roadBottomY - horizonY) * Math.min(1.25, scale);
      const laneHalfWidthAtY = width * 0.24 * scale;
      const x = vanishX + (xLane - egoOffsetNorm * 0.65) * laneHalfWidthAtY * 2;
      return { x, y, scale };
    };

    // 1. Sky & Dusk/Afternoon Indian Highway Atmosphere
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(0.65, '#1e293b');
    skyGrad.addColorStop(1, '#334155');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, horizonY);

    // Subtle distant tree line silhouette
    ctx.fillStyle = '#0f1c18';
    for (let i = 0; i < 18; i++) {
      const tx = (i / 17) * width;
      const r = 16 + ((i * 29) % 24);
      ctx.beginPath();
      ctx.arc(tx, horizonY - 2, r, Math.PI, 0);
      ctx.fill();
    }

    // 2. Dusty Indian Roadside Shoulder / Terrain
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
    groundGrad.addColorStop(0, '#2a241d');
    groundGrad.addColorStop(1, '#1c1813');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // 3. Asphalt Road Polygon (Ego + Adjacent + Oncoming Shoulder)
    const roadLeftBottom = project(-2.1, 3.0).x;
    const roadRightBottom = project(2.1, 3.0).x;
    const roadLeftTop = project(-2.1, 80).x;
    const roadRightTop = project(2.1, 80).x;

    const asphaltGrad = ctx.createLinearGradient(0, horizonY, 0, height);
    asphaltGrad.addColorStop(0, '#262930');
    asphaltGrad.addColorStop(1, '#191c22');
    ctx.fillStyle = asphaltGrad;
    ctx.beginPath();
    ctx.moveTo(roadLeftTop, horizonY);
    ctx.lineTo(roadRightTop, horizonY);
    ctx.lineTo(roadRightBottom, height);
    ctx.lineTo(roadLeftBottom, height);
    ctx.closePath();
    ctx.fill();

    // 4. Crisp Lane Markings (White outer shoulders + dashed ego boundaries)
    // Left yellow-white edge line
    this.drawPerspectiveLaneLine(ctx, project, -0.92, 4, 72, '#e2e8f0', 4, false);
    // Right lane divider (dashed white)
    this.drawPerspectiveLaneLine(ctx, project, 0.92, 4, 72, '#f8fafc', 4.5, true);
    // Inner ego lane guidance boundaries (dashed white / yellow median)
    this.drawPerspectiveLaneLine(ctx, project, -0.48, 4, 72, '#f1f5f9', 3.5, true);
    this.drawPerspectiveLaneLine(ctx, project, 0.48, 4, 72, '#facc15', 3.8, false);

    // 5. Render Surface Hazards (Speed Breakers & Potholes)
    const sortedSurfaces = [...this.surfaces].sort((a, b) => b.z - a.z);
    for (const surf of sortedSurfaces) {
      this.drawSurfaceFeature(ctx, project, surf);
    }

    // 6. Render Roadside Speed Limit Signs
    for (const sign of this.signs) {
      this.drawSpeedSign(ctx, project, sign);
    }

    // 7. Render Traffic Actors sorted far-to-near
    const sortedActors = [...this.actors].sort((a, b) => b.z - a.z);
    for (const actor of sortedActors) {
      this.drawActor(ctx, project, actor);
    }
  }

  private spawnScenarioActor(scenario: SimulatorScenario): void {
    if (scenario === 'auto_cutin') {
      this.actors.push({
        id: this.nextId++,
        kind: Math.random() > 0.4 ? 'auto' : 'two_wheeler',
        z: 36,
        xLane: -0.9,
        targetXLane: 0.02,
        speedKmh: 28,
        widthM: 1.35,
        heightM: 1.65,
        color: '#eab308',
      });
      return;
    }
    if (scenario === 'wrong_side_hazard') {
      this.actors.push({
        id: this.nextId++,
        kind: 'wrong_side_bike',
        z: 62,
        xLane: 0.25,
        targetXLane: 0.14,
        speedKmh: -36,
        widthM: 0.95,
        heightM: 1.45,
        color: '#ef4444',
      });
      return;
    }
    if (scenario === 'cattle_crossing') {
      this.actors.push({
        id: this.nextId++,
        kind: 'cattle',
        z: 46,
        xLane: -1.15,
        targetXLane: 0.2,
        speedKmh: 3,
        widthM: 1.45,
        heightM: 1.35,
        color: '#e7e5e4',
      });
      return;
    }
    const roll = Math.random();
    if (roll < 0.35) {
      this.actors.push({
        id: this.nextId++,
        kind: 'two_wheeler',
        z: 52,
        xLane: -0.75,
        targetXLane: Math.random() > 0.5 ? -0.15 : -0.65,
        speedKmh: 34,
        widthM: 0.85,
        heightM: 1.45,
        color: '#38bdf8',
      });
    } else if (roll < 0.7) {
      this.actors.push({
        id: this.nextId++,
        kind: 'auto',
        z: 48,
        xLane: -0.45,
        targetXLane: -0.1,
        speedKmh: 28,
        widthM: 1.4,
        heightM: 1.7,
        color: '#eab308',
      });
    } else {
      this.actors.push({
        id: this.nextId++,
        kind: 'car',
        z: 60,
        xLane: 0.08,
        targetXLane: 0.08,
        speedKmh: 45,
        widthM: 1.85,
        heightM: 1.5,
        color: '#cbd5e1',
      });
    }
  }

  private drawPerspectiveLaneLine(
    ctx: CanvasRenderingContext2D,
    project: (xLane: number, z: number) => { x: number; y: number; scale: number },
    xLane: number,
    zNear: number,
    zFar: number,
    color: string,
    baseWidth: number,
    dashed: boolean
  ): void {
    ctx.strokeStyle = color;
    ctx.lineCap = 'butt';

    if (!dashed) {
      const pNear = project(xLane, zNear);
      const pFar = project(xLane, zFar);
      ctx.lineWidth = baseWidth;
      ctx.beginPath();
      ctx.moveTo(pNear.x, pNear.y);
      ctx.lineTo(pFar.x, pFar.y);
      ctx.stroke();
      return;
    }

    const dashCycle = 6.0;
    const dashLen = 3.0;
    const offset = this.roadPhase % dashCycle;
    for (let z = zNear - offset; z < zFar; z += dashCycle) {
      const segStart = Math.max(zNear, z);
      const segEnd = Math.min(zFar, z + dashLen);
      if (segEnd <= segStart) continue;
      const p1 = project(xLane, segStart);
      const p2 = project(xLane, segEnd);
      ctx.lineWidth = Math.max(1.2, baseWidth * p1.scale * 0.65);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  private drawSurfaceFeature(
    ctx: CanvasRenderingContext2D,
    project: (xLane: number, z: number) => { x: number; y: number; scale: number },
    surf: SimSurfaceFeature
  ): void {
    if (surf.kind === 'speed_breaker') {
      const pL = project(-0.88, surf.z);
      const pR = project(0.88, surf.z);
      const h = Math.max(4, 15 * pL.scale);
      const w = pR.x - pL.x;

      if (surf.marked) {
        // Painted yellow/black speed breaker
        const stripes = 8;
        const stripeW = w / stripes;
        for (let i = 0; i < stripes; i++) {
          ctx.fillStyle = i % 2 === 0 ? '#facc15' : '#0f172a';
          ctx.fillRect(pL.x + i * stripeW, pL.y - h * 0.5, stripeW + 0.5, h);
        }
      } else {
        // Unmarked Indian asphalt speed breaker: bright crest + dark shadow lip
        ctx.fillStyle = '#0a0b0e';
        ctx.fillRect(pL.x, pL.y + h * 0.15, w, h * 0.5);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(pL.x, pL.y - h * 0.45, w, h * 0.6);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(pL.x, pL.y - h * 0.25, w, Math.max(2, h * 0.22));
      }
    } else {
      // Pothole depression with dark crater and rough light rim
      const p = project(surf.xLane, surf.z);
      const rx = Math.max(8, 36 * p.scale);
      const ry = Math.max(4, 14 * p.scale);
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx * 1.15, ry * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#07080b';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, rx * 0.88, ry * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSpeedSign(
    ctx: CanvasRenderingContext2D,
    project: (xLane: number, z: number) => { x: number; y: number; scale: number },
    sign: SimSign
  ): void {
    const xLane = sign.side === 'left' ? -1.15 : 1.15;
    const p = project(xLane, sign.z);
    const r = Math.max(8, 22 * p.scale);
    const signY = p.y - r * 3.8;

    // Pole
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = Math.max(1.5, 4 * p.scale);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, signY);
    ctx.stroke();

    // Red circular Indian mandatory speed limit sign
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(p.x, signY, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, signY, r * 0.72, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${Math.max(8, Math.round(r * 0.75))}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(sign.limit), p.x, signY + 1);
  }

  private drawActor(
    ctx: CanvasRenderingContext2D,
    project: (xLane: number, z: number) => { x: number; y: number; scale: number },
    actor: SimActor
  ): void {
    const p = project(actor.xLane, actor.z);
    const w = Math.max(16, actor.widthM * 66 * p.scale);
    const h = Math.max(18, actor.heightM * 66 * p.scale);
    const x = p.x - w / 2;
    const y = p.y - h;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, w * 0.55, Math.max(3, h * 0.08), 0, 0, Math.PI * 2);
    ctx.fill();

    if (actor.kind === 'auto') {
      // Indian Auto-Rickshaw (black/green canopy + yellow lower body + rear window)
      ctx.fillStyle = '#111827';
      ctx.fillRect(x + w * 0.14, y, w * 0.72, h * 0.52);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(x + w * 0.06, y + h * 0.48, w * 0.88, h * 0.42);
      // Rear window & taillights
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + w * 0.26, y + h * 0.12, w * 0.48, h * 0.24);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + w * 0.1, y + h * 0.65, w * 0.16, h * 0.1);
      ctx.fillRect(x + w * 0.74, y + h * 0.65, w * 0.16, h * 0.1);
      // Rear tires
      ctx.fillStyle = '#09090b';
      ctx.fillRect(x + w * 0.06, y + h * 0.82, w * 0.18, h * 0.18);
      ctx.fillRect(x + w * 0.76, y + h * 0.82, w * 0.18, h * 0.18);
    } else if (actor.kind === 'two_wheeler' || actor.kind === 'wrong_side_bike') {
      // Rider + Two-wheeler silhouette
      const isWrong = actor.kind === 'wrong_side_bike';
      // Wheels & chassis
      ctx.fillStyle = '#18181b';
      ctx.fillRect(p.x - w * 0.22, y + h * 0.48, w * 0.44, h * 0.52);
      // Rider torso + helmet
      ctx.fillStyle = isWrong ? '#dc2626' : '#0284c7';
      ctx.fillRect(p.x - w * 0.28, y + h * 0.22, w * 0.56, h * 0.38);
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(p.x, y + h * 0.14, w * 0.22, 0, Math.PI * 2);
      ctx.fill();
      // Headlight (wrong side) or Taillight
      ctx.fillStyle = isWrong ? '#fef08a' : '#ef4444';
      ctx.beginPath();
      ctx.arc(p.x, y + h * 0.54, Math.max(3, w * 0.14), 0, Math.PI * 2);
      ctx.fill();
    } else if (actor.kind === 'cattle') {
      // Stray Cow silhouette
      ctx.fillStyle = '#d6d3d1';
      ctx.fillRect(x + w * 0.08, y + h * 0.24, w * 0.72, h * 0.44);
      // Head + horns
      ctx.fillRect(x + w * 0.72, y + h * 0.14, w * 0.22, h * 0.28);
      ctx.strokeStyle = '#78716c';
      ctx.lineWidth = Math.max(1.5, w * 0.05);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.78, y + h * 0.15);
      ctx.lineTo(x + w * 0.74, y + h * 0.02);
      ctx.moveTo(x + w * 0.88, y + h * 0.15);
      ctx.lineTo(x + w * 0.94, y + h * 0.02);
      ctx.stroke();
      // 4 legs
      ctx.fillStyle = '#a8a29e';
      ctx.fillRect(x + w * 0.12, y + h * 0.66, w * 0.1, h * 0.34);
      ctx.fillRect(x + w * 0.28, y + h * 0.66, w * 0.1, h * 0.34);
      ctx.fillRect(x + w * 0.56, y + h * 0.66, w * 0.1, h * 0.34);
      ctx.fillRect(x + w * 0.7, y + h * 0.66, w * 0.1, h * 0.34);
    } else {
      // Car / SUV rear view
      ctx.fillStyle = actor.color;
      ctx.fillRect(x + w * 0.05, y + h * 0.36, w * 0.9, h * 0.52);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x + w * 0.14, y + h * 0.06, w * 0.72, h * 0.34);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + w * 0.2, y + h * 0.12, w * 0.6, h * 0.22);
      // Taillights & tires
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + w * 0.08, y + h * 0.44, w * 0.18, h * 0.11);
      ctx.fillRect(x + w * 0.74, y + h * 0.44, w * 0.18, h * 0.11);
      ctx.fillStyle = '#09090b';
      ctx.fillRect(x + w * 0.08, y + h * 0.84, w * 0.18, h * 0.16);
      ctx.fillRect(x + w * 0.74, y + h * 0.84, w * 0.18, h * 0.16);
    }
  }
}
