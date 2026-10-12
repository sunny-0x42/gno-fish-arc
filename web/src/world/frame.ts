import * as THREE from "three";

/** World up. Fish local forward is -Z after `rotation.y`. */
export const UP = new THREE.Vector3(0, 1, 0);

/** `rotation.y` of an object whose nose is local -Z. yaw 0 looks toward -Z. */
export function forwardFromYaw(yaw: number, out: THREE.Vector3): THREE.Vector3 {
  return forwardFromAim(yaw, 0, out);
}

/**
 * Nose-up limit. Steeper than this and the horizontal heading collapses,
 * so the sector facing and the chase camera lose their right vector.
 */
export const PITCH_LIMIT = 1.2;

/**
 * Local -Z after yaw then pitch.
 * Yaw 0 pitch 0 is (0, 0, -1). Positive pitch raises that nose toward +Y.
 */
export function forwardFromAim(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  const level = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * level, Math.sin(pitch), -Math.cos(yaw) * level);
}

const _axisX = new THREE.Vector3(1, 0, 0);
const _yawQ = new THREE.Quaternion();
const _pitchQ = new THREE.Quaternion();

/** Same yaw-then-pitch frame as `forwardFromAim`. Pitch is local X, so the nose stays the parent's -Z. */
export function aimQuaternion(yaw: number, pitch: number, out: THREE.Quaternion): THREE.Quaternion {
  _yawQ.setFromAxisAngle(UP, yaw);
  _pitchQ.setFromAxisAngle(_axisX, pitch);
  return out.copy(_yawQ).multiply(_pitchQ);
}

/** Heading that points local -Z along the planar direction (x, z). */
export function yawFromDirection(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

export function dampAngle(current: number, target: number, maxStep: number): number {
  let delta = target - current;
  const turn = Math.PI * 2;
  while (delta > Math.PI) delta -= turn;
  while (delta < -Math.PI) delta += turn;
  if (delta > maxStep) delta = maxStep;
  if (delta < -maxStep) delta = -maxStep;
  return current + delta;
}

const _wishFwd = new THREE.Vector3();

/**
 * Heading-relative wish on the swim plane.
 * `forward` +1 is the nose. `strafe` +1 is right, from forward × up: (−fz, 0, fx).
 * Yaw 0, forward 1 is (0, 0, −1). Yaw 0, strafe 1 is (1, 0, 0).
 * A zero stick returns a zero vector. Do not pass `_wishFwd` as `out`.
 */
export function swimWish(yaw: number, forward: number, strafe: number, out: THREE.Vector3): THREE.Vector3 {
  forwardFromAim(yaw, 0, _wishFwd);
  const rx = -_wishFwd.z;
  const rz = _wishFwd.x;
  out.set(_wishFwd.x * forward + rx * strafe, 0, _wishFwd.z * forward + rz * strafe);
  const len = Math.hypot(out.x, out.z);
  if (len < 1e-6) return out.set(0, 0, 0);
  return out.multiplyScalar(1 / len);
}

export type SwimStep = {
  yaw: number;
  dx: number;
  dz: number;
  moving: boolean;
  /** World units per second along the nose. Negative backs up. */
  speed: number;
  /** Radians per second. Positive yaw turns left. */
  yawRate: number;
};

/** Carried glide. `stepSwim` does not keep this between calls. */
export type SwimGlide = { yaw: number; speed: number; yawRate: number };

/**
 * Seconds to ease. Accel is the surge into a press. Coast is the glide after release.
 * Yaw rate eases in, then the existing per-frame `turn` cap still limits it.
 */
const SWIM_ACCEL = 4.2;
const SWIM_COAST = 2.4;
const SWIM_YAW_ACCEL = 7;
const SWIM_TURN_CREEP = 0.8;
const SWIM_REVERSE = 1.45;
/** Below this the body counts as still, so the wag stops. */
const SWIM_STILL = 0.08;

const _swimNose = new THREE.Vector3();

function approach(current: number, target: number, rate: number, dt: number): number {
  if (!(dt > 0) || !(rate > 0)) return current;
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}

/**
 * One player step in the same frame as `forwardFromAim`.
 * The body translates on its nose, so a turn becomes an arc. It does not slide.
 * `forward` +1 swims ahead and −1 backs up. `strafe` +1 is right and yaws right
 * (negative yaw). A or D alone also builds speed, so the fish does not spin in place.
 * `turn` is the max radians this frame. Pace 0 and turn 0 drop the glide (X).
 * A zero stick coasts. Do not pass `_swimNose` into here.
 */
export function stepSwim(
  glide: SwimGlide,
  forward: number,
  strafe: number,
  turn: number,
  pace: number,
  dt: number,
): SwimStep {
  const yaw0 = glide.yaw;
  if (!(dt > 0)) {
    return { yaw: yaw0, dx: 0, dz: 0, moving: false, speed: glide.speed, yawRate: glide.yawRate };
  }
  const paceAbs = Math.max(0, pace);
  const turnAbs = Math.max(0, turn);
  if (paceAbs === 0 && turnAbs === 0) {
    return { yaw: yaw0, dx: 0, dz: 0, moving: false, speed: 0, yawRate: 0 };
  }

  const maxRate = turnAbs / dt;
  const steer = Math.max(-1, Math.min(1, strafe));
  const thrust = Math.max(-1, Math.min(1, forward));
  // strafe +1 is right. Positive yaw turns left, so the rate is the opposite sign.
  const prevRate = glide.yawRate;
  let yawRate = approach(prevRate, -steer * maxRate, SWIM_YAW_ACCEL, dt);
  if (yawRate > maxRate) yawRate = maxRate;
  if (yawRate < -maxRate) yawRate = -maxRate;
  const yaw = yaw0 + ((prevRate + yawRate) * 0.5) * dt;

  let target = thrust * paceAbs;
  if (Math.abs(thrust) < 1e-4 && Math.abs(steer) > 1e-4) target = SWIM_TURN_CREEP * paceAbs;
  const prevSpeed = glide.speed;
  let rate = SWIM_ACCEL;
  if (Math.abs(target) < 1e-4) rate = SWIM_COAST;
  else if (target * prevSpeed < 0) rate = SWIM_ACCEL * SWIM_REVERSE;
  const speed = approach(prevSpeed, target, rate, dt);
  const used = (prevSpeed + speed) * 0.5;

  forwardFromAim(yaw, 0, _swimNose);
  const dx = _swimNose.x * used * dt;
  const dz = _swimNose.z * used * dt;
  const moving = Math.abs(used) > SWIM_STILL;
  return { yaw, dx, dz, moving, speed, yawRate };
}

/** Shortest-angle blend. `alpha` 0 keeps `current`. `alpha` 1 matches `target`. */
export function blendAngle(current: number, target: number, alpha: number): number {
  const step = Math.max(0, Math.min(1, alpha));
  let delta = target - current;
  const turn = Math.PI * 2;
  while (delta > Math.PI) delta -= turn;
  while (delta < -Math.PI) delta += turn;
  return current + delta * step;
}

export type ChasePose = { x: number; y: number; z: number; yaw: number; pitch: number };

const _chaseFwd = new THREE.Vector3();
const _chaseRight = new THREE.Vector3();

/** Blend position and yaw by the same factor so the chase frame stays rigid. */
export function followPose(current: ChasePose, target: ChasePose, alpha: number, out: ChasePose): ChasePose {
  const step = Math.max(0, Math.min(1, alpha));
  out.x = current.x + (target.x - current.x) * step;
  out.y = current.y + (target.y - current.y) * step;
  out.z = current.z + (target.z - current.z) * step;
  out.yaw = blendAngle(current.yaw, target.yaw, step);
  out.pitch = blendAngle(current.pitch, target.pitch, step);
  return out;
}

/**
 * Place a chase camera from one pose.
 * Yaw 0 faces -Z, so the camera sits toward +Z and looks ahead along -Z.
 * Right is forward × up: yaw 0 → (1, 0, 0).
 */
export function placeChaseCamera(
  pose: ChasePose,
  dist: number,
  height: number,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
): void {
  forwardFromAim(pose.yaw, pose.pitch, _chaseFwd);
  _chaseRight.set(-_chaseFwd.z, 0, _chaseFwd.x);
  const span = Math.hypot(_chaseRight.x, _chaseRight.z);
  if (span > 1e-4) _chaseRight.multiplyScalar(1 / span);
  outPos.set(pose.x, pose.y, pose.z);
  outPos.addScaledVector(_chaseFwd, -dist * 0.82);
  outPos.addScaledVector(_chaseRight, dist * 0.42);
  outPos.y += height;
  outLook.set(pose.x, pose.y, pose.z);
  outLook.addScaledVector(_chaseFwd, 3.5);
}
