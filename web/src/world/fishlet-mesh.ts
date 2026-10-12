import * as THREE from "three";
import { colors, indices, normals, positions } from "./fishlet-mesh.data";

/** School fish. Head is local −Z, tail is local +Z. Measured from the Blender bake. */
export function createFishletGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box || box.min.z > -0.5 || box.max.z < 0.8) {
    throw new Error("school fish nose is not on local -Z");
  }
  return geo;
}
