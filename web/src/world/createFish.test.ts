import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { RARITIES } from "../sim/catalog";
import { fishWave } from "./fishWave";
import { createFish, copyFishPose, disposeRig, fishVisualScale, poseFish, sizeFish } from "./createFish";

describe("fish meshes", () => {
  it("points the nose in front of the tail on local -Z", () => {
    for (const rarity of RARITIES) {
      const rig = createFish(rarity);
      const nose = rig.root.getObjectByName("nose");
      const tail = rig.root.getObjectByName("tailTip");
      expect(nose).toBeTruthy();
      expect(tail).toBeTruthy();
      expect(nose!.position.z).toBeLessThan(tail!.position.z);
      const pos = rig.body.geometry.getAttribute("position");
      const norm = rig.body.geometry.getAttribute("normal");
      let best = -Infinity;
      let ny = 0;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y > best) {
          best = y;
          ny = norm.getY(i);
        }
      }
      expect(ny).toBeGreaterThan(0);
      rig.root.rotation.y = 0;
      const worldNose = new THREE.Vector3();
      const worldTail = new THREE.Vector3();
      nose!.getWorldPosition(worldNose);
      tail!.getWorldPosition(worldTail);
      expect(worldNose.z).toBeLessThan(worldTail.z);
    }
  });

  it("puts the angler mass farther forward than the mackerel", () => {
    const fattestZ = (rarity: (typeof RARITIES)[number]) => {
      const rig = createFish(rarity);
      const pos = rig.body.geometry.getAttribute("position");
      let best = -1;
      let z = 0;
      for (let i = 0; i < pos.count; i++) {
        const radius = Math.hypot(pos.getX(i), pos.getY(i));
        if (radius > best) {
          best = radius;
          z = pos.getZ(i);
        }
      }
      return z;
    };
    expect(fattestZ("epic")).toBeLessThan(fattestZ("uncommon") - 0.2);
  });

  it("uses opaque restrained skin instead of plastic clearcoat or self illumination", () => {
    const rig = createFish("legendary");
    const mat = rig.body.material as THREE.MeshPhysicalMaterial;
    expect(mat.clearcoat).toBeLessThan(0.25);
    expect(mat.transmission).toBe(0);
    expect(mat.emissiveIntensity).toBe(0);
    expect(mat.roughness).toBeGreaterThan(0.3);
    expect(mat.userData.waveRate).toBeTruthy();
    disposeRig(rig);
  });
});


describe("anatomical topology", () => {
  it("has exactly one body boundary at the mouth and no open caudal cap", () => {
    for (const rarity of RARITIES) {
      const rig = createFish(rarity, { quality: "low", phaseOffset: 0 });
      const geometry = rig.body.geometry;
      const position = geometry.getAttribute("position"), index = geometry.index!;
      const point = (i: number) => [position.getX(i), position.getY(i), position.getZ(i)].map(value => Math.round(value * 1e5) / 1e5).join(",");
      const edges = new Map<string, { count: number; z: number }>();
      for (let i = 0; i < index.count; i += 3) {
        for (let j = 0; j < 3; j++) {
          const a = index.getX(i + j), b = index.getX(i + (j + 1) % 3);
          const key = [point(a), point(b)].sort().join("|");
          const edge = edges.get(key) ?? { count: 0, z: position.getZ(a) };
          edge.count++; edges.set(key, edge);
        }
      }
      const boundary = [...edges.values()].filter(edge => edge.count === 1);
      expect(boundary).toHaveLength(18);
      expect(boundary.every(edge => Math.abs(edge.z + geometry.userData.fishLength / 2) < 1e-5)).toBe(true);
      expect([...edges.values()].every(edge => edge.count <= 2)).toBe(true);
      const normal = geometry.getAttribute("normal");
      for (let ring = 0; ring <= 28; ring++) for (const axis of ["getX", "getY", "getZ"] as const)
        expect(normal[axis](ring * 19)).toBeCloseTo(normal[axis](ring * 19 + 18), 7);
      const cavity = rig.root.getObjectByName("mouth-cavity") as THREE.Mesh;
      expect(cavity.geometry.type).toBe("BufferGeometry");
      const cp = cavity.geometry.getAttribute("position");
      const depth = Math.max(...Array.from({ length: cp.count }, (_, i) => cp.getZ(i)))
        - Math.min(...Array.from({ length: cp.count }, (_, i) => cp.getZ(i)));
      expect(depth).toBeGreaterThan(0.3);
      expect(rig.tail.children).toHaveLength(1);
      expect(rig.root.getObjectByName("caudal-membrane")).toBeTruthy();
      disposeRig(rig);
    }
  });

  it("keeps the body and oral mouth rings joined through bites and wave phases", () => {
    for (const rarity of RARITIES) {
      const rig = createFish(rarity, { quality: "low", phaseOffset: 0 });
      const cavity = rig.visual.getObjectByName("mouth-cavity") as THREE.Mesh;
      const lowerLip = rig.visual.getObjectByName("lower-lip") as THREE.Mesh;
      const lowerJaw = rig.visual.getObjectByName("lower-jaw-skin") as THREE.Mesh;
      expect(lowerLip.parent).toBe(rig.visual);
      expect(lowerJaw.parent).toBe(rig.visual);
      expect(lowerLip.geometry.userData.biteHinge).toEqual(rig.body.geometry.userData.biteHinge);
      expect(lowerJaw.geometry.userData.biteHinge).toEqual(rig.body.geometry.userData.biteHinge);
      const sphere = cavity.geometry.boundingSphere!.clone();
      const length = rig.body.geometry.userData.fishLength as number;
      const strength = rig.body.geometry.userData.fishStrength as number;
      const deformed = (positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i);
        const wave = fishWave(point.z, length, strength, rig.motion.phase, rig.motion.amplitude * rig.gait.strength);
        point.x += wave.x; point.y += wave.y;
        return point;
      };
      for (const bite of [0, 0.5, 1, 0]) for (const phase of [0, 1.7, 4.2]) {
        rig.motion.bite = bite; rig.motion.phase = phase;
        rig.motion.amplitude = 1.07;
        poseFish(rig, 0, bite, 1, 0);
        const bp = rig.body.geometry.getAttribute("position");
        const cp = cavity.geometry.getAttribute("position");
        for (let i = 0; i <= 18; i++)
          expect(deformed(bp, i).distanceTo(deformed(cp, i)), `${rarity} bite ${bite}`).toBeLessThan(1e-6);
        for (let i = 0; i < cp.count; i++)
          expect(deformed(cp, i).distanceTo(sphere.center)).toBeLessThanOrEqual(sphere.radius + 1e-6);
        const normals = rig.body.geometry.getAttribute("normal");
        for (let ring = 0; ring <= 28; ring++) for (const axis of ["getX", "getY", "getZ"] as const)
          expect(normals[axis](ring * 19)).toBeCloseTo(normals[axis](ring * 19 + 18), 7);
      }
      expect((cavity.material as THREE.Material).userData.wavePhase).toBeTruthy();
      disposeRig(rig);
    }
  });

  it("has no fixed glint, and deforms the long fins and lines in shader space", () => {
    const rig = createFish("epic", { phaseOffset: 1 });
    let basicMaterials = 0;
    rig.root.traverse(object => {
      const material = (object as THREE.Mesh).material;
      if (material instanceof THREE.MeshBasicMaterial) basicMaterials++;
    });
    expect(basicMaterials).toBe(0);
    expect(rig.root.getObjectByName("cornea")).toBeTruthy();
    for (const name of ["dorsal", "lateral-line-1", "caudal-membrane", "pelvic-fin"]) {
      const mesh = rig.root.getObjectByName(name) as THREE.Mesh;
      expect((mesh.material as THREE.Material).userData.wavePhase).toBeTruthy();
      expect(mesh.position.length()).toBe(0);
    }
    const fast = createFish("uncommon");
    expect(rig.gait.rate).toBeLessThan(fast.gait.rate);
    expect(rig.gait.strength).toBeLessThan(fast.gait.strength);
    disposeRig(rig); disposeRig(fast);
  });
});

describe("semi-realistic fish rigs", () => {
  it("builds finite anatomy, relief textures and cached sized bounds for all six species", () => {
    for (const rarity of RARITIES) {
      const rig = createFish(rarity, { size: "large", phaseOffset: 0, quality: "low" });
      for (const name of ["eye-left", "eye-right", "mouth-cavity", "upper-lip", "lower-lip", "gill-slit-1", "operculum--1", "lateral-line-1"])
        expect(rig.root.getObjectByName(name), `${rarity}: ${name}`).toBeTruthy();
      rig.root.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.geometry) return;
        for (const key of ["position", "normal", "uv"]) {
          const attribute = mesh.geometry.getAttribute(key);
          expect(attribute).toBeTruthy();
          for (const value of attribute.array) expect(Number.isFinite(value)).toBe(true);
        }
        mesh.geometry.computeBoundingSphere();
        expect(mesh.geometry.boundingSphere!.radius).toBeGreaterThan(0);
      });
      const material = rig.body.material as THREE.MeshPhysicalMaterial;
      expect(material.map).toBeInstanceOf(THREE.DataTexture);
      expect(material.bumpMap).toBeTruthy();
      expect(material.roughnessMap).not.toBe(material.bumpMap);
      expect(material.bumpMap!.colorSpace).not.toBe(THREE.SRGBColorSpace);
      expect(material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(rig.bounds.radius).toBeGreaterThan(rig.bounds.length * 0.4);
      expect(rig.bounds.height).toBeGreaterThan(0);
      disposeRig(rig);
    }
  });

  it("keeps six species silhouettes and signature anatomy distinctive", () => {
    const angler = createFish("epic");
    const koi = createFish("legendary");
    const abyss = createFish("mythic");
    expect(angler.lure!.getObjectByName("lure-stalk")).toBeTruthy();
    expect(angler.root.getObjectByName("upper-tooth")).toBeTruthy();
    expect(koi.root.getObjectByName("barbel")).toBeTruthy();
    expect(abyss.root.getObjectByName("dorsal-armor")).toBeTruthy();
    for (const rig of [angler, koi, abyss]) disposeRig(rig);
  });

  it("scales bounds without resetting orientation or independent animation", () => {
    const rig = createFish("common", { size: "small", phaseOffset: 1.2 });
    poseFish(rig, 1, 0, 2, 1 / 60);
    rig.root.rotation.y = 0.7;
    const phase = rig.motion.phase;
    const radius = rig.bounds.radius;
    sizeFish(rig, "large");
    expect(fishVisualScale("small")).toBe(0.7);
    expect(fishVisualScale("medium")).toBe(1);
    expect(fishVisualScale("large")).toBe(1.4);
    expect(fishVisualScale("large") / fishVisualScale("small")).toBeCloseTo(2);
    expect(rig.bounds.radius / radius).toBeCloseTo(fishVisualScale("large") / fishVisualScale("small"));
    expect(rig.motion.phase).toBe(phase);
    expect(rig.root.rotation.y).toBe(0.7);
    expect(fishVisualScale(NaN)).toBe(1);
    disposeRig(rig);
  });

  it("accumulates phase smoothly over pace changes, clamps pauses, and supports legacy calls", () => {
    const rig = createFish("rare", { phaseOffset: 0 });
    poseFish(rig, 10, 0, 1);
    const initial = rig.motion.phase;
    poseFish(rig, 10.016, 1, 5);
    expect(rig.motion.phase - initial).toBeGreaterThan(0);
    expect(rig.motion.phase - initial).toBeLessThan(0.06);
    const before = rig.motion.phase;
    poseFish(rig, 1000, 0, 0, 0);
    expect(rig.motion.phase).toBe(before);
    poseFish(rig, 1001, 0, 0);
    expect(rig.motion.phase - before).toBeLessThan(0.4);
    expect(rig.jaw.rotation.x).toBeLessThan(0);
    for (let i = 0; i < 90; i++) poseFish(rig, i, 0, 1, 1 / 60, true);
    expect(rig.motion.amplitude).toBeCloseTo(0.2, 3);
    expect(Math.abs(rig.jaw.rotation.x)).toBeLessThan(0.001);
    disposeRig(rig);
  });

  it("uses inverse-transpose deformation normals and independent shader uniforms", () => {
    const a = createFish("legendary", { phaseOffset: 0 });
    const b = createFish("legendary", { phaseOffset: 2 });
    const materialA = a.body.material as THREE.MeshPhysicalMaterial;
    const materialB = b.body.material as THREE.MeshPhysicalMaterial;
    const shader = { uniforms: {}, vertexShader: `#include <common>
#include <beginnormal_vertex>
#include <begin_vertex>` } as unknown as THREE.WebGLProgramParametersWithUniforms;
    materialA.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain("objectNormal.z - dot(slope, objectNormal.xy)");
    expect(shader.vertexShader).toContain("objectTangent.xy + slope * objectTangent.z");
    expect(shader.vertexShader).toContain("transformed.xy += fishWave(position.z)");
    expect(materialA.userData.wavePhase).not.toBe(materialB.userData.wavePhase);
    poseFish(a, 1, 0, 2, 0.016);
    expect(materialB.userData.wavePhase.value).toBe(2);
    expect(materialA.map).not.toBe(materialB.map);
    expect(a.body.geometry).not.toBe(b.body.geometry);
    disposeRig(a); disposeRig(b);
  });

  it("copies phase, smoothing and bite across a rig swap without sharing state", () => {
    const from = createFish("common", { phaseOffset: 0.4 });
    const to = createFish("uncommon", { phaseOffset: 3, quality: "high" });
    poseFish(from, 10, 1, 3, 0.016);
    copyFishPose(from, to);
    expect(to.motion).toEqual(from.motion);
    expect(to.motion).not.toBe(from.motion);
    expect(to.motion.bite).toBe(from.motion.bite);
    expect(to.jaw.rotation.x).toBeCloseTo(from.jaw.rotation.x, 3); // species-specific surface tangent
    const toMaterial = to.body.material as THREE.MeshPhysicalMaterial;
    expect(toMaterial.userData.wavePhase.value).toBe(from.motion.phase);
    const saved = from.motion.phase;
    poseFish(to, 10.016, 0, 1, 0.016);
    expect(from.motion.phase).toBe(saved);
    expect(to.motion.phase).toBeGreaterThan(saved);
    disposeRig(from); disposeRig(to);
  });

  it("owns and disposes every geometry, material and aliased texture exactly once", () => {
    const rig = createFish("epic");
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    rig.root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) resources.add(mesh.geometry);
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const material of materials) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
      }
    });
    const spies = [...resources].map(resource => vi.spyOn(resource, "dispose"));
    disposeRig(rig); disposeRig(rig);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(rig.disposed).toBe(true);
  });

  it("low quality reduces body tessellation and maps while traits remain cosmetic", () => {
    const low = createFish("common", { quality: "low", trait: "fang" });
    const high = createFish("common", { quality: "high", trait: "hide" });
    expect(low.body.geometry.getAttribute("position").count).toBeLessThan(high.body.geometry.getAttribute("position").count);
    expect(low.root.getObjectByName("lower-tooth")).toBeTruthy();
    const lowMat = low.body.material as THREE.MeshPhysicalMaterial;
    const highMat = high.body.material as THREE.MeshPhysicalMaterial;
    expect(lowMat.map!.image.width).toBeLessThan(highMat.map!.image.width);
    expect(highMat.bumpScale).toBeGreaterThan(lowMat.bumpScale);
    expect(low.speciesScale).toBe(high.speciesScale);
    disposeRig(low); disposeRig(high);
  });
});


describe("species refinement", () => {
  it("uses species scale density, face masks, distinct fin rays and quality-independent relief", () => {
    const columns: number[] = [];
    for (const rarity of RARITIES) {
      const low = createFish(rarity, { quality: "low", trait: "hide" });
      const high = createFish(rarity, { quality: "high", trait: "hide" });
      const skin = low.body.material as THREE.MeshPhysicalMaterial;
      const highSkin = high.body.material as THREE.MeshPhysicalMaterial;
      const pattern = skin.map!.userData.pattern;
      columns.push(pattern.columns);
      expect(pattern.headMask).toEqual([0.29, 0.39]);
      expect(skin.bumpScale).toBe(highSkin.bumpScale);
      // Compare actual texels, not just descriptive metadata: head relief has no
      // repeating scale arcs, while scaled flanks gain broad relief contrast.
      const image = (skin.bumpMap as THREE.DataTexture).image;
      const spread = (u: number) => {
        const values = Array.from({ length: image.height }, (_, y) =>
          image.data[(y * image.width + Math.floor(u * image.width)) * 4]);
        return Math.max(...values) - Math.min(...values);
      };
      if (rarity !== "epic") expect(spread(0.55)).toBeGreaterThan(spread(0.15) + 15);
      const dorsal = low.root.getObjectByName("dorsal") as THREE.Mesh;
      const highDorsal = high.root.getObjectByName("dorsal") as THREE.Mesh;
      const fin = dorsal.material as THREE.MeshPhysicalMaterial;
      expect(fin.map!.userData.pattern).toEqual({ kind: "fin-rays", rootToTip: true });
      expect(fin.map).not.toBe(skin.map);
      expect(dorsal.geometry.getAttribute("position").count).toBeLessThan(highDorsal.geometry.getAttribute("position").count);
      expect(dorsal.geometry.userData.finProfile.edgeThickness).toBeLessThan(dorsal.geometry.userData.finProfile.rootThickness);
      if (rarity === "epic") expect(pattern.shape).toBe("grain");
      if (rarity === "mythic") expect(pattern.shape).toBe("plate");
      if (rarity === "legendary") expect(dorsal.geometry.userData.finProfile.outline).toBe("flowing");
      if (rarity === "uncommon") expect(low.root.getObjectByName("second-dorsal")).toBeTruthy();
      disposeRig(low); disposeRig(high);
    }
    expect(new Set(columns).size).toBe(6);
  });

  it("retains both curved tooth rows at low quality but no default minnow, mackerel or koi teeth", () => {
    for (const rarity of RARITIES) {
      const rig = createFish(rarity, { quality: "low" });
      const teeth: THREE.Mesh[] = [];
      rig.root.traverse(object => { if (["upper-tooth", "lower-tooth"].includes(object.name)) teeth.push(object as THREE.Mesh); });
      if (["common", "uncommon", "legendary"].includes(rarity)) expect(teeth).toHaveLength(0);
      else {
        expect(teeth.filter(tooth => tooth.name === "upper-tooth").length).toBe(teeth.length / 2);
        const lengths = new Set(teeth.map(tooth => {
          const p = tooth.geometry.getAttribute("position");
          return Math.round(Math.abs(p.getY(0) - p.getY(p.count - 1)) * 1e4);
        }));
        expect(lengths.size).toBeGreaterThan(1);
        for (const tooth of teeth) {
          expect(tooth.parent).toBe(rig.visual);
          expect(tooth.geometry.userData.biteHinge).toEqual(rig.body.geometry.userData.biteHinge);
          expect(tooth.geometry.userData.taper.tipRadius).toBeLessThan(tooth.geometry.userData.taper.rootRadius * 0.1);
        }
      }
      disposeRig(rig);
    }
  });

  it("deforms teeth and tapered mouth-root barbels with the oral weighting, without root drift", () => {
    const bitePoint = (point: THREE.Vector3, hinge: { center: number; nose: number; depth: number; length: number }, bite: number) => {
      const { center, nose, depth, length } = hinge;
      const y = point.y - center, z = point.z - nose, angle = -bite * 0.62;
      const weight = THREE.MathUtils.clamp(-y / Math.max(0.01, length * 0.03), 0, 1)
        * (1 - THREE.MathUtils.smoothstep(z, 0, depth));
      return new THREE.Vector3(point.x,
        THREE.MathUtils.lerp(y, y * Math.cos(angle) - (z - depth) * Math.sin(angle), weight) + center,
        THREE.MathUtils.lerp(z, y * Math.sin(angle) + (z - depth) * Math.cos(angle) + depth, weight) + nose);
    };
    for (const rarity of ["rare", "epic", "legendary", "mythic"] as const) {
      const rig = createFish(rarity, { quality: "low", phaseOffset: 0 });
      const oral = rig.visual.children.filter(object => ["upper-tooth", "lower-tooth", "barbel"].includes(object.name)) as THREE.Mesh[];
      if (rarity === "legendary") expect(oral).toHaveLength(4);
      for (const bite of [0, 0.5, 1, 0]) for (const phase of [0, 1.7, 4.2]) {
        rig.motion.bite = bite; rig.motion.phase = phase; rig.motion.amplitude = 1.07;
        poseFish(rig, 0, bite, 3, 0);
        rig.root.updateMatrixWorld(true);
        for (const mesh of oral) {
          const p = mesh.geometry.getAttribute("position");
          const rest = mesh.geometry.userData.restPositions as Float32Array;
          const uv = mesh.geometry.getAttribute("uv");
          const sphere = mesh.geometry.boundingSphere!;
          for (let i = 0; i < p.count; i++) {
            const expected = bitePoint(new THREE.Vector3(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]), mesh.geometry.userData.biteHinge, bite);
            if (!mesh.geometry.userData.barbel || uv.getX(i) === 0)
              expect(new THREE.Vector3().fromBufferAttribute(p, i).distanceTo(expected)).toBeLessThan(1e-6);
            const actual = new THREE.Vector3().fromBufferAttribute(p, i);
            const wave = fishWave(actual.z, rig.body.geometry.userData.fishLength, rig.body.geometry.userData.fishStrength, phase, 1.07 * rig.gait.strength);
            actual.x += wave.x; actual.y += wave.y;
            expect(actual.distanceTo(sphere.center)).toBeLessThanOrEqual(sphere.radius + 1e-6);
            const world = actual.applyMatrix4(mesh.matrixWorld);
            expect(world.length()).toBeLessThanOrEqual(rig.bounds.radius);
          }
        }
      }
      disposeRig(rig);
    }
  });
});
