import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { addOceanLights, SUN_POSITION, WATER_LEVEL, submergedDistance, WaterLighting } from "./water";

describe("shared underwater lighting", () => {
  it("attenuates only the submerged part of a view segment", () => {
    expect(submergedDistance(0, -7, 20)).toBe(20);
    expect(WATER_LEVEL).toBeLessThan(12);
    expect(submergedDistance(14, 12, 20)).toBe(0);
    expect(submergedDistance(14, 0, 20)).toBeCloseTo(20 * WATER_LEVEL / 14);
    expect(submergedDistance(0, 14, 20)).toBeCloseTo(20 * WATER_LEVEL / 14);
  });

  it("composes deformation hooks once and keeps clocks local to each scene", () => {
    const material = new THREE.MeshStandardMaterial();
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `// prior deformation\n${shader.vertexShader}`;
    };
    const root = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const water = new WaterLighting();
    water.apply(root);
    const hook = material.onBeforeCompile;
    water.apply(root);
    expect(material.onBeforeCompile).toBe(hook);
    const shader = {
      uniforms: {},
      vertexShader: "#include <project_vertex>",
      fragmentShader: "#include <opaque_fragment>",
    } as unknown as Parameters<typeof material.onBeforeCompile>[0];
    hook(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain("prior deformation");
    expect(shader.vertexShader).toContain("instanceMatrix * shoalWorld");
    expect(shader.fragmentShader).toContain("shoalTransmission");
    expect(shader.fragmentShader).toContain("if (shoalWaterDetail > 0.5)");
    expect(shader.fragmentShader).toContain("shoalSunDir");
    expect(shader.fragmentShader).toContain("shoalFlow");
    expect(shader.fragmentShader).toContain("shoalCausticGain");
    expect(shader.fragmentShader).toContain(`${WATER_LEVEL}`);
    expect(shader.uniforms.shoalSunDir).toBe(water.sunDir);
    expect(water.sunDir.value.equals(SUN_POSITION)).toBe(true);
    water.detail.value = 0;
    expect(shader.uniforms.shoalWaterDetail.value).toBe(0);
    expect(shader.uniforms.shoalWaterTime).toBe(water.time);
    expect(new WaterLighting().time).not.toBe(water.time);
    root.geometry.dispose();
    material.dispose();
  });

  it("lifts a below-horizon sun so night stays readable", () => {
    const scene = new THREE.Scene();
    const lamps = addOceanLights(scene);
    const sun = scene.children.find((child) => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    lamps.apply({
      sun: SUN_POSITION.clone(),
      sunColor: new THREE.Color("#fff3df"),
      sunIntensity: 2.1,
      sky: new THREE.Color("#d8edf1"),
      ground: new THREE.Color("#163b36"),
      hemi: 0.85,
    });
    expect(sun.position.y).toBe(SUN_POSITION.y);
    expect(sun.intensity).toBeCloseTo(2.1);
    lamps.apply({
      sun: new THREE.Vector3(-SUN_POSITION.x, -SUN_POSITION.y, -SUN_POSITION.z),
      sunColor: new THREE.Color("#c5d4ee"),
      sunIntensity: 0.34,
      sky: new THREE.Color("#10243c"),
      ground: new THREE.Color("#243044"),
      hemi: 0.42,
    });
    expect(sun.position.y).toBe(6);
    expect(sun.intensity).toBeCloseTo(0.34);
    expect(sun.color.getHexString()).toBe("c5d4ee");
  });
});
