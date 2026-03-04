import { Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIsMobile } from "../hooks/use-mobile";
import { useSoundEngine } from "../hooks/useSoundEngine";
import GameOverlay from "./GameOverlay";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Vec2 {
  x: number;
  y: number;
}

interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface TerrainPoint {
  x: number;
  y: number;
}

interface TerrainSegment {
  points: TerrainPoint[];
  isGap: boolean;
  startX: number;
  endX: number;
}

interface Boost {
  pos: Vec2;
  collected: boolean;
  pulsePhase: number;
}

interface StuntBanner {
  text: string;
  timer: number;
  maxTimer: number;
  color: string;
}

interface BikeState {
  pos: Vec2;
  vel: Vec2;
  angle: number;
  angularVel: number;
  rearWheelContact: boolean;
  frontWheelContact: boolean;
  rearWheelPos: Vec2;
  frontWheelPos: Vec2;
  rearWheelRot: number;
  frontWheelRot: number;
}

interface GameState {
  bike: BikeState;
  particles: Particle[];
  terrainChunks: TerrainSegment[];
  boosts: Boost[];
  camera: Vec2;
  cameraTarget: Vec2;
  score: number;
  combo: number;
  maxCombo: number;
  isGameOver: boolean;
  distance: number;
  stuntsPerformed: string[];
  rotationAccum: number;
  wheelieTimer: number;
  airTime: number;
  airTimeAccum: number;
  wasAirborne: boolean;
  stuntBanners: StuntBanner[];
  speed: number;
  height: number;
  currentAirTime: number;
  showControls: boolean;
  controlsTimer: number;
  lastLandingVelY: number;
  boostActive: boolean;
  boostTimer: number;
  difficulty: number;
  terrainGenX: number;
  pendingFlips: number;
}

interface Keys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface GameEndData {
  score: number;
  maxCombo: number;
  stuntsPerformed: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GRAVITY = 980;
const MAX_SPEED = 620;
const WHEEL_BASE = 55;
const WHEEL_RADIUS = 14;
const ENGINE_TORQUE = 1800;
const BRAKE_TORQUE = 1200;
const LEAN_TORQUE = 420;
const SUSPENSION_STIFFNESS = 1800;
const SUSPENSION_DAMPING = 120;
const SUSPENSION_REST = 30;
const ANGULAR_DAMPING = 0.85;
const GROUND_FRICTION = 0.72;
const AIR_FRICTION = 0.998;
const CHUNK_WIDTH = 900;
const PARTICLE_POOL_SIZE = 250;
const BOOST_AMOUNT = 180;
const MIN_AIRTIME_STUNT = 1.0;
const MIN_WHEELIE_TIME = 0.5;
const FLIP_THRESHOLD = Math.PI * 2;

// Colors (literal values since canvas can't use CSS vars)
const COLOR_BG = "#0a0a0f";
const _COLOR_TERRAIN_FILL = "#0d1f0d";
const COLOR_TERRAIN_OUTLINE = "#39ff14";
const COLOR_BIKE_FRAME = "#00ffff";
const COLOR_BIKE_ACCENT = "#ff00ff";
const COLOR_WHEEL_RIM = "#ffff00";
const COLOR_WHEEL_DARK = "#111120";
const COLOR_RIDER = "#e0f8ff";
const COLOR_BOOST = "#ffff00";
const COLOR_BOOST_GLOW = "#ffaa00";
const COLOR_HUD = "#00ffff";
const _COLOR_HUD_DIM = "#00cccc88";
const COLOR_STARS = "#ffffff";

// ─── Terrain Generation ───────────────────────────────────────────────────────

function generateChunk(
  startX: number,
  difficulty: number,
  prevEndY: number,
): TerrainSegment[] {
  const segments: TerrainSegment[] = [];
  const tier = Math.min(3, Math.floor(difficulty));
  let x = startX;
  let y = prevEndY;
  const STEP = 40;

  while (x < startX + CHUNK_WIDTH) {
    const segType = getSegmentType(tier);

    if (segType === "flat") {
      const len = 120 + Math.random() * 180;
      const pts = buildFlat(x, y, len, STEP);
      segments.push({ points: pts, isGap: false, startX: x, endX: x + len });
      y = pts[pts.length - 1].y;
      x += len;
    } else if (segType === "hill") {
      const len = 200 + Math.random() * 250;
      const amplitude = 40 + tier * 25 + Math.random() * 40;
      const pts = buildHill(x, y, len, amplitude, STEP);
      segments.push({ points: pts, isGap: false, startX: x, endX: x + len });
      y = pts[pts.length - 1].y;
      x += len;
    } else if (segType === "ramp") {
      const len = 150 + Math.random() * 120;
      const rise = 60 + tier * 30 + Math.random() * 60;
      const pts = buildRamp(x, y, len, rise, STEP);
      segments.push({ points: pts, isGap: false, startX: x, endX: x + len });
      y = pts[pts.length - 1].y;
      x += len;
    } else if (segType === "gap") {
      const gapMin = tier === 2 ? 60 : 110;
      const gapMax = tier === 2 ? 110 : 220;
      const gapWidth = gapMin + Math.random() * (gapMax - gapMin);
      segments.push({
        points: [],
        isGap: true,
        startX: x,
        endX: x + gapWidth,
      });
      x += gapWidth;
      // Landing ramp
      const landingRamp = buildLandingRamp(x, y - 40, 120, 40, STEP);
      segments.push({
        points: landingRamp,
        isGap: false,
        startX: x,
        endX: x + 120,
      });
      y = landingRamp[landingRamp.length - 1].y;
      x += 120;
    }
  }
  return segments;
}

function getSegmentType(tier: number): string {
  const r = Math.random();
  if (tier === 0) {
    if (r < 0.4) return "flat";
    if (r < 0.9) return "hill";
    return "ramp";
  }
  if (tier === 1) {
    if (r < 0.25) return "flat";
    if (r < 0.65) return "hill";
    if (r < 0.9) return "ramp";
    return "gap";
  }
  if (tier === 2) {
    if (r < 0.15) return "flat";
    if (r < 0.45) return "hill";
    if (r < 0.75) return "ramp";
    return "gap";
  }
  if (r < 0.1) return "flat";
  if (r < 0.35) return "hill";
  if (r < 0.6) return "ramp";
  return "gap";
}

function buildFlat(
  startX: number,
  y: number,
  len: number,
  step: number,
): TerrainPoint[] {
  const pts: TerrainPoint[] = [];
  for (let x = startX; x <= startX + len; x += step) {
    pts.push({ x, y: y + (Math.random() - 0.5) * 6 });
  }
  pts.push({ x: startX + len, y });
  return pts;
}

function buildHill(
  startX: number,
  y: number,
  len: number,
  amplitude: number,
  step: number,
): TerrainPoint[] {
  const pts: TerrainPoint[] = [];
  for (let x = startX; x <= startX + len; x += step) {
    const t = (x - startX) / len;
    const hillY = y - Math.sin(t * Math.PI) * amplitude;
    pts.push({ x, y: hillY });
  }
  pts.push({ x: startX + len, y });
  return pts;
}

function buildRamp(
  startX: number,
  y: number,
  len: number,
  rise: number,
  step: number,
): TerrainPoint[] {
  const pts: TerrainPoint[] = [];
  for (let x = startX; x <= startX + len; x += step) {
    const t = (x - startX) / len;
    // Curved ramp that launches
    const rampY = y - rise * t ** 0.7;
    pts.push({ x, y: rampY });
  }
  return pts;
}

function buildLandingRamp(
  startX: number,
  y: number,
  len: number,
  drop: number,
  step: number,
): TerrainPoint[] {
  const pts: TerrainPoint[] = [];
  for (let x = startX; x <= startX + len; x += step) {
    const t = (x - startX) / len;
    const rampY = y + drop * t;
    pts.push({ x, y: rampY });
  }
  return pts;
}

// ─── Terrain Queries ──────────────────────────────────────────────────────────

function getTerrainY(x: number, chunks: TerrainSegment[]): number | null {
  for (const chunk of chunks) {
    if (chunk.isGap) continue;
    if (x < chunk.startX || x > chunk.endX) continue;
    const pts = chunk.points;
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i].x && x <= pts[i + 1].x) {
        const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + t * (pts[i + 1].y - pts[i].y);
      }
    }
  }
  return null;
}

function isInGap(x: number, chunks: TerrainSegment[]): boolean {
  for (const chunk of chunks) {
    if (chunk.isGap && x >= chunk.startX && x <= chunk.endX) return true;
  }
  return false;
}

// ─── Particle Helpers ─────────────────────────────────────────────────────────

function spawnDust(particles: Particle[], pos: Vec2, count: number): void {
  for (let i = 0; i < count; i++) {
    if (particles.length >= PARTICLE_POOL_SIZE) {
      // Recycle oldest dead particle
      const deadIdx = particles.findIndex((p) => p.life <= 0);
      if (deadIdx >= 0) particles.splice(deadIdx, 1);
      else break;
    }
    particles.push({
      pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
      vel: {
        x: (Math.random() - 0.5) * 80,
        y: -Math.random() * 60 - 20,
      },
      life: 0.6 + Math.random() * 0.4,
      maxLife: 1.0,
      color: `hsl(${30 + Math.random() * 20}, 60%, ${40 + Math.random() * 20}%)`,
      size: 2 + Math.random() * 3,
    });
  }
}

function spawnSparks(
  particles: Particle[],
  pos: Vec2,
  intensity: number,
): void {
  const count = Math.min(20, Math.floor(intensity / 15));
  for (let i = 0; i < count; i++) {
    if (particles.length >= PARTICLE_POOL_SIZE) {
      const deadIdx = particles.findIndex((p) => p.life <= 0);
      if (deadIdx >= 0) particles.splice(deadIdx, 1);
      else break;
    }
    const angle = Math.random() * Math.PI;
    const speed = 100 + Math.random() * intensity * 0.8;
    particles.push({
      pos: { x: pos.x, y: pos.y },
      vel: {
        x: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
        y: -Math.sin(angle) * speed,
      },
      life: 0.2 + Math.random() * 0.3,
      maxLife: 0.5,
      color: Math.random() > 0.5 ? "#ffff00" : "#ff6600",
      size: 1 + Math.random() * 2,
    });
  }
}

// ─── Bike Physics Helpers ─────────────────────────────────────────────────────

function getWheelPositions(bike: BikeState): { rear: Vec2; front: Vec2 } {
  const cos = Math.cos(bike.angle);
  const sin = Math.sin(bike.angle);
  const half = WHEEL_BASE / 2;
  return {
    rear: {
      x: bike.pos.x - cos * half,
      y: bike.pos.y - sin * half,
    },
    front: {
      x: bike.pos.x + cos * half,
      y: bike.pos.y + sin * half,
    },
  };
}

// ─── Initial State ────────────────────────────────────────────────────────────

function createInitialState(canvasW: number, canvasH: number): GameState {
  const startY = canvasH * 0.5;
  const startChunks = generateInitialTerrain(canvasH);

  const bike: BikeState = {
    pos: { x: 120, y: startY - SUSPENSION_REST - WHEEL_RADIUS - 10 },
    vel: { x: 0, y: 0 },
    angle: 0,
    angularVel: 0,
    rearWheelContact: false,
    frontWheelContact: false,
    rearWheelPos: { x: 0, y: 0 },
    frontWheelPos: { x: 0, y: 0 },
    rearWheelRot: 0,
    frontWheelRot: 0,
  };

  const { rear, front } = getWheelPositions(bike);
  bike.rearWheelPos = rear;
  bike.frontWheelPos = front;

  const particles: Particle[] = [];

  return {
    bike,
    particles,
    terrainChunks: startChunks,
    boosts: generateBoosts(startChunks),
    camera: { x: 120 - canvasW * 0.3, y: startY - canvasH * 0.4 },
    cameraTarget: { x: 120 - canvasW * 0.3, y: startY - canvasH * 0.4 },
    score: 0,
    combo: 1,
    maxCombo: 1,
    isGameOver: false,
    distance: 0,
    stuntsPerformed: [],
    rotationAccum: 0,
    wheelieTimer: 0,
    airTime: 0,
    airTimeAccum: 0,
    wasAirborne: false,
    stuntBanners: [],
    speed: 0,
    height: 0,
    currentAirTime: 0,
    showControls: true,
    controlsTimer: 5.0,
    lastLandingVelY: 0,
    boostActive: false,
    boostTimer: 0,
    difficulty: 0,
    terrainGenX: 0,
    pendingFlips: 0,
  };
}

function generateInitialTerrain(canvasH: number): TerrainSegment[] {
  const chunks: TerrainSegment[] = [];
  // Flat start section
  const startY = canvasH * 0.5;
  const flatPts: TerrainPoint[] = [];
  for (let x = -200; x <= 400; x += 40) {
    flatPts.push({ x, y: startY });
  }
  chunks.push({ points: flatPts, isGap: false, startX: -200, endX: 400 });

  // Generate subsequent chunks
  let genX = 400;
  let lastY = startY;
  for (let i = 0; i < 8; i++) {
    const newChunks = generateChunk(genX, i / 3, lastY);
    for (const c of newChunks) {
      if (!c.isGap && c.points.length > 0) {
        lastY = c.points[c.points.length - 1].y;
      }
    }
    chunks.push(...newChunks);
    genX += CHUNK_WIDTH;
  }

  return chunks;
}

function generateBoosts(chunks: TerrainSegment[]): Boost[] {
  const boosts: Boost[] = [];
  for (const chunk of chunks) {
    if (chunk.isGap) continue;
    if (chunk.endX - chunk.startX < 200) continue;
    // Place boost on flat-ish sections
    const pts = chunk.points;
    for (let i = 2; i < pts.length - 2; i++) {
      const slope = Math.abs(pts[i].y - pts[i - 1].y);
      if (slope < 8 && Math.random() < 0.08) {
        boosts.push({
          pos: { x: pts[i].x, y: pts[i].y - 30 },
          collected: false,
          pulsePhase: Math.random() * Math.PI * 2,
        });
      }
    }
  }
  return boosts;
}

// ─── Stunt Banner Helpers (module-level, used in callbacks) ──────────────────

function addStuntBanner(state: GameState, text: string, color: string) {
  state.stuntBanners.push({ text, timer: 2.0, maxTimer: 2.0, color });
  if (state.stuntBanners.length > 3) state.stuntBanners.shift();
}

function recordStunt(state: GameState, name: string) {
  if (!state.stuntsPerformed.includes(name)) {
    state.stuntsPerformed.push(name);
  }
}

// ─── Main BikeGame Component ──────────────────────────────────────────────────

export default function BikeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Keys>({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const starsRef = useRef<
    { x: number; y: number; size: number; brightness: number }[]
  >([]);

  const [gameEndData, setGameEndData] = useState<GameEndData | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const isMobile = useIsMobile();

  // Sound engine
  const {
    playBoost,
    playFlipWhoosh,
    playLandingThud,
    playWheelTick,
    playCrash,
    setEngineSpeed,
    muted,
    toggleMute,
  } = useSoundEngine();

  // Track airborne state for whoosh trigger
  const wasAirborneRef = useRef(false);

  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = createInitialState(canvas.width, canvas.height);
    stateRef.current = state;
    state.terrainGenX =
      state.terrainChunks[state.terrainChunks.length - 1]?.endX ?? 0;
    wasAirborneRef.current = false;
    setGameEndData(null);
    setShowOverlay(false);

    // Generate stars
    starsRef.current = Array.from({ length: 120 }, () => ({
      x: Math.random() * 4000 - 200,
      y: Math.random() * 600 - 300,
      size: Math.random() * 1.5 + 0.3,
      brightness: 0.3 + Math.random() * 0.7,
    }));
  }, []);

  // ─── Physics Update ──────────────────────────────────────────────────────────

  const updatePhysics = useCallback((state: GameState, dt: number) => {
    const keys = keysRef.current;
    const bike = state.bike;

    // Apply gravity
    bike.vel.y += GRAVITY * dt;

    // Compute wheel positions
    const { rear: rearPos, front: frontPos } = getWheelPositions(bike);
    bike.rearWheelPos = rearPos;
    bike.frontWheelPos = frontPos;

    // Terrain contact for each wheel
    const rearTerrainY = getTerrainY(rearPos.x, state.terrainChunks);
    const frontTerrainY = getTerrainY(frontPos.x, state.terrainChunks);

    const rearInGap = isInGap(rearPos.x, state.terrainChunks);
    const frontInGap = isInGap(frontPos.x, state.terrainChunks);

    let rearContact = false;
    let frontContact = false;

    let rearForceY = 0;
    let frontForceY = 0;

    // Rear suspension
    if (!rearInGap && rearTerrainY !== null) {
      const wheelBottom = rearPos.y + WHEEL_RADIUS;
      const penetration = wheelBottom - rearTerrainY;
      if (penetration > -SUSPENSION_REST * 2) {
        const compression = penetration + SUSPENSION_REST;
        if (compression > 0) {
          rearContact = true;
          rearForceY =
            -SUSPENSION_STIFFNESS * compression -
            SUSPENSION_DAMPING * bike.vel.y;
          rearForceY = Math.min(rearForceY, 0); // Only push up
        }
      }
    }

    // Front suspension
    if (!frontInGap && frontTerrainY !== null) {
      const wheelBottom = frontPos.y + WHEEL_RADIUS;
      const penetration = wheelBottom - frontTerrainY;
      if (penetration > -SUSPENSION_REST * 2) {
        const compression = penetration + SUSPENSION_REST;
        if (compression > 0) {
          frontContact = true;
          frontForceY =
            -SUSPENSION_STIFFNESS * compression -
            SUSPENSION_DAMPING * bike.vel.y;
          frontForceY = Math.min(frontForceY, 0);
        }
      }
    }

    const totalSuspForce = rearForceY + frontForceY;
    bike.vel.y += totalSuspForce * dt;

    // Torque from unequal wheel forces
    const half = WHEEL_BASE / 2;
    const sin = Math.sin(bike.angle);
    const cos = Math.cos(bike.angle);
    const torqueFromSusp = (frontForceY - rearForceY) * (half * cos) * 0.0002;
    bike.angularVel += torqueFromSusp * dt;

    // Engine / brake torque → forward impulse
    if (rearContact || frontContact) {
      let driveForce = 0;
      if (keys.up) {
        driveForce = ENGINE_TORQUE;
        if (state.boostActive) driveForce *= 1.5;
      }
      if (keys.down) {
        driveForce = -BRAKE_TORQUE * 0.5;
      }
      bike.vel.x += cos * driveForce * dt;
      bike.vel.y += sin * driveForce * dt;
    } else {
      // Air acceleration (reduced)
      if (keys.up) {
        bike.vel.x += cos * ENGINE_TORQUE * 0.25 * dt;
      }
    }

    // Ground friction
    if (rearContact || frontContact) {
      bike.vel.x *= GROUND_FRICTION ** (dt * 60);
    } else {
      bike.vel.x *= AIR_FRICTION ** (dt * 60);
    }

    // Speed cap
    const spd = Math.sqrt(bike.vel.x * bike.vel.x + bike.vel.y * bike.vel.y);
    const maxSpd = MAX_SPEED + (state.boostActive ? BOOST_AMOUNT : 0);
    if (spd > maxSpd) {
      const scale = maxSpd / spd;
      bike.vel.x *= scale;
      bike.vel.y *= scale;
    }

    // Lean
    if (keys.left) {
      bike.angularVel -= LEAN_TORQUE * dt;
    }
    if (keys.right) {
      bike.angularVel += LEAN_TORQUE * dt;
    }

    // Angular damping (more on ground)
    if (rearContact && frontContact) {
      bike.angularVel *= 0.6 ** (dt * 60);
      // Auto-level on ground
      bike.angularVel -= bike.angle * 8 * dt;
    } else {
      bike.angularVel *= ANGULAR_DAMPING ** (dt * 60);
    }

    bike.angularVel = Math.max(-15, Math.min(15, bike.angularVel));
    bike.angle += bike.angularVel * dt;

    // Integrate position
    bike.pos.x += bike.vel.x * dt;
    bike.pos.y += bike.vel.y * dt;

    // Clamp angle to prevent spin-lock on ground
    if (rearContact && frontContact) {
      const dx = frontPos.x - rearPos.x;
      const dy = (frontTerrainY ?? frontPos.y) - (rearTerrainY ?? rearPos.y);
      const targetAngle = Math.atan2(dy, dx);
      bike.angle += (targetAngle - bike.angle) * 0.15;
    }

    // Clamp bike above terrain (prevent clipping)
    if (rearContact && rearTerrainY !== null) {
      const maxPenetr = 5;
      const rearBottom = rearPos.y + WHEEL_RADIUS;
      if (rearBottom > rearTerrainY + maxPenetr) {
        bike.pos.y -= rearBottom - rearTerrainY - maxPenetr + 1;
        if (bike.vel.y > 0) bike.vel.y *= 0.3;
      }
    }
    if (frontContact && frontTerrainY !== null) {
      const maxPenetr = 5;
      const frontBottom = frontPos.y + WHEEL_RADIUS;
      if (frontBottom > frontTerrainY + maxPenetr) {
        bike.pos.y -= frontBottom - frontTerrainY - maxPenetr + 1;
        if (bike.vel.y > 0) bike.vel.y *= 0.3;
      }
    }

    bike.rearWheelContact = rearContact;
    bike.frontWheelContact = frontContact;

    // Wheel rotation
    const wheelCircumference = 2 * Math.PI * WHEEL_RADIUS;
    const rotPerPx = (2 * Math.PI) / wheelCircumference;
    bike.rearWheelRot += bike.vel.x * rotPerPx * dt;
    bike.frontWheelRot += bike.vel.x * rotPerPx * dt;

    return { rearContact, frontContact };
  }, []);

  // ─── Stunt Detection ──────────────────────────────────────────────────────────

  const updateStunts = useCallback(
    (
      state: GameState,
      dt: number,
      rearContact: boolean,
      frontContact: boolean,
    ) => {
      const bike = state.bike;
      const isAirborne = !rearContact && !frontContact;
      const wasAirborne = state.wasAirborne;

      // Track airtime
      if (isAirborne) {
        state.airTimeAccum += dt;
        state.currentAirTime = state.airTimeAccum;
      }

      // Rotation accumulation (only in air)
      if (isAirborne) {
        state.rotationAccum += bike.angularVel * dt;
      }

      // Wheelie detection
      if (rearContact && !frontContact) {
        state.wheelieTimer += dt;
        if (state.wheelieTimer > MIN_WHEELIE_TIME) {
          const pts = Math.floor(10 * state.combo);
          state.score += pts;
          if (
            Math.floor(state.wheelieTimer * 10) !==
            Math.floor((state.wheelieTimer - dt) * 10)
          ) {
            // Occasional bonus tick
            if (
              state.stuntsPerformed[state.stuntsPerformed.length - 1] !==
              "WHEELIE!"
            ) {
              addStuntBanner(state, "WHEELIE!", "#ff00ff");
              recordStunt(state, "WHEELIE!");
            }
          }
        }
      } else {
        state.wheelieTimer = 0;
      }

      // Landing
      if (wasAirborne && (rearContact || frontContact)) {
        const airSecs = state.airTimeAccum;

        // Check flips
        const flips = Math.floor(
          Math.abs(state.rotationAccum) / FLIP_THRESHOLD,
        );
        if (flips > 0) {
          const isBackflip = state.rotationAccum < 0;
          for (let i = 0; i < flips; i++) {
            const pts = 500 * state.combo;
            state.score += pts;
            state.combo = Math.min(10, state.combo + 1);
            const name = isBackflip
              ? `BACKFLIP! x${state.combo}`
              : `FRONTFLIP! x${state.combo}`;
            addStuntBanner(state, name, "#00ffff");
            recordStunt(state, isBackflip ? "BACKFLIP" : "FRONTFLIP");
          }
        }

        // Big air
        if (airSecs >= MIN_AIRTIME_STUNT) {
          const pts = Math.floor(50 * airSecs * state.combo);
          state.score += pts;
          const name = airSecs > 3 ? `HUGE AIR! +${pts}` : `BIG AIR! +${pts}`;
          addStuntBanner(state, name, "#ffff00");
          recordStunt(state, airSecs > 3 ? "HUGE AIR" : "BIG AIR");
        }

        // Combo: if no stunts, reset
        if (
          flips === 0 &&
          airSecs < MIN_AIRTIME_STUNT &&
          state.wheelieTimer < MIN_WHEELIE_TIME
        ) {
          state.combo = Math.max(1, state.combo - 0);
        }

        // Spark on hard landing
        const impactVel = Math.abs(bike.vel.y);
        state.lastLandingVelY = impactVel;
        if (impactVel > 280) {
          spawnSparks(
            state.particles,
            { x: bike.rearWheelPos.x, y: bike.rearWheelPos.y + WHEEL_RADIUS },
            impactVel,
          );
          spawnSparks(
            state.particles,
            { x: bike.frontWheelPos.x, y: bike.frontWheelPos.y + WHEEL_RADIUS },
            impactVel,
          );
        }
        spawnDust(
          state.particles,
          { x: bike.rearWheelPos.x, y: bike.rearWheelPos.y + WHEEL_RADIUS },
          8,
        );

        state.rotationAccum = 0;
        state.airTimeAccum = 0;
        state.currentAirTime = 0;
      }

      // Dust while driving
      if ((rearContact || frontContact) && Math.abs(bike.vel.x) > 100) {
        if (Math.random() < 0.3) {
          const pt = rearContact ? bike.rearWheelPos : bike.frontWheelPos;
          spawnDust(state.particles, { x: pt.x, y: pt.y + WHEEL_RADIUS }, 2);
        }
      }

      // Dust on takeoff
      if (!isAirborne && wasAirborne) {
        // Already handled above
      } else if (isAirborne && !wasAirborne) {
        spawnDust(
          state.particles,
          { x: bike.rearWheelPos.x, y: bike.rearWheelPos.y + WHEEL_RADIUS },
          10,
        );
      }

      state.wasAirborne = isAirborne;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
    },
    [],
  );

  // ─── Update Loop ──────────────────────────────────────────────────────────────

  const update = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current;
      const state = stateRef.current;
      if (!canvas || !state) return;

      const rawDt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;
      const dt = Math.min(rawDt, 0.033);

      if (state.isGameOver) {
        // Engine should already be silent after playCrash/stopEngine
        animFrameRef.current = requestAnimationFrame(update);
        return;
      }

      // Controls overlay countdown
      if (state.showControls) {
        state.controlsTimer -= dt;
        if (state.controlsTimer <= 0) state.showControls = false;
      }

      // Boost timer
      if (state.boostActive) {
        state.boostTimer -= dt;
        if (state.boostTimer <= 0) state.boostActive = false;
      }

      // Physics
      const { rearContact, frontContact } = updatePhysics(state, dt);

      // Stunt detection
      updateStunts(state, dt, rearContact, frontContact);

      // ── Sound triggers ──────────────────────────────────────────────────────
      const isAirborneNow = !rearContact && !frontContact;

      // Takeoff whoosh: just became airborne
      if (isAirborneNow && !wasAirborneRef.current) {
        playFlipWhoosh();
      }

      // Landing thud: just landed
      if (!isAirborneNow && wasAirborneRef.current) {
        playLandingThud(Math.abs(state.bike.vel.y));
      }

      // Wheelie tick (rear contact only, no front)
      if (rearContact && !frontContact) {
        playWheelTick();
      }

      wasAirborneRef.current = isAirborneNow;

      // Engine pitch tied to speed
      setEngineSpeed(state.speed);
      // ── End sound triggers ──────────────────────────────────────────────────

      // Update particles
      for (const p of state.particles) {
        p.pos.x += p.vel.x * dt;
        p.pos.y += p.vel.y * dt;
        p.vel.y += 200 * dt;
        p.life -= dt;
      }
      // Remove dead particles
      for (let i = state.particles.length - 1; i >= 0; i--) {
        if (state.particles[i].life <= 0) state.particles.splice(i, 1);
      }

      // Update stunt banners
      for (const banner of state.stuntBanners) {
        banner.timer -= dt;
      }
      for (let i = state.stuntBanners.length - 1; i >= 0; i--) {
        if (state.stuntBanners[i].timer <= 0) state.stuntBanners.splice(i, 1);
      }

      // Check boost pickups
      for (const boost of state.boosts) {
        if (boost.collected) continue;
        boost.pulsePhase += dt * 3;
        const dx = state.bike.pos.x - boost.pos.x;
        const dy = state.bike.pos.y - boost.pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 45) {
          boost.collected = true;
          state.boostActive = true;
          state.boostTimer = 3.0;
          state.bike.vel.x += BOOST_AMOUNT * Math.sign(state.bike.vel.x || 1);
          addStuntBanner(state, "BOOST! 🔥", COLOR_BOOST);
          spawnSparks(state.particles, boost.pos, 200);
          playBoost();
        }
      }

      // Distance and difficulty
      state.distance = Math.max(state.distance, state.bike.pos.x);
      state.difficulty = state.distance / 3000;
      state.score += Math.floor(state.bike.vel.x * dt * 0.05);

      // Speed / height
      state.speed = Math.abs(state.bike.vel.x) * 0.06; // convert to km/h rough
      const canvasMidY = canvas.height * 0.5;
      state.height = Math.max(0, (canvasMidY - state.bike.pos.y) * 0.05);

      // Generate more terrain ahead
      const lookAhead = state.bike.pos.x + canvas.width * 2;
      if (lookAhead > state.terrainGenX - CHUNK_WIDTH) {
        const lastChunk = state.terrainChunks[state.terrainChunks.length - 1];
        const lastY =
          lastChunk && !lastChunk.isGap && lastChunk.points.length > 0
            ? lastChunk.points[lastChunk.points.length - 1].y
            : canvas.height * 0.5;
        const newChunks = generateChunk(
          state.terrainGenX,
          state.difficulty,
          lastY,
        );
        state.terrainChunks.push(...newChunks);
        state.boosts.push(...generateBoosts(newChunks));
        state.terrainGenX += CHUNK_WIDTH;

        // Remove old chunks behind camera
        const cullX = state.camera.x - CHUNK_WIDTH;
        state.terrainChunks = state.terrainChunks.filter((c) => c.endX > cullX);
      }

      // Camera update
      const lookAheadOffset = state.bike.vel.x * 0.15;
      state.cameraTarget.x =
        state.bike.pos.x - canvas.width * 0.3 + lookAheadOffset;
      state.cameraTarget.y = state.bike.pos.y - canvas.height * 0.4;
      state.camera.x += (state.cameraTarget.x - state.camera.x) * 0.08;
      state.camera.y += (state.cameraTarget.y - state.camera.y) * 0.06;

      // Game over checks
      // 1. Head hits ground
      const headX = state.bike.pos.x + Math.cos(state.bike.angle - 0.3) * 20;
      const headY =
        state.bike.pos.y + Math.sin(state.bike.angle - 0.3) * 20 - 35;
      const headTerrainY = getTerrainY(headX, state.terrainChunks);
      if (headTerrainY !== null && headY > headTerrainY - 5) {
        triggerGameOver(state);
        return;
      }

      // 2. Bike falls too far below terrain / into gap
      const terrainAtBike = getTerrainY(state.bike.pos.x, state.terrainChunks);
      const lowestVisible = state.camera.y + canvas.height + 800;
      if (state.bike.pos.y > lowestVisible) {
        triggerGameOver(state);
        return;
      }
      if (
        terrainAtBike === null &&
        isInGap(state.bike.pos.x, state.terrainChunks) &&
        state.bike.pos.y > (terrainAtBike ?? 0) + 600
      ) {
        triggerGameOver(state);
        return;
      }
      if (
        rearContact === false &&
        frontContact === false &&
        state.bike.pos.y > lowestVisible - 400
      ) {
        const terrCheck = getTerrainY(state.bike.pos.x, state.terrainChunks);
        if (terrCheck === null) {
          triggerGameOver(state);
          return;
        }
      }

      // Render
      render(canvas, state, timestamp);

      animFrameRef.current = requestAnimationFrame(update);
    },
    [
      updatePhysics,
      updateStunts,
      playBoost,
      playFlipWhoosh,
      playLandingThud,
      playWheelTick,
      setEngineSpeed,
    ],
  );

  function triggerGameOver(state: GameState) {
    state.isGameOver = true;
    playCrash();
    const endData: GameEndData = {
      score: state.score,
      maxCombo: state.maxCombo,
      stuntsPerformed: [...state.stuntsPerformed],
    };
    setGameEndData(endData);
    setShowOverlay(true);
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  function render(
    canvas: HTMLCanvasElement,
    state: GameState,
    timestamp: number,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const cam = state.camera;

    // Clear
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, W, H);

    // Draw stars (parallax)
    ctx.save();
    for (const star of starsRef.current) {
      const sx = (((star.x - cam.x * 0.1) % W) + W) % W;
      const sy = (((star.y - cam.y * 0.05) % H) + H) % H;
      ctx.globalAlpha = star.brightness;
      ctx.fillStyle = COLOR_STARS;
      ctx.beginPath();
      ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Camera transform
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // Draw terrain
    drawTerrain(ctx, state, W, H);

    // Draw boosts
    drawBoosts(ctx, state, timestamp);

    // Draw particles
    drawParticles(ctx, state);

    // Draw bike
    drawBike(ctx, state.bike);

    ctx.restore();

    // HUD (screen space)
    drawHUD(ctx, state, W, H, timestamp);
  }

  function drawTerrain(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    W: number,
    H: number,
  ) {
    const cam = state.camera;
    const bottomY = cam.y + H + 200;

    for (const chunk of state.terrainChunks) {
      if (chunk.isGap) continue;
      if (chunk.endX < cam.x - 100 || chunk.startX > cam.x + W + 100) continue;

      const pts = chunk.points;
      if (pts.length < 2) continue;

      // Filled terrain polygon
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.lineTo(pts[pts.length - 1].x, bottomY);
      ctx.lineTo(pts[0].x, bottomY);
      ctx.closePath();

      // Gradient fill
      const grad = ctx.createLinearGradient(0, pts[0].y, 0, bottomY);
      grad.addColorStop(0, "#0d2510");
      grad.addColorStop(0.3, "#091809");
      grad.addColorStop(1, "#040d04");
      ctx.fillStyle = grad;
      ctx.fill();

      // Neon outline
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.strokeStyle = COLOR_TERRAIN_OUTLINE;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = COLOR_TERRAIN_OUTLINE;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawBoosts(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    timestamp: number,
  ) {
    const t = timestamp / 1000;
    for (const boost of state.boosts) {
      if (boost.collected) continue;
      const { x, y } = boost.pos;
      const pulse = 0.85 + 0.15 * Math.sin(boost.pulsePhase + t * 4);
      const size = 14 * pulse;

      // Outer glow
      ctx.save();
      ctx.shadowColor = COLOR_BOOST_GLOW;
      ctx.shadowBlur = 20 + 10 * Math.sin(t * 3);
      ctx.fillStyle = COLOR_BOOST;
      ctx.globalAlpha = 0.8;

      // Diamond shape
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size * 0.6, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size * 0.6, y);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // "B" label
      ctx.fillStyle = "#000000";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚡", x, y);
    }
  }

  function drawParticles(ctx: CanvasRenderingContext2D, state: GameState) {
    for (const p of state.particles) {
      if (p.life <= 0) continue;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, Math.max(0.5, p.size * alpha), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function drawBike(ctx: CanvasRenderingContext2D, bike: BikeState) {
    ctx.save();
    ctx.translate(bike.pos.x, bike.pos.y);
    ctx.rotate(bike.angle);

    const half = WHEEL_BASE / 2;

    // Suspension lines
    ctx.strokeStyle = "#334466";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(-half, WHEEL_RADIUS + 8);
    ctx.moveTo(half, 0);
    ctx.lineTo(half, WHEEL_RADIUS + 8);
    ctx.stroke();

    // Bike frame
    ctx.shadowColor = COLOR_BIKE_FRAME;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = COLOR_BIKE_FRAME;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // Main frame triangle
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(0, -22);
    ctx.lineTo(half, -5);
    ctx.lineTo(-half, 0);
    ctx.stroke();

    // Top tube
    ctx.strokeStyle = COLOR_BIKE_ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-half + 5, -8);
    ctx.lineTo(half - 5, -8);
    ctx.stroke();

    // Fork
    ctx.strokeStyle = COLOR_BIKE_FRAME;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(half - 5, -8);
    ctx.lineTo(half, WHEEL_RADIUS + 6);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Rider
    drawRider(ctx, bike);

    ctx.restore();

    // Wheels (draw in world space via saved positions)
    ctx.save();
    drawWheel(ctx, bike.rearWheelPos, bike.rearWheelRot);
    drawWheel(ctx, bike.frontWheelPos, bike.frontWheelRot);
    ctx.restore();
  }

  function drawRider(ctx: CanvasRenderingContext2D, _bike: BikeState) {
    ctx.shadowColor = COLOR_RIDER;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = COLOR_RIDER;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";

    // Body
    ctx.beginPath();
    ctx.moveTo(-5, -8);
    ctx.lineTo(-5, -28);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(-5, -34, 8, 0, Math.PI * 2);
    ctx.fillStyle = COLOR_BIKE_FRAME;
    ctx.fill();
    ctx.strokeStyle = COLOR_RIDER;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Arms
    ctx.strokeStyle = COLOR_RIDER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -22);
    ctx.lineTo(12, -18); // handle bar
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-5, -22);
    ctx.lineTo(-18, -16);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(-5, -8);
    ctx.lineTo(-15, 2);
    ctx.lineTo(-half() + 5, 4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-5, -8);
    ctx.lineTo(5, 2);
    ctx.lineTo(half() - 5, 4);
    ctx.stroke();

    ctx.shadowBlur = 0;

    function half() {
      return WHEEL_BASE / 2;
    }
  }

  function drawWheel(
    ctx: CanvasRenderingContext2D,
    pos: Vec2,
    rotation: number,
  ) {
    ctx.save();
    ctx.translate(pos.x, pos.y);

    // Wheel shadow
    ctx.shadowColor = "#000000";
    ctx.shadowBlur = 10;
    ctx.fillStyle = COLOR_WHEEL_DARK;
    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Neon rim
    ctx.strokeStyle = COLOR_WHEEL_RIM;
    ctx.lineWidth = 3;
    ctx.shadowColor = COLOR_WHEEL_RIM;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_RADIUS - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Spokes
    ctx.strokeStyle = "#00cccc";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const angle = rotation + (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(
        Math.cos(angle) * (WHEEL_RADIUS - 2),
        Math.sin(angle) * (WHEEL_RADIUS - 2),
      );
      ctx.stroke();
    }

    // Hub
    ctx.fillStyle = COLOR_BIKE_ACCENT;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawHUD(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    W: number,
    _H: number,
    _timestamp: number,
  ) {
    // HUD background panel
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.beginPath();
    ctx.roundRect(16, 16, 220, 120, 8);
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(16, 16, 220, 120, 8);
    ctx.stroke();

    ctx.font = "bold 13px 'Geist Mono', monospace";
    ctx.shadowBlur = 0;

    const lines = [
      { label: "SCORE", value: state.score.toLocaleString(), color: COLOR_HUD },
      { label: "COMBO", value: `x${state.combo}`, color: "#ff00ff" },
      {
        label: "SPEED",
        value: `${Math.floor(state.speed)} km/h`,
        color: "#39ff14",
      },
      {
        label: "HEIGHT",
        value: `${Math.floor(state.height)}m`,
        color: "#ffff00",
      },
      {
        label: "AIR",
        value: `${state.currentAirTime.toFixed(1)}s`,
        color: "#ff6600",
      },
    ];

    lines.forEach((line, i) => {
      const y = 36 + i * 20;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText(`${line.label}:`, 28, y);
      ctx.fillStyle = line.color;
      ctx.shadowColor = line.color;
      ctx.shadowBlur = 6;
      ctx.fillText(line.value, 110, y);
      ctx.shadowBlur = 0;
    });

    // Boost indicator
    if (state.boostActive) {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 100);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#ffaa00";
      ctx.shadowColor = "#ffaa00";
      ctx.shadowBlur = 15;
      ctx.font = "bold 14px 'Geist Mono', monospace";
      ctx.fillText(`⚡ BOOST ${state.boostTimer.toFixed(1)}s`, 28, 148);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Stunt banners
    const bannerBaseY = 80;
    let bannerY = bannerBaseY;
    for (const banner of state.stuntBanners) {
      const progress = banner.timer / banner.maxTimer;
      const alpha = Math.min(1, progress * 3);
      const scale = 1 + (1 - progress) * 0.1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(W / 2, bannerY);
      ctx.scale(scale, scale);

      // Shadow/glow
      ctx.shadowColor = banner.color;
      ctx.shadowBlur = 25;
      ctx.font = "bold 28px 'Bricolage Grotesque', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = banner.color;
      ctx.fillText(banner.text, 0, 0);
      ctx.shadowBlur = 0;

      ctx.restore();
      bannerY += 44;
    }
    ctx.textAlign = "left";

    // Controls overlay
    if (state.showControls) {
      const alpha = Math.min(1, state.controlsTimer);
      ctx.save();
      ctx.globalAlpha = alpha * 0.92;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - 200, _H / 2 - 120, 400, 240, 12);
      ctx.fill();
      ctx.strokeStyle = "#00ffff44";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(W / 2 - 200, _H / 2 - 120, 400, 240, 12);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = COLOR_HUD;
      ctx.shadowColor = COLOR_HUD;
      ctx.shadowBlur = 10;
      ctx.font = "bold 22px 'Bricolage Grotesque', sans-serif";
      ctx.fillText("CONTROLS", W / 2, _H / 2 - 85);
      ctx.shadowBlur = 0;

      const controls = [
        ["↑ / W", "Accelerate"],
        ["↓ / S", "Brake"],
        ["← / A", "Lean Back"],
        ["→ / D", "Lean Forward"],
      ];

      ctx.font = "15px 'Geist Mono', monospace";
      controls.forEach(([key, action], i) => {
        const y = _H / 2 - 50 + i * 32;
        ctx.fillStyle = "#ffff00";
        ctx.shadowColor = "#ffff00";
        ctx.shadowBlur = 5;
        ctx.fillText(key, W / 2 - 60, y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillText(action, W / 2 + 60, y);
      });

      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "13px 'Geist Mono', monospace";
      ctx.fillText("Do flips and stunts for big scores!", W / 2, _H / 2 + 88);

      ctx.restore();
      ctx.textAlign = "left";
    }

    // Distance indicator
    ctx.font = "11px 'Geist Mono', monospace";
    ctx.fillStyle = "rgba(0,255,255,0.5)";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.floor(state.distance / 10)}m`, W - 20, 32);
    ctx.textAlign = "left";
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    initGame();

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, [initGame]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent, down: boolean) => {
      const k = keysRef.current;
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") k.up = down;
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S")
        k.down = down;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A")
        k.left = down;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D")
        k.right = down;
      // Prevent scrolling
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", (e) => handleKey(e, true));
    window.addEventListener("keyup", (e) => handleKey(e, false));
    return () => {
      window.removeEventListener("keydown", (e) => handleKey(e, true));
      window.removeEventListener("keyup", (e) => handleKey(e, false));
    };
  }, []);

  useEffect(() => {
    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(update);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [update]);

  const handleRestart = useCallback(() => {
    initGame();
    lastTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(update);
  }, [initGame, update]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#0a0a0f",
      }}
    >
      <canvas
        ref={canvasRef}
        data-ocid="game.canvas_target"
        style={{ display: "block", width: "100%", height: "100%" }}
      />

      {/* Mute toggle — sits over canvas, top-right corner */}
      <button
        type="button"
        data-ocid="game.mute_toggle"
        onClick={toggleMute}
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0, 0, 0, 0.55)",
          border: "1.5px solid rgba(0, 255, 255, 0.55)",
          borderRadius: 8,
          cursor: "pointer",
          color: muted ? "rgba(0,255,255,0.35)" : "#00ffff",
          transition: "color 0.15s, border-color 0.15s, background 0.15s",
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(0,255,255,0.12)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "rgba(0,255,255,0.9)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(0,0,0,0.55)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "rgba(0,255,255,0.55)";
        }}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* Mobile touch controls */}
      {isMobile && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 20,
          }}
        >
          {/* ── Left column: BACK FLIP (above) + BRAKE (below) ── */}

          {/* Back Flip button */}
          <button
            type="button"
            data-ocid="game.backflip_button"
            aria-label="Back Flip"
            style={{
              position: "absolute",
              bottom: 120,
              left: 20,
              width: 88,
              height: 88,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              background: "rgba(0,0,0,0.55)",
              border: "2px solid rgba(255,0,255,0.6)",
              borderRadius: 12,
              cursor: "pointer",
              color: "#ff66ff",
              fontSize: 22,
              fontFamily: "'Geist Mono', monospace",
              fontWeight: "bold",
              boxShadow:
                "0 0 14px rgba(255,0,255,0.4), inset 0 0 8px rgba(255,0,255,0.1)",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              pointerEvents: "auto",
              transition: "box-shadow 0.1s, background 0.1s",
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              keysRef.current.left = true;
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              keysRef.current.left = false;
            }}
            onMouseDown={() => {
              keysRef.current.left = true;
            }}
            onMouseUp={() => {
              keysRef.current.left = false;
            }}
            onMouseLeave={() => {
              keysRef.current.left = false;
            }}
          >
            <span style={{ fontSize: 24 }}>↺</span>
          </button>

          {/* Brake button */}
          <button
            type="button"
            data-ocid="game.brake_button"
            aria-label="Brake"
            style={{
              position: "absolute",
              bottom: 20,
              left: 20,
              width: 88,
              height: 88,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              background: "rgba(0,0,0,0.55)",
              border: "2px solid rgba(255,60,60,0.65)",
              borderRadius: 12,
              cursor: "pointer",
              color: "#ff6060",
              fontSize: 22,
              fontFamily: "'Geist Mono', monospace",
              fontWeight: "bold",
              boxShadow:
                "0 0 14px rgba(255,60,60,0.4), inset 0 0 8px rgba(255,60,60,0.1)",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              pointerEvents: "auto",
              transition: "box-shadow 0.1s, background 0.1s",
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              keysRef.current.down = true;
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              keysRef.current.down = false;
            }}
            onMouseDown={() => {
              keysRef.current.down = true;
            }}
            onMouseUp={() => {
              keysRef.current.down = false;
            }}
            onMouseLeave={() => {
              keysRef.current.down = false;
            }}
          >
            <span style={{ fontSize: 24 }}>▼</span>
          </button>

          {/* ── Right column: FRONT FLIP (above) + GAS (below) ── */}

          {/* Front Flip button */}
          <button
            type="button"
            data-ocid="game.frontflip_button"
            aria-label="Front Flip"
            style={{
              position: "absolute",
              bottom: 120,
              right: 20,
              width: 88,
              height: 88,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              background: "rgba(0,0,0,0.55)",
              border: "2px solid rgba(0,255,255,0.6)",
              borderRadius: 12,
              cursor: "pointer",
              color: "#00ffff",
              fontSize: 22,
              fontFamily: "'Geist Mono', monospace",
              fontWeight: "bold",
              boxShadow:
                "0 0 14px rgba(0,255,255,0.4), inset 0 0 8px rgba(0,255,255,0.1)",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              pointerEvents: "auto",
              transition: "box-shadow 0.1s, background 0.1s",
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              keysRef.current.right = true;
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              keysRef.current.right = false;
            }}
            onMouseDown={() => {
              keysRef.current.right = true;
            }}
            onMouseUp={() => {
              keysRef.current.right = false;
            }}
            onMouseLeave={() => {
              keysRef.current.right = false;
            }}
          >
            <span style={{ fontSize: 24 }}>↻</span>
          </button>

          {/* Gas / Accelerate button */}
          <button
            type="button"
            data-ocid="game.accelerate_button"
            aria-label="Accelerate"
            style={{
              position: "absolute",
              bottom: 20,
              right: 20,
              width: 88,
              height: 88,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              background: "rgba(0,0,0,0.55)",
              border: "2px solid rgba(57,255,20,0.65)",
              borderRadius: 12,
              cursor: "pointer",
              color: "#39ff14",
              fontSize: 22,
              fontFamily: "'Geist Mono', monospace",
              fontWeight: "bold",
              boxShadow:
                "0 0 14px rgba(57,255,20,0.45), inset 0 0 8px rgba(57,255,20,0.1)",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
              pointerEvents: "auto",
              transition: "box-shadow 0.1s, background 0.1s",
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              keysRef.current.up = true;
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              keysRef.current.up = false;
            }}
            onMouseDown={() => {
              keysRef.current.up = true;
            }}
            onMouseUp={() => {
              keysRef.current.up = false;
            }}
            onMouseLeave={() => {
              keysRef.current.up = false;
            }}
          >
            <span style={{ fontSize: 24 }}>▲</span>
          </button>
        </div>
      )}

      {showOverlay && gameEndData && (
        <GameOverlay gameEndData={gameEndData} onRestart={handleRestart} />
      )}
    </div>
  );
}
