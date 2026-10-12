import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  squidColors,
  squidDuration,
  squidIndices,
  squidInverseBinds,
  squidJet,
  squidJoints,
  squidMeshNode,
  squidNodes,
  squidNormals,
  squidPositions,
  squidSkinIndex,
  squidSkinWeight,
  squidTracks,
} from "./squid-rig.data";

/**
 * Arms lead on local −Z. The Blender export measures that, and squidPose.yaw
 * is the only heading applied to the flock.
 */

const squidClip = new THREE.AnimationClip("SquidSwim", squidDuration, squidTracks.flatMap((track) => {
  // Mantle scale keys pulse the whole body. The swim is joint rotation only.
  if (track.path === "scale") return [];
  const name = squidNodes[track.node].name;
  const times = new Float32Array(track.times);
  const values = new Float32Array(track.values);
  if (track.path === "translation") return [new THREE.VectorKeyframeTrack(`${name}.position`, times, values)];
  if (track.path === "rotation") return [new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values)];
  return [];
}));

function squidGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(squidPositions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(squidNormals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(squidColors, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(squidSkinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(squidSkinWeight, 4));
  const count = squidPositions.length / 3;
  const Index = count > 65535 ? Uint32Array : Uint16Array;
  geometry.setIndex(new THREE.BufferAttribute(new Index(squidIndices), 1));
  if (squidJet.length === squidPositions.length) {
    geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(squidJet, 3)];
  }
  geometry.computeBoundingBox();
  return geometry;
}

function squidMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.36,
    metalness: 0.02,
    vertexColors: true,
  });
}

function createSquidTemplate(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const objects: THREE.Object3D[] = squidNodes.map((node, index) => {
    const object = index === squidMeshNode ? new THREE.SkinnedMesh(geometry, material) : new THREE.Bone();
    object.name = node.name;
    object.position.fromArray(node.t);
    object.quaternion.fromArray(node.r);
    object.scale.fromArray(node.s);
    object.frustumCulled = false;
    return object;
  });
  objects.forEach((object, index) => {
    const parent = squidNodes[index].parent;
    if (parent < 0) group.add(object);
    else objects[parent].add(object);
  });
  const mesh = objects[squidMeshNode] as THREE.SkinnedMesh;
  const bones = squidJoints.map((index) => objects[index] as THREE.Bone);
  const inverses = squidJoints.map((_, index) => new THREE.Matrix4().fromArray(squidInverseBinds, index * 16));
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  if (geometry.morphAttributes.position) {
    mesh.morphTargetInfluences = [0];
    mesh.morphTargetDictionary = { Jet: 0 };
  }
  const box = geometry.boundingBox;
  if (!box || box.min.z > -0.4) throw new Error("squid arms are not on local -Z");
  return group;
}

export function createSquidFlock(count: number): {
  flock: THREE.Group;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
} {
  const geometry = squidGeometry();
  const material = squidMaterial();
  const template = createSquidTemplate(geometry, material);
  const flock = new THREE.Group();
  flock.name = "squid";
  flock.frustumCulled = false;
  for (let i = 0; i < count; i++) {
    const model = cloneSkeleton(template) as THREE.Group;
    model.name = `squid-${i}`;
    model.frustumCulled = false;
    model.traverse((object) => {
      object.frustumCulled = false;
    });
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(squidClip).play();
    model.userData.mixer = mixer;
    flock.add(model);
  }
  return { flock, geometry, material };
}

/** Scrub the shared swim clip. Position and yaw stay with squidPose. */
export function syncSquidSwim(flock: THREE.Group, now: number): void {
  const duration = squidDuration;
  for (let i = 0; i < flock.children.length; i++) {
    const model = flock.children[i];
    const mixer = model.userData.mixer as THREE.AnimationMixer;
    const phase = now * 0.85 + (i * duration) / flock.children.length;
    const local = phase - duration * Math.floor(phase / duration);
    mixer.setTime(local);
    model.traverse((object) => {
      const skinned = object as THREE.SkinnedMesh;
      if (skinned.morphTargetInfluences) skinned.morphTargetInfluences[0] = 0;
    });
  }
}
