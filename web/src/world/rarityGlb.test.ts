import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Rarity } from "../sim/catalog";
import { bindRarityMotion, mountRarityFish, poseRarityFish } from "./rarityGlb";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

function loadGlb(rarity: Rarity): Promise<{ model: THREE.Group; clips: THREE.AnimationClip[] }> {
  const scope = globalThis as { self?: unknown };
  scope.self ??= globalThis;
  const file = readFileSync(new URL(`../../public/models/${rarity}.glb`, import.meta.url));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buffer, "", (gltf) => {
      resolve({ model: gltf.scene, clips: gltf.animations });
    }, reject);
  });
}

function boneNamed(root: THREE.Object3D, name: string): THREE.Bone {
  let found: THREE.Bone | undefined;
  root.traverse((object) => {
    if (!found && object.name === name && (object as THREE.Bone).isBone) found = object as THREE.Bone;
  });
  if (!found) throw new Error(`missing bone ${name}`);
  return found;
}

describe("rarity fish GLBs", () => {
  it.each(RARITIES)("%s points its nose along -Z, wags, and opens its jaw", async (rarity) => {
    const { model, clips } = await loadGlb(rarity);
    const mounted = mountRarityFish(model, rarity);
    bindRarityMotion(mounted, clips);
    const root = new THREE.Group();
    root.add(mounted);
    mounted.updateMatrixWorld(true);
    const nose = new THREE.Vector3();
    const eye = new THREE.Vector3();
    mounted.getObjectByName("Nose")!.getWorldPosition(nose);
    mounted.getObjectByName("EyeNear")!.getWorldPosition(eye);
    expect(nose.z).toBeLessThan(-0.7);
    expect(Math.abs(nose.z)).toBeGreaterThan(Math.abs(nose.x));
    const mountUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mounted.quaternion);
    // Epic and mythic are rolled a half-turn about −Z so the belly matches the sculpt.
    if (rarity === "epic" || rarity === "mythic") expect(mountUp.y).toBeLessThan(-0.9);
    else expect(mountUp.y).toBeGreaterThan(0.9);
    expect(eye.z).toBeGreaterThan(nose.z + 0.15);
    expect(Math.abs(eye.x)).toBeGreaterThan(0.05);
    const caudal = boneNamed(mounted, "Caudal");
    const jaw = boneNamed(mounted, "Jaw");
    const pose = (phase: number, bite: number) => {
      poseRarityFish(root, phase, bite);
      return { tail: caudal.quaternion.clone(), jaw: jaw.quaternion.clone() };
    };
    const left = pose(0, 0);
    const right = pose(Math.PI / 2, 0);
    expect(left.tail.angleTo(right.tail)).toBeGreaterThan(0.08);
    const shut = pose(0, 0);
    const open = pose(0, 1);
    expect(open.jaw.angleTo(shut.jaw)).toBeGreaterThan(0.12);

    const spine = boneNamed(mounted, "Spine2");
    poseRarityFish(root, 0, 0);
    const spineA = spine.quaternion.clone();
    poseRarityFish(root, Math.PI / 2, 0);
    expect(spine.quaternion.angleTo(spineA)).toBeGreaterThan(0.12);
    const pectoral = boneNamed(mounted, "PectoralL");
    const lead = (Math.PI / 2 + 0.35) / 2;
    poseRarityFish(root, lead, 0);
    const finA = pectoral.quaternion.clone();
    poseRarityFish(root, lead + Math.PI / 2, 0);
    expect(pectoral.quaternion.angleTo(finA)).toBeGreaterThan(0.45);

    const headBone = boneNamed(mounted, "Head");
    const headAt = new THREE.Vector3();
    const tailAt = new THREE.Vector3();
    poseRarityFish(root, Math.PI / 2, 0);
    mounted.updateMatrixWorld(true);
    headBone.getWorldPosition(headAt);
    caudal.getWorldPosition(tailAt);
    mounted.worldToLocal(headAt);
    mounted.worldToLocal(tailAt);
    // Head and Caudal are not the empties the mount was built from.
    expect(headAt.z).toBeLessThan(tailAt.z - 0.5);

    const spot = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const xs: number[] = [];
    const ys: number[] = [];
    const steps = 24;
    for (let i = 0; i < steps; i += 1) {
      poseRarityFish(root, (i / steps) * Math.PI * 2, 0);
      mounted.updateMatrixWorld(true);
      const parent = caudal.parent ?? mounted;
      parent.getWorldPosition(ahead);
      caudal.getWorldPosition(spot);
      spot.sub(ahead);
      const reach = Math.max(spot.length(), 0.05);
      caudal.getWorldPosition(ahead);
      spot.normalize().multiplyScalar(reach);
      ahead.add(spot);
      mounted.worldToLocal(ahead);
      xs.push(ahead.x);
      ys.push(ahead.y);
    }
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const spanX = maxX - minX;
    const spanY = Math.max(...ys) - Math.min(...ys);
    const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    expect(spanX).toBeGreaterThan(0.12);
    expect(Math.abs(meanX - (minX + maxX) / 2)).toBeLessThan(spanX * 0.18);
    expect(spanY).toBeLessThan(spanX * 0.45);
    poseRarityFish(root, Math.PI / 2, 0);
    mounted.updateMatrixWorld(true);
    mounted.getObjectByName("Nose")!.getWorldPosition(nose);
    expect(nose.z).toBeLessThan(-0.7);

    const eyeBone = boneNamed(mounted, "EyeL");
    poseRarityFish(root, 0, 0);
    const eyeShut = eyeBone.quaternion.clone();
    const jawRest = jaw.quaternion.clone();
    poseRarityFish(root, Math.PI / 2, 0);
    expect(eyeBone.quaternion.angleTo(eyeShut)).toBeGreaterThan(0.08);
    expect(jaw.quaternion.angleTo(jawRest)).toBeGreaterThan(0.08);
    mounted.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of list) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        expect(material.metalness).toBe(0);
        expect(material.emissive.r + material.emissive.g + material.emissive.b).toBe(0);
        if ("sheen" in material) expect((material as { sheen: number }).sheen).toBe(0);
      }
    });
  });
});
