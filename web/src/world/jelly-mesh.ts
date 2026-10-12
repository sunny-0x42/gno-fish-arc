import * as THREE from "three";
import { colors, indices, normals, positions } from "./jelly-mesh.data";

/** Reef jellyfish. Bell crown is +Y and tentacles hang on −Y. Facing stays the instance yaw. */
export function createJellyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box || box.max.y < 0.2 || box.min.y > -0.6) {
    throw new Error("jellyfish tentacles do not hang");
  }
  return geo;
}
