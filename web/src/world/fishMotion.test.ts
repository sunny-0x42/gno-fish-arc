import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyRootPinnedFlex, finExcursion, rotateAroundAxis } from "./fishMotion";

describe("fish motion helpers", () => {
  it("rotates around an anchor without moving the root", () => {
    const point = rotateAroundAxis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), new THREE.Vector3(0, 1, 0), Math.PI / 2);
    expect(point.x).toBeCloseTo(1);
    expect(point.z).toBeCloseTo(0);
    expect(rotateAroundAxis(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.4).length()).toBe(0);
  });
  it("rebuilds from rest positions and caps excursions", () => {
    const position = new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1], 3);
    const rest = new Float32Array(position.array);
    applyRootPinnedFlex(position, { rest, anchor: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0), weights: new Float32Array([0, 1]), maxAngle: 0.2 }, 2);
    expect(position.getX(0)).toBe(0);
    expect(position.getX(1)).toBeCloseTo(Math.sin(0.2));
    const once = Array.from(position.array);
    applyRootPinnedFlex(position, { rest, anchor: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0), weights: new Float32Array([0, 1]), maxAngle: 0.2 }, 2);
    expect(Array.from(position.array)).toEqual(once);
    expect(finExcursion(2, 0.4)).toBeCloseTo(4 * Math.sin(0.2));
  });
});
