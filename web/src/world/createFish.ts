import * as THREE from "three";
import { SPECIES, type Rarity } from "../sim/catalog";
import { poseCommonClownfish } from "./commonGlb";
import { poseRarityFish } from "./rarityGlb";
import { fishWave, fishWaveGLSL } from "./fishWave";
import { applyRootPinnedFlex, finExcursion } from "./fishMotion";

export type FishQuality = "low" | "balanced" | "high";
export type FishSize = "small" | "medium" | "large" | number;
export type FishOptions = { size?: FishSize; trait?: "swift" | "fang" | "hide"; phaseOffset?: number; quality?: FishQuality };
export type FishBounds = { radius: number; height: number; length: number };
export type FinRegion = {
  mesh: THREE.Mesh;
  rest: Float32Array;
  anchor: THREE.Vector3;
  axis: THREE.Vector3;
  weights: Float32Array;
  maxAngle: number;
  kind: "median" | "finlet" | "pelvic" | "pectoral" | "caudal";
  side: number;
  phase: number;
};

/** Visual multiplier only; never used for collision or combat. Numeric sizes are direct multipliers. */
export function fishVisualScale(size?: FishSize): number {
  if (typeof size === "number") return Number.isFinite(size) ? Math.max(0.25, Math.min(4, size)) : 1;
  return size === "small" ? 0.7 : size === "large" ? 1.4 : 1;
}

export type FishRig = {
  root: THREE.Group;
  visual: THREE.Group;
  body: THREE.Mesh;
  tail: THREE.Group;
  jaw: THREE.Group;
  fins: THREE.Group;
  lure: THREE.Group | null;
  bounds: FishBounds;
  baseBounds: FishBounds;
  speciesScale: number;
  motion: { phase: number; rate: number; amplitude: number; secondaryAmplitude: number; lastTime: number | null; bite: number };
  finRegions: FinRegion[];
  oralMeshes: THREE.Mesh[];
  disposed: boolean;
  attachments: { object: THREE.Object3D; rest: THREE.Vector3; rotation: THREE.Quaternion }[];
  waveMaterials: THREE.MeshPhysicalMaterial[];
  gait: { rate: number; strength: number; pectoral: number };
};

type Look = {
  species: Rarity;
  back: string;
  belly: string;
  fin: string;
  mark: string;
  emissive: string;
  glow: number;
  length: number;
  thick: number;
  eye: number;
  pattern: "plain" | "stripes" | "spots" | "runes";
  spines: number;
  teeth: boolean;
  lure: boolean;
  barbels: boolean;
  horn: boolean;
  keel: boolean;
  dorsal: number;
  /** Dorsal run as a fraction of body length. */
  sail: number;
  /** Radius samples from nose (u=0) to tail (u=1). Catmull-Rom, not one shared profile. */
  knots: number[];
  /** Vertical radius / horizontal radius. */
  deep: number;
  arch: number;
  /** Tail lobe scale. */
  tail: number;
  /** How wide the fork opens. */
  fork: number;
  /** Pectoral scale. */
  pec: number;
};

const LOOK: Record<Rarity, Look> = {
  common: {
    species: "common",
    back: "#d5e2ea",
    belly: "#f7fbfc",
    fin: "#c5d5df",
    mark: "#8ea4b4",
    emissive: "#000000",
    glow: 0,
    length: 2.15,
    thick: 0.32,
    eye: 0.12,
    pattern: "plain",
    spines: 0,
    teeth: false,
    lure: false,
    barbels: false,
    horn: false,
    keel: false,
    dorsal: 0.3,
    sail: 0.4,
    knots: [0.36, 0.74, 1, 0.94, 0.66, 0.3, 0.12],
    deep: 0.98,
    arch: 0.05,
    tail: 0.78,
    fork: 0.22,
    pec: 0.72,
  },
  uncommon: {
    species: "uncommon",
    back: "#1a62d0",
    belly: "#e7f8ff",
    fin: "#9ad4ff",
    mark: "#123b70",
    emissive: "#000000",
    glow: 0,
    length: 2.7,
    thick: 0.36,
    eye: 0.09,
    pattern: "stripes",
    spines: 0,
    teeth: false,
    lure: false,
    barbels: false,
    horn: false,
    keel: false,
    dorsal: 0.16,
    sail: 0.62,
    knots: [0.06, 0.2, 0.48, 0.86, 1, 0.92, 0.58, 0.2, 0.06],
    deep: 0.7,
    arch: 0.02,
    tail: 1.05,
    fork: 0.72,
    pec: 0.52,
  },
  rare: {
    species: "rare",
    back: "#b84f43",
    belly: "#ffd0b0",
    fin: "#ff8a62",
    mark: "#ffd35a",
    emissive: "#000000",
    glow: 0,
    length: 2.45,
    thick: 0.58,
    eye: 0.09,
    pattern: "spots",
    spines: 5,
    teeth: true,
    lure: false,
    barbels: false,
    horn: false,
    keel: true,
    dorsal: 0.58,
    sail: 0.46,
    knots: [0.4, 0.86, 1.08, 1, 0.74, 0.34, 0.14],
    deep: 1.24,
    arch: 0.08,
    tail: 0.9,
    fork: 0.12,
    pec: 0.95,
  },
  epic: {
    species: "epic",
    back: "#354853",
    belly: "#9ba69e",
    fin: "#536758",
    mark: "#708276",
    emissive: "#6d3dff",
    glow: 0.18,
    length: 2.5,
    thick: 0.62,
    eye: 0.1,
    pattern: "spots",
    spines: 0,
    teeth: true,
    lure: true,
    barbels: false,
    horn: false,
    keel: false,
    dorsal: 0.18,
    sail: 0.28,
    knots: [0.58, 1.08, 0.9, 0.55, 0.32, 0.16, 0.07],
    deep: 0.86,
    arch: 0.03,
    tail: 0.52,
    fork: 0.16,
    pec: 0.88,
  },
  legendary: {
    species: "legendary",
    back: "#f0b429",
    belly: "#fff6dc",
    fin: "#d6e4bb",
    mark: "#fffaf0",
    emissive: "#ff9d00",
    glow: 0.08,
    length: 3.35,
    thick: 0.42,
    eye: 0.09,
    pattern: "stripes",
    spines: 0,
    teeth: false,
    lure: false,
    barbels: true,
    horn: false,
    keel: false,
    dorsal: 0.42,
    sail: 0.5,
    knots: [0.16, 0.36, 0.58, 0.74, 0.78, 0.72, 0.56, 0.34, 0.14],
    deep: 0.8,
    arch: 0.05,
    tail: 0.95,
    fork: 0.85,
    pec: 0.85,
  },
  mythic: {
    species: "mythic",
    back: "#141820",
    belly: "#2a384c",
    fin: "#243246",
    mark: "#7dfff1",
    emissive: "#1ad6c5",
    glow: 0.12,
    length: 3.6,
    thick: 0.7,
    eye: 0.11,
    pattern: "runes",
    spines: 3,
    teeth: true,
    lure: false,
    barbels: false,
    horn: true,
    keel: true,
    dorsal: 0.46,
    sail: 0.5,
    knots: [0.38, 0.74, 1, 1.04, 0.98, 0.74, 0.42, 0.16],
    deep: 0.92,
    arch: 0.1,
    tail: 1.18,
    fork: 0.38,
    pec: 1.08,
  },
};

function sampleProfile(knots: number[], u: number): number {
  const n = knots.length;
  const x = Math.min(1, Math.max(0, u)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const t = x - i;
  const p0 = knots[Math.max(0, i - 1)];
  const p1 = knots[i];
  const p2 = knots[i + 1];
  const p3 = knots[Math.min(n - 1, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  const v =
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  return Math.max(0.05, Math.min(1.25, v));
}

function bodyGeometry(length: number, thick: number, knots: number[], deep: number, arch: number, quality: FishQuality): THREE.BufferGeometry {
  const seg = quality === "low" ? 28 : quality === "high" ? 72 : 48;
  const rad = quality === "low" ? 18 : quality === "high" ? 40 : 28;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const z = -length * 0.5 + u * length;
    const r = Math.max(0.025, thick * sampleProfile(knots, u));
    const rx = r;
    const ry = r * deep;
    const lift = r * arch;
    for (let j = 0; j <= rad; j++) {
      const v = (j / rad) * Math.PI * 2;
      positions.push(Math.sin(v) * rx, Math.cos(v) * ry + lift, z);
      uvs.push(u, j / rad);
    }
  }
  const row = rad + 1;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rad; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Nose ring is the sole aperture; close the caudal peduncle.
  const cap = positions.length / 3;
  positions.push(0, thick * sampleProfile(knots, 1) * arch, length * 0.5);
  uvs.push(1, 0.5);
  for (let j = 0; j < rad; j++) indices.push(seg * row + j, cap, seg * row + j + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.bodySegments = seg;
  geo.userData.radialSegments = rad;
  weldBodySeamNormals(geo);
  geo.userData.mouthAperture = { radialSegments: rad };
  return geo;
}

function weldBodySeamNormals(geo: THREE.BufferGeometry): void {
  const seg = geo.userData.bodySegments as number;
  const rad = geo.userData.radialSegments as number;
  const row = rad + 1;
  const normals = geo.getAttribute("normal");
  for (let i = 0; i <= seg; i++) {
    const first = i * row, last = first + rad;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, first)
      .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  normals.needsUpdate = true;
}

/** Rotate the lower head about the oral hinge, fading into the fixed cheek. */
function biteGeometry(geometry: THREE.BufferGeometry, bite: number): void {
  if (geometry.userData.lastBite === bite) return;
  const positions = geometry.getAttribute("position");
  const rest = geometry.userData.restPositions as Float32Array;
  const { center, nose, depth, length } = geometry.userData.biteHinge as {
    center: number; nose: number; depth: number; length: number;
  };
  const angle = -bite * 0.62;
  for (let i = 0; i < positions.count; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1] - center, z = rest[i * 3 + 2] - nose;
    // Both sides of the mouth rim share this weight. The longitudinal fade
    // ends at the hinge so the lower head rejoins the stationary body.
    const lower = THREE.MathUtils.clamp(-y / Math.max(0.01, length * 0.03), 0, 1);
    const fade = 1 - THREE.MathUtils.smoothstep(z, 0, depth);
    const weight = lower * fade;
    const rotatedY = y * Math.cos(angle) - (z - depth) * Math.sin(angle);
    const rotatedZ = y * Math.sin(angle) + (z - depth) * Math.cos(angle) + depth;
    positions.setXYZ(i, x, THREE.MathUtils.lerp(y, rotatedY, weight) + center,
      THREE.MathUtils.lerp(z, rotatedZ, weight) + nose);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  if (geometry.userData.bodySegments !== undefined) weldBodySeamNormals(geometry);
  geometry.userData.lastBite = bite;
}

function finVolume(length: number, height: number, bend: number, thick: number, quality: FishQuality, outline: "compact" | "paddle" | "flowing" | "angular" | "spiny" = "compact"): THREE.BufferGeometry {
  const cols = quality === "low" ? 12 : quality === "high" ? 32 : 22;
  const rows = quality === "low" ? 4 : quality === "high" ? 10 : 7;
  const centers: THREE.Vector3[] = [];
  const norms: THREE.Vector3[] = [];
  const at = (i: number, j: number) => {
    const t = i / cols;
    const s = j / rows;
    const sine = Math.max(0, Math.sin(t * Math.PI));
    const fade = outline === "paddle" ? sine ** 0.45
      : outline === "flowing" ? sine ** 0.8 * (0.75 + 0.55 * t)
      : outline === "angular" ? Math.min(t * 3.3, (1 - t) * 1.6, 1)
      : outline === "spiny" ? sine * (0.82 + 0.18 * Math.cos(t * Math.PI * 10) ** 2) : sine;
    const edge = 0.58 + 0.42 * Math.sin(Math.min(1, s) * Math.PI * 0.5);
    return new THREE.Vector3(t * length, fade * height * s * edge * (1 - 0.045 * s * Math.cos(t * Math.PI * 22)), bend * fade * s * s);
  };
  const id = (i: number, j: number) => i * (rows + 1) + j;
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) centers.push(at(i, j));
  }
  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(cols, i + 1);
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(rows, j + 1);
      const tangent = centers[id(i1, j)].clone().sub(centers[id(i0, j)]);
      const span = centers[id(i, j1)].clone().sub(centers[id(i, j0)]);
      const normal = new THREE.Vector3().crossVectors(tangent, span);
      if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
      else normal.normalize();
      norms.push(normal);
    }
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const pushShell = (sign: number) => {
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        const k = id(i, j);
        const normal = norms[k];
        const point = centers[k];
        const taper = 1 - 0.92 * (j / rows);
        positions.push(
          point.x + normal.x * sign * thick * 0.5 * taper,
          point.y + normal.y * sign * thick * 0.5 * taper,
          point.z + normal.z * sign * thick * 0.5 * taper,
        );
        uvs.push(i / cols, j / rows);
      }
    }
  };
  pushShell(1);
  pushShell(-1);
  const stride = (cols + 1) * (rows + 1);
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => {
    indices.push(a, c, b, b, c, d);
  };
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = id(i, j);
      const b = id(i, j + 1);
      const c = id(i + 1, j);
      const d = id(i + 1, j + 1);
      quad(a, b, c, d);
      quad(a + stride, c + stride, b + stride, d + stride);
    }
  }
  const rim = (a: number, b: number, c: number, d: number) => {
    indices.push(a, b, c, c, b, d);
  };
  for (let i = 0; i < cols; i++) {
    const a = id(i, 0);
    const c = id(i + 1, 0);
    rim(a, a + stride, c, c + stride);
    const tip = id(i, rows);
    const tipNext = id(i + 1, rows);
    rim(tip + stride, tip, tipNext + stride, tipNext);
  }
  for (let j = 0; j < rows; j++) {
    const a = id(0, j);
    const b = id(0, j + 1);
    rim(a + stride, a, b + stride, b);
    const c = id(cols, j);
    const d = id(cols, j + 1);
    rim(c, c + stride, d, d + stride);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.finProfile = { outline, cols, rows, rootThickness: thick, edgeThickness: thick * 0.08 };
  return geo;
}

/** Closed tapered tube, shared by inward-curving teeth and flexible mouth barbels. */
function taperedCurve(points: THREE.Vector3[], radius: number, quality: FishQuality): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const segments = quality === "low" ? 8 : quality === "high" ? 24 : 16;
  const sides = 6;
  const geometry = new THREE.TubeGeometry(curve, segments, radius, sides, false);
  const positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    const u = uv.getX(i), center = curve.getPointAt(u);
    const point = new THREE.Vector3().fromBufferAttribute(positions, i).sub(center)
      .multiplyScalar(1 - u * 0.97).add(center);
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  // Cap both ends rather than leaving the tooth tip or barbel root open.
  const indices = Array.from(geometry.index!.array);
  for (let j = 1; j < sides - 1; j++) {
    indices.push(0, j + 1, j);
    const last = segments * (sides + 1);
    indices.push(last, last + j, last + j + 1);
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.taper = { rootRadius: radius, tipRadius: radius * 0.03, segments, sides };
  return geometry;
}

function hexRgb(hex: string): [number, number, number] {
  const n = hex.replace("#", "");
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

const SCALE_DETAIL = {
    common: { columns: 68, rows: 34, relief: 0.007, shape: "shallow" },
    uncommon: { columns: 92, rows: 44, relief: 0.004, shape: "fine" },
    rare: { columns: 34, rows: 20, relief: 0.02, shape: "round" },
    epic: { columns: 0, rows: 0, relief: 0.008, shape: "grain" },
    legendary: { columns: 40, rows: 22, relief: 0.018, shape: "overlap" },
    mythic: { columns: 23, rows: 14, relief: 0.026, shape: "plate" },
} as const;


/** Deterministic, canvas-free scale relief, pigmentation and fin rays. No per-scale meshes. */
function patternMaps(look: Look, quality: FishQuality, fin = false): { color: THREE.DataTexture; relief: THREE.DataTexture; roughness: THREE.DataTexture } {
  const width = quality === "low" ? 128 : quality === "high" ? 512 : 256;
  const height = width / 2;
  const color = new Uint8Array(width * height * 4);
  const relief = new Uint8Array(width * height * 4);
  const roughness = new Uint8Array(width * height * 4);
  const scale = SCALE_DETAIL[look.species];
  const back = hexRgb(fin ? look.fin : look.back);
  const belly = hexRgb(fin ? look.fin : look.belly);
  const mark = hexRgb(look.mark);
  for (let y = 0; y < height; y++) {
    const v = y / height;
    // Body radial UV: dorsal at 0/1, belly at .5, flanks at .25/.75.
    const bellyMix = (0.5 - 0.5 * Math.cos(v * Math.PI * 2)) ** 2;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const row = Math.floor(v * scale.rows);
      const sx = ((u * scale.columns + (row % 2) * 0.5) % 1) - 0.5;
      const sy = (v * scale.rows) % 1;
      const outline = scale.shape === "plate" ? 0.22 + 0.65 * (1 - Math.abs(sx) * 2)
        : 0.28 + 0.55 * Math.sqrt(Math.max(0, 1 - 4 * sx * sx));
      const arc = Math.abs(sy - outline);
      // No repeated body scales across the face/operculum or thin peduncle.
      const mask = THREE.MathUtils.smoothstep(u, 0.29, 0.39) * (1 - THREE.MathUtils.smoothstep(u, 0.88, 0.98));
      const edge = scale.shape === "grain" ? 0 : Math.exp(-arc * 30) * mask
        * (0.55 + 0.45 * Math.sin(v * Math.PI * 2) ** 2);
      const grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const noise = grain - Math.floor(grain);
      let pigment = 0;
      if (look.pattern === "stripes") {
        pigment = look.barbels
          ? Math.max(0, Math.sin(u * 17 + Math.cos(v * 19)) - 0.25) * 0.52
          : Math.max(0, Math.cos(u * 105 + Math.sin(v * 26) * 1.3)) ** 5 * (1 - bellyMix) * 0.85;
      } else if (look.pattern === "spots") {
        pigment = Math.max(0, Math.sin(u * 49 + Math.cos(v * 37)) * Math.cos(v * 41) - 0.52) * 0.48;
      } else if (look.pattern === "runes") {
        const lateral = Math.min(Math.abs(v - 0.25), Math.abs(v - 0.75));
        pigment = Math.exp(-lateral * 150) * (0.6 + 0.4 * Math.cos(u * 80)) * mask;
      }
      // Fan UV rays converge at the root and spread towards the trailing edge.
      const rayCoordinate = (u - 0.5) / (0.35 + v * 0.65);
      const rays = Math.max(0, Math.cos(rayCoordinate * Math.PI * 28)) ** 12;
      const h = fin ? 0.35 + rays * (0.25 + v * 0.22) : 0.56 - edge * 0.28 + noise * (look.lure ? 0.12 : 0.035);
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const base = back[c] + (belly[c] - back[c]) * bellyMix;
        color[i + c] = Math.max(0, Math.min(255, base + (mark[c] - base) * (fin ? 0 : pigment) - (fin ? 0 : edge * 9) + noise * 5 - (fin ? rays * 28 : 0)));
        relief[i + c] = Math.round(h * 255);
        roughness[i + c] = Math.round(255 * (fin ? 0.68 + rays * 0.15 : 0.72 + edge * 0.12 + noise * 0.08));
      }
      color[i + 3] = relief[i + 3] = roughness[i + 3] = 255;
    }
  }
  const make = (data: Uint8Array) => {
    const texture = new THREE.DataTexture(new Uint8Array(data), width, height);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = quality === "low" ? 1 : 4;
    texture.needsUpdate = true;
    return texture;
  };
  const map = make(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.userData.pattern = fin ? { kind: "fin-rays", rootToTip: true } : { ...scale, headMask: [0.29, 0.39] };
  return { color: map, relief: make(relief), roughness: make(roughness) };
}

function wet(color: string, glow = "#000000", intensity = 0, fin = false): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: fin ? 0.62 : 0.48,
    metalness: 0,
    clearcoat: fin ? 0.04 : 0.16,
    clearcoatRoughness: 0.38,
    sheen: fin ? 0.12 : 0.08,
    sheenRoughness: 0.28,
    sheenColor: new THREE.Color("#eefaff"),
    ior: 1.34,
    transmission: 0,
    thickness: fin ? 0.015 : 0.12,
    attenuationColor: new THREE.Color("#8adfff"),
    attenuationDistance: 2.4,
    emissive: glow,
    emissiveIntensity: intensity,
    side: fin ? THREE.DoubleSide : THREE.FrontSide,
  });
}

function bindWave(mat: THREE.MeshPhysicalMaterial, length: number, thick: number): void {
  const phase = { value: 0 };
  const amplitude = { value: 1 };
  mat.userData.waveTime = phase;
  mat.userData.wavePhase = phase;
  mat.userData.waveAmplitude = amplitude;
  mat.userData.waveRate = { value: 2.9 };
  const previousCompile = mat.onBeforeCompile;
  const inheritedKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(mat, shader, renderer);
    shader.uniforms.uFishPhase = phase;
    shader.uniforms.uFishAmplitude = amplitude;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
${fishWaveGLSL(length, thick * 0.22)}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
        vec2 slope = fishSlope(position.z);
        objectNormal = normalize(vec3(objectNormal.xy, objectNormal.z - dot(slope, objectNormal.xy)));
        #ifdef USE_TANGENT
          objectTangent = normalize(vec3(objectTangent.xy + slope * objectTangent.z, objectTangent.z));
        #endif`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        transformed.xy += fishWave(position.z);`);
  };
  mat.customProgramCacheKey = () => `${inheritedKey}|shoal-wave-v5-${length}-${thick}`;
}

/** Cross-section of the silhouette at u, nose at 0. */
function sectionAt(look: Look, u: number): { z: number; rx: number; ry: number; center: number } {
  const r = Math.max(0.025, look.thick * sampleProfile(look.knots, u));
  return {
    z: -look.length * 0.5 + u * look.length,
    rx: r,
    ry: r * look.deep,
    center: r * look.arch,
  };
}

/** Elliptic skin sampler includes longitudinal profile slope and centerline arch. */
function surfaceAt(look: Look, u: number, angle: number) {
  const section = sectionAt(look, u);
  const before = sectionAt(look, Math.max(0, u - 0.001));
  const after = sectionAt(look, Math.min(1, u + 0.001));
  const position = new THREE.Vector3(Math.sin(angle) * section.rx, Math.cos(angle) * section.ry + section.center, section.z);
  const tangent = new THREE.Vector3(Math.sin(angle) * (after.rx - before.rx),
    Math.cos(angle) * (after.ry - before.ry) + after.center - before.center, after.z - before.z).normalize();
  const around = new THREE.Vector3(Math.cos(angle) * section.rx, -Math.sin(angle) * section.ry, 0);
  const normal = new THREE.Vector3().crossVectors(tangent, around).normalize();
  return { position, normal, tangent };
}

function oralProfile(look: Look) {
  return {
    common: { depth: 0.145, lip: 0.006, throat: 0.1 },
    uncommon: { depth: 0.145, lip: 0.005, throat: 0.12 },
    rare: { depth: 0.18, lip: 0.012, throat: 0.18 },
    epic: { depth: 0.24, lip: 0.021, throat: 0.22 },
    legendary: { depth: 0.15, lip: 0.01, throat: 0.14 },
    mythic: { depth: 0.21, lip: 0.016, throat: 0.2 },
  }[look.species];
}

function mouthGeometry(look: Look, quality: FishQuality): THREE.BufferGeometry {
  const rad = quality === "low" ? 18 : quality === "high" ? 40 : 28;
  const mouth = sectionAt(look, 0);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let ring = 0; ring <= 5; ring++) {
    const depth = ring / 5;
    for (let j = 0; j <= rad; j++) {
      const angle = j / rad * Math.PI * 2;
      const radius = 1 - depth * (1 - oralProfile(look).throat);
      positions.push(Math.sin(angle) * mouth.rx * radius, Math.cos(angle) * mouth.ry * radius,
        depth * look.length * oralProfile(look).depth);
      uvs.push(j / rad, depth);
    }
  }
  for (let ring = 0; ring < 5; ring++) for (let j = 0; j < rad; j++) {
    const a = ring * (rad + 1) + j, b = a + rad + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const center = positions.length / 3;
  positions.push(0, 0, look.length * oralProfile(look).depth); uvs.push(0.5, 1);
  for (let j = 0; j < rad; j++) indices.push(5 * (rad + 1) + j, 5 * (rad + 1) + j + 1, center);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function jawGeometry(look: Look): THREE.BufferGeometry {
  const mouth = sectionAt(look, 0), cheek = sectionAt(look, 0.13);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 16; j++) {
    const u = i / 4, angle = Math.PI / 2 + j / 16 * Math.PI;
    positions.push(Math.sin(angle) * THREE.MathUtils.lerp(mouth.rx, cheek.rx * 0.94, u),
      Math.cos(angle) * THREE.MathUtils.lerp(mouth.ry, cheek.ry * 0.94, u),
      -look.length * 0.13 * (1 - u));
    uvs.push(u, j / 16);
    if (i < 4 && j < 16) { const a = i * 17 + j; indices.push(a, a + 17, a + 1, a + 1, a + 17, a + 18); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function caudalGeometry(look: Look, quality: FishQuality): THREE.BufferGeometry {
  const span = quality === "low" ? 16 : quality === "high" ? 44 : 32, rows = quality === "low" ? 4 : quality === "high" ? 10 : 7;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const root = sectionAt(look, 0.94);
  for (let i = 0; i <= span; i++) for (let j = 0; j <= rows; j++) {
    const v = i / span * 2 - 1, s = j / rows;
    const edge = (0.54 + Math.abs(v) * look.fork * 0.46) * look.tail;
    positions.push(0.016 * (1 - s) * Math.sin(v * Math.PI),
      root.center + v * (root.ry * (1 - s) + 0.59 * look.tail * s),
      root.z + s * edge * (1 - 0.022 * Math.cos(v * Math.PI * 12) * s));
    uvs.push((v + 1) / 2, s);
    if (i < span && j < rows) { const a = i * (rows + 1) + j; indices.push(a, a + 1, a + rows + 1, a + 1, a + rows + 2, a + rows + 1); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function createFish(rarity: Rarity, options: FishOptions = {}): FishRig {
  const quality = options.quality ?? "balanced";
  const look = LOOK[rarity];
  const root = new THREE.Group();
  root.name = `fish-${rarity}`;
  const visual = new THREE.Group();
  root.add(visual);

  const maps = patternMaps(look, quality);
  const lift = 0;
  const glow = look.emissive === "#000000" ? look.back : look.emissive;
  const skin = wet("#ffffff");
  skin.map = maps.color;
  skin.bumpMap = maps.relief;
  skin.roughnessMap = maps.roughness;
  skin.bumpScale = SCALE_DETAIL[rarity].relief * (options.trait === "hide" ? 2.5 : 1);
  skin.roughness = options.trait === "hide" ? 0.56 : 0.4;
  bindWave(skin, look.length, look.thick);
  const body = new THREE.Mesh(bodyGeometry(look.length, look.thick, look.knots, look.deep, look.arch, quality), skin);
  body.name = "body";
  body.geometry.userData.fishLength = look.length;
  body.geometry.userData.fishStrength = look.thick * 0.22;
  body.geometry.userData.restPositions = new Float32Array(body.geometry.getAttribute("position").array);
  body.geometry.userData.biteHinge = { center: sectionAt(look, 0).center, nose: -look.length * 0.5,
    depth: look.length * 0.13, length: look.length };
  visual.add(body);

  const finMat = wet(look.fin, glow, lift * 0.35, true);
  const finMaps = patternMaps(look, quality, true);
  finMat.color.set("#ffffff");
  finMat.map = finMaps.color;
  finMat.bumpMap = finMaps.relief;
  finMat.roughnessMap = finMaps.roughness;
  finMat.bumpScale = 0.012;
  if (options.trait === "swift") finMat.sheen = 0.18;
  const finOutline = look.barbels ? "flowing" : look.horn ? "angular" : rarity === "rare" ? "spiny" : "compact";
  const sail = sectionAt(look, 0.42);
  const dorsal = new THREE.Mesh(finVolume(look.length * look.sail, look.dorsal, 0.04, 0.028, quality, finOutline), finMat);
  dorsal.name = "dorsal";
  dorsal.rotation.y = -Math.PI / 2;
  dorsal.position.set(0, sail.ry * 0.9 + sail.center, sail.z - look.length * 0.04);
  visual.add(dorsal);

  if (rarity === "uncommon") {
    dorsal.scale.x = 0.46;
    const rear = sectionAt(look, 0.59);
    const second = new THREE.Mesh(finVolume(look.length * 0.16, 0.13, 0.025, 0.021, quality, "angular"), finMat);
    second.name = "second-dorsal";
    second.rotation.y = -Math.PI / 2;
    second.position.set(0, rear.ry + rear.center, rear.z);
    visual.add(second);
  }

  const fins = new THREE.Group();
  fins.name = "pectorals";
  const pectoralGeo = finVolume((look.barbels ? 1.15 : 0.62) * look.pec, 0.28 * look.pec, 0.16, 0.026, quality, look.lure ? "paddle" : finOutline);
  const gill = sectionAt(look, 0.3);
  const left = new THREE.Mesh(pectoralGeo, finMat);
  left.position.set(gill.rx * 0.82, -gill.ry * 0.08 + gill.center, gill.z);
  left.rotation.z = -0.85;
  left.rotation.y = 0.55;
  left.rotation.x = 0.35;
  const right = new THREE.Mesh(pectoralGeo, finMat);
  right.position.set(-gill.rx * 0.82, -gill.ry * 0.08 + gill.center, gill.z);
  right.rotation.z = 0.85;
  right.rotation.y = -0.55;
  right.rotation.x = 0.35;
  fins.add(left, right);
  visual.add(fins);

  const tail = new THREE.Group();
  tail.position.set(0, 0, look.length * 0.4);
  tail.name = "caudal-root";
  const caudal = new THREE.Mesh(caudalGeometry(look, quality), finMat);
  caudal.name = "caudal-membrane";
  caudal.position.z = -tail.position.z;
  tail.add(caudal);
  visual.add(tail);

  const curveMesh = (points: THREE.Vector3[], radius: number, material: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), quality === "low" ? 12 : 24, radius, 6, false), material);
    mesh.name = name;
    return mesh;
  };
  const mouth = sectionAt(look, 0);
  const width = mouth.rx;
  const height = mouth.ry;
  const lipMat = wet(look.lure ? "#79607f" : look.fin);
  const cavity = new THREE.Mesh(mouthGeometry(look, quality), wet("#271d21"));
  cavity.name = "mouth-cavity";
  cavity.geometry.userData.restPositions = new Float32Array(cavity.geometry.getAttribute("position").array);
  cavity.geometry.userData.biteHinge = { center: 0, nose: 0, depth: look.length * 0.13, length: look.length };
  cavity.position.set(0, mouth.center, mouth.z);
  visual.add(cavity);
  const jaw = new THREE.Group();
  jaw.name = "jaw";
  jaw.position.set(0, mouth.center, mouth.z + look.length * 0.13);
  const lipPoints = (upper: boolean) => Array.from({ length: 13 }, (_, i) => {
    const angle = i / 12 * Math.PI;
    return new THREE.Vector3(Math.cos(angle) * width, (upper ? 1 : -1) * Math.sin(angle) * height, -look.length * 0.13);
  });
  const upperLip = curveMesh(lipPoints(true), oralProfile(look).lip, lipMat, "upper-lip");
  upperLip.position.copy(jaw.position);
  visual.add(upperLip);
  const lowerLip = curveMesh(lipPoints(false), oralProfile(look).lip * 1.12, lipMat, "lower-lip");
  lowerLip.position.copy(jaw.position);
  visual.add(lowerLip);
  const jawMesh = new THREE.Mesh(jawGeometry(look), wet(look.back));
  jawMesh.name = "lower-jaw-skin";
  jawMesh.position.copy(jaw.position);
  visual.add(jawMesh);
  if (look.teeth || options.trait === "fang") {
    const toothMat = wet("#e3decb");
    const count = look.lure ? 13 : look.horn ? 9 : 7;
    for (const upper of [false, true]) for (let i = 0; i < count; i++) {
      const angle = 0.18 + (i / (count - 1)) * (Math.PI - 0.36);
      const sign = upper ? 1 : -1;
      const rootPoint = new THREE.Vector3(Math.cos(angle) * width * 0.97,
        sign * Math.sin(angle) * height * 0.97, 0.008);
      const frontFang = i === Math.floor(count / 2) - 1 || i === Math.ceil(count / 2);
      const toothLength = (look.lure ? (i % 2 ? 0.13 : 0.21)
        : look.horn ? (frontFang ? 0.2 : 0.085) : frontFang ? 0.11 : 0.045)
        * (options.trait === "fang" ? 1.25 : 1);
      const tip = rootPoint.clone().add(new THREE.Vector3(-rootPoint.x * 0.16, -sign * toothLength, toothLength * 0.42));
      const middle = rootPoint.clone().lerp(tip, 0.5); middle.z -= toothLength * 0.11;
      const geometry = taperedCurve([rootPoint, middle, tip], look.lure ? 0.009 : frontFang ? 0.016 : 0.01, quality);
      geometry.userData.oralAnchor = rootPoint.clone().add(new THREE.Vector3(0, mouth.center, mouth.z));
      const tooth = new THREE.Mesh(geometry, toothMat);
      tooth.name = upper ? "upper-tooth" : "lower-tooth";
      tooth.position.set(0, mouth.center, mouth.z);
      visual.add(tooth);
    }
  }
  visual.add(jaw);
  const orbitMat = wet(look.back);
  const irisMat = wet(look.lure ? "#c9aa67" : look.barbels ? "#b6cda4" : "#b49b58");
  const pupilMat = wet("#060d14");
  const corneaMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.12, roughness: 0.08, metalness: 0, clearcoat: 0.3, ior: 1.37, depthWrite: false });
  const gillMat = wet(look.lure ? "#332238" : "#59383a");
  const lineMat = look.horn ? wet(look.mark, look.emissive, 0.45) : lipMat;
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.name = side < 0 ? "eye-left" : "eye-right";
    const surface = surfaceAt(look, 0.19, side * 1.17);
    eye.position.copy(surface.position).addScaledVector(surface.normal, -look.eye * 0.09);
    eye.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), surface.normal);
    const orbit = new THREE.Mesh(new THREE.SphereGeometry(look.eye * 1.18, 16, 12), orbitMat);
    orbit.scale.set(0.24, 1, 1);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(look.eye, 20, 14), irisMat);
    iris.scale.set(0.22, 1, 1); iris.position.x = look.eye * 0.13;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(look.eye * 0.58, 16, 12), pupilMat);
    pupil.scale.set(0.14, 1, 1); pupil.position.x = look.eye * 0.3;
    const cornea = new THREE.Mesh(new THREE.SphereGeometry(look.eye * 1.02, 20, 14), corneaMat);
    cornea.name = "cornea";
    cornea.scale.set(0.28, 1, 1); cornea.position.x = look.eye * 0.15;
    eye.add(orbit, iris, pupil, cornea);
    visual.add(eye);
    const points = Array.from({ length: 9 }, (_, i) => {
      const angle = -1.12 + i / 8 * 2.24;
      const section = sectionAt(look, 0.3 + Math.cos(angle) * 0.028);
      return new THREE.Vector3(side * section.rx * Math.cos(angle) * 1.015, section.ry * Math.sin(angle) + section.rx * look.arch, section.z);
    });
    visual.add(curveMesh(points, 0.004, gillMat, `gill-slit-${side}`));
    visual.add(curveMesh(points.map(point => point.clone().add(new THREE.Vector3(side * 0.006, 0, -0.022))), 0.006, lipMat, `operculum-${side}`));
    const line = Array.from({ length: 14 }, (_, i) => {
      const section = sectionAt(look, 0.36 + i / 13 * 0.53);
      return new THREE.Vector3(side * section.rx * 1.008, section.ry * 0.06 + section.center, section.z);
    });
    visual.add(curveMesh(line, look.horn ? 0.009 : 0.0025, lineMat, `lateral-line-${side}`));
  }

  for (let i = 0; i < look.spines; i++) {
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.42, 8), wet(look.mark));
    const u = 0.36 + (look.spines === 1 ? 0.1 : (i / (look.spines - 1)) * 0.28);
    const back = sectionAt(look, u);
    spine.name = "dorsal-spine";
    spine.position.set(0, back.ry + back.center + 0.16, back.z);
    visual.add(spine);
  }

  let lure: THREE.Group | null = null;
  if (look.lure) {
    lure = new THREE.Group();
    const crown = sectionAt(look, 0.16);
    lure.position.set(0, crown.ry * 0.92 + crown.center, crown.z);
    const stalk = curveMesh([new THREE.Vector3(), new THREE.Vector3(0, 0.3, -0.04),
      new THREE.Vector3(0, 0.54, -0.3), new THREE.Vector3(0, 0.42, -0.53)], 0.015, finMat, "lure-stalk");
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), wet("#dceada", "#aeead4", 0.8));
    bulb.name = "lure-bulb";
    bulb.position.set(0, 0.42, -0.53);
    lure.add(stalk, bulb);
    visual.add(lure);
  }

  if (look.barbels) {
    const whisker = wet(look.fin, glow, lift * 0.2, true);
    for (const side of [-1, 1]) for (const short of [false, true]) {
      const angle = side * (short ? 1.22 : 1.72);
      const rootPoint = new THREE.Vector3(Math.sin(angle) * width, Math.cos(angle) * height + mouth.center, mouth.z);
      const reach = short ? 0.32 : 0.68;
      const geometry = taperedCurve([rootPoint,
        rootPoint.clone().add(new THREE.Vector3(side * reach * 0.25, -reach * 0.16, -reach * 0.24)),
        rootPoint.clone().add(new THREE.Vector3(side * reach * 0.45, -reach * 0.3, -reach * 0.7)),
        rootPoint.clone().add(new THREE.Vector3(side * reach * 0.52, -reach * 0.2, -reach))], short ? 0.008 : 0.012, quality);
      geometry.userData.oralAnchor = rootPoint.clone();
      geometry.userData.barbel = true;
      const barb = new THREE.Mesh(geometry, whisker);
      barb.name = "barbel";
      visual.add(barb);
    }
  }

  if (look.horn) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.72, 12), wet("#d9fff8", "#7dfff1", 0.85));
    const brow = sectionAt(look, 0.12);
    horn.position.set(0, brow.ry + brow.center + 0.04, brow.z);
    horn.rotation.x = 1.05;
    visual.add(horn);
  }

  if (look.keel) {
    const belly = sectionAt(look, 0.55);
    const keel = new THREE.Mesh(finVolume(look.length * 0.22, look.thick * 0.28, 0.03, 0.02, quality, finOutline), finMat);
    keel.name = "keel";
    keel.rotation.y = -Math.PI / 2;
    keel.rotation.x = Math.PI;
    keel.position.set(0, -belly.ry * 0.72 + belly.center, belly.z);
    visual.add(keel);
  }

  if (look.horn) {
    const armorMat = wet("#263d46", "#167769", 0.035);
    const armorGeo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < (quality === "low" ? 4 : 7); i++) {
      const section = sectionAt(look, 0.29 + i * 0.074);
      const plate = new THREE.Mesh(armorGeo, armorMat);
      plate.name = "dorsal-armor";
      plate.scale.set(section.rx * 0.78, 0.075, 0.17);
      plate.position.set(0, section.ry + section.center, section.z);
      visual.add(plate);
    }
  }

  // Tideblade's paired finlets and narrow peduncle distinguish it from other forked tails.
  if (rarity === "uncommon") {
    const finletGeo = finVolume(0.12, 0.085, 0.01, 0.014, quality, "angular");
    for (let i = 0; i < (quality === "low" ? 3 : 5); i++) {
      const section = sectionAt(look, 0.67 + i * 0.045);
      for (const side of [-1, 1]) {
        const finlet = new THREE.Mesh(finletGeo, finMat);
        finlet.name = "finlet";
        finlet.rotation.y = -Math.PI / 2;
        if (side < 0) finlet.rotation.x = Math.PI;
        finlet.position.set(0, section.ry * side + section.center, section.z);
        visual.add(finlet);
      }
    }
  }
  if (!look.keel) {
    const section = sectionAt(look, 0.66);
    const anal = new THREE.Mesh(finVolume(look.length * 0.18, look.thick * 0.3, 0.025, 0.018, quality, finOutline), finMat);
    anal.name = "anal-fin";
    anal.rotation.set(Math.PI, -Math.PI / 2, 0);
    anal.position.set(0, -section.ry * 0.86 + section.center, section.z);
    visual.add(anal);
  }

  // Paired pelvic fins complete the ventral silhouette for every quality preset.
  for (const side of [-1, 1]) {
    const section = sectionAt(look, look.lure ? 0.4 : 0.51);
    const pelvic = new THREE.Mesh(finVolume(look.pec * 0.32, look.pec * 0.13, 0.025, 0.011, quality, finOutline), finMat);
    pelvic.name = "pelvic-fin";
    pelvic.position.set(side * section.rx * 0.42, section.center - section.ry * 0.89, section.z);
    pelvic.rotation.set(Math.PI, -side * 0.5, side * 0.3);
    visual.add(pelvic);
  }

  const nose = new THREE.Object3D();
  nose.name = "nose";
  nose.position.set(0, 0, -look.length * 0.5);
  const tailTip = new THREE.Object3D();
  tailTip.name = "tailTip";
  tailTip.position.set(0, 0, look.length * 0.5);
  root.add(nose, tailTip);
  const phase = options.phaseOffset !== undefined && Number.isFinite(options.phaseOffset) ? options.phaseOffset : Math.random() * Math.PI * 2;
  // Long surfaces use the exact body deformation in fish-local coordinates.
  const waveMaterials = [skin];
  const baked = new Set<THREE.Object3D>();
  // Oral lining shares fish-local wave coordinates with the body, including
  // the moving mouth ring. A rigid attachment rotation would separate them.
  cavity.geometry.translate(0, mouth.center, mouth.z);
  cavity.position.set(0, 0, 0);
  cavity.geometry.userData.restPositions = new Float32Array(cavity.geometry.getAttribute("position").array);
  cavity.geometry.userData.biteHinge = { ...body.geometry.userData.biteHinge };
  bindWave(cavity.material as THREE.MeshPhysicalMaterial, look.length, look.thick);
  waveMaterials.push(cavity.material as THREE.MeshPhysicalMaterial);
  baked.add(cavity);
  const oralHinge = new THREE.Vector3(0, mouth.center, mouth.z + look.length * 0.13);
  const oralPositions = cavity.geometry.getAttribute("position");
  let oralRadius = 0;
  for (let i = 0; i < oralPositions.count; i++)
    oralRadius = Math.max(oralRadius, new THREE.Vector3().fromBufferAttribute(oralPositions, i).distanceTo(oralHinge));
  // A hinge rotation preserves distance to the hinge, and a blended rotation
  // lies inside the same ball. Include the maximum travelling-wave excursion.
  cavity.geometry.boundingSphere = new THREE.Sphere(oralHinge, oralRadius + look.thick * 0.35);
  const bake = (mesh: THREE.Mesh) => {
    mesh.updateMatrix();
    const bakedOrigin = new THREE.Vector3().applyMatrix4(mesh.matrix);
    mesh.geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    mesh.geometry.userData.flexAnchor = bakedOrigin;
    // Median-fin roots follow the changing dorsal/ventral profile, not a flat
    // floating baseline. Retain the species outline as height above the skin.
    if (["dorsal", "second-dorsal", "anal-fin", "keel", "finlet"].includes(mesh.name)) {
      const vertices = mesh.geometry.getAttribute("position");
      const anchor = sectionAt(look, mesh.position.z / look.length + 0.5);
      const side = mesh.position.y >= anchor.center ? 1 : -1;
      const baseline = anchor.center + side * anchor.ry * 0.96;
      for (let i = 0; i < vertices.count; i++) {
        const section = sectionAt(look, vertices.getZ(i) / look.length + 0.5);
        vertices.setY(i, vertices.getY(i) - baseline + section.center + side * section.ry * 0.96);
      }
      mesh.geometry.computeVertexNormals();
    }
    if (["upper-lip", "lower-lip", "lower-jaw-skin", "upper-tooth", "lower-tooth", "barbel"].includes(mesh.name)) {
      mesh.geometry.userData.restPositions = new Float32Array(mesh.geometry.getAttribute("position").array);
      mesh.geometry.userData.biteHinge = { ...body.geometry.userData.biteHinge };
    }
    const material = (mesh.material as THREE.MeshPhysicalMaterial).clone();
    bindWave(material, look.length, look.thick);
    mesh.material = material;
    waveMaterials.push(material);
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.boundingSphere!.radius += look.thick * 0.35
      + (mesh.geometry.userData.biteHinge ? look.length * 0.13 + look.thick * 0.8 : 0);
    baked.add(mesh);
  };
  const originalGeometries = new Set<THREE.BufferGeometry>();
  const originalMaterials = new Set<THREE.Material>();
  for (const object of [...visual.children]) {
    if (object instanceof THREE.Mesh && object !== body && object !== cavity) {
      originalGeometries.add(object.geometry); originalMaterials.add(object.material as THREE.Material); bake(object);
    }
  }
  tail.position.set(0, 0, 0); caudal.position.set(0, 0, 0);
  originalGeometries.add(caudal.geometry); bake(caudal);
  const retained = new Set<THREE.BufferGeometry>();
  const retainedMaterials = new Set<THREE.Material>();
  visual.traverse(object => { if (object instanceof THREE.Mesh) { retained.add(object.geometry); retainedMaterials.add(object.material as THREE.Material); } });
  for (const geometry of originalGeometries) if (!retained.has(geometry)) geometry.dispose();
  for (const material of originalMaterials) if (!retainedMaterials.has(material)) material.dispose();
  const attachments = visual.children.filter(object => object !== body && object !== fins && object !== tail && object !== jaw && !baked.has(object))
    .concat(fins.children).map(object => ({ object, rest: object.position.clone(), rotation: object.quaternion.clone() }));
  const finRegions: FinRegion[] = [];
  const registerFin = (mesh: THREE.Mesh, kind: FinRegion["kind"], side = 0, maxAngle = 0.24) => {
    const profile = mesh.geometry.userData.finProfile as { cols: number; rows: number } | undefined;
    if (!profile) return;
    const position = mesh.geometry.getAttribute("position");
    const rest = new Float32Array(position.array);
    const stride = profile.rows + 1;
    const shellStride = (profile.cols + 1) * stride;
    const anchor = new THREE.Vector3();
    for (let shell = 0; shell < 2; shell++) for (let j = 0; j <= profile.rows; j++)
      anchor.add(new THREE.Vector3().fromBufferAttribute(position, shell * shellStride + j));
    anchor.multiplyScalar(1 / (2 * (profile.rows + 1)));
    const weights = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const j = (i % shellStride) % stride;
      weights[i] = (j / profile.rows) ** 2;
    }
    const axis = kind === "caudal" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    finRegions.push({ mesh, rest, anchor, axis, weights, maxAngle, kind, side, phase: side * 0.55 });
  };
  visual.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name === "caudal-membrane") registerFin(object, "caudal", 0, 0.44);
    else if (object.name === "pelvic-fin") registerFin(object, "pelvic", Math.sign(object.position.x), 0.36);
    else if (object.name === "finlet") registerFin(object, "finlet", Math.sign(object.position.y), 0.10);
    else if (["dorsal", "second-dorsal", "anal-fin", "keel"].includes(object.name)) registerFin(object, "median", 0, 0.24);
    else if (fins.children.includes(object)) registerFin(object, "pectoral", Math.sign(object.position.x), 0.30);
  });
  const oralMeshes = visual.children.filter(object => object instanceof THREE.Mesh && object.geometry.userData.biteHinge) as THREE.Mesh[];
  const gait = { rate: look.lure ? 1.25 : look.barbels ? 2.05 : rarity === "uncommon" ? 3.25 : 2.6,
    strength: look.lure ? 0.48 : rarity === "uncommon" ? 0.9 : 1,
    pectoral: look.lure || rarity === "rare" ? 0.22 : 0.1 };
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const extents = box.getSize(new THREE.Vector3());
  const reach = new THREE.Vector3(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)),
    Math.max(Math.abs(box.min.y), Math.abs(box.max.y)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z)));
  const margin = look.thick * 0.6 + look.length * 0.24 * Math.sin(0.62) + 0.14
    + Math.max(finExcursion(look.length * 0.5, 0.44), finExcursion(look.pec, 0.36));
  const baseBounds = { radius: reach.length() + margin, height: extents.y + margin * 2, length: extents.z + margin };
  body.geometry.computeBoundingSphere();
  body.geometry.boundingSphere!.radius += margin;
  const rig: FishRig = { root, visual, body, tail, jaw, fins, lure, attachments, waveMaterials, gait,
    bounds: { ...baseBounds }, baseBounds, speciesScale: SPECIES[rarity].scale,
    motion: { phase, rate: gait.rate, amplitude: 1, secondaryAmplitude: 1, lastTime: null, bite: 0 }, finRegions, oralMeshes, disposed: false };
  sizeFish(rig, options.size);
  poseFish(rig, 0, 0, 1, 0);
  rig.motion.lastTime = null;
  return rig;
}

/** Resize in-place and update cached world-unit bounds without touching phase/pose. */
export function sizeFish(rig: FishRig, size?: FishSize): void {
  const scale = rig.speciesScale * fishVisualScale(size);
  rig.root.scale.setScalar(scale);
  rig.bounds.radius = rig.baseBounds.radius * scale;
  rig.bounds.height = rig.baseBounds.height * scale;
  rig.bounds.length = rig.baseBounds.length * scale;
}

const _tangent = new THREE.Vector3();
const _waveForward = new THREE.Vector3(0, 0, 1);
const _waveQuat = new THREE.Quaternion();

/** time and dt are seconds. Four-argument legacy calls derive dt from monotonic time. */
export function poseFish(rig: FishRig, time: number, bite01: number, pace: number, dt?: number, reducedMotion = false): void {
  if (rig.disposed) return;
  const state = rig.motion;
  const elapsed = dt ?? (state.lastTime === null ? 0 : time - state.lastTime);
  const step = Number.isFinite(elapsed) ? Math.max(0, Math.min(0.1, elapsed)) : 0;
  if (Number.isFinite(time)) state.lastTime = time;
  const speed = Number.isFinite(pace) ? Math.max(0, Math.min(6, pace)) : 1;
  const smooth = 1 - Math.exp(-step * 8);
  const mounted = rig.visual.getObjectByName("rarity-glb");
  // The angler gait is 1.25. On a mounted GLB that clock left the body almost still.
  const glideRate = mounted ? 2.55 : rig.gait.rate;
  state.rate += (glideRate + speed * 0.32 - state.rate) * smooth;
  state.amplitude += ((reducedMotion ? 0.2 : 0.65 + Math.min(speed, 3) * 0.14) - state.amplitude) * smooth;
  state.secondaryAmplitude += ((reducedMotion ? 0.2 : 1) - state.secondaryAmplitude) * smooth;
  state.phase += step * state.rate;
  const phase = state.phase;
  const amplitude = state.amplitude;
  rig.tail.rotation.y = 0;
  rig.fins.rotation.x = 0;
  if (mounted) {
    rig.visual.rotation.z = 0;
    rig.visual.rotation.x = 0;
    rig.visual.position.y = Math.sin(phase) * 0.014 * amplitude;
  } else {
    rig.visual.rotation.z = Math.sin(phase * 0.65) * 0.045 * amplitude;
    rig.visual.rotation.x = Math.cos(phase * 0.7) * 0.025 * amplitude;
    rig.visual.position.y = Math.sin(phase * 0.45) * 0.022 * amplitude;
  }
  const bite = Number.isFinite(bite01) ? THREE.MathUtils.clamp(bite01, 0, 1) : 0;
  state.bite += (bite - state.bite) * (1 - Math.exp(-step * (bite > state.bite ? 24 : 14)));
  rig.jaw.quaternion.identity();
  rig.jaw.rotation.set(-Math.max(state.bite, Number.EPSILON) * 0.62, 0, 0);
  rig.visual.position.z = -state.bite * 0.12;
  if (mounted) {
    poseRarityFish(rig.visual, phase, state.bite, amplitude);
    return;
  }
  const length = rig.body.geometry.userData.fishLength as number;
  const strength = rig.body.geometry.userData.fishStrength as number;
  for (const attachment of rig.attachments) {
    const wave = fishWave(attachment.rest.z, length, strength, phase, amplitude * rig.gait.strength);
    attachment.object.position.copy(attachment.rest);
    attachment.object.position.x += wave.x;
    attachment.object.position.y += wave.y;
    _tangent.set(wave.dx, wave.dy, 1).normalize();
    _waveQuat.setFromUnitVectors(_waveForward, _tangent);
    attachment.object.quaternion.copy(_waveQuat).multiply(attachment.rotation);
    if (attachment.object.parent === rig.fins) {
      const side = Math.sign(attachment.rest.x);
      attachment.object.rotateZ(side * Math.sin(phase * 0.9 + side * 0.55) * rig.gait.pectoral * amplitude);
    }
  }
  for (const region of rig.finRegions) {
    const stroke = region.kind === "caudal" ? Math.sin(phase * 1.12) * 0.44
      : region.kind === "pectoral" ? Math.sin(phase * 0.9 + region.phase) * rig.gait.pectoral * 1.4
      : Math.sin(phase * (region.kind === "pelvic" ? 0.82 : 0.72) + region.phase) * (region.kind === "pelvic" ? 0.36 : region.kind === "finlet" ? 0.10 : 0.24);
    const biteKick = state.bite * (region.kind === "caudal" ? 0.08 : region.kind === "pectoral" ? 0.06 : 0);
    const position = region.mesh.geometry.getAttribute("position");
    applyRootPinnedFlex(position, { rest: region.rest, anchor: region.anchor, axis: region.axis, weights: region.weights, maxAngle: region.maxAngle }, (stroke + biteKick) * state.secondaryAmplitude);
    region.mesh.geometry.computeVertexNormals();
  }
  const cavity = rig.visual.getObjectByName("mouth-cavity") as THREE.Mesh;
  biteGeometry(rig.body.geometry, state.bite);
  biteGeometry(cavity.geometry, state.bite);
  for (const object of rig.oralMeshes) {
    if (object === rig.body || object.geometry === cavity.geometry) continue;
    biteGeometry(object.geometry, state.bite);
    if (object.geometry.userData.barbel) {
      // Flex away from the fixed mouth-root; reduced motion scales the excursion.
      const positions = object.geometry.getAttribute("position");
      const uv = object.geometry.getAttribute("uv");
      object.geometry.userData.lastBite = undefined;
      for (let i = 0; i < positions.count; i++) {
        const flex = uv.getX(i) ** 2 * Math.sin(phase * 0.8 + uv.getX(i) * 3) * 0.018 * amplitude * state.secondaryAmplitude;
        positions.setY(i, positions.getY(i) + flex);
      }
      positions.needsUpdate = true;
      object.geometry.computeVertexNormals();
    }
  }
  if (rig.lure) {
    rig.lure.rotation.z = Math.sin(phase * 0.6) * 0.14 * amplitude;
    rig.lure.rotation.x = Math.cos(phase * 0.45) * 0.04 * amplitude;
  }
  for (const material of rig.waveMaterials) {
    (material.userData.wavePhase as { value: number }).value = phase;
    (material.userData.waveAmplitude as { value: number }).value = amplitude * rig.gait.strength;
    (material.userData.waveRate as { value: number }).value = state.rate;
  }
  poseCommonClownfish(rig.visual, phase, state.bite, amplitude);
  poseRarityFish(rig.visual, phase, state.bite, 1);
}

/** Transfer animation only during quality/aspect replacement. Caller owns world transforms/extra scale. */
export function copyFishPose(from: FishRig, to: FishRig): void {
  if (to.disposed) return;
  Object.assign(to.motion, from.motion);
  poseFish(to, to.motion.lastTime ?? 0, to.motion.bite, 1, 0);
  // A never-posed legacy rig must still derive its first dt as zero.
  to.motion.lastTime = from.motion.lastTime;
}

/** Per-rig ownership; repeated calls are harmless, including aliased map slots. */
export function disposeRig(rig: FishRig): void {
  if (rig.disposed) return;
  rig.disposed = true;
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  rig.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geos.add(mesh.geometry);
    const material = mesh.material;
    const list = Array.isArray(material) ? material : material ? [material] : [];
    for (const mat of list) mats.add(mat);
  });
  for (const mat of mats) {
    if (mat.userData.sharedAsset) continue;
    for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
  }
  for (const texture of textures) texture.dispose();
  for (const geo of geos) if (!geo.userData.sharedAsset) geo.dispose();
  for (const mat of mats) if (!mat.userData.sharedAsset) mat.dispose();
}
