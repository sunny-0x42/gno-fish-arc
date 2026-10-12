import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { RARITIES, type Rarity } from "../sim/catalog";
import type { FishRig } from "./createFish";

/** Species body lengths. They match LOOK in createFish.ts. Root scale stays on the rig. */
const BODY_LENGTH: Record<Rarity, number> = {
  common: 2.15,
  uncommon: 2.7,
  rare: 2.45,
  epic: 2.5,
  legendary: 3.35,
  mythic: 3.6,
};

/** Stroke scale. Higher rarities bend further. Race.glb is the rare fish. */
const STROKE: Record<Rarity, number> = {
  common: 0.92,
  uncommon: 1,
  rare: 1.06,
  epic: 1.14,
  legendary: 1.24,
  mythic: 1.34,
};

const _nose = new THREE.Vector3();
const _front = new THREE.Vector3();
const _ahead = new THREE.Vector3(0, 0, -1);
const _up = new THREE.Vector3();

const TAU = Math.PI * 2;

type TailStroke = {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  amp: number;
  lag: number;
};

type FinStroke = {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  amp: number;
  lag: number;
  rate: number;
};

type EyeStroke = {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  side: number;
};

type JawStroke = {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  axis: THREE.Vector3;
  angle: number;
};

type RarityMotion = {
  mixer: THREE.AnimationMixer;
  swim: THREE.AnimationAction;
  bite: THREE.AnimationAction;
  tail: TailStroke[];
  fins: FinStroke[];
  eyes: EyeStroke[];
  jaw: JawStroke | null;
};

/**
 * Head-to-tail stroke, in radians before the cruise gain.
 * The swim clip's tail delta is a roll, which a three-quarter camera reads as one
 * lobe sticking out. These amplitudes replace that delta with a yaw around the fish's
 * up axis, growing toward the tail and lagging so the bend travels. The species bend
 * stays in the clip's mean quaternion.
 */
const TAIL_WAVE = [
  { name: "Head", amp: 0.14 },
  { name: "Spine1", amp: 0.22 },
  { name: "Spine2", amp: 0.34 },
  { name: "Spine3", amp: 0.48 },
  { name: "Spine4", amp: 0.64 },
  { name: "Tail1", amp: 0.82 },
  { name: "Tail2", amp: 0.98 },
  { name: "Caudal", amp: 0.95 },
] as const;
const TAIL_LAG = 0.55;
const TAIL_KICK = 0.16;
const TAIL_SAMPLES = 32;

/**
 * Smooth flap layered in place of the clip's fin keys. Several clips barely move
 * the pectorals, and the ones that move are short linear keys.
 * `rate` is cycles of this flap per swim cycle. Left and right share a phase:
 * the forward axis already swings them in opposite directions.
 */
const FIN_WAVE = [
  { name: "PectoralL", amp: 0.7, lag: 0.35, rate: 2 },
  { name: "PectoralR", amp: 0.7, lag: 0.35, rate: 2 },
  { name: "PelvicL", amp: 0.46, lag: 1.05, rate: 2 },
  { name: "PelvicR", amp: 0.46, lag: 1.05, rate: 2 },
  { name: "Dorsal", amp: 0.5, lag: 0.85, rate: 1 },
  { name: "Anal", amp: 0.36, lag: 1.25, rate: 1 },
] as const;

const restCache = new WeakMap<THREE.AnimationClip, { name: string; rest: THREE.Quaternion; amp: number; lag: number }[]>();

const _yaw = new THREE.Quaternion();
const _pitch = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _finAxis = new THREE.Vector3();
const _flap = new THREE.Quaternion();
const _jawDelta = new THREE.Quaternion();

const templates = new Map<Rarity, THREE.Group>();
const loading = new Map<Rarity, Promise<THREE.Group>>();
const clips = new Map<Rarity, THREE.AnimationClip[]>();

/**
 * Turn the loaded fish so its measured nose points along local −Z.
 * Uniform scale keeps the nose-to-tail span at the species body length, centered on the origin.
 */
export function mountRarityFish(source: THREE.Object3D, rarity: Rarity): THREE.Group {
  source.updateMatrixWorld(true);
  const nose = source.getObjectByName("Nose");
  const eye = source.getObjectByName("EyeNear");
  if (!nose || !eye) throw new Error(`${rarity} fish GLB is missing Nose or EyeNear`);
  nose.getWorldPosition(_nose);
  const box = new THREE.Box3().setFromObject(source);
  const center = box.getCenter(new THREE.Vector3());
  _front.copy(_nose).sub(center);
  _front.y = 0;
  if (_front.lengthSq() < 1e-6) throw new Error(`${rarity} fish nose has no forward offset`);
  _front.normalize();

  const size = box.getSize(new THREE.Vector3());
  const alongX = size.x >= size.z;
  const axis = new THREE.Vector3(alongX ? Math.sign(_front.x) || 1 : 0, 0, alongX ? 0 : Math.sign(_front.z) || 1);
  const agreement = _front.dot(axis);
  if (agreement < 0.9) throw new Error(`${rarity} fish front cues disagree (${agreement.toFixed(3)})`);

  const aligned = new THREE.Group();
  aligned.name = "rarity-glb";
  aligned.quaternion.setFromUnitVectors(_front, _ahead);
  // Embermaw and Astravex keep the nose on −Z, but the pale belly is on +Y.
  // Compared with each unrigged sculpt (belly on the bottom, back on top), a half-turn
  // about forward (−Z) lays the belly on −Y. Nose and tail stay on the same axis.
  const bellyRoll = rarity === "epic" || rarity === "mythic";
  if (bellyRoll) aligned.rotateZ(Math.PI);
  _up.set(0, 1, 0).applyQuaternion(aligned.quaternion);
  const bellyDown = bellyRoll ? _up.y < -0.9 : _up.y > 0.9;
  if (!bellyDown) throw new Error(`${rarity} fish mount rolled upside down`);
  aligned.add(source);

  aligned.updateMatrixWorld(true);
  nose.getWorldPosition(_nose);
  const mounted = new THREE.Box3().setFromObject(aligned);
  const mid = mounted.getCenter(new THREE.Vector3());
  const span = mounted.max.z - _nose.z;
  if (!(span > 0.5)) throw new Error(`${rarity} fish length is not measurable`);
  const scale = BODY_LENGTH[rarity] / span;
  const midZ = (_nose.z + mounted.max.z) / 2;
  aligned.scale.setScalar(scale);
  aligned.position.set(-mid.x * scale, -mid.y * scale, -midZ * scale);
  aligned.userData.stroke = STROKE[rarity];
  markShared(aligned);
  return aligned;
}

function markShared(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.userData.sharedAsset = true;
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of list) {
      material.userData.sharedAsset = true;
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.metalness = 0;
      material.emissive.setRGB(0, 0, 0);
      material.emissiveIntensity = 0;
      material.envMapIntensity = 1;
      if ("sheen" in material) (material as { sheen: number }).sheen = 0;
    }
  });
}

function clipNamed(source: THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  const exact = THREE.AnimationClip.findByName(source, name);
  if (exact) return exact;
  return source.find((clip) => clip.name === name || clip.name.endsWith(`|${name}`) || clip.name.endsWith(`/${name}`));
}

/** Swim keeps every non-jaw track. Bite keeps only jaw tracks, so the two do not blend. */
function solo(clip: THREE.AnimationClip, keep: (trackName: string) => boolean): THREE.AnimationClip {
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter((track) => keep(track.name)));
}

export function bindRarityMotion(model: THREE.Object3D, sourceClips: THREE.AnimationClip[]): void {
  const swimSource = clipNamed(sourceClips, "Swim");
  const biteSource = clipNamed(sourceClips, "Bite");
  if (!swimSource || !biteSource) return;
  const swimClip = solo(swimSource, (track) => !track.includes("Jaw"));
  const biteClip = solo(biteSource, (track) => track.includes("Jaw"));
  if (swimClip.tracks.length === 0 || biteClip.tracks.length === 0) return;
  const mixer = new THREE.AnimationMixer(model);
  const swim = mixer.clipAction(swimClip);
  swim.play();
  swim.timeScale = 0;
  const bite = mixer.clipAction(biteClip);
  bite.setLoop(THREE.LoopOnce, 1);
  bite.clampWhenFinished = true;
  bite.play();
  bite.timeScale = 0;
  model.userData.motion = {
    mixer,
    swim,
    bite,
    tail: tailStrokes(model, mixer, swim, swimSource),
    fins: finStrokes(model, mixer, swim),
    eyes: eyeStrokes(model, mixer, swim),
    jaw: jawStroke(model, mixer, bite),
  } satisfies RarityMotion;
}

function averageQuaternion(samples: THREE.Quaternion[]): THREE.Quaternion {
  const acc = new THREE.Quaternion();
  const ref = samples[0] ?? acc;
  for (const sample of samples) {
    const flip = ref.dot(sample) < 0 ? -1 : 1;
    acc.x += sample.x * flip;
    acc.y += sample.y * flip;
    acc.z += sample.z * flip;
    acc.w += sample.w * flip;
  }
  if (acc.lengthSq() < 1e-8) return ref.clone();
  return acc.normalize();
}

/** Mean tail pose of this swim clip, sampled once per shared clip. */
function tailStrokes(
  model: THREE.Object3D,
  mixer: THREE.AnimationMixer,
  swim: THREE.AnimationAction,
  swimSource: THREE.AnimationClip,
): TailStroke[] {
  let cached = restCache.get(swimSource);
  if (!cached) {
    const pending = TAIL_WAVE.flatMap((entry, index) => {
      const bone = model.getObjectByName(entry.name);
      if (!bone || !(bone as THREE.Bone).isBone) return [];
      return [{ bone: bone as THREE.Bone, amp: entry.amp, lag: index * TAIL_LAG, samples: [] as THREE.Quaternion[] }];
    });
    const duration = swim.getClip().duration;
    for (let i = 0; i < TAIL_SAMPLES; i += 1) {
      swim.time = (i / TAIL_SAMPLES) * duration;
      mixer.update(0);
      for (const stroke of pending) stroke.samples.push(stroke.bone.quaternion.clone());
    }
    swim.time = 0;
    mixer.update(0);
    cached = pending.map((stroke) => ({
      name: stroke.bone.name,
      rest: averageQuaternion(stroke.samples),
      amp: stroke.amp,
      lag: stroke.lag,
    }));
    restCache.set(swimSource, cached);
  }
  const strokes: TailStroke[] = [];
  for (const entry of cached) {
    const bone = model.getObjectByName(entry.name);
    if (!bone || !(bone as THREE.Bone).isBone) continue;
    strokes.push({ bone: bone as THREE.Bone, rest: entry.rest, amp: entry.amp, lag: entry.lag });
  }
  return strokes;
}

/**
 * Positive yaw about fish up sends a tail point on +Z toward +X.
 * The sine spends equal time on each side, and each joint lags the one ahead of it.
 * Tail2 and Caudal add a smaller second harmonic so the tip accelerates through center.
 */
function settleTail(model: THREE.Object3D, motion: RarityMotion, phase: number, gain: number): void {
  model.updateWorldMatrix(true, false);
  for (const stroke of motion.tail) {
    const parent = stroke.bone.parent ?? model;
    parent.updateWorldMatrix(true, false);
    _up.set(0, 1, 0).transformDirection(model.matrixWorld);
    _inv.copy(parent.matrixWorld).invert();
    _axis.copy(_up).transformDirection(_inv);
    if (_axis.lengthSq() < 1e-8) _axis.set(0, 1, 0);
    else _axis.normalize();
    const along = phase - stroke.lag;
    const kick = stroke.bone.name === "Tail2" || stroke.bone.name === "Caudal" ? TAIL_KICK : 0;
    const wave = Math.sin(along) + kick * Math.sin(2 * along);
    _yaw.setFromAxisAngle(_axis, wave * stroke.amp * gain);
    stroke.bone.quaternion.copy(_yaw).multiply(stroke.rest);
  }
}

function finStrokes(model: THREE.Object3D, mixer: THREE.AnimationMixer, swim: THREE.AnimationAction): FinStroke[] {
  const pending: { bone: THREE.Bone; amp: number; lag: number; rate: number; samples: THREE.Quaternion[] }[] = [];
  for (const entry of FIN_WAVE) {
    const bone = model.getObjectByName(entry.name);
    if (!bone || !(bone as THREE.Bone).isBone) continue;
    pending.push({ bone: bone as THREE.Bone, amp: entry.amp, lag: entry.lag, rate: entry.rate, samples: [] });
  }
  const duration = swim.getClip().duration;
  for (let i = 0; i < TAIL_SAMPLES; i += 1) {
    swim.time = (i / TAIL_SAMPLES) * duration;
    mixer.update(0);
    for (const fin of pending) fin.samples.push(fin.bone.quaternion.clone());
  }
  swim.time = 0;
  mixer.update(0);
  return pending.map((fin) => ({
    bone: fin.bone,
    rest: averageQuaternion(fin.samples),
    amp: fin.amp,
    lag: fin.lag,
    rate: fin.rate,
  }));
}

/**
 * Parent-space flap about the fish's forward (−Z).
 * Forward (0,0,−1) × a tip at +X is (0,−1,0), so a right-side fin drops.
 * Forward × a tip at +Y is (−1,0,0), so a dorsal fin sways sideways.
 * Left and right share a phase; the cross product already mirrors them.
 */
/** Eyes glance with the same stroke as the head, plus a faster flick on the second harmonic. */
function eyeStrokes(model: THREE.Object3D, mixer: THREE.AnimationMixer, swim: THREE.AnimationAction): EyeStroke[] {
  const pending: { bone: THREE.Bone; side: number; samples: THREE.Quaternion[] }[] = [];
  for (const name of ["EyeL", "EyeR"] as const) {
    const bone = model.getObjectByName(name);
    if (!bone || !(bone as THREE.Bone).isBone) continue;
    pending.push({ bone: bone as THREE.Bone, side: name === "EyeL" ? 1 : -1, samples: [] });
  }
  const duration = swim.getClip().duration;
  for (let i = 0; i < TAIL_SAMPLES; i += 1) {
    swim.time = (i / TAIL_SAMPLES) * duration;
    mixer.update(0);
    for (const eye of pending) eye.samples.push(eye.bone.quaternion.clone());
  }
  swim.time = 0;
  mixer.update(0);
  return pending.map((eye) => ({ bone: eye.bone, rest: averageQuaternion(eye.samples), side: eye.side }));
}

/** Bite hinge, measured from the closed and open keys so the breath uses the same axis. */
function jawStroke(model: THREE.Object3D, mixer: THREE.AnimationMixer, bite: THREE.AnimationAction): JawStroke | null {
  const bone = model.getObjectByName("Jaw");
  if (!bone || !(bone as THREE.Bone).isBone) return null;
  const jaw = bone as THREE.Bone;
  bite.time = 0;
  mixer.update(0);
  const rest = jaw.quaternion.clone();
  bite.time = bite.getClip().duration;
  mixer.update(0);
  const open = jaw.quaternion.clone();
  bite.time = 0;
  mixer.update(0);
  _jawDelta.copy(open).multiply(rest.clone().invert());
  if (_jawDelta.w < 0) _jawDelta.set(-_jawDelta.x, -_jawDelta.y, -_jawDelta.z, -_jawDelta.w);
  const angle = 2 * Math.acos(THREE.MathUtils.clamp(_jawDelta.w, -1, 1));
  const scale = Math.sqrt(Math.max(0, 1 - _jawDelta.w * _jawDelta.w));
  const axis = scale < 1e-5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(_jawDelta.x / scale, _jawDelta.y / scale, _jawDelta.z / scale);
  return { bone: jaw, rest, axis, angle };
}

function settleEyes(model: THREE.Object3D, motion: RarityMotion, phase: number, gain: number): void {
  model.updateWorldMatrix(true, false);
  for (const eye of motion.eyes) {
    const parent = eye.bone.parent ?? model;
    parent.updateWorldMatrix(true, false);
    _inv.copy(parent.matrixWorld).invert();
    _up.set(0, 1, 0).transformDirection(model.matrixWorld);
    _axis.copy(_up).transformDirection(_inv);
    if (_axis.lengthSq() < 1e-8) continue;
    _axis.normalize();
    _finAxis.set(1, 0, 0).transformDirection(model.matrixWorld).transformDirection(_inv);
    if (_finAxis.lengthSq() < 1e-8) continue;
    _finAxis.normalize();
    const glance = Math.sin(phase) * 0.2 * gain + eye.side * Math.sin(phase * 2) * 0.045 * gain;
    const bob = Math.sin(phase + 0.7) * 0.08 * gain;
    _yaw.setFromAxisAngle(_axis, glance);
    _pitch.setFromAxisAngle(_finAxis, bob);
    eye.bone.quaternion.copy(_yaw).multiply(_pitch).multiply(eye.rest);
  }
}

/** Mouth pumps once per tail stroke, then the bite hinge opens over that breath. */
function settleMouth(motion: RarityMotion, phase: number, bite: number, gain: number): void {
  const jaw = motion.jaw;
  if (!jaw || jaw.angle < 0.05) return;
  const pump = Math.sin(phase) * 0.2 * gain * (1 - bite * 0.65);
  _flap.setFromAxisAngle(jaw.axis, jaw.angle * bite + pump);
  jaw.bone.quaternion.copy(_flap).multiply(jaw.rest);
}

function settleFins(model: THREE.Object3D, motion: RarityMotion, phase: number, gain: number): void {
  model.updateWorldMatrix(true, false);
  for (const fin of motion.fins) {
    const parent = fin.bone.parent ?? model;
    parent.updateWorldMatrix(true, false);
    _finAxis.set(0, 0, -1).transformDirection(model.matrixWorld);
    _inv.copy(parent.matrixWorld).invert();
    _finAxis.transformDirection(_inv);
    if (_finAxis.lengthSq() < 1e-8) continue;
    _finAxis.normalize();
    _flap.setFromAxisAngle(_finAxis, Math.sin(phase * fin.rate - fin.lag) * fin.amp * gain);
    fin.bone.quaternion.copy(_flap).multiply(fin.rest);
  }
}

/** Swim scrubs the body clip. Bite scrubs the jaw clip. Both clocks stay paused. */
export function poseRarityFish(root: THREE.Object3D, phase: number, bite: number, amplitude = 1): void {
  const model = root.getObjectByName("rarity-glb");
  const motion = model?.userData.motion as RarityMotion | undefined;
  if (!model || !motion) return;
  const turn = Number.isFinite(phase) ? phase : 0;
  const wrapped = ((turn % TAU) + TAU) % TAU;
  const open = Number.isFinite(bite) ? THREE.MathUtils.clamp(bite, 0, 1) : 0;
  const species = typeof model.userData.stroke === "number" ? model.userData.stroke : 1;
  const gain = (Number.isFinite(amplitude) ? THREE.MathUtils.clamp(amplitude, 0, 1.5) : 1) * species;
  motion.swim.time = (wrapped / TAU) * motion.swim.getClip().duration;
  motion.bite.time = open * motion.bite.getClip().duration;
  motion.mixer.update(0);
  settleTail(model, motion, wrapped, gain);
  settleFins(model, motion, wrapped, gain);
  settleEyes(model, motion, wrapped, gain);
  settleMouth(motion, wrapped, open, gain);
}

function loadRarityFish(rarity: Rarity): Promise<THREE.Group> {
  const ready = templates.get(rarity);
  if (ready) return Promise.resolve(ready);
  const pending = loading.get(rarity);
  if (pending) return pending;
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    new GLTFLoader().load(`/models/${rarity}.glb`, (gltf) => {
      try {
        const model = mountRarityFish(gltf.scene, rarity);
        templates.set(rarity, model);
        clips.set(rarity, gltf.animations);
        resolve(model);
      } catch (error) {
        loading.delete(rarity);
        reject(error);
      }
    }, undefined, (error) => {
      loading.delete(rarity);
      reject(error);
    });
  });
  loading.set(rarity, promise);
  return promise;
}

/** Start all six loads. A missing file stays quiet here; attaching a rig still warns. */
export function preloadRarityFish(): void {
  for (const rarity of RARITIES) {
    void loadRarityFish(rarity).catch(() => {});
  }
}

/** Swap the procedural body for this rarity's shared GLB. One template serves every fish of that rarity. */
export function attachRarityFish(rig: FishRig, rarity: Rarity, water?: { apply(root: THREE.Object3D): void }): void {
  if (rig.disposed || rig.visual.getObjectByName("rarity-glb")) return;
  for (const child of rig.visual.children) child.visible = false;
  void loadRarityFish(rarity).then((source) => {
    if (rig.disposed || rig.visual.getObjectByName("rarity-glb")) return;
    const model = cloneSkeleton(source);
    bindRarityMotion(model, clips.get(rarity) ?? []);
    rig.visual.add(model);
    water?.apply(model);
  }).catch((error) => {
    console.warn(`${rarity} fish GLB`, error);
    if (rig.disposed) return;
    for (const child of rig.visual.children) child.visible = true;
  });
}
