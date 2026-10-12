import * as THREE from "three";
import { ROCKS, SHELTERS } from "../sim/cover";
import { SEA_RADIUS } from "../sim/rules";
import type { GraphicsQuality } from "./quality";
import type { Daylight } from "./daylight";
import { daylightAt } from "./daylight";
import { WATER_LEVEL } from "./water";
import { createFishletGeometry } from "./fishlet-mesh";
import { createJellyGeometry } from "./jelly-mesh";
import { createReefGeometry } from "./reef-mesh";
import { createTurtleGeometry } from "./turtle-mesh";
import { createSquidFlock, syncSquidSwim } from "./squid-rig";

export const ARENA = SEA_RADIUS;

export type Scenery = {
  /** Visual time only: callers may freeze/slow it for reduced motion. */
  update: (time: number) => void;
  setQuality: (quality: GraphicsQuality) => void;
  setDaylight: (day: Daylight) => void;
  dispose: () => void;
};

const SPAWN_CLEAR = 30;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function duneAt(x: number, z: number): number {
  return Math.sin(x * 0.028) * Math.cos(z * 0.024) * 1.55
    + Math.sin((x + z) * 0.012) * 0.85
    + Math.sin(x * 0.07 + z * 0.05) * 0.28
    + Math.sin(x * 0.41) * Math.cos(z * 0.36) * 0.22;
}

const BED_RINGS = 54;
const BED_SEGMENTS = 96;
const BED_RADIUS = ARENA + 200;
const BED_SINK = -15.5;

/** Sample the actual triangulated bed, rather than an unsampled high-frequency dune. */
export function floorY(x: number, z: number): number {
  const angle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
  const sector = Math.floor(angle / (Math.PI * 2) * BED_SEGMENTS);
  const radial = Math.hypot(x, z) / BED_RADIUS * BED_RINGS;
  const ring = Math.min(BED_RINGS - 1, Math.floor(radial));
  const point = (r: number, s: number): [number, number] => {
    const a = s / BED_SEGMENTS * Math.PI * 2;
    return [Math.cos(a) * r * BED_RADIUS / BED_RINGS, Math.sin(a) * r * BED_RADIUS / BED_RINGS];
  };
  const a = point(ring, sector);
  const b = point(ring, sector + 1);
  const c = point(ring + 1, sector);
  const d = point(ring + 1, sector + 1);
  const sample = (p: number[], q: number[], r: number[]): number | undefined => {
    const determinant = (q[1] - r[1]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[1] - r[1]);
    if (Math.abs(determinant) < 1e-9) return undefined;
    const u = ((q[1] - r[1]) * (x - r[0]) + (r[0] - q[0]) * (z - r[1])) / determinant;
    const v = ((r[1] - p[1]) * (x - r[0]) + (p[0] - r[0]) * (z - r[1])) / determinant;
    if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) return undefined;
    return BED_SINK + u * duneAt(p[0], p[1]) + v * duneAt(q[0], q[1]) + (1 - u - v) * duneAt(r[0], r[1]);
  };
  // Curved polar cells can put the point in the next radial cell's inner triangle.
  return (ring === 0 ? sample(a, c, d) : sample(a, c, b) ?? sample(b, c, d))
    ?? sample(c, point(ring + 2, sector), d)
    ?? BED_SINK + duneAt(x, z);
}

function discGeometry(radius: number, rings: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // One center vertex. A collapsed ring at r=0 shades as a dark pinwheel.
  positions.push(0, 0, 0);
  uvs.push(0.5, 0.5);
  for (let i = 1; i <= rings; i++) {
    const r = (i / rings) * radius;
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      uvs.push(0.5 + (Math.cos(a) * i) / rings / 2, 0.5 + (Math.sin(a) * i) / rings / 2);
    }
  }
  const stride = segments + 1;
  for (let j = 0; j < segments; j++) {
    // (center, outer j, outer j+1). Three.js cross keeps the normal at -Y.
    indices.push(0, j + 1, j + 2);
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = 1 + i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function bladeGeometry(height: number, width: number, ruffle = 0): THREE.BufferGeometry {
  const rows = 16;
  const cols = 3;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const flare = Math.sin(t * Math.PI) * width * (1 - t * 0.35);
    const bend = t * t * 0.85;
    const serr = Math.sin(t * 22) * ruffle * (0.25 + t);
    for (let c = 0; c < cols; c++) {
      const side = c - 1;
      const rib = c === 1 ? -0.04 * (1 - t) : 0;
      const x = side * (flare + (c === 1 ? 0 : serr));
      const z = bend + rib + (c === 1 ? 0 : Math.sin(t * 9 + side) * ruffle * 0.35);
      positions.push(x, t * height, z);
      const tone = c === 1 ? 1 : 0.72;
      colors.push(0.62 * tone, tone, 0.48 * tone);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c;
      const b = a + cols;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertices = 0;
  for (const part of parts) {
    if (!part.getAttribute("normal")) part.computeVertexNormals();
    vertices += part.getAttribute("position").count;
  }
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    const pos = part.getAttribute("position");
    const nrm = part.getAttribute("normal");
    for (let i = 0; i < pos.count; i++) {
      positions[(offset + i) * 3] = pos.getX(i);
      positions[(offset + i) * 3 + 1] = pos.getY(i);
      positions[(offset + i) * 3 + 2] = pos.getZ(i);
      normals[(offset + i) * 3] = nrm.getX(i);
      normals[(offset + i) * 3 + 1] = nrm.getY(i);
      normals[(offset + i) * 3 + 2] = nrm.getZ(i);
    }
    if (part.index) {
      for (let i = 0; i < part.index.count; i++) indices.push(part.index.getX(i) + offset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(offset + i);
    }
    offset += pos.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  return geo;
}

/** Tapered shared branches leave actual negative space between fan arms. */
function branchPart(from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const direction = to.clone().sub(from);
  const geo = new THREE.CylinderGeometry(radius * 0.52, radius, direction.length(), 5);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
  const center = from.clone().add(to).multiplyScalar(0.5);
  geo.translate(center.x, center.y, center.z);
  return geo;
}

function fanGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2;
    const joint = new THREE.Vector3(Math.sin(a) * 0.36, Math.cos(a) * 0.6, 0);
    const tip = new THREE.Vector3(Math.sin(a) * 0.85, 0.35 + Math.cos(a) * 1.28, Math.sin(i * 1.7) * 0.045);
    parts.push(branchPart(new THREE.Vector3(), joint, 0.023), branchPart(joint, tip, 0.015));
    const cup = new THREE.SphereGeometry(0.045, 5, 4);
    cup.scale(1.1, 0.45, 0.8);
    cup.translate(tip.x, tip.y, tip.z);
    parts.push(cup);
    for (const side of [-1, 1]) {
      const end = tip.clone().multiplyScalar(0.88);
      end.x += side * 0.095;
      parts.push(branchPart(joint.clone().lerp(tip, 0.5), end, 0.009));
    }
  }
  return disposeParts(parts, mergeParts(parts));
}

/** Ribbed scallop valve in the original XY plane; seeded instance tilts stay intact. */
function shellGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const rows = 10;
  const columns = 36;
  for (let r = 0; r <= rows; r++) for (let i = 0; i <= columns; i++) {
    const t = r / rows;
    const a = -1.25 + (i / columns) * 2.5;
    const rib = 1 + Math.cos(a * 18) * 0.055 * t;
    const lip = t * t;
    positions.push(
      Math.sin(a) * t * 0.32 * rib,
      Math.cos(a) * t * 0.36 * rib - 0.13,
      -Math.sin(t * Math.PI) * 0.08 - Math.cos(a * 18) * t * (1 - t) * 0.02 - lip * 0.028,
    );
  }
  for (let r = 0; r < rows; r++) for (let i = 0; i < columns; i++) {
    const a = r * (columns + 1) + i;
    const b = a + columns + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function colonyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const arms: Array<[number, number, number, number]> = [
    [0, 0, 0, 1],
    [0.22, 0, 0.28, 0.72],
    [-0.2, 0, 0.16, 0.64],
    [0.05, 0, -0.22, 0.58],
    [0.16, 0.15, 0.05, 0.5],
  ];
  for (const [x, z, tilt, scale] of arms) {
    const cone = new THREE.CylinderGeometry(0.065, 0.22, 1.05, 7, 5);
    const vertices = cone.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      const h = (vertices.getY(i) + 0.525) / 1.05;
      const bend = h * h;
      vertices.setXYZ(i,
        vertices.getX(i) + Math.sin(h * 2.6 + x * 5) * bend * 0.1,
        vertices.getY(i),
        vertices.getZ(i) + Math.sin(h * 3.1 + z * 4) * bend * 0.08);
    }
    cone.computeVertexNormals();
    cone.translate(0, 0.52, 0);
    cone.scale(scale, scale, scale);
    cone.rotateZ(tilt);
    cone.translate(x, 0, z);
    parts.push(cone);
    const joint = new THREE.Vector3(x + Math.sin(tilt) * -0.5 * scale, 0.55 * scale, z);
    const cup = new THREE.SphereGeometry(0.09 * scale, 6, 5);
    cup.scale(1, 0.42, 1);
    cup.translate(joint.x, joint.y + 0.05 * scale, joint.z);
    parts.push(cup);
    const rim = new THREE.TorusGeometry(0.1 * scale, 0.018 * scale, 4, 8);
    rim.rotateX(Math.PI / 2);
    rim.translate(joint.x, joint.y + 0.07 * scale, joint.z);
    parts.push(rim);
    for (const side of [-1, 1]) {
      const tip = joint.clone().add(new THREE.Vector3(side * 0.23 * scale, 0.32 * scale, 0.12 * scale));
      parts.push(branchPart(joint, tip, 0.055 * scale));
      const polyp = new THREE.SphereGeometry(0.035 * scale, 5, 4);
      polyp.translate(tip.x, tip.y, tip.z);
      parts.push(polyp);
    }
  }
  const geo = mergeParts(parts);
  for (const part of parts) part.dispose();
  return geo;
}

function withPhase(geo: THREE.BufferGeometry, count: number): THREE.BufferGeometry {
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) phase[i] = (i * 0.73) % (Math.PI * 2);
  geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
  return geo;
}

function withFog(extra: Record<string, THREE.IUniform>): { [uniform: string]: THREE.IUniform } {
  return Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), extra);
}

function bladeMaterial(
  roughness: number,
  bend: number,
  speed: number,
  time: { value: number },
  flow: { value: THREE.Vector2 },
  vertexColors = false,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.uniforms.uBend = { value: bend };
    shader.uniforms.uSpeed = { value: speed };
    shader.uniforms.uFlow = flow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uBend;\nuniform float uSpeed;\nuniform vec2 uFlow;\nattribute float aPhase;\n")
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
        float plantedHeight = max(position.y, 0.0);
        float slopeX = sin(uTime * uSpeed + aPhase) * uBend * 2.0 * plantedHeight + uFlow.x * 0.12 * plantedHeight;
        float slopeZ = (position.y > 0.0 ? cos(uTime * uSpeed * 0.73 + aPhase) * uBend * 0.4 : 0.0) + uFlow.y * 0.12 * plantedHeight;
        objectNormal.y -= slopeX * objectNormal.x + slopeZ * objectNormal.z;
        objectNormal = normalize(objectNormal);`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float h = max(position.y, 0.0);
        float sway = sin(uTime * uSpeed + aPhase) * uBend * h * h;
        transformed.x += sway + uFlow.x * h * 0.12;
        transformed.z += cos(uTime * uSpeed * 0.73 + aPhase) * uBend * 0.4 * h + uFlow.y * h * 0.12;`,
      );
  };
  mat.customProgramCacheKey = () => `blade-normal-v3-${bend}-${speed}`;
  return mat;
}

// Shared by the column wall, the haze shell, and the far-sand fade.
// Grain holds past one chase view, through the reef ring, then takes the column color.
const WATER_COLUMN_GLSL = `
uniform vec3 uColumnNear;
uniform vec3 uColumnFar;
float seaGrade(vec3 world) {
  return smoothstep(36.0, 220.0, length(world - cameraPosition));
}
vec3 waterColumn(vec3 world) {
  float depth = 1.0 - smoothstep(-20.0, ${WATER_LEVEL}, world.y);
  vec3 col = mix(uColumnNear, uColumnFar, seaGrade(world));
  // Water column color, not a global visibility-reducing fog.
  return mix(col * vec3(1.08, 1.15, 1.12), col * vec3(0.67, 0.78, 0.86), depth);
}
`;

// Surface-gradient bump mapping: no UV tangent requirement, including merged/instanced reefs.
const RELIEF_GLSL = `
vec3 seaReliefNormal(vec3 eyePosition, vec3 baseNormal, float height) {
  vec3 dx = dFdx(eyePosition);
  vec3 dy = dFdy(eyePosition);
  vec3 crossX = cross(dy, baseNormal);
  vec3 crossY = cross(baseNormal, dx);
  float determinant = dot(dx, crossX);
  vec3 gradient = sign(determinant) * (dFdx(height) * crossX + dFdy(height) * crossY);
  return normalize(max(abs(determinant), 1e-8) * baseNormal - gradient);
}
`;

type SeaTone = {
  time: { value: number };
  detail: { value: number };
  sun: { value: THREE.Vector3 };
  flow: { value: THREE.Vector2 };
  near: { value: THREE.Color };
  far: { value: THREE.Color };
  reflect: { value: THREE.Color };
  lift: { value: THREE.Color };
};

function sandMaterial(tone: SeaTone): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: "#e4d2b4",
    roughness: 0.96,
    metalness: 0,
    side: THREE.BackSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = tone.time;
    shader.uniforms.uSceneryDetail = tone.detail;
    shader.uniforms.uFlow = tone.flow;
    shader.uniforms.uColumnNear = tone.near;
    shader.uniforms.uColumnFar = tone.far;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBedWorld;\n")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vBedWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uTime;
        uniform float uSceneryDetail;
        uniform vec2 uFlow;
        varying vec3 vBedWorld;
        ${WATER_COLUMN_GLSL}
        ${RELIEF_GLSL}
        float sandHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sandNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = sandHash(i);
          float b = sandHash(i + vec2(1.0, 0.0));
          float c = sandHash(i + vec2(0.0, 1.0));
          float d = sandHash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
      `)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 bedXZ = vBedWorld.xz;
        vec2 drift = bedXZ + uFlow * uTime * 0.22;
        float broad = sandNoise(bedXZ * 0.08);
        float fine = 0.5;
        if (uSceneryDetail > 0.5) fine = sandNoise(drift * 0.46);
        float rip = sin(drift.x * 0.31 + sin(drift.y * 0.17)) * sin(drift.y * 0.23);
        float crest = smoothstep(-8.35, -6.15, vBedWorld.y);
        float trough = 1.0 - smoothstep(-0.2, 0.12, rip);
        float sunlight = 0.5 + 0.5 * sin(drift.x * 0.011 + drift.y * 0.008 + uTime * 0.17);
        vec3 grain = vec3(0.68 + broad * 0.24 + fine * 0.16 + rip * 0.08);
        grain *= 0.86 + 0.22 * sunlight;
        grain = mix(grain, grain * vec3(1.08, 1.03, 0.94), crest * 0.45);
        grain = mix(grain, grain * vec3(0.9, 0.98, 1.0), trough * 0.28);
        float speck = sandHash(floor(drift * 7.0));
        grain = mix(grain, grain * vec3(0.55, 0.52, 0.48), step(0.992, speck));
        // Shared water lighting owns caustics and attenuation, not this albedo.
        diffuseColor.rgb *= grain;`,
      )
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        if (uSceneryDetail > 0.5) {
        vec2 reliefPoint = vBedWorld.xz + uFlow * uTime * 0.22;
        float rippleHeight = sin(reliefPoint.x * 1.7 + sin(reliefPoint.y * 0.43)) * 0.028;
        float grainHeight = sandNoise(reliefPoint * 9.0) * 0.007;
        normal = seaReliefNormal(-vViewPosition, normal, rippleHeight + grainHeight); }`)
      .replace("#include <opaque_fragment>", `// shoal-column-transition
        float bedEdge = smoothstep(${ARENA + 15}.0, ${BED_RADIUS - 8}.0, length(vBedWorld.xz));
        float bedDistance = smoothstep(100.0, 280.0, length(vBedWorld - cameraPosition));
        outgoingLight = mix(outgoingLight, waterColumn(vBedWorld), max(bedEdge, bedDistance));
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => "sand-normal-relief-v12";
  return mat;
}

function surfaceMaterial(side: THREE.Side, tone: SeaTone): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side,
    fog: true,
    uniforms: withFog({
      uTime: tone.time,
      uSceneryDetail: tone.detail,
      uSunDir: tone.sun,
      uFlow: tone.flow,
      uReflect: tone.reflect,
      uLift: tone.lift,
      uColumnFar: tone.far,
    }),
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float uTime;
      uniform float uSceneryDetail;
      uniform vec2 uFlow;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vWave;
      varying float vRip;
      void main() {
        vec3 p = position;
        float wave = sin(p.x * 0.045 + uTime * 0.5) * 0.28;
        wave += sin(p.z * 0.033 - uTime * 0.34) * 0.18;
        wave += sin((p.x + p.z) * 0.016 + uTime * 0.18) * 0.14;
        wave += sin(p.x * 0.09 - p.z * 0.07 + uTime * 0.82) * 0.045;
        float currentPhase = dot(p.xz, uFlow) * 0.11 - uTime * 0.72;
        float current = sin(currentPhase) * 0.09;
        float ripple = sin((p.x + p.z) * 0.09 + uTime * 1.1) * 0.07;
        p.y += wave + current + ripple;
        float dx = cos(p.x * 0.045 + uTime * 0.5) * 0.28 * 0.045;
        dx += cos((p.x + p.z) * 0.016 + uTime * 0.18) * 0.14 * 0.016;
        dx += cos(p.x * 0.09 - p.z * 0.07 + uTime * 0.82) * 0.045 * 0.09;
        float dz = cos(p.z * 0.033 - uTime * 0.34) * 0.18 * 0.033;
        dz += cos((p.x + p.z) * 0.016 + uTime * 0.18) * 0.14 * 0.016;
        dz += -cos(p.x * 0.09 - p.z * 0.07 + uTime * 0.82) * 0.045 * 0.07;
        float currentSlope = cos(currentPhase) * 0.09 * 0.11;
        dx += currentSlope * uFlow.x;
        dz += currentSlope * uFlow.y;
        dx += cos((p.x + p.z) * 0.09 + uTime * 1.1) * 0.07 * 0.09;
        dz += cos((p.x + p.z) * 0.09 + uTime * 1.1) * 0.07 * 0.09;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * vec3(-dx, 1.0, -dz));
        vWave = wave / 0.6;
        vRip = ripple;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform float uSceneryDetail;
      uniform vec3 uSunDir;
      uniform vec2 uFlow;
      uniform vec3 uReflect;
      uniform vec3 uLift;
      uniform vec3 uColumnFar;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vWave;
      varying float vRip;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float detailX = 0.0;
        float detailZ = 0.0;
        vec2 slip = vWorld.xz + uFlow * uTime * 0.35;
        if (uSceneryDetail > 0.5) {
        detailX = cos(slip.x * 0.71 + slip.y * 0.39 + uTime * 0.7) * 0.018;
        detailZ = cos(slip.y * 0.83 - slip.x * 0.31 - uTime * 0.53) * 0.016; }
        vec3 normalW = normalize(vNormalW + vec3(-detailX, 0.0, -detailZ));
        bool aboveWater = cameraPosition.y > vWorld.y;
        vec3 facingNormal = aboveWater ? normalW : -normalW;
        vec3 sunDir = normalize(uSunDir);
        float cosView = clamp(dot(facingNormal, viewDir), 0.0, 1.0);
        // Air/water Schlick reflectance (IOR 1.333); underwater has a critical angle.
        float fres = 0.0204 + 0.9796 * pow(1.0 - cosView, 5.0);
        float critical = sqrt(1.0 - 1.0 / (1.333 * 1.333));
        if (!aboveWater) fres = mix(fres, 1.0, 1.0 - smoothstep(critical - 0.04, critical + 0.04, cosView));
        vec3 halfVec = normalize(viewDir + sunDir);
        float spec = aboveWater ? pow(max(dot(normalW, halfVec), 0.0), 180.0) : 0.0;
        vec3 reflected = aboveWater ? uReflect : vec3(0.025, 0.13, 0.16);
        vec3 transmitted = aboveWater ? uColumnFar : uLift;
        vec3 col = mix(transmitted, reflected, fres);
        col += vec3(1.0, 0.91, 0.74) * spec * fres * 1.8;
        float lane = dot(vWorld.xz, uFlow);
        float foam = pow(max(0.0, sin(lane * 0.22 - uTime * 0.9)), 14.0);
        col += uLift * foam * 0.28;
        float span = length(vWorld.xz);
        float fade = 1.0 - smoothstep(420.0, 560.0, span);
        float alpha = (0.018 + fres * 0.16 + spec * 0.04 + foam * 0.05) * fade;
        if (aboveWater) {
          float path = ${(WATER_LEVEL - BED_SINK).toFixed(2)} / max(viewDir.y, 0.08);
          float body = 1.0 - exp(-path * 0.08);
          col = mix(col, uColumnFar, body);
          alpha = clamp(alpha + body * 0.9, 0.0, 0.84);
        }
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function columnMaterial(tone: SeaTone): THREE.ShaderMaterial {
  // Height and distance color of the water. Not a shaft and not scene fog.
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: true,
    uniforms: {
      uColumnNear: tone.near,
      uColumnFar: tone.far,
      uFlow: tone.flow,
      uTime: tone.time,
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec2 uFlow;
      ${WATER_COLUMN_GLSL}
      void main() {
        vec3 col = waterColumn(vWorld);
        float lane = dot(vWorld.xz, uFlow);
        float band = 0.5 + 0.5 * sin(lane * 0.07 - uTime * 0.4 + vWorld.y * 0.15);
        col += vec3(0.012, 0.018, 0.016) * band * (1.0 - seaGrade(vWorld));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

type LifePose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  sx: number;
  sy: number;
  sz: number;
};

/** Local -Z follows travel. vx=0 and vz>0 yields π, which sends -Z to +Z. */
function faceTravel(vx: number, vz: number): number {
  return Math.atan2(-vx, -vz);
}

const GROVES = [
  { a: -1.15, r: 42 },
  { a: -2.2, r: 70 },
  { a: 0.4, r: 56 },
  { a: 1.7, r: 88 },
  { a: 2.6, r: 48 },
  { a: -0.2, r: 96 },
  { a: 3.4, r: 120 },
  { a: -2.8, r: 110 },
  { a: 0.9, r: 160 },
  { a: 2.2, r: 185 },
  { a: -1.6, r: 175 },
  { a: -0.4, r: 210 },
];

const JELLY_COUNT = 8;
const RAY_COUNT = 4;
const SQUID_COUNT = 5;
const TURTLE_COUNT = 4;
const OUTER_SCHOOL = 16;
const CRAB_COUNT = 8;
const SEAHORSE_COUNT = 6;

export function jellyPose(index: number, now: number): LifePose {
  const pulse = Math.sin(now * 1.4 + index * 0.8);
  const sy = 0.86 + pulse * 0.14;
  const wide = 1.05 - pulse * 0.08;
  if (index === 0 || index === 1) {
    const lead = index === 0;
    const w = lead ? 0.16 : 0.13;
    const phase = now * w + (lead ? 0.7 : 2.1);
    const x = (lead ? 4 : -14) + Math.sin(phase) * (lead ? 10 : 8);
    const z = (lead ? -18 : -28) + Math.cos(phase) * (lead ? 6 : 5);
    const vx = Math.cos(phase) * (lead ? 10 : 8) * w;
    const vz = -Math.sin(phase) * (lead ? 6 : 5) * w;
    const s = lead ? 1.55 : 1.2;
    return {
      x,
      y: (lead ? 4.6 : 5.5) + Math.sin(now * 0.8 + index) * 0.35,
      z,
      yaw: faceTravel(vx, vz),
      pitch: Math.sin(now * 0.6 + index) * 0.18,
      sx: wide * s,
      sy: sy * s,
      sz: wide * s,
    };
  }
  const w = 0.055 + (index % 3) * 0.012;
  const phase = now * w + index * 1.2;
  const radius = 46 + index * 16;
  const x = Math.cos(phase) * radius + (index % 2 === 0 ? 10 : -14);
  const z = Math.sin(phase) * radius;
  const vx = -Math.sin(phase) * radius * w;
  const vz = Math.cos(phase) * radius * w;
  const s = 1.45 + (index % 3) * 0.32;
  return {
    x,
    y: 2.4 + (index % 4) * 0.7 + Math.sin(now * 0.55 + index) * 0.6,
    z,
    yaw: faceTravel(vx, vz),
    pitch: Math.sin(now * 0.6 + index) * 0.18,
    sx: wide * s,
    sy: sy * s,
    sz: wide * s,
  };
}

export function squidPose(index: number, now: number): LifePose {
  const w = 0.18 + index * 0.02;
  const phase = now * w + index * 1.3;
  const radius = 12 + index * 5;
  const cx = index % 2 === 0 ? 8 : -16;
  const cz = -20 - index * 7;
  const x = cx + Math.cos(phase) * radius;
  const z = cz + Math.sin(phase) * radius * 0.62;
  const vx = -Math.sin(phase) * radius * w;
  const vz = Math.cos(phase) * radius * 0.62 * w;
  const s = 1.7 + (index % 3) * 0.22;
  return {
    x,
    y: 0.9 + (index % 3) * 0.45 + Math.sin(now * 0.7 + index) * 0.22,
    z,
    yaw: faceTravel(vx, vz),
    sx: s,
    sy: s,
    sz: s,
  };
}

export function rayPose(index: number, now: number): LifePose {
  if (index === 0) {
    const w = 0.11;
    const phase = now * w;
    const x = Math.sin(phase) * 26;
    const z = -36 + Math.cos(phase) * 12;
    const vx = Math.cos(phase) * 26 * w;
    const vz = -Math.sin(phase) * 12 * w;
    const s = 3.1;
    return { x, y: -1.65 + Math.sin(now * 0.4) * 0.18, z, yaw: faceTravel(vx, vz), sx: s, sy: s, sz: s };
  }
  const w = 0.07 + index * 0.01;
  const phase = now * w + index * 1.7;
  const radius = 78 + index * 24;
  const x = Math.cos(phase) * radius;
  const z = Math.sin(phase) * radius * 0.82;
  const vx = -Math.sin(phase) * radius * w;
  const vz = Math.cos(phase) * radius * 0.82 * w;
  const s = 2.15 + index * 0.32;
  return { x, y: -8.2 + Math.sin(now * 0.3 + index) * 0.35, z, yaw: faceTravel(vx, vz), sx: s, sy: s, sz: s };
}

export function turtlePose(index: number, now: number): LifePose {
  const pitch = Math.sin(now * 0.8 + index) * 0.22;
  if (index >= 2) {
    const w = 0.028 + index * 0.004;
    const phase = now * w + index * 1.4;
    const radius = 150 + index * 28;
    const x = Math.cos(phase) * radius;
    const z = Math.sin(phase) * radius * 0.86;
    const vx = -Math.sin(phase) * radius * w;
    const vz = Math.cos(phase) * radius * 0.86 * w;
    return {
      x,
      y: -6.4 + Math.sin(now * 0.18 + index) * 0.45,
      z,
      yaw: faceTravel(vx, vz),
      pitch,
      sx: 2.4,
      sy: 2.4,
      sz: 2.4,
    };
  }
  const w = 0.045 + index * 0.012;
  const phase = now * w + index * Math.PI;
  const radiusX = index === 0 ? 16 : 96;
  const radiusZ = index === 0 ? 9 : 96;
  const x = Math.cos(phase) * radiusX;
  const z = Math.sin(phase) * radiusZ + (index === 0 ? -22 : 0);
  const vx = -Math.sin(phase) * radiusX * w;
  const vz = Math.cos(phase) * radiusZ * w;
  const s = index === 0 ? 3.15 : 2.7;
  return {
    x,
    y: (index === 0 ? 0.15 : -1.15) + Math.sin(now * 0.22 + index) * 0.28,
    z,
    yaw: faceTravel(vx, vz),
    pitch,
    sx: s,
    sy: s,
    sz: s,
  };
}

function crabHome(index: number): { x: number; z: number } {
  if (index === 0) return { x: 3.2, z: -36 };
  if (index === 1) return { x: -7.5, z: -41 };
  const rand = mulberry32(0x5e0c + index * 97);
  const a = rand() * Math.PI * 2;
  const r = 44 + rand() * (ARENA * 0.5);
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

export function crabPose(index: number, now: number): LifePose {
  const home = crabHome(index);
  const w = 0.62;
  const phase = now * w + index * 0.9;
  const orbit = 1.25;
  const x = home.x + Math.cos(phase) * orbit;
  const z = home.z + Math.sin(phase) * orbit;
  const vx = -Math.sin(phase) * orbit * w;
  const vz = Math.cos(phase) * orbit * w;
  const s = 2.7 + (index % 3) * 0.35;
  return {
    x,
    y: floorY(x, z) + 0.05 + Math.abs(Math.sin(phase * 2)) * 0.035,
    z,
    yaw: faceTravel(vx, vz),
    sx: s,
    sy: s * 0.92,
    sz: s,
  };
}

export function seahorsePose(index: number, now: number): LifePose {
  const grove = GROVES[index % GROVES.length];
  const w = 0.24;
  const phase = now * w + index * 0.85;
  const x = Math.cos(grove.a) * grove.r + Math.cos(phase) * 2.2;
  const z = Math.sin(grove.a) * grove.r + Math.sin(phase) * 2.2;
  const vx = -Math.sin(phase) * 2.2 * w;
  const vz = Math.cos(phase) * 2.2 * w;
  const s = 2.15 + (index % 2) * 0.28;
  return {
    x,
    y: floorY(x, z) + 1.25 + Math.sin(now * 0.95 + index) * 0.2,
    z,
    yaw: faceTravel(vx, vz),
    sx: s,
    sy: s,
    sz: s,
  };
}

function disposeParts(parts: THREE.BufferGeometry[], geo: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const part of parts) part.dispose();
  return geo;
}

function rayGeometry(): THREE.BufferGeometry {
  // Flat diamond disc. Nose is local -Z. Height stays under 0.3.
  const positions: number[] = [0, 0.1, -0.08];
  const indices: number[] = [];
  const rings = 8;
  const segments = 36;
  for (let ring = 1; ring <= rings; ring++) {
    const r = ring / rings;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const cx = Math.cos(angle);
      const sz = Math.sin(angle);
      const wing = Math.abs(cx);
      const front = Math.max(-sz, 0);
      const x = cx * r * (1.12 + wing * 0.38);
      const z = sz * r * (sz < 0 ? 0.92 : 0.4) - front * r * 0.18;
      const y = 0.09 * (1 - r * r) - 0.025 * r * wing;
      positions.push(x, y, z);
    }
  }
  for (let i = 0; i < segments; i++) indices.push(0, i + 2, i + 1);
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let i = 0; i < segments; i++) {
      const a = 1 + ring * (segments + 1) + i;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const underside = positions.length / 3;
  positions.push(0, -0.06, 0);
  const outer = 1 + (rings - 1) * (segments + 1);
  for (let i = 0; i < segments; i++) indices.push(underside, outer + i, outer + i + 1);
  const disc = new THREE.BufferGeometry();
  disc.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  disc.setIndex(indices);
  disc.computeVertexNormals();
  const tail = new THREE.ConeGeometry(0.04, 1.85, 6, 8);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0.015, 1.15);
  const parts = [disc, tail];
  const barb = new THREE.ConeGeometry(0.028, 0.16, 4);
  barb.rotateX(Math.PI / 2);
  barb.translate(0, 0.02, 2.02);
  parts.push(barb);
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.035, 6, 5);
    eye.scale(0.7, 0.55, 1);
    eye.translate(side * 0.12, 0.08, -0.62);
    const lobe = new THREE.SphereGeometry(0.08, 6, 4);
    lobe.scale(0.7, 0.22, 1.3);
    lobe.translate(side * 0.2, 0.03, -0.78);
    parts.push(eye, lobe);
  }
  for (let i = 0; i < 7; i++) {
    const spot = new THREE.SphereGeometry(0.02, 4, 3);
    spot.translate((i - 3) * 0.22, 0.1, -0.15 + (i % 2) * 0.12);
    parts.push(spot);
  }
  const geo = mergeParts(parts);
  for (const part of parts) part.dispose();
  const pos = geo.getAttribute("position");
  const color = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const belly = y < 0;
    const spot = Math.sin(x * 9.5) * Math.sin(z * 8.0) > 0.45 && y > 0;
    const tone = belly ? [0.78, 0.86, 0.84] : spot ? [0.16, 0.28, 0.32] : [0.28, 0.48, 0.52];
    color[i * 3] = tone[0];
    color[i * 3 + 1] = tone[1];
    color[i * 3 + 2] = tone[2];
  }
  geo.setAttribute("color", new THREE.BufferAttribute(color, 3));
  return geo;
}

function turtleGeometry(): THREE.BufferGeometry {
  return createTurtleGeometry();
}

function crabGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.28, 12, 8);
  body.scale(1.45, 0.38, 1.05);
  const parts: THREE.BufferGeometry[] = [body];
  for (const side of [-1, 1]) {
    const stalk = new THREE.CylinderGeometry(0.012, 0.014, 0.12, 4);
    stalk.translate(side * 0.12, 0.14, -0.14);
    const eye = new THREE.SphereGeometry(0.032, 6, 5);
    eye.translate(side * 0.14, 0.2, -0.18);
    const palm = new THREE.SphereGeometry(0.09, 6, 5);
    palm.scale(0.72, 0.5, 1.25);
    palm.translate(side * 0.36, 0.03, -0.4);
    const finger = new THREE.SphereGeometry(0.035, 5, 4);
    finger.scale(0.45, 0.35, 1.7);
    finger.translate(side * 0.4, 0.07, -0.58);
    parts.push(stalk, eye, palm, finger);
  }
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const hip = new THREE.CylinderGeometry(0.02, 0.014, 0.16, 4);
      hip.rotateZ(side * 1.15);
      hip.translate(side * 0.22, -0.02, -0.12 + i * 0.1);
      const shin = new THREE.CylinderGeometry(0.012, 0.008, 0.2, 4);
      shin.rotateZ(side * 0.55);
      shin.translate(side * 0.4, -0.08, -0.1 + i * 0.1);
      parts.push(hip, shin);
    }
  }
  return disposeParts(parts, mergeParts(parts));
}

function seahorseGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spine: Array<[number, number, number, number]> = [
    [0.08, 0.05, 0.02, 0.07],
    [0.1, 0.22, 0, 0.075],
    [0.04, 0.4, -0.02, 0.08],
    [-0.02, 0.58, 0, 0.078],
    [0, 0.76, -0.04, 0.07],
    [0, 0.94, -0.08, 0.08],
  ];
  for (const [x, y, z, r] of spine) {
    const bead = new THREE.SphereGeometry(r, 7, 5);
    bead.translate(x, y, z);
    parts.push(bead);
  }
  const head = new THREE.SphereGeometry(0.12, 8, 6);
  head.scale(0.78, 1.15, 1.05);
  head.translate(0, 1.08, -0.12);
  parts.push(head);
  const snout = new THREE.SphereGeometry(0.045, 6, 4);
  snout.scale(0.7, 0.65, 1.9);
  snout.translate(0, 1.05, -0.3);
  parts.push(snout);
  const fin = new THREE.SphereGeometry(0.08, 6, 4);
  fin.scale(0.28, 1.15, 0.55);
  fin.translate(0.14, 0.7, 0);
  parts.push(fin);
  const coronet = new THREE.SphereGeometry(0.05, 5, 4);
  coronet.scale(1.1, 0.7, 0.8);
  coronet.translate(0, 1.2, -0.08);
  parts.push(coronet);
  const curl: Array<[number, number, number, number]> = [
    [0.02, -0.02, 0.08, 0.045],
    [0.06, -0.08, 0.16, 0.04],
    [0.02, -0.12, 0.22, 0.032],
    [-0.04, -0.1, 0.24, 0.026],
  ];
  for (const [x, y, z, r] of curl) {
    const bead = new THREE.SphereGeometry(r, 5, 4);
    bead.translate(x, y, z);
    parts.push(bead);
  }
  return disposeParts(parts, mergeParts(parts));
}

function starfishGeometry(): THREE.BufferGeometry {
  const core = new THREE.SphereGeometry(0.2, 8, 6);
  core.scale(1, 0.38, 1);
  const parts: THREE.BufferGeometry[] = [core];
  for (let i = 0; i < 5; i++) {
    const arm = new THREE.SphereGeometry(0.12, 6, 4);
    arm.scale(0.55, 0.32, 1.7);
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    arm.rotateY(a);
    arm.translate(Math.sin(a) * 0.28, 0.02, Math.cos(a) * 0.28);
    parts.push(arm);
    for (let bump = 1; bump <= 3; bump++) {
      const knob = new THREE.SphereGeometry(0.035 - bump * 0.006, 4, 3);
      knob.translate(Math.sin(a) * (0.16 + bump * 0.1), 0.05, Math.cos(a) * (0.16 + bump * 0.1));
      parts.push(knob);
    }
  }
  return disposeParts(parts, mergeParts(parts));
}

function anemoneGeometry(): THREE.BufferGeometry {
  const base = new THREE.CylinderGeometry(0.16, 0.26, 0.32, 8);
  base.translate(0, 0.16, 0);
  const parts: THREE.BufferGeometry[] = [base];
  for (let i = 0; i < 16; i++) {
    const tent = new THREE.ConeGeometry(0.028, 0.78, 4);
    tent.translate(0, 0.39, 0);
    const bulb = new THREE.SphereGeometry(0.04, 5, 4);
    bulb.translate(0, 0.78, 0);
    const a = (i / 16) * Math.PI * 2;
    const lean = 0.42 + (i % 3) * 0.06;
    for (const part of [tent, bulb]) {
      part.rotateZ(Math.cos(a) * lean);
      part.rotateX(Math.sin(a) * lean);
      part.translate(Math.cos(a) * 0.12, 0.26, Math.sin(a) * 0.12);
      parts.push(part);
    }
  }
  return disposeParts(parts, mergeParts(parts));
}

function urchinGeometry(): THREE.BufferGeometry {
  const body = new THREE.IcosahedronGeometry(0.28, 0);
  const parts: THREE.BufferGeometry[] = [body];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 22; i++) {
    const dir = new THREE.Vector3(
      Math.sin(i * 2.399),
      0.22 + (i % 5) * 0.16,
      Math.cos(i * 2.399),
    ).normalize();
    const length = 0.22 + (i % 4) * 0.06;
    const spike = new THREE.ConeGeometry(0.022, length, 4);
    spike.translate(0, length * 0.5, 0);
    spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    spike.translate(dir.x * 0.26, dir.y * 0.26, dir.z * 0.26);
    parts.push(spike);
  }
  return disposeParts(parts, mergeParts(parts));
}

function lifeSway(time: { value: number }, kind: "jelly" | "ray" | "turtle"): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: kind === "jelly" ? 0.22 : 0.52,
    metalness: 0.02,
    transparent: kind === "jelly",
    opacity: kind === "jelly" ? 0.8 : 1,
    depthWrite: true,
    side: kind === "jelly" ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors: kind === "jelly",
    emissive: kind === "jelly" ? "#7ecfc4" : "#000000",
    emissiveIntensity: kind === "jelly" ? 0.16 : 0,
  });
  const warp = kind === "ray"
    ? `float wing = abs(position.x);
      transformed.y += sin(uTime * 1.7 + aPhase) * 0.12 * wing;`
    : kind === "turtle"
      ? `float flip = smoothstep(0.72, 1.05, abs(position.x));
      transformed.y += sin(uTime * 2.6 + aPhase) * 0.22 * flip;
      transformed.z += cos(uTime * 2.6 + aPhase) * 0.06 * flip;`
        : `float hang = max(-position.y, 0.0);
      float bell = smoothstep(0.0, 0.22, position.y);
      float pulse = sin(uTime * 1.4 + aPhase);
      transformed.x += sin(uTime * 1.6 + aPhase + position.y * 3.0) * 0.16 * hang;
      transformed.z += cos(uTime * 1.3 + aPhase) * 0.09 * hang;
      transformed.x *= 1.0 - pulse * 0.07 * bell;
      transformed.z *= 1.0 - pulse * 0.07 * bell;
      transformed.y += pulse * 0.045 * bell;`;
  const normalWarp = kind === "ray"
    ? `objectNormal.x -= sin(uTime * 1.7 + aPhase) * 0.12 * sign(position.x) * objectNormal.y;`
    : kind === "turtle"
      ? `float flipperT = clamp((abs(position.x) - 0.72) / 0.33, 0.0, 1.0);
        float flipperSlope = 6.0 * flipperT * (1.0 - flipperT) / 0.33;
        objectNormal.x -= sin(uTime * 2.6 + aPhase) * 0.22 * flipperSlope * sign(position.x) * objectNormal.y;`
        : `float tentacleHang = max(-position.y, 0.0);
        float tentaclePhase = uTime * 1.6 + aPhase + position.y * 3.0;
        float tentacleSlopeX = position.y < 0.0 ? 0.16 * (3.0 * cos(tentaclePhase) * tentacleHang - sin(tentaclePhase)) : 0.0;
        float tentacleSlopeZ = position.y < 0.0 ? -cos(uTime * 1.3 + aPhase) * 0.09 : 0.0;
        objectNormal.y -= tentacleSlopeX * objectNormal.x + tentacleSlopeZ * objectNormal.z;`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nattribute float aPhase;\n")
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${normalWarp}\nobjectNormal = normalize(objectNormal);`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${warp}`);
  };
  mat.customProgramCacheKey = () => `life-normal-v5-${kind}`;
  return mat;
}

function writeLife(
  mesh: THREE.InstancedMesh,
  count: number,
  poseAt: (index: number, now: number) => LifePose,
  now: number,
  dummy: THREE.Object3D,
): void {
  for (let i = 0; i < Math.min(count, mesh.count); i++) {
    const pose = poseAt(i, now);
    dummy.position.set(pose.x, pose.y, pose.z);
    dummy.rotation.set(pose.pitch ?? 0, pose.yaw, 0);
    dummy.scale.set(pose.sx, pose.sy, pose.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

const REEF: Array<[number, number]> = [
  [2.2, -34],
  [-6.4, -38],
  [9.5, -44],
  [-1.2, -47],
  [14.2, -36.5],
  [-13, -44],
  [6, -52],
  [-9, -33.5],
];

function lifePoint(index: number, salt: number): { x: number; z: number } {
  const seeded = index < REEF.length
    ? { x: REEF[index][0], z: REEF[index][1] }
    : (() => {
      const rand = mulberry32((0x5e0c + salt * 131 + index * 17) >>> 0);
      const a = rand() * Math.PI * 2;
      const r = 38 + rand() * (ARENA * 0.62);
      return { x: Math.cos(a) * r, z: Math.sin(a) * r };
    })();
  const dist = Math.hypot(seeded.x, seeded.z);
  if (dist < SPAWN_CLEAR + 2) {
    const push = (SPAWN_CLEAR + 2) / Math.max(dist, 0.001);
    return { x: seeded.x * push, z: seeded.z * push };
  }
  if (dist > ARENA - 16) {
    const pull = (ARENA - 16) / dist;
    return { x: seeded.x * pull, z: seeded.z * pull };
  }
  return seeded;
}

type Spot = { x: number; y: number; z: number; yaw: number; scale: number; tilt: number; squash?: number };

function placeInstances(
  mesh: THREE.InstancedMesh,
  spots: Spot[],
  color: (i: number, out: THREE.Color) => void,
): void {
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < spots.length; i++) {
    const spot = spots[i];
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(spot.tilt, spot.yaw, 0);
    dummy.scale.set(spot.scale, spot.scale * (spot.squash ?? 1), spot.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color(i, tint);
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
}

/** Buried, tapered talus. All upper vertices stay below the original cover footprint. */
function foundationGeometry(x: number, z: number, radius: number, top: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const segments = 16;
  for (let ring = 0; ring < 3; ring++) {
    const r = radius * (ring === 0 ? 1.08 : ring === 1 ? 0.96 : 0.78);
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      const ripple = 1 + Math.sin(a * 3 + x) * 0.045 + Math.cos(a * 5 + z) * 0.025;
      const px = Math.cos(a) * r * ripple;
      const pz = Math.sin(a) * r * ripple;
      const bed = floorY(x + px, z + pz) - 0.45;
      const y = ring === 0 ? bed : ring === 1 ? bed * 0.5 + top * 0.5 : top;
      positions.push(px, y, pz);
    }
  }
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < segments; i++) {
      const a = ring * (segments + 1) + i;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Cap overlaps the original mesh; no daylight slit between support and cover.
  positions.push(0, top, 0);
  const center = positions.length / 3 - 1;
  for (let i = 0; i < segments; i++) indices.push(center, 2 * (segments + 1) + i + 1, 2 * (segments + 1) + i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

/** Posts sit on `inner`. Rocks use `radius` as their mesh scale. Same records as the collider. */
function boulderGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const lumps: Array<[number, number, number, number, number, number]> = [
    [0, 0.02, 0, 1.05, 0.7, 0.9],
    [0.4, -0.06, 0.2, 0.62, 0.46, 0.54],
    [-0.4, -0.04, 0.16, 0.56, 0.48, 0.5],
    [0.06, 0.16, -0.34, 0.48, 0.36, 0.44],
    [-0.14, -0.14, -0.26, 0.42, 0.3, 0.38],
  ];
  for (const [x, y, z, sx, sy, sz] of lumps) {
    const lump = new THREE.IcosahedronGeometry(0.55, 2);
    const pos = lump.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const chip = 1 + Math.sin(px * 9.5 + pz * 7.2 + x) * 0.14 + Math.cos(py * 12 + z) * 0.08;
      pos.setXYZ(i, px * sx * chip, py * sy * chip * 0.92, pz * sz * chip);
    }
    lump.computeVertexNormals();
    lump.translate(x, y, z);
    parts.push(lump);
  }
  return disposeParts(parts, mergeParts(parts));
}

function reefHeadGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cups: Array<[number, number, number, number, number]> = [
    [0, 0.2, 0, 0.58, 0.95],
    [0.78, 0.05, 0.32, 0.4, 0.72],
    [-0.74, 0.02, 0.28, 0.38, 0.68],
    [0.22, 0.22, -0.7, 0.36, 0.64],
    [-0.3, 0.18, -0.62, 0.34, 0.6],
    [1.05, -0.05, -0.12, 0.3, 0.52],
    [-1.0, -0.02, -0.16, 0.28, 0.5],
  ];
  for (const [x, y, z, radius, height] of cups) {
    const cup = new THREE.CylinderGeometry(radius * 0.62, radius, height, 8, 3);
    const pos = cup.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const h = (pos.getY(i) + height / 2) / Math.max(height, 0.001);
      const flare = 1 + h * h * 0.55;
      const pore = 1 + Math.sin(pos.getX(i) * 22 + pos.getZ(i) * 16) * 0.08 * h;
      pos.setXYZ(i, pos.getX(i) * flare * pore, pos.getY(i), pos.getZ(i) * flare * pore);
    }
    cup.computeVertexNormals();
    cup.translate(x, y + height * 0.28, z);
    parts.push(cup);
    const rim = new THREE.TorusGeometry(radius * 0.9, Math.max(0.025, radius * 0.1), 5, 10);
    rim.rotateX(Math.PI / 2);
    rim.translate(x, y + height * 0.72, z);
    parts.push(rim);
  }
  for (const side of [-1, 1]) {
    const joint = new THREE.Vector3(side * 0.45, 0.35, 0.1);
    const tip = joint.clone().add(new THREE.Vector3(side * 0.55, 0.42, 0.18));
    parts.push(branchPart(joint, tip, 0.07));
    const polyp = new THREE.SphereGeometry(0.08, 6, 4);
    polyp.translate(tip.x, tip.y, tip.z);
    parts.push(polyp);
  }
  return disposeParts(parts, mergeParts(parts));
}

function brainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const fold = Math.sin(x * 16 + Math.sin(z * 9)) * Math.cos(z * 13) * 0.045;
    const n = Math.hypot(x, y, z) || 1;
    pos.setXYZ(i, x + (x / n) * fold, Math.max(0, y + (y / n) * fold * 0.6), z + (z / n) * fold);
  }
  geo.computeVertexNormals();
  return geo;
}

function plateGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(0.72, 20);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const radius = Math.hypot(x, z);
    const fold = Math.sin(Math.atan2(z, x) * 7) * 0.045 * radius + Math.sin(radius * 14) * 0.016;
    pos.setY(i, 0.035 * (1 - radius / 0.72) + fold);
  }
  geo.computeVertexNormals();
  return geo;
}

function addCover(
  root: THREE.Group,
  keepGeo: (geo: THREE.BufferGeometry) => THREE.BufferGeometry,
  keepMat: <T extends THREE.Material>(mat: T) => T,
) {
  const reefMat = keepMat(reefMaterial("#1f8a78", 0.72, true));
  const crownMat = keepMat(reefMaterial("#7fd0b4", 0.55, true));
  const growthMats = [
    keepMat(reefMaterial("#e07a62", 0.6, true)),
    keepMat(reefMaterial("#f2c7a0", 0.56, true)),
    keepMat(reefMaterial("#c45c7a", 0.58, true)),
  ];
  const caveMat = keepMat(reefMaterial("#3e5160", 0.84));
  const rockMat = keepMat(reefMaterial("#6d6458", 0.9));
  const rubbleMat = keepMat(reefMaterial("#4a433c", 0.95));
  const stalkGeo = keepGeo(new THREE.CylinderGeometry(0.55, 0.7, 2.4, 7));
  const reefGeo = keepGeo(reefHeadGeometry());
  const growthGeo = keepGeo(colonyGeometry());
  const brainGeo = keepGeo(brainGeometry());
  const plateGeo = keepGeo(plateGeometry());
  const rubbleGeo = keepGeo(new THREE.CylinderGeometry(1, 1, 0.35, 10));
  const rockGeo = keepGeo(boulderGeometry());
  for (const shelter of SHELTERS) {
    const group = new THREE.Group();
    group.name = `cover-${shelter.id}`;
    group.position.set(shelter.x, 0, shelter.z);
    const posts = shelter.kind === "cave" ? 7 : 8;
    const geo = shelter.kind === "cave" ? stalkGeo : reefGeo;
    const mat = shelter.kind === "cave" ? caveMat : crownMat;
    for (let i = 0; i < posts; i++) {
      const angle = (i / posts) * Math.PI * 2;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        Math.cos(angle) * shelter.inner,
        shelter.kind === "cave" ? 1.3 : 0.9,
        Math.sin(angle) * shelter.inner,
      );
      if (shelter.kind === "reef") mesh.scale.set(1.15, 0.7, 1.15);
      group.add(mesh);
      if (shelter.kind !== "reef") continue;
      const lean = angle + (i % 2 === 0 ? 0.35 : -0.35);
      const branch = new THREE.Mesh(growthGeo, growthMats[i % growthMats.length]);
      branch.position.set(Math.cos(lean) * shelter.inner * 0.86, -0.15, Math.sin(lean) * shelter.inner * 0.86);
      branch.rotation.y = -lean;
      branch.scale.setScalar(0.8 + (i % 3) * 0.12);
      group.add(branch);
      if (i % 2 === 0) {
        const brain = new THREE.Mesh(brainGeo, growthMats[(i + 1) % growthMats.length]);
        brain.position.set(Math.cos(angle) * (shelter.inner - 0.35), 0.35, Math.sin(angle) * (shelter.inner - 0.35));
        brain.scale.setScalar(0.7);
        group.add(brain);
      } else {
        const plate = new THREE.Mesh(plateGeo, growthMats[(i + 2) % growthMats.length]);
        plate.position.set(Math.cos(angle) * (shelter.inner + 0.45), -0.85, Math.sin(angle) * (shelter.inner + 0.45));
        plate.rotation.y = angle;
        plate.scale.setScalar(0.85);
        group.add(plate);
      }
    }
    // Separate child after the gameplay posts: hide/rebuild cover hides its supports too.
    // Individual narrow bases preserve the central pocket and gaps between posts.
    const foundations = new THREE.Group();
    foundations.name = `foundation-${shelter.id}`;
    for (let i = 0; i < posts; i++) {
      const angle = i / posts * Math.PI * 2;
      const x = shelter.x + Math.cos(angle) * shelter.inner;
      const z = shelter.z + Math.sin(angle) * shelter.inner;
      const base = new THREE.Mesh(keepGeo(foundationGeometry(x, z, shelter.kind === "cave" ? 0.7 : 0.98, 0.48)), shelter.kind === "cave" ? caveMat : reefMat);
      base.position.set(x - shelter.x, 0, z - shelter.z);
      foundations.add(base);
    }
    group.add(foundations);
    root.add(group);
    const rubble = new THREE.Mesh(rubbleGeo, rubbleMat);
    rubble.name = `rubble-${shelter.id}`;
    rubble.position.set(shelter.x, 0.2, shelter.z);
    rubble.scale.set(shelter.inner * 0.85, 1, shelter.inner * 0.85);
    rubble.visible = false;
    root.add(rubble);
  }
  for (const rock of ROCKS) {
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.name = `rock-${rock.id}`;
    mesh.position.set(rock.x, 0.7, rock.z);
    mesh.scale.setScalar(rock.radius);
    root.add(mesh);
    const foundation = new THREE.Mesh(keepGeo(foundationGeometry(rock.x, rock.z, rock.radius * 0.78, 0.2)), rockMat);
    foundation.name = `foundation-${rock.id}`;
    foundation.position.set(rock.x, 0, rock.z);
    root.add(foundation);
  }
}

/** Fine surface relief through shading, without extra meshes or collider changes. */
function reefMaterial(color: string, roughness: number, coral = false): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vReefLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvReefLocal = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vReefLocal;
        ${RELIEF_GLSL}
        float reefGrain(vec3 p) {
          return sin(p.x * 17.0 + sin(p.z * 13.0)) * sin(p.y * 23.0 + p.z * 9.0);
        }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float grain = 0.0;
        if (uSceneryDetail > 0.5) grain = reefGrain(vReefLocal);
        float strata = sin(vReefLocal.y * ${coral ? "42.0" : "11.0"} + sin(vReefLocal.x * 4.0) * 1.6);
        diffuseColor.rgb *= 0.95 + grain * 0.065 + strata * 0.035;
        float growth = smoothstep(-0.1, 0.9, vReefLocal.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 1.04, 0.94), growth * ${coral ? "0.12" : "0.32"});`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        float relief = reefGrain(vReefLocal) * ${coral ? "0.003" : "0.012"};
        relief += sin(vReefLocal.y * 11.0 + sin(vReefLocal.x * 4.0) * 1.6) * 0.008;
        normal = seaReliefNormal(-vViewPosition, normal, relief);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + reefGrain(vReefLocal * 1.7) * 0.045, 0.35, 1.0);`);
  };
  mat.customProgramCacheKey = () => `reef-normal-relief-v2-${coral}`;
  return mat;
}

export function addScenery(scene: THREE.Scene, quality: GraphicsQuality = "balanced"): Scenery {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const keepGeo = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    geos.push(geo);
    return geo;
  };
  const keepMat = <T extends THREE.Material>(mat: T): T => {
    mats.push(mat);
    return mat;
  };

  const root = new THREE.Group();
  root.name = "sea-root";
  scene.add(root);

  scene.background = new THREE.Color("#083f48");
  scene.fog = null;

  const time = { value: 0 };
  const detail = { value: quality === "low" ? 0 : 1 };
  const noon = daylightAt(12);
  const tone: SeaTone = {
    time,
    detail,
    sun: { value: noon.sun },
    flow: { value: noon.flow },
    near: { value: noon.near },
    far: { value: noon.far },
    reflect: { value: noon.reflect },
    lift: { value: noon.lift },
  };

  const haze = new THREE.Mesh(
    keepGeo(new THREE.SphereGeometry(980, 48, 32)),
    keepMat(columnMaterial(tone)),
  );
  haze.name = "water-haze";
  haze.frustumCulled = false;
  root.add(haze);

  const caustics = new THREE.Group();
  caustics.name = "caustics";
  root.add(caustics);

  const column = new THREE.Mesh(
    keepGeo(new THREE.CylinderGeometry(720, 720, 72, 40, 1, true)),
    keepMat(columnMaterial(tone)),
  );
  column.name = "column";
  column.position.y = -6;
  column.frustumCulled = false;
  root.add(column);
  // Global illumination belongs to SeaView/Stage, not scenery.

  const bed = new THREE.Mesh(
    keepGeo(discGeometry(BED_RADIUS, BED_RINGS, BED_SEGMENTS)),
    keepMat(sandMaterial(tone)),
  );
  bed.name = "bed";
  const bedPos = bed.geometry.getAttribute("position");
  for (let i = 0; i < bedPos.count; i++) {
    bedPos.setY(i, duneAt(bedPos.getX(i), bedPos.getZ(i)));
  }
  bed.geometry.computeVertexNormals();
  bed.position.y = BED_SINK;
  root.add(bed);

  const surfaceGeo = keepGeo(discGeometry(ARENA + 320, 80, 160));
  // Disc winding faces -Y. FrontSide is the underside the play camera sees.
  const surface = new THREE.Mesh(surfaceGeo, keepMat(surfaceMaterial(THREE.FrontSide, tone)));
  surface.name = "surface";
  surface.position.y = WATER_LEVEL;
  surface.renderOrder = 2;
  const surfaceUnder = new THREE.Mesh(surfaceGeo, keepMat(surfaceMaterial(THREE.BackSide, tone)));
  surfaceUnder.name = "surfaceUnder";
  surfaceUnder.position.y = WATER_LEVEL;
  surfaceUnder.renderOrder = 2;
  root.add(surface, surfaceUnder);

  const rand = mulberry32(0x5e0a);
  const groves = GROVES;
  const kelpSpots: Spot[] = [];
  for (let g = 0; g < groves.length; g++) {
    const grove = groves[g];
    const blades = 12;
    for (let i = 0; i < blades; i++) {
      const jitter = 1.2 + rand() * 4.2;
      const ang = rand() * Math.PI * 2;
      let x = Math.cos(grove.a) * grove.r + Math.cos(ang) * jitter;
      let z = Math.sin(grove.a) * grove.r + Math.sin(ang) * jitter;
      const dist = Math.hypot(x, z);
      if (dist < SPAWN_CLEAR) {
        x *= SPAWN_CLEAR / Math.max(dist, 0.001);
        z *= SPAWN_CLEAR / Math.max(dist, 0.001);
      }
      const yaw = rand() * Math.PI * 2;
      const scale = 0.75 + rand() * 0.9;
      const y = floorY(x, z);
      kelpSpots.push({ x, y, z, yaw, scale, tilt: 0 });
      kelpSpots.push({ x: x + 0.12, y: floorY(x + 0.12, z + 0.05), z: z + 0.05, yaw: yaw + Math.PI / 2, scale: scale * 0.84, tilt: 0 });
    }
  }
  for (let i = 0; i < 140; i++) {
    const a = rand() * Math.PI * 2;
    const r = SPAWN_CLEAR + 6 + rand() * (ARENA - SPAWN_CLEAR - 24);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const yaw = rand() * Math.PI * 2;
    const scale = 0.65 + rand() * 0.9;
    const y = floorY(x, z);
    kelpSpots.push({ x, y, z, yaw, scale, tilt: 0 });
    kelpSpots.push({ x: x + 0.1, y: floorY(x + 0.1, z), z, yaw: yaw + 1.2, scale: scale * 0.8, tilt: 0 });
  }
  // Decorative ring just outside each shelter. Not a collider. The pocket stays clear.
  for (const shelter of SHELTERS) {
    const blades = 6;
    for (let i = 0; i < blades; i++) {
      const ang = (i / blades) * Math.PI * 2 + 0.4;
      const ring = shelter.radius + 2.4;
      const x = shelter.x + Math.cos(ang) * ring;
      const z = shelter.z + Math.sin(ang) * ring;
      const yaw = ang;
      const scale = 0.9;
      const y = floorY(x, z);
      kelpSpots.push({ x, y, z, yaw, scale, tilt: 0 });
    }
  }
  const kelp = new THREE.InstancedMesh(
    keepGeo(withPhase(bladeGeometry(5.6, 0.46, 0.08), kelpSpots.length)),
    keepMat(bladeMaterial(0.62, 0.045, 0.7, time, tone.flow, true)),
    kelpSpots.length,
  );
  kelp.name = "kelp";
  const kelpTints = ["#0d6a45", "#146e52", "#1c7a48", "#3d6a3e"];
  placeInstances(kelp, kelpSpots, (i, tint) => tint.set(kelpTints[i % kelpTints.length]));
  root.add(kelp);

  const grassSpots: Spot[] = [];
  for (let i = 0; i < 280; i++) {
    const grove = groves[i % groves.length];
    const ang = rand() * Math.PI * 2;
    const jitter = rand() * 14;
    const x = Math.cos(grove.a) * grove.r + Math.cos(ang) * jitter;
    const z = Math.sin(grove.a) * grove.r + Math.sin(ang) * jitter;
    if (Math.hypot(x, z) > ARENA - 8) continue;
    grassSpots.push({
      x,
      y: floorY(x, z),
      z,
      yaw: rand() * Math.PI,
      scale: 0.55 + rand() * 0.7,
      tilt: 0,
    });
  }
  const grass = new THREE.InstancedMesh(
    keepGeo(withPhase(bladeGeometry(1.45, 0.14, 0.02), grassSpots.length)),
    keepMat(bladeMaterial(0.7, 0.09, 1.15, time, tone.flow)),
    grassSpots.length,
  );
  grass.name = "grass";
  placeInstances(grass, grassSpots, (_i, tint) => tint.set("#1f8a58"));
  root.add(grass);

  const rockSpots: Spot[] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rand();
    const r = 38 + rand() * (ARENA * 0.7);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    rockSpots.push({
      x,
      y: floorY(x, z) + 0.15,
      z,
      yaw: rand() * Math.PI * 2,
      scale: 1.2 + rand() * 2.6,
      tilt: rand() * 0.6,
    });
  }
  const rocks = new THREE.InstancedMesh(
    keepGeo(boulderGeometry()),
    keepMat(reefMaterial("#ffffff", 0.93)),
    rockSpots.length,
  );
  rocks.name = "rocks";
  const rockTints = ["#6e655c", "#8a8074", "#4e5756"];
  placeInstances(rocks, rockSpots, (i, tint) => tint.set(rockTints[i % rockTints.length]));
  root.add(rocks);

  const pebbleSpots: Spot[] = [];
  for (let i = 0; i < 54; i++) {
    const a = rand() * Math.PI * 2;
    const r = 8 + rand() * (ARENA * 0.8);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    pebbleSpots.push({
      x,
      y: floorY(x, z) + 0.04,
      z,
      yaw: rand() * Math.PI,
      scale: 0.22 + rand() * 0.42,
      tilt: rand() * 0.5,
      squash: 0.42,
    });
  }
  const pebbles = new THREE.InstancedMesh(
    keepGeo(new THREE.SphereGeometry(0.45, 8, 6)),
    keepMat(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.88 })),
    pebbleSpots.length,
  );
  pebbles.name = "pebbles";
  placeInstances(pebbles, pebbleSpots, (i, tint) => tint.set(i % 2 === 0 ? "#b7a48a" : "#8d7d6c"));
  root.add(pebbles);

  const coralSpots: Spot[] = [];
  for (let i = 0; i < 28; i++) {
    const grove = groves[i % groves.length];
    const ang = rand() * Math.PI * 2;
    const x = Math.cos(grove.a) * grove.r + Math.cos(ang) * (3 + rand() * 6);
    const z = Math.sin(grove.a) * grove.r + Math.sin(ang) * (3 + rand() * 6);
    if (Math.hypot(x, z) < SPAWN_CLEAR) continue;
    coralSpots.push({
      x,
      y: floorY(x, z),
      z,
      yaw: rand() * Math.PI * 2,
      scale: 0.75 + rand() * 0.9,
      tilt: (rand() - 0.5) * 0.25,
    });
  }
  const coral = new THREE.InstancedMesh(
    keepGeo(colonyGeometry()),
    keepMat(reefMaterial("#ffffff", 0.58, true)),
    coralSpots.length,
  );
  coral.name = "coral";
  const coralTints = ["#e07a62", "#f0a38a", "#2a9a86", "#c45c7a"];
  placeInstances(coral, coralSpots, (i, tint) => tint.set(coralTints[i % coralTints.length]));
  root.add(coral);

  const fanGeo = fanGeometry();
  const fanSpots: Spot[] = [];
  for (let i = 0; i < 8; i++) {
    const grove = groves[i % groves.length];
    const x = Math.cos(grove.a) * grove.r + (rand() - 0.5) * 8;
    const z = Math.sin(grove.a) * grove.r + (rand() - 0.5) * 8;
    if (Math.hypot(x, z) < SPAWN_CLEAR) continue;
    fanSpots.push({
      x,
      y: floorY(x, z),
      z,
      yaw: rand() * Math.PI * 2,
      scale: 0.7 + rand() * 0.8,
      tilt: 0,
    });
  }
  const fans = new THREE.InstancedMesh(
    keepGeo(withPhase(fanGeo, fanSpots.length)),
    keepMat(bladeMaterial(0.5, 0.03, 0.45, time, tone.flow)),
    fanSpots.length,
  );
  fans.name = "fans";
  placeInstances(fans, fanSpots, (i, tint) => tint.set(i % 2 === 0 ? "#d86a62" : "#e7c07a"));
  root.add(fans);

  const shellSpots: Spot[] = [];
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const r = 12 + rand() * (ARENA * 0.8);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    shellSpots.push({
      x,
      y: floorY(x, z) + 0.05,
      z,
      yaw: rand() * Math.PI,
      scale: 0.85 + rand() * 0.9,
      tilt: Math.PI / 2,
    });
  }
  const shells = new THREE.InstancedMesh(
    keepGeo(shellGeometry()),
    keepMat(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.42, side: THREE.DoubleSide })),
    shellSpots.length,
  );
  shells.name = "shells";
  placeInstances(shells, shellSpots, (i, tint) => tint.set(i % 2 === 0 ? "#f4e4cc" : "#e7b8a4"));
  root.add(shells);

  const schoolCount = 18;
  const nearCount = 12;
  const schoolMat = keepMat(new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.34,
    metalness: 0.04,
    vertexColors: true,
  }));
  schoolMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\n")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float tail = smoothstep(0.15, 0.95, position.z);
        float wag = sin(uTime * 6.5 + position.z * 5.0);
        transformed.x += wag * 0.22 * tail;
        transformed.y += cos(uTime * 6.5) * 0.05 * tail;
        float pec = smoothstep(0.1, 0.28, abs(position.x)) * (1.0 - smoothstep(0.05, 0.5, abs(position.z)));
        transformed.y += sin(uTime * 8.0 + sign(position.x)) * 0.1 * pec;`);
  };
  schoolMat.customProgramCacheKey = () => "school-wag-v1";
  const fishGeo = keepGeo(createFishletGeometry());
  const school = new THREE.InstancedMesh(fishGeo, schoolMat, schoolCount);
  school.name = "school";
  school.frustumCulled = false;
  const schoolNear = new THREE.InstancedMesh(fishGeo, schoolMat, nearCount);
  schoolNear.name = "schoolNear";
  schoolNear.frustumCulled = false;
  const schoolTint = new THREE.Color();
  const schoolDummy = new THREE.Object3D();
  for (let i = 0; i < schoolCount; i++) {
    schoolTint.set(i % 3 === 0 ? "#d5e6ee" : i % 3 === 1 ? "#c5dce8" : "#e7f2f4");
    school.setColorAt(i, schoolTint);
  }
  for (let i = 0; i < nearCount; i++) {
    schoolTint.set(i % 2 === 0 ? "#e8f4f6" : "#b7d4e2");
    schoolNear.setColorAt(i, schoolTint);
  }
  if (school.instanceColor) school.instanceColor.needsUpdate = true;
  if (schoolNear.instanceColor) schoolNear.instanceColor.needsUpdate = true;
  const schoolOuter = new THREE.InstancedMesh(fishGeo, schoolMat, OUTER_SCHOOL);
  schoolOuter.name = "schoolOuter";
  schoolOuter.frustumCulled = false;
  for (let i = 0; i < OUTER_SCHOOL; i++) {
    schoolTint.set(i % 2 === 0 ? "#d5e4ee" : "#c9dbe6");
    schoolOuter.setColorAt(i, schoolTint);
  }
  if (schoolOuter.instanceColor) schoolOuter.instanceColor.needsUpdate = true;
  root.add(school, schoolNear, schoolOuter);

  // Decorative life. Not bite targets. A second seed keeps the kelp stream put.
  const lifeTint = new THREE.Color();
  const paint = (mesh: THREE.InstancedMesh, colors: string[]) => {
    for (let i = 0; i < mesh.count; i++) {
      lifeTint.set(colors[i % colors.length]);
      mesh.setColorAt(i, lifeTint);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
  };

  const jellies = new THREE.InstancedMesh(
    keepGeo(withPhase(createJellyGeometry(), JELLY_COUNT)),
    keepMat(lifeSway(time, "jelly")),
    JELLY_COUNT,
  );
  jellies.name = "jellies";
  paint(jellies, ["#d7fff4", "#f3d0ea", "#c6e4ff", "#f7e7c4"]);
  const rayMat = keepMat(lifeSway(time, "ray"));
  rayMat.vertexColors = true;
  const rays = new THREE.InstancedMesh(
    keepGeo(withPhase(rayGeometry(), RAY_COUNT)),
    rayMat,
    RAY_COUNT,
  );
  rays.name = "rays";
  paint(rays, ["#ffffff", "#f3f7f6", "#e7eeec", "#f6f1e6"]);
  const turtleMat = keepMat(lifeSway(time, "turtle"));
  turtleMat.vertexColors = true;
  const turtles = new THREE.InstancedMesh(
    keepGeo(withPhase(turtleGeometry(), TURTLE_COUNT)),
    turtleMat,
    TURTLE_COUNT,
  );
  turtles.name = "turtles";
  paint(turtles, ["#ffffff", "#f3efe6", "#efe4d2", "#f7f4ee"]);
  const crabs = new THREE.InstancedMesh(
    keepGeo(crabGeometry()),
    keepMat(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.58 })),
    CRAB_COUNT,
  );
  crabs.name = "crabs";
  paint(crabs, ["#c45c3c", "#8d4034", "#d07a45"]);
  const seahorses = new THREE.InstancedMesh(
    keepGeo(seahorseGeometry()),
    keepMat(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.42 })),
    SEAHORSE_COUNT,
  );
  seahorses.name = "seahorses";
  paint(seahorses, ["#e0a84a", "#d4784a", "#c9843c"]);
  const squidBuilt = createSquidFlock(SQUID_COUNT);
  const squid = squidBuilt.flock;
  keepGeo(squidBuilt.geometry);
  keepMat(squidBuilt.material);

  const starCount = 16;
  const starSpots: Spot[] = [];
  for (let i = 0; i < starCount; i++) {
    const spot = lifePoint(i, 3);
    starSpots.push({
      x: spot.x,
      y: floorY(spot.x, spot.z) + 0.03,
      z: spot.z,
      yaw: (i * 0.7) % (Math.PI * 2),
      scale: 1.15 + (i % 4) * 0.22,
      tilt: 0,
    });
  }
  const starfish = new THREE.InstancedMesh(
    keepGeo(starfishGeometry()),
    keepMat(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 })),
    starSpots.length,
  );
  starfish.name = "starfish";
  placeInstances(starfish, starSpots, (i, tint) => tint.set(["#e07a32", "#d24b4b", "#e0a05a", "#c45a78"][i % 4]));

  const anemoneCount = 12;
  const anemoneSpots: Spot[] = [];
  for (let i = 0; i < anemoneCount; i++) {
    const spot = lifePoint(i, 9);
    const x = spot.x + 1.7;
    const z = spot.z - 0.6;
    const held = Math.hypot(x, z) < SPAWN_CLEAR + 2
      ? { x: x * ((SPAWN_CLEAR + 2) / Math.max(Math.hypot(x, z), 0.001)), z: z * ((SPAWN_CLEAR + 2) / Math.max(Math.hypot(x, z), 0.001)) }
      : { x, z };
    anemoneSpots.push({
      x: held.x,
      y: floorY(held.x, held.z),
      z: held.z,
      yaw: (i * 1.1) % (Math.PI * 2),
      scale: 1.35 + (i % 3) * 0.28,
      tilt: 0,
    });
  }
  const anemones = new THREE.InstancedMesh(
    keepGeo(withPhase(anemoneGeometry(), anemoneSpots.length)),
    keepMat(bladeMaterial(0.48, 0.06, 0.85, time, tone.flow)),
    anemoneSpots.length,
  );
  anemones.name = "anemones";
  placeInstances(anemones, anemoneSpots, (i, tint) => tint.set(["#e07a96", "#f0a0b8", "#d06088", "#f2c1a0"][i % 4]));

  const urchinCount = 14;
  const urchinSpots: Spot[] = [];
  for (let i = 0; i < urchinCount; i++) {
    const spot = lifePoint(i + 2, 15);
    const x = spot.x - 1.5;
    const z = spot.z + 1.2;
    const dist = Math.hypot(x, z);
    const held = dist < SPAWN_CLEAR + 2
      ? { x: x * ((SPAWN_CLEAR + 2) / Math.max(dist, 0.001)), z: z * ((SPAWN_CLEAR + 2) / Math.max(dist, 0.001)) }
      : { x, z };
    urchinSpots.push({
      x: held.x,
      y: floorY(held.x, held.z) + 0.08,
      z: held.z,
      yaw: (i * 0.4) % (Math.PI * 2),
      scale: 0.7 + (i % 4) * 0.16,
      tilt: 0,
    });
  }
  const urchins = new THREE.InstancedMesh(
    keepGeo(urchinGeometry()),
    keepMat(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82 })),
    urchinSpots.length,
  );
  urchins.name = "urchins";
  placeInstances(urchins, urchinSpots, (i, tint) => tint.set(["#4a3d55", "#3d4c55", "#5a4038"][i % 3]));

  const brainSpots: Spot[] = [];
  for (let i = 0; i < 24; i++) {
    const spot = lifePoint(i + REEF.length, 27);
    brainSpots.push({
      x: spot.x,
      y: floorY(spot.x, spot.z) + 0.04,
      z: spot.z,
      yaw: (i * 0.85) % (Math.PI * 2),
      scale: 1.2 + (i % 4) * 0.26,
      tilt: 0,
      squash: 0.7,
    });
  }
  const brains = new THREE.InstancedMesh(
    keepGeo(brainGeometry()),
    keepMat(reefMaterial("#ffffff", 0.62, true)),
    brainSpots.length,
  );
  brains.name = "brains";
  placeInstances(brains, brainSpots, (i, tint) => tint.set(["#c45c6a", "#d98a7a", "#8f4a55", "#e0a090"][i % 4]));

  const plateSpots: Spot[] = [];
  for (let i = 0; i < 18; i++) {
    const spot = lifePoint(i + REEF.length, 33);
    plateSpots.push({
      x: spot.x,
      y: floorY(spot.x, spot.z) + 0.02,
      z: spot.z,
      yaw: (i * 1.3) % (Math.PI * 2),
      scale: 1.45 + (i % 3) * 0.4,
      tilt: 0,
    });
  }
  const plates = new THREE.InstancedMesh(
    keepGeo(plateGeometry()),
    keepMat(reefMaterial("#ffffff", 0.55, true)),
    plateSpots.length,
  );
  plates.name = "plates";
  placeInstances(plates, plateSpots, (i, tint) => tint.set(["#e07a62", "#f2c7a0", "#c96b62", "#d4a574"][i % 4]));
  const reefRand = mulberry32(0x5e21);
  const reefSpots: Spot[] = [];
  for (let i = 0; i < 22; i++) {
    const angle = reefRand() * Math.PI * 2;
    const radius = 52 + reefRand() * (ARENA * 0.7);
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    const dist = Math.hypot(x, z);
    if (dist < SPAWN_CLEAR + 10) {
      const push = (SPAWN_CLEAR + 10) / Math.max(dist, 0.001);
      x *= push;
      z *= push;
    }
    reefSpots.push({
      x,
      y: floorY(x, z),
      z,
      yaw: reefRand() * Math.PI * 2,
      scale: 4.2 + reefRand() * 3.4,
      tilt: 0,
    });
  }
  const reefs = new THREE.InstancedMesh(
    keepGeo(createReefGeometry()),
    keepMat(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.62, vertexColors: true })),
    reefSpots.length,
  );
  reefs.name = "reefs";
  placeInstances(reefs, reefSpots, (i, tint) => tint.set(["#ffffff", "#f3e4dc", "#f7d7cf", "#efe2d4"][i % 4]));
  const shelfRand = mulberry32(0x5e44);
  const shelfSpots: Spot[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = shelfRand() * Math.PI * 2;
    const radius = ARENA * 0.78 + shelfRand() * 180;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    shelfSpots.push({
      x,
      y: floorY(x, z),
      z,
      yaw: shelfRand() * Math.PI * 2,
      scale: 8 + shelfRand() * 5,
      tilt: 0,
    });
  }
  const outerReefs = new THREE.InstancedMesh(
    keepGeo(createReefGeometry()),
    keepMat(new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.62, vertexColors: true })),
    shelfSpots.length,
  );
  outerReefs.name = "outerReefs";
  placeInstances(outerReefs, shelfSpots, (i, tint) => tint.set(["#ffffff", "#f3e4dc", "#f7d7cf", "#efe2d4"][i % 4]));
  root.add(jellies, rays, turtles, crabs, seahorses, squid, starfish, anemones, urchins, brains, plates, reefs, outerReefs);
  addCover(root, keepGeo, keepMat);
  for (const material of mats) {
    if (!(material instanceof THREE.MeshStandardMaterial) || material === bed.material) continue;
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      shader.uniforms.uSceneryDetail = detail;
      shader.fragmentShader = `uniform float uSceneryDetail;
${shader.fragmentShader}`;
      // Keep coarse albedo on low, skip derivative relief and extra roughness samples.
      shader.fragmentShader = shader.fragmentShader
        .replace("float relief = reefGrain", "if (uSceneryDetail > 0.5) { float relief = reefGrain")
        .replace("normal = seaReliefNormal(-vViewPosition, normal, relief);", "normal = seaReliefNormal(-vViewPosition, normal, relief); }")
        .replace("roughnessFactor = clamp(roughnessFactor + reefGrain", "if (uSceneryDetail > 0.5) roughnessFactor = clamp(roughnessFactor + reefGrain");
    };
    material.customProgramCacheKey = () => `${key}:scenery-detail-v1`;
  }

  let disposed = false;
  // Allocate once at full capacity. Presets only change submitted decorations;
  // cover/rubble meshes are deliberately excluded, including externally set visibility.
  const swimmers = new Set<THREE.InstancedMesh>([school, schoolNear, schoolOuter, jellies, rays, turtles, crabs, seahorses]);
  const decorations: Array<{ mesh: THREE.InstancedMesh; full: number; matrices: Float32Array; colors?: Float32Array; phases?: Float32Array }> = [];
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) decorations.push({
      mesh: object, full: object.count,
      matrices: new Float32Array(object.instanceMatrix.array),
      colors: object.instanceColor ? new Float32Array(object.instanceColor.array) : undefined,
      phases: object.geometry.getAttribute("aPhase") ? new Float32Array(object.geometry.getAttribute("aPhase").array) : undefined,
    });
  });
  let refreshVisible: (() => void) | undefined;
  const setQuality = (next: GraphicsQuality) => {
    if (disposed) return;
    for (const { mesh, full, matrices, colors, phases } of decorations) {
      const fraction = next === "low" ? 0.45 : next === "high" || mesh === kelp ? 1 : 0.8;
      mesh.count = Math.max(1, Math.ceil(full * fraction));
      if (!swimmers.has(mesh)) {
        const selected: number[] = [];
        // Reserve two original blades at every shelter before sampling the rest.
        if (mesh === kelp && mesh.count < full) {
          const start = full - SHELTERS.length * 6;
          for (let i = 0; i < SHELTERS.length; i++) selected.push(start + i * 6, start + i * 6 + 3);
        }
        const reserved = new Set(selected);
        const available = Array.from({ length: full }, (_, i) => i).filter((i) => !reserved.has(i));
        const remaining = mesh.count - selected.length;
        for (let i = 0; i < remaining; i++) selected.push(available[Math.floor(i * available.length / remaining)]);
        if (mesh.count === full) selected.splice(0, selected.length, ...Array.from({ length: full }, (_, i) => i));
        for (let i = 0; i < selected.length; i++) {
          mesh.instanceMatrix.array.set(matrices.subarray(selected[i] * 16, selected[i] * 16 + 16), i * 16);
          if (colors && mesh.instanceColor) mesh.instanceColor.array.set(colors.subarray(selected[i] * 3, selected[i] * 3 + 3), i * 3);
          if (phases) (mesh.geometry.getAttribute("aPhase").array as Float32Array)[i] = phases[selected[i]];
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (phases) mesh.geometry.getAttribute("aPhase").needsUpdate = true;
      }
    }
    detail.value = next === "low" ? 0 : 1;
    // Newly revealed swimmers join the current phase, never stale hidden transforms.
    refreshVisible?.();
  };
  setQuality(quality);
  const scenery: Scenery = {
    setQuality,
    setDaylight(day) {
      if (disposed) return;
      tone.sun.value.copy(day.sun);
      tone.flow.value.copy(day.flow);
      tone.near.value.copy(day.near);
      tone.far.value.copy(day.far);
      tone.reflect.value.copy(day.reflect);
      tone.lift.value.copy(day.lift);
      if (scene.background instanceof THREE.Color) scene.background.copy(day.background);
    },
    update(now: number) {
      if (disposed) return;
      time.value = now;
      for (let i = 0; i < school.count; i++) {
        const theta = now * 0.22 + i * 0.62;
        const radius = 32 + (i % 6) * 10;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        schoolDummy.position.set(x, 0.15 + Math.sin(theta * 2 + i) * 1.05, z);
        const vx = -Math.sin(theta);
        const vz = Math.cos(theta);
        schoolDummy.rotation.set(Math.sin(theta * 2) * 0.16, Math.atan2(-vx, -vz), Math.sin(theta * 3) * 0.28);
        schoolDummy.scale.setScalar(0.62 + (i % 3) * 0.14);
        schoolDummy.updateMatrix();
        school.setMatrixAt(i, schoolDummy.matrix);
      }
      school.instanceMatrix.needsUpdate = true;
      const nearCenters = [
        { x: 4, z: -28, r: 7 },
        { x: -14, z: -18, r: 5.5 },
      ];
      for (let i = 0; i < schoolNear.count; i++) {
        const center = nearCenters[i % nearCenters.length];
        const theta = now * 0.48 + i * 0.72;
        const x = center.x + Math.cos(theta) * center.r;
        const z = center.z + Math.sin(theta) * center.r * 0.72;
        schoolDummy.position.set(x, -0.2 + Math.sin(theta * 2 + i) * 0.7, z);
        const vx = -Math.sin(theta) * center.r;
        const vz = Math.cos(theta) * center.r * 0.72;
        schoolDummy.rotation.set(Math.sin(theta * 2) * 0.12, Math.atan2(-vx, -vz), Math.sin(theta * 3) * 0.22);
        schoolDummy.scale.setScalar(0.48 + (i % 3) * 0.1);
        schoolDummy.updateMatrix();
        schoolNear.setMatrixAt(i, schoolDummy.matrix);
      }
      schoolNear.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < schoolOuter.count; i++) {
        const theta = now * 0.08 + i * 0.55;
        const radius = 150 + (i % 5) * 22;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius * 0.9;
        schoolDummy.position.set(x, -3.4 + Math.sin(theta * 2 + i) * 1.3, z);
        const vx = -Math.sin(theta);
        const vz = Math.cos(theta) * 0.9;
        schoolDummy.rotation.set(Math.sin(theta * 2) * 0.14, Math.atan2(-vx, -vz), Math.sin(theta * 3) * 0.2);
        schoolDummy.scale.setScalar(0.7 + (i % 3) * 0.16);
        schoolDummy.updateMatrix();
        schoolOuter.setMatrixAt(i, schoolDummy.matrix);
      }
      schoolOuter.instanceMatrix.needsUpdate = true;
      writeLife(jellies, JELLY_COUNT, jellyPose, now, schoolDummy);
      writeLife(rays, RAY_COUNT, rayPose, now, schoolDummy);
      writeLife(turtles, TURTLE_COUNT, turtlePose, now, schoolDummy);
      writeLife(crabs, CRAB_COUNT, crabPose, now, schoolDummy);
      writeLife(seahorses, SEAHORSE_COUNT, seahorsePose, now, schoolDummy);
      for (let i = 0; i < SQUID_COUNT; i++) {
        const pose = squidPose(i, now);
        const model = squid.children[i];
        model.position.set(pose.x, pose.y, pose.z);
        model.rotation.set(0, pose.yaw, 0);
        model.scale.set(pose.sx, pose.sy, pose.sz);
      }
      syncSquidSwim(squid, now);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(root);
      for (const { mesh } of decorations) mesh.dispose();
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
    },
  };
  refreshVisible = () => scenery.update(time.value);
  refreshVisible();
  return scenery;
}
