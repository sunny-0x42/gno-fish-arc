import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { ROCKS, SHELTERS } from "../sim/cover";
import { daylightAt } from "./daylight";
import { SUN_POSITION, WATER_LEVEL, WaterLighting } from "./water";
import { addScenery, floorY, crabPose, jellyPose, rayPose, seahorsePose, squidPose, turtlePose } from "./scenery";

function expectFacesTravel(
  mesh: THREE.InstancedMesh,
  pose: (index: number, now: number) => { x: number; z: number },
  index: number,
  now: number,
): void {
  const a = pose(index, now);
  const b = pose(index, now + 0.05);
  const vx = (b.x - a.x) / 0.05;
  const vz = (b.z - a.z) / 0.05;
  const len = Math.hypot(vx, vz);
  expect(len).toBeGreaterThan(0.02);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const nose = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
  expect((nose.x * vx + nose.z * vz) / len).toBeGreaterThan(0.9);
  expect(matrix.elements[12]).toBeCloseTo(a.x, 3);
  expect(matrix.elements[14]).toBeCloseTo(a.z, 3);
}

describe("sea scenery", () => {
  it("matches rendered bed triangles rather than floating analytical dunes", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene, "high");
    scene.updateMatrixWorld(true);
    const bed = scene.getObjectByName("bed") as THREE.Mesh;
    const caster = new THREE.Raycaster();
    for (let i = 0; i < 80; i++) {
      const a = i * 2.399;
      const r = 3 + i * 3;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      caster.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
      const hits = caster.intersectObject(bed);
      expect(hits.length).toBeGreaterThan(0);
      expect(floorY(x, z)).toBeCloseTo(hits[0].point.y, 4);
    }
    scenery.dispose();
  });

  it("samples bed triangles for planted roots and keeps every shelter decorated on low", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene, "low");
    const kelp = scene.getObjectByName("kelp") as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (const shelter of SHELTERS) {
      let count = 0;
      for (let i = 0; i < kelp.count; i++) {
        kelp.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        expect(position.y).toBeCloseTo(floorY(position.x, position.z), 1);
        if (Math.abs(Math.hypot(position.x - shelter.x, position.z - shelter.z) - shelter.radius - 2.4) < 0.02) count++;
      }
      expect(count).toBeGreaterThanOrEqual(2);
    }
    scenery.dispose();
  });

  it("grounds cover in buried supports without filling pockets or adding duplicate lights", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene);
    const lights: THREE.Object3D[] = [];
    scene.traverse((obj) => { if (obj instanceof THREE.Light) lights.push(obj); });
    expect(lights).toHaveLength(0);
    for (const shelter of SHELTERS) {
      const foundation = scene.getObjectByName(`foundation-${shelter.id}`)!;
      expect(foundation.parent?.name).toBe(`cover-${shelter.id}`);
      for (const child of foundation.children) {
        const mesh = child as THREE.Mesh;
        expect(Math.hypot(mesh.position.x, mesh.position.z)).toBeCloseTo(shelter.inner);
        mesh.geometry.computeBoundingBox();
        expect(mesh.geometry.boundingBox!.min.y).toBeLessThan(-4);
        expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(0.48);
        expect(mesh.geometry.boundingBox!.max.x).toBeLessThan(1.2);
      }
    }
    for (const rock of ROCKS) {
      const mesh = scene.getObjectByName(`foundation-${rock.id}`) as THREE.Mesh;
      expect(mesh.position.x).toBe(rock.x);
      expect(mesh.position.z).toBe(rock.z);
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox!.min.y).toBeLessThan(-4);
      expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(0.2);
    }
    scenery.dispose();
  });

  it("does not animate hidden preset instances and reveals them at the current visual phase", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene, "high");
    scenery.update(1);
    const mesh = scene.getObjectByName("school") as THREE.InstancedMesh;
    const index = mesh.count - 1;
    const before = new THREE.Matrix4();
    const after = new THREE.Matrix4();
    mesh.getMatrixAt(index, before);
    const spy = vi.spyOn(mesh, "setMatrixAt");
    scenery.setQuality("low");
    spy.mockClear();
    scenery.update(4);
    expect(spy).toHaveBeenCalledTimes(mesh.count);
    mesh.getMatrixAt(index, after);
    expect(after.elements).toEqual(before.elements);
    scenery.setQuality("high");
    mesh.getMatrixAt(index, after);
    expect(after.elements).not.toEqual(before.elements);
    scenery.dispose();
  });

  it("composes sand transition after water attenuation and shares one surface level", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene, "low");
    const water = new WaterLighting();
    water.apply(scene);
    const material = (scene.getObjectByName("bed") as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {},
      vertexShader: `#include <common>
#include <begin_vertex>
#include <project_vertex>`,
      fragmentShader: `#include <common>
#include <color_fragment>
#include <normal_fragment_maps>
#include <opaque_fragment>`,
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader.indexOf("shoalTransmission")).toBeLessThan(shader.fragmentShader.indexOf("float bedEdge"));
    expect(shader.uniforms.uSceneryDetail.value).toBe(0);
    scenery.setQuality("high");
    expect(shader.uniforms.uSceneryDetail.value).toBe(1);
    expect(scene.getObjectByName("surface")!.position.y).toBe(WATER_LEVEL);
    expect(scene.getObjectByName("surfaceUnder")!.position.y).toBe(WATER_LEVEL);
    scenery.dispose();
  });

  it("pairs deformation with analytical normals and uses surface Fresnel on both sides", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene);
    for (const name of ["kelp", "jellies", "rays", "turtles"]) {
      const material = (scene.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>",
        fragmentShader: "",
      } as Parameters<typeof material.onBeforeCompile>[0];
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.vertexShader).toContain("objectNormal");
      expect(shader.vertexShader).toContain("objectNormal = normalize(objectNormal)");
      expect(shader.vertexShader).toContain("transformed");
    }
    const material = (scene.getObjectByName("surface") as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(material.fragmentShader).toContain("uniform float uTime;");
    expect(material.fragmentShader).toContain("1.333");
    expect(material.fragmentShader).toContain("aboveWater");
    expect(material.fragmentShader).toContain("uSunDir");
    expect(material.uniforms.uSunDir.value.x).toBe(SUN_POSITION.x);
    expect(material.uniforms.uSunDir.value.y).toBe(SUN_POSITION.y);
    expect(material.uniforms.uSunDir.value.z).toBe(SUN_POSITION.z);
    scenery.dispose();
  });

  it("plants shells on the bed and shares one current with the day", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene, "high");
    const shells = scene.getObjectByName("shells") as THREE.InstancedMesh;
    expect(shells).toBeTruthy();
    expect(shells.count).toBeGreaterThan(10);
    const matrix = new THREE.Matrix4();
    shells.getMatrixAt(0, matrix);
    const planted = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(planted.y).toBeCloseTo(floorY(planted.x, planted.z) + 0.05, 4);
    const surface = scene.getObjectByName("surface") as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect(surface.material.uniforms.uFlow.value.length()).toBeGreaterThan(0.9);
    expect(surface.material.fragmentShader).toContain("uFlow");
    const column = scene.getObjectByName("column") as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect(column.material.uniforms.uColumnFar).toBe(surface.material.uniforms.uColumnFar);
    const kelp = scene.getObjectByName("kelp") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const kelpShader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>",
      fragmentShader: "",
    } as Parameters<typeof kelp.material.onBeforeCompile>[0];
    kelp.material.onBeforeCompile(kelpShader, {} as THREE.WebGLRenderer);
    expect(kelpShader.vertexShader).toContain("uFlow");
    expect(kelpShader.uniforms.uFlow).toBe(surface.material.uniforms.uFlow);
    const bed = scene.getObjectByName("bed") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const sandShader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <color_fragment>\n#include <normal_fragment_maps>\n#include <opaque_fragment>",
    } as Parameters<typeof bed.material.onBeforeCompile>[0];
    bed.material.onBeforeCompile(sandShader, {} as THREE.WebGLRenderer);
    expect(sandShader.fragmentShader).not.toContain("float caustic =");
    expect(sandShader.uniforms.uColumnNear).toBe(column.material.uniforms.uColumnNear);
    expect(sandShader.uniforms.uFlow).toBe(surface.material.uniforms.uFlow);
    const noonNear = (column.material.uniforms.uColumnNear.value as THREE.Color).r;
    scenery.setDaylight(daylightAt(0));
    expect(surface.material.uniforms.uSunDir.value.y).toBeLessThan(0);
    expect((column.material.uniforms.uColumnNear.value as THREE.Color).r).toBeLessThan(noonNear);
    expect(scene.fog).toBeNull();
    expect(scene.getObjectByName("marine-particles")).toBeUndefined();
    scenery.dispose();
  });

  it("keeps upgraded decorative anatomy and all scenery attributes finite", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene);
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      for (const name of ["position", "normal"]) {
        const attr = obj.geometry.getAttribute(name);
        if (attr) expect(Array.from(attr.array).every(Number.isFinite), `${obj.name}:${name}`).toBe(true);
      }
    });
    const ray = scene.getObjectByName("rays") as THREE.InstancedMesh;
    const bounds = ray.geometry.boundingBox!;
    expect(bounds.min.z).toBeLessThan(-0.6); // Head remains local -Z.
    expect(bounds.max.z).toBeGreaterThan(1.8); // Long tapered whip tail.
    expect(bounds.max.x).toBeGreaterThan(1.2);
    expect(bounds.max.y - bounds.min.y).toBeLessThan(0.3); // Flattened pectoral disc, not an ellipsoid.
    const squid = scene.getObjectByName("squid")!;
    let squidSkin: THREE.SkinnedMesh | undefined;
    squid.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) squidSkin = obj;
    });
    expect(squidSkin!.geometry.boundingBox!.min.z).toBeLessThan(-0.4); // Arms lead on local -Z.
    scenery.dispose();
  });

  it("changes decorative budgets live without rebuilding or moving cover/layout", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene, "high");
    scenery.update(4);
    const root = scene.getObjectByName("sea-root");
    const kelp = scene.getObjectByName("kelp") as THREE.InstancedMesh;
    const full = kelp.count;
    const matrices = Array.from(kelp.instanceMatrix.array);
    const geometry = kelp.geometry;
    const material = kelp.material;
    expect(scene.getObjectByName("marine-particles")).toBeUndefined();
    const cover = scene.getObjectByName(`cover-${SHELTERS[0].id}`)!;
    const rubble = scene.getObjectByName(`rubble-${SHELTERS[0].id}`)!;
    rubble.visible = true; // Gameplay controls this, not the visual preset.
    const coverPosition = cover.position.clone();
    scenery.setQuality("low");
    expect(kelp.count).toBeLessThan(full);

    scenery.setQuality("balanced");

    scenery.setQuality("high");
    expect(kelp.count).toBe(full);
    expect(kelp.geometry).toBe(geometry);
    expect(kelp.material).toBe(material);
    expect(Array.from(kelp.instanceMatrix.array)).toEqual(matrices);


    expect(scene.getObjectByName("sea-root")).toBe(root);
    expect(cover.position).toEqual(coverPosition);
    expect(rubble.visible).toBe(true);
    expect(scene.fog).toBeNull();
    scenery.dispose();
    scenery.setQuality("low"); // Safe after teardown.
    expect(scene.getObjectByName("sea-root")).toBeUndefined();
  });

  it("keeps seeded full layouts identical regardless of the initial preset", () => {
    const lowScene = new THREE.Scene();
    const highScene = new THREE.Scene();
    const low = addScenery(lowScene, "low");
    const high = addScenery(highScene, "high");
    low.update(7);
    high.update(7);
    low.setQuality("high");
    lowScene.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      const counterpart = highScene.getObjectByName(object.name) as THREE.InstancedMesh;
      expect(object.count).toBe(counterpart.count);
      expect(Array.from(object.instanceMatrix.array)).toEqual(Array.from(counterpart.instanceMatrix.array));
    });
    low.dispose();
    high.dispose();
  });

  it("shares visual time with sand and disposes each owned resource once", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene);
    const bed = scene.getObjectByName("bed") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <color_fragment>\n#include <normal_fragment_maps>\n#include <opaque_fragment>",
    } as Parameters<typeof bed.material.onBeforeCompile>[0];
    bed.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain("normal = seaReliefNormal");
    expect(shader.fragmentShader).not.toContain("gl_FragColor.rgb = mix");
    expect(shader.fragmentShader).not.toContain("float caustic =");
    expect(shader.fragmentShader).toContain("shoal-column-transition");
    expect(shader.fragmentShader).toContain("if (uSceneryDetail > 0.5)");
    scenery.update(5);
    expect(shader.uniforms.uTime.value).toBe(5);
    scenery.update(5); // Reduced-motion callers freeze the same visual clock.
    expect(shader.uniforms.uTime.value).toBe(5);
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh>();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        resources.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) resources.add(mat);
      }
      if (object instanceof THREE.InstancedMesh) resources.add(object);
    });
    const spies = [...resources].map((resource) => vi.spyOn(resource, "dispose"));
    scenery.dispose();
    scenery.dispose();
    scenery.update(9);
    expect(shader.uniforms.uTime.value).toBe(5);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it("builds reefs, caves, and rocks from the cover list", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene);
    scene.updateMatrixWorld(true);
    for (const shelter of SHELTERS) {
      const group = scene.getObjectByName(`cover-${shelter.id}`);
      expect(group).toBeTruthy();
      expect(group!.position.x).toBeCloseTo(shelter.x);
      expect(group!.position.z).toBeCloseTo(shelter.z);
      const post = group!.children[0] as THREE.Object3D;
      const world = post.getWorldPosition(new THREE.Vector3());
      expect(Math.hypot(world.x - shelter.x, world.z - shelter.z)).toBeCloseTo(shelter.inner, 5);
      const rubble = scene.getObjectByName(`rubble-${shelter.id}`);
      expect(rubble).toBeTruthy();
      expect(rubble!.position.x).toBeCloseTo(shelter.x);
      expect(rubble!.position.z).toBeCloseTo(shelter.z);
    }
    for (const rock of ROCKS) {
      const mesh = scene.getObjectByName(`rock-${rock.id}`) as THREE.Mesh;
      expect(mesh).toBeTruthy();
      expect(mesh.position.x).toBeCloseTo(rock.x);
      expect(mesh.position.z).toBeCloseTo(rock.z);
      expect(mesh.scale.x).toBeCloseTo(rock.radius);
    }
    scenery.dispose();
  });

  it("keeps the surface above the fish and the sand below them", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene);
    const surface = scene.getObjectByName("surface") as THREE.Mesh;
    const bed = scene.getObjectByName("bed") as THREE.Mesh;
    expect(surface).toBeTruthy();
    expect(surface.position.y).toBeGreaterThan(8);
    surface.geometry.computeVertexNormals();
    const normals = surface.geometry.getAttribute("normal");
    let normalY = 0;
    for (let i = 0; i < normals.count; i++) normalY += normals.getY(i);
    expect(normalY / normals.count).toBeLessThan(0);
    expect(bed.position.y).toBeLessThan(-6);
    expect(bed.rotation.x).toBeCloseTo(0, 5);
    expect(scene.fog).toBeNull();
    expect(scene.getObjectByName("dust")).toBeUndefined();
    expect(scene.getObjectByName("bubbles")).toBeUndefined();
    let origin = 0;
    const bedFlat = bed.geometry.getAttribute("position");
    for (let i = 0; i < bedFlat.count; i++) {
      if (bedFlat.getX(i) === 0 && bedFlat.getZ(i) === 0) origin += 1;
    }
    expect(origin).toBe(1);
    const bedPos = bed.geometry.getAttribute("position");
    let raised = 0;
    for (let i = 0; i < bedPos.count; i++) if (Math.abs(bedPos.getY(i)) > 0.25) raised += 1;
    expect(raised).toBeGreaterThan(20);
    expect(scene.getObjectByName("vista")).toBeUndefined();
    scenery.dispose();
    expect(scene.getObjectByName("surface")).toBeUndefined();
  });

  it("points scenery fish along local -Z, nose ahead of the tail", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene);
    scenery.update(0);
    const school = scene.getObjectByName("school") as THREE.InstancedMesh;
    const box = school.geometry.boundingBox ?? new THREE.Box3();
    school.geometry.computeBoundingBox();
    const bounds = school.geometry.boundingBox ?? box;
    expect(bounds.min.z).toBeLessThan(-0.5);
    expect(bounds.max.z).toBeGreaterThan(0.8);
    const matrix = new THREE.Matrix4();
    school.getMatrixAt(0, matrix);
    const nose = new THREE.Vector3(0, 0, -1).transformDirection(matrix);
    expect(nose.z).toBeGreaterThan(0.9);
    expect(Math.abs(nose.x)).toBeLessThan(0.15);
    expect(matrix.elements[12]).toBeCloseTo(32, 4);
    expect(matrix.elements[14]).toBeCloseTo(0, 4);
    scenery.dispose();
  });

  it("leaves kelp planted while the school swims", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene);
    const kelp = scene.getObjectByName("kelp") as THREE.InstancedMesh;
    const before = new THREE.Matrix4();
    kelp.getMatrixAt(0, before);
    scenery.update(4);
    const after = new THREE.Matrix4();
    kelp.getMatrixAt(0, after);
    expect(Array.from(after.elements)).toEqual(Array.from(before.elements));
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    for (const shelter of SHELTERS) {
      let onRing = false;
      for (let i = 0; i < kelp.count; i++) {
        kelp.getMatrixAt(i, matrix);
        pos.setFromMatrixPosition(matrix);
        const dist = Math.hypot(pos.x - shelter.x, pos.z - shelter.z);
        if (dist >= shelter.radius && dist <= shelter.radius + 3) onRing = true;
      }
      expect(onRing).toBe(true);
    }
    const school = scene.getObjectByName("school") as THREE.InstancedMesh;
    const home = new THREE.Matrix4();
    const away = new THREE.Matrix4();
    scenery.update(0);
    school.getMatrixAt(0, home);
    scenery.update(3);
    school.getMatrixAt(0, away);
    expect(away.elements[14]).not.toBeCloseTo(home.elements[14], 2);
    scenery.dispose();
    const again = addScenery(scene);
    again.update(0);
    expect(scene.getObjectByName("school")).toBeTruthy();
    again.dispose();
  });

  it("swims extra life along local -Z and leaves the reef planted", () => {
    const scene = new THREE.Scene();
    const scenery = addScenery(scene);
    for (const name of ["jellies", "rays", "turtles", "crabs", "seahorses", "squid", "starfish", "anemones", "urchins", "brains", "plates", "column"]) {
      expect(scene.getObjectByName(name), name).toBeTruthy();
    }
    expect(scene.fog).toBeNull();
    expect(scene.getObjectByName("dust")).toBeUndefined();
    expect(scene.getObjectByName("bubbles")).toBeUndefined();
    expect(scene.getObjectByName("vista")).toBeUndefined();
    const haze = scene.getObjectByName("water-haze");
    expect(haze).toBeTruthy();
    expect(scene.getObjectByName("caustics")).toBeTruthy();
    const hazePoints: THREE.Object3D[] = [];
    haze?.traverse((obj) => {
      if (obj.type === "Points") hazePoints.push(obj);
    });
    expect(hazePoints).toHaveLength(0);
    expect(scene.getObjectByName("water-haze")).toBeTruthy();
    expect(scene.getObjectByName("caustics")).toBeTruthy();
    const stars = scene.getObjectByName("starfish") as THREE.InstancedMesh;
    const anemones = scene.getObjectByName("anemones") as THREE.InstancedMesh;
    const planted = new THREE.Matrix4();
    const still = new THREE.Matrix4();
    stars.getMatrixAt(0, planted);
    anemones.getMatrixAt(0, still);
    scenery.update(0);
    expectFacesTravel(scene.getObjectByName("jellies") as THREE.InstancedMesh, jellyPose, 0, 0);
    expectFacesTravel(scene.getObjectByName("rays") as THREE.InstancedMesh, rayPose, 0, 0);
    expectFacesTravel(scene.getObjectByName("turtles") as THREE.InstancedMesh, turtlePose, 0, 0);
    expectFacesTravel(scene.getObjectByName("crabs") as THREE.InstancedMesh, crabPose, 0, 0);
    expectFacesTravel(scene.getObjectByName("seahorses") as THREE.InstancedMesh, seahorsePose, 0, 0);
    const squid = scene.getObjectByName("squid")!;
    const squidHome = squidPose(0, 0);
    const squidChild = squid.children[0];
    squidChild.updateWorldMatrix(true, false);
    const squidNose = new THREE.Vector3(0, 0, -1).transformDirection(squidChild.matrixWorld);
    const squidAhead = squidPose(0, 0.05);
    const squidVx = (squidAhead.x - squidHome.x) / 0.05;
    const squidVz = (squidAhead.z - squidHome.z) / 0.05;
    const squidLen = Math.hypot(squidVx, squidVz);
    expect(squidLen).toBeGreaterThan(0.02);
    expect((squidNose.x * squidVx + squidNose.z * squidVz) / squidLen).toBeGreaterThan(0.9);
    expect(squidChild.position.x).toBeCloseTo(squidHome.x, 3);
    expect(squidChild.position.z).toBeCloseTo(squidHome.z, 3);
    const finRest = scene.getObjectByName("fin_L2")!.quaternion.clone();
    const armRest = scene.getObjectByName("arm_0_1")!.quaternion.clone();
    const squidScale = squidChild.scale.x;
    const jelly = scene.getObjectByName("jellies") as THREE.InstancedMesh;
    const home = new THREE.Matrix4();
    jelly.getMatrixAt(0, home);
    scenery.update(2);
    expect(scene.getObjectByName("fin_L2")!.quaternion.angleTo(finRest)).toBeGreaterThan(0.02);
    expect(scene.getObjectByName("arm_0_1")!.quaternion.angleTo(armRest)).toBeGreaterThan(0.02);
    const squidLater = squidPose(0, 2);
    expect(squidChild.position.x).toBeCloseTo(squidLater.x, 3);
    expect(squidChild.position.z).toBeCloseTo(squidLater.z, 3);
    expect(squidChild.scale.x).toBeCloseTo(squidChild.scale.y, 5);
    expect(squidChild.scale.y).toBeCloseTo(squidChild.scale.z, 5);
    expect(squidChild.scale.x).toBeCloseTo(squidScale, 5);
    expect(squidChild.scale.x).toBeCloseTo(squidPose(0, 2).sx, 5);
    const mantle = scene.getObjectByName("mantle")!;
    expect(mantle.scale.x).toBeCloseTo(1, 2);
    expect(mantle.scale.y).toBeCloseTo(1, 2);
    expect(mantle.scale.z).toBeCloseTo(1, 2);
    let jet = 0;
    squid.traverse((obj) => {
      const skinned = obj as THREE.SkinnedMesh;
      if (skinned.morphTargetInfluences) jet = Math.max(jet, skinned.morphTargetInfluences[0]);
    });
    expect(jet).toBe(0);
    const away = new THREE.Matrix4();
    jelly.getMatrixAt(0, away);
    expect(away.elements[12]).not.toBeCloseTo(home.elements[12], 2);
    const starAfter = new THREE.Matrix4();
    const anemoneAfter = new THREE.Matrix4();
    stars.getMatrixAt(0, starAfter);
    anemones.getMatrixAt(0, anemoneAfter);
    expect(Array.from(starAfter.elements)).toEqual(Array.from(planted.elements));
    expect(Array.from(anemoneAfter.elements)).toEqual(Array.from(still.elements));
    const ray = scene.getObjectByName("rays") as THREE.InstancedMesh;
    ray.getMatrixAt(0, home);
    expect(home.elements[13]).toBeLessThan(-0.4);
    expect(home.elements[13]).toBeGreaterThan(-3.2);
    scenery.dispose();
  });
});
