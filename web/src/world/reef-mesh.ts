import * as THREE from "three";
import { colors, indices, normals, positions } from "./reef-mesh.data";

/** Reef cluster. Base sits on local y = 0. Branches rise on +Y. */
export function createReefGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box || box.max.y < 0.4 || box.min.y > 0.02) {
    throw new Error("reef cluster does not sit on the sand");
  }
  return geo;
}
