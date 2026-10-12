import * as THREE from "three";

/** Mean surface. The idle camera is at y=14, and a view sample at y=12 stays above the water. */
export const WATER_LEVEL = 11.6;
export const SUN_POSITION = new THREE.Vector3(-28, 60, 18);

/** Length of a view segment below the surface, including cameras above water. */
export function submergedDistance(cameraY: number, objectY: number, distance: number): number {
  if (cameraY <= WATER_LEVEL && objectY <= WATER_LEVEL) return distance;
  if (cameraY >= WATER_LEVEL && objectY >= WATER_LEVEL) return 0;
  const crossing = (WATER_LEVEL - cameraY) / (objectY - cameraY);
  return distance * (cameraY > WATER_LEVEL ? 1 - crossing : crossing);
}

export class WaterLighting {
  private readonly bound = new WeakSet<THREE.Material>();
  readonly time = { value: 0 };
  readonly detail = { value: 1 };
  readonly sunDir = { value: SUN_POSITION.clone() };
  readonly causticGain = { value: 1 };
  readonly wetTint = { value: new THREE.Color(0.018, 0.095, 0.12) };
  readonly flow = { value: new THREE.Vector2(0.93, 0.36).normalize() };

  setDay(day: { sun: THREE.Vector3; caustic: number; wet: THREE.Color; flow: THREE.Vector2 }): void {
    this.sunDir.value.copy(day.sun);
    this.causticGain.value = day.caustic;
    this.wetTint.value.copy(day.wet);
    this.flow.value.copy(day.flow);
  }

  /** Compose after geometry hooks; each Stage owns its clock, materials remain independent. */
  apply(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial) || this.bound.has(material)) continue;
        this.bound.add(material);
        const previous = material.onBeforeCompile;
        const key = material.customProgramCacheKey();
        material.onBeforeCompile = (shader, renderer) => {
          previous.call(material, shader, renderer);
          shader.uniforms.shoalWaterTime = this.time;
          shader.uniforms.shoalWaterDetail = this.detail;
          shader.uniforms.shoalSunDir = this.sunDir;
          shader.uniforms.shoalCausticGain = this.causticGain;
          shader.uniforms.shoalWetTint = this.wetTint;
          shader.uniforms.shoalFlow = this.flow;
          shader.vertexShader = `varying vec3 shoalWorldPosition;\n${shader.vertexShader}`.replace(
            "#include <project_vertex>",
            `#include <project_vertex>
            vec4 shoalWorld = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              shoalWorld = instanceMatrix * shoalWorld;
            #endif
            shoalWorldPosition = (modelMatrix * shoalWorld).xyz;`,
          );
          const transition = shader.fragmentShader.includes("// shoal-column-transition");
          shader.fragmentShader = `varying vec3 shoalWorldPosition;
            uniform float shoalWaterTime;
            uniform float shoalWaterDetail;
            uniform vec3 shoalSunDir;
            uniform float shoalCausticGain;
            uniform vec3 shoalWetTint;
            uniform vec2 shoalFlow;\n${shader.fragmentShader}`.replace(
            transition ? "// shoal-column-transition" : "#include <opaque_fragment>",
            `vec3 shoalRay = shoalWorldPosition - cameraPosition;
            float shoalDistance = length(shoalRay);
            float shoalWet = 1.0;
            if (cameraPosition.y > ${WATER_LEVEL} && shoalWorldPosition.y > ${WATER_LEVEL}) shoalWet = 0.0;
            else if (cameraPosition.y > ${WATER_LEVEL}) shoalWet = clamp((${WATER_LEVEL} - shoalWorldPosition.y) / max(cameraPosition.y - shoalWorldPosition.y, 0.001), 0.0, 1.0);
            else if (shoalWorldPosition.y > ${WATER_LEVEL}) shoalWet = clamp((${WATER_LEVEL} - cameraPosition.y) / max(shoalWorldPosition.y - cameraPosition.y, 0.001), 0.0, 1.0);
            vec3 shoalTransmission = exp(-vec3(0.018, 0.007, 0.0045) * shoalDistance * shoalWet);
            if (shoalWaterDetail > 0.5) {
            vec2 shoalP = shoalWorldPosition.xz * 0.72 + shoalFlow * shoalWaterTime * 0.45;
            float shoalWave = sin(shoalP.x + sin(shoalP.y * 1.3 + shoalWaterTime * 0.28)) * sin(shoalP.y - shoalWaterTime * 0.22 + sin(shoalP.x * 0.8));
            float shoalCaustic = pow(max(0.0, 1.0 - abs(shoalWave) * 4.0), 5.0);
            vec3 shoalUp = normalize(mat3(viewMatrix) * shoalSunDir);
            float shoalFacing = max(0.0, dot(normal, shoalUp));
            float shoalDepth = max(0.0, ${WATER_LEVEL} - shoalWorldPosition.y);
            outgoingLight *= 1.0 + shoalCaustic * shoalFacing * exp(-shoalDepth * 0.06) * 0.16 * shoalWaterDetail * shoalCausticGain * step(shoalWorldPosition.y, ${WATER_LEVEL});
            }
            outgoingLight = outgoingLight * shoalTransmission + shoalWetTint * (1.0 - shoalTransmission);
            ${transition ? "// shoal-column-transition" : "#include <opaque_fragment>"}`,
          );
        };
        material.customProgramCacheKey = () => `${key}:shoal-water-v3`;
        material.needsUpdate = true;
      }
    });
  }
}

export type OceanLamps = {
  apply: (day: { sun: THREE.Vector3; sunColor: THREE.Color; sunIntensity: number; sky: THREE.Color; ground: THREE.Color; hemi: number }) => void;
};

export function addOceanLights(scene: THREE.Scene): OceanLamps {
  const sky = new THREE.HemisphereLight("#d8edf1", "#163b36", 0.85);
  const sun = new THREE.DirectionalLight("#fff3df", 2.1);
  sun.position.copy(SUN_POSITION);
  scene.add(sky, sun);
  return {
    apply(day) {
      const lamp = day.sun.clone();
      if (lamp.y < 6) lamp.y = 6;
      sun.position.copy(lamp);
      sun.color.copy(day.sunColor);
      sun.intensity = day.sunIntensity;
      sky.color.copy(day.sky);
      sky.groundColor.copy(day.ground);
      sky.intensity = day.hemi;
    },
  };
}
