import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { FishRig } from "./createFish";

/** Nose-to-tail length of the common procedural fish. The GLB is scaled to this. */
const TARGET_LENGTH = 2.15;

export const COMMON_GLB_URL = "/models/commonfish.glb";

const _nose = new THREE.Vector3();
const _front = new THREE.Vector3();
const _ahead = new THREE.Vector3(0, 0, -1);
const _up = new THREE.Vector3();

/**
 * Turn the loaded clownfish so its measured nose points along local −Z,
 * the same forward the sea already uses. The eye is not an input.
 * Uniform scale keeps the nose-to-tail span at 2.15 and centered on the origin.
 */
export function mountCommonClownfish(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true);
  const nose = source.getObjectByName("Nose");
  const eye = source.getObjectByName("EyeNear");
  if (!nose || !eye) throw new Error("common clownfish GLB is missing Nose or EyeNear");
  nose.getWorldPosition(_nose);
  const box = new THREE.Box3().setFromObject(source);
  const center = box.getCenter(new THREE.Vector3());
  _front.copy(_nose).sub(center);
  _front.y = 0;
  if (_front.lengthSq() < 1e-6) throw new Error("common clownfish nose has no forward offset");
  _front.normalize();

  const size = box.getSize(new THREE.Vector3());
  const alongX = size.x >= size.z;
  const axis = new THREE.Vector3(alongX ? Math.sign(_front.x) || 1 : 0, 0, alongX ? 0 : Math.sign(_front.z) || 1);
  const agreement = _front.dot(axis);
  if (agreement < 0.9) throw new Error(`common clownfish front cues disagree (${agreement.toFixed(3)})`);

  const aligned = new THREE.Group();
  aligned.name = "common-glb";
  aligned.quaternion.setFromUnitVectors(_front, _ahead);
  _up.set(0, 1, 0).applyQuaternion(aligned.quaternion);
  if (_up.y < 0.9) throw new Error("common clownfish mount rolled upside down");
  aligned.add(source);

  aligned.updateMatrixWorld(true);
  nose.getWorldPosition(_nose);
  const mounted = new THREE.Box3().setFromObject(aligned);
  const mid = mounted.getCenter(new THREE.Vector3());
  const span = mounted.max.z - _nose.z;
  if (!(span > 0.5)) throw new Error("common clownfish length is not measurable");
  const scale = TARGET_LENGTH / span;
  const midZ = (_nose.z + mounted.max.z) / 2;
  aligned.scale.setScalar(scale);
  aligned.position.set(-mid.x * scale, -mid.y * scale, -midZ * scale);
  markShared(aligned);
  return aligned;
}

function markShared(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.userData.sharedAsset = true;
    const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of list) material.userData.sharedAsset = true;
  });
}

let template: THREE.Group | null = null;
let loading: Promise<THREE.Group> | null = null;
let clips: THREE.AnimationClip[] = [];

const TAU = Math.PI * 2;

type ClownfishMotion = {
  mixer: THREE.AnimationMixer;
  swim: THREE.AnimationAction;
  idle: THREE.AnimationAction | null;
  bite: THREE.AnimationAction;
};

function clipNamed(source: THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  const exact = THREE.AnimationClip.findByName(source, name);
  if (exact) return exact;
  return source.find((clip) => clip.name === name || clip.name.endsWith(`|${name}`) || clip.name.endsWith(`/${name}`));
}

/** Keep the jaw out of the swim clip, and the spine out of the bite clip, so the two do not blend. */
function solo(clip: THREE.AnimationClip, keep: (trackName: string) => boolean): THREE.AnimationClip {
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter((track) => keep(track.name)));
}

/** Each sea fish gets its own mixer. Clips stay shared across clones. */
export function bindClownfishMotion(model: THREE.Object3D, sourceClips: THREE.AnimationClip[] = clips): void {
  const swimSource = clipNamed(sourceClips, "Swim");
  const biteSource = clipNamed(sourceClips, "Bite");
  const idleSource = clipNamed(sourceClips, "Idle");
  if (!swimSource || !biteSource) return;
  const swimClip = solo(swimSource, (track) => !track.includes("Jaw"));
  const biteClip = solo(biteSource, (track) => track.includes("Jaw"));
  const idleClip = idleSource ? solo(idleSource, (track) => !track.includes("Jaw")) : null;
  if (swimClip.tracks.length === 0 || biteClip.tracks.length === 0) return;
  const mixer = new THREE.AnimationMixer(model);
  const swim = mixer.clipAction(swimClip);
  swim.play();
  swim.timeScale = 0;
  const idle = idleClip && idleClip.tracks.length > 0 ? mixer.clipAction(idleClip) : null;
  if (idle) {
    idle.play();
    idle.timeScale = 0;
    idle.setEffectiveWeight(0);
  }
  const bite = mixer.clipAction(biteClip);
  bite.setLoop(THREE.LoopOnce, 1);
  bite.clampWhenFinished = true;
  bite.play();
  bite.timeScale = 0;
  model.userData.motion = { mixer, swim, idle, bite } satisfies ClownfishMotion;
}

/**
 * Swim is a looping spine-and-fin clip. Bite scrubs the jaw clip.
 * Both clocks are paused; the sea phase and the bite envelope set the frames.
 */
export function poseCommonClownfish(root: THREE.Object3D, phase: number, bite: number, amplitude = 1): void {
  const model = root.getObjectByName("common-glb");
  const motion = model?.userData.motion as ClownfishMotion | undefined;
  if (!motion) return;
  const turn = Number.isFinite(phase) ? phase : 0;
  const wrapped = ((turn % TAU) + TAU) % TAU;
  const open = Number.isFinite(bite) ? THREE.MathUtils.clamp(bite, 0, 1) : 0;
  const pace = Number.isFinite(amplitude) ? THREE.MathUtils.clamp(amplitude, 0, 1) : 1;
  motion.swim.setEffectiveWeight(pace);
  motion.swim.time = (wrapped / TAU) * motion.swim.getClip().duration;
  if (motion.idle) {
    motion.idle.setEffectiveWeight(1 - pace);
    motion.idle.time = (wrapped / TAU) * motion.idle.getClip().duration;
  }
  motion.bite.time = open * motion.bite.getClip().duration;
  motion.mixer.update(0);
}

export function loadCommonClownfish(url = COMMON_GLB_URL): Promise<THREE.Group> {
  if (template) return Promise.resolve(template);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => {
        try {
          template = mountCommonClownfish(gltf.scene);
          clips = gltf.animations;
          resolve(template);
        } catch (error) {
          loading = null;
          reject(error);
        }
      }, undefined, (error) => {
        loading = null;
        reject(error);
      });
    });
  }
  return loading;
}

/** Swap the procedural common body for the shared GLB. Other species stay procedural. */
export function attachCommonClownfish(rig: FishRig, water?: { apply(root: THREE.Object3D): void }): void {
  if (rig.disposed || rig.visual.getObjectByName("common-glb")) return;
  for (const child of rig.visual.children) child.visible = false;
  void loadCommonClownfish().then((source) => {
    if (rig.disposed || rig.visual.getObjectByName("common-glb")) return;
    const model = cloneSkeleton(source);
    bindClownfishMotion(model);
    rig.visual.add(model);
    water?.apply(model);
  }).catch((error) => {
    console.warn("common clownfish GLB", error);
    if (rig.disposed) return;
    for (const child of rig.visual.children) child.visible = true;
  });
}
