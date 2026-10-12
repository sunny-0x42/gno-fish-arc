import * as THREE from "three";
import { colors, indices, normals, positions } from "./turtle-mesh.data";

/** Sea turtle. Head is local -Z. Flippers extend past |x| = 0.55. Shell stays under y = 0.55. */
export function createTurtleGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box || box.min.z > -0.4 || box.max.x < 0.55) {
    throw new Error("sea turtle nose or flippers are out of range");
  }
  return geo;
}
