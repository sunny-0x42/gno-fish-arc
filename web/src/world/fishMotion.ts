import * as THREE from "three";

export type FinFlex = {
  rest: Float32Array;
  anchor: THREE.Vector3;
  axis: THREE.Vector3;
  weights: Float32Array;
  maxAngle: number;
};

/** Rodrigues rotation for a point around a fixed local anchor. */
export function rotateAroundAxis(point: THREE.Vector3, anchor: THREE.Vector3, axis: THREE.Vector3, angle: number, out = new THREE.Vector3()): THREE.Vector3 {
  const x = point.x - anchor.x, y = point.y - anchor.y, z = point.z - anchor.z;
  const c = Math.cos(angle), s = Math.sin(angle);
  const kx = axis.x, ky = axis.y, kz = axis.z;
  const dot = kx * x + ky * y + kz * z;
  const crossX = ky * z - kz * y, crossY = kz * x - kx * z, crossZ = kx * y - ky * x;
  out.set(
    anchor.x + x * c + crossX * s + kx * dot * (1 - c),
    anchor.y + y * c + crossY * s + ky * dot * (1 - c),
    anchor.z + z * c + crossZ * s + kz * dot * (1 - c),
  );
  return out;
}

/** Rebuild a fin from immutable rest positions; roots have zero weight. */
export function applyRootPinnedFlex(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, flex: FinFlex, angle: number): void {
  const bounded = THREE.MathUtils.clamp(angle, -flex.maxAngle, flex.maxAngle);
  const point = new THREE.Vector3();
  const rotated = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromArray(flex.rest, i * 3);
    rotateAroundAxis(point, flex.anchor, flex.axis, bounded * flex.weights[i], rotated);
    position.setXYZ(i, rotated.x, rotated.y, rotated.z);
  }
  position.needsUpdate = true;
}

export function finExcursion(distance: number, maxAngle: number): number {
  return 2 * Math.max(0, distance) * Math.sin(Math.abs(maxAngle) / 2);
}
