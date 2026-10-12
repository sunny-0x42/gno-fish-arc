import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createFish, disposeRig } from "./createFish";
import { bindClownfishMotion, mountCommonClownfish, poseCommonClownfish } from "./commonGlb";

const GLB = new URL("../../public/models/commonfish.glb", import.meta.url);

function loadGlb(buffer: ArrayBuffer): Promise<{ model: THREE.Group; clips: THREE.AnimationClip[] }> {
  const scope = globalThis as { self?: unknown };
  scope.self ??= globalThis;
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(buffer, "", (gltf) => {
      const model = mountCommonClownfish(gltf.scene);
      bindClownfishMotion(model, gltf.animations);
      resolve({ model, clips: gltf.animations });
    }, reject);
  });
}

function fileBuffer(): ArrayBuffer {
  const file = readFileSync(GLB);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

function boneNamed(root: THREE.Object3D, name: string): THREE.Bone {
  let found: THREE.Bone | undefined;
  root.traverse((object) => {
    if (!found && object.name === name && (object as THREE.Bone).isBone) found = object as THREE.Bone;
  });
  if (!found) throw new Error(`missing bone ${name}`);
  return found;
}

describe("common clownfish GLB mount", () => {
  it("points the measured nose along -Z and keeps the eye beside the body", async () => {
    const { model } = await loadGlb(fileBuffer());
    model.updateMatrixWorld(true);
    const nose = new THREE.Vector3();
    const eye = new THREE.Vector3();
    model.getObjectByName("Nose")!.getWorldPosition(nose);
    model.getObjectByName("EyeNear")!.getWorldPosition(eye);
    expect(nose.z).toBeLessThan(-0.9);
    expect(Math.abs(nose.z)).toBeGreaterThan(Math.abs(nose.x));
    expect(eye.z).toBeGreaterThan(nose.z + 0.2);
    expect(Math.abs(eye.x)).toBeGreaterThan(0.08);
    expect(eye.y).toBeGreaterThan(nose.y);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    expect(Math.abs(center.x)).toBeLessThan(0.05);
    expect(Math.abs(center.z)).toBeLessThan(0.35);
  });

  it("wags the tail joint and drops the jaw on a bite", async () => {
    const { model } = await loadGlb(fileBuffer());
    const caudal = boneNamed(model, "Caudal");
    const jaw = boneNamed(model, "Jaw");
    const mouth = model.getObjectByName("Mouth")!;
    const upper = model.getObjectByName("UpperLip")!;
    const body = model.getObjectByName("Body") as THREE.SkinnedMesh;
    const tailTip = model.getObjectByName("Caudal_1") ?? caudal;
    const side = new THREE.Vector3();
    const poseAt = (phase: number, bite: number) => {
      poseCommonClownfish(model, phase, bite);
      model.updateMatrixWorld(true);
      tailTip.getWorldPosition(side);
      const lip = mouth.getWorldPosition(new THREE.Vector3());
      const gap = lip.distanceTo(upper.getWorldPosition(new THREE.Vector3()));
      return { tail: caudal.quaternion.clone(), jaw: jaw.quaternion.clone(), mouth: lip, gap, tip: side.clone() };
    };
    const left = poseAt(2.2 - Math.PI / 2, 0);
    const right = poseAt(2.2 + Math.PI / 2, 0);
    expect(left.tail.angleTo(right.tail)).toBeGreaterThan(0.5);
    expect(Math.abs(left.tip.x - right.tip.x)).toBeGreaterThan(0.12);
    const shut = poseAt(0, 0);
    const open = poseAt(0, 1);
    expect(open.jaw.angleTo(shut.jaw)).toBeGreaterThan(0.2);
    expect(open.gap).toBeGreaterThan(shut.gap + 0.02);
    const positions = body.geometry.getAttribute("position");
    let moved = 0;
    const sample = new THREE.Vector3();
    const bent = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 80) {
      poseAt(0, 0);
      body.skeleton.update();
      sample.fromBufferAttribute(positions, index);
      body.applyBoneTransform(index, sample);
      const rest = sample.clone();
      poseAt(2.2 + Math.PI / 2, 0);
      body.skeleton.update();
      bent.fromBufferAttribute(positions, index);
      body.applyBoneTransform(index, bent);
      moved = Math.max(moved, rest.distanceTo(bent));
    }
    expect(moved).toBeGreaterThan(0.02);
  });

  it("keeps the painted body opaque, dielectric, and free of a white sheen", async () => {
    const { model } = await loadGlb(fileBuffer());
    let body: THREE.Mesh | undefined;
    model.traverse((object) => {
      if (!body && object.name === "Body") body = object as THREE.Mesh;
    });
    const material = body!.material as THREE.MeshPhysicalMaterial;
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.metalness).toBe(0);
    expect(material.emissive.r + material.emissive.g + material.emissive.b).toBe(0);
    expect(material.sheen).toBe(0);
    expect(material.clearcoat).toBeLessThan(0.12);
  });

  it("leaves a disposed rig's shared GLB geometry alive for the next fish", () => {
    const rig = createFish("common", { quality: "low" });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geometry.userData.sharedAsset = true;
    const material = new THREE.MeshStandardMaterial();
    material.userData.sharedAsset = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "common-glb";
    rig.visual.add(mesh);
    disposeRig(rig);
    expect(geometry.getAttribute("position").count).toBe(1);
    geometry.dispose();
    material.dispose();
  });
});
