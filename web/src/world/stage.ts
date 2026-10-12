import * as THREE from "three";
import { GRAPHICS, loadQuality, readQuality, subscribeQuality } from "./quality";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** One WebGL view. Sea and the fish card both mount this. Fog stays off. */
export type StageFrame = {
  time: number;
  dt: number;
};

export type StageOptions = {
  alpha?: boolean;
  clear?: string;
  background?: string;
  fov?: number;
  near?: number;
  far?: number;
  exposure?: number;
  canvasClass?: string;
};

/** Seconds since the previous frame, never negative, capped so a stall cannot skip the sea. */
export function frameDelta(previousMs: number, nowMs: number, cap = 0.033): number {
  if (!(nowMs > previousMs)) return 0;
  return Math.min(cap, (nowMs - previousMs) / 1000);
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly mount: HTMLElement;
  private readonly observer: ResizeObserver;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private readonly unsubscribeQuality: () => void;
  private readonly environment: THREE.WebGLRenderTarget;

  constructor(mount: HTMLElement, options: StageOptions = {}) {
    this.mount = mount;
    const alpha = options.alpha === true;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GRAPHICS[loadQuality()].pixelRatio));
    this.unsubscribeQuality = subscribeQuality(() => {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, GRAPHICS[readQuality()].pixelRatio));
      this.resize();
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = options.exposure ?? 1.18;
    if (!alpha) this.renderer.setClearColor(options.clear ?? "#071c26", 1);
    if (options.canvasClass) this.renderer.domElement.className = options.canvasClass;
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const environmentScene = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environmentScene, 0.08);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.32;
    environmentScene.dispose();
    pmrem.dispose();
    if (options.background) this.scene.background = new THREE.Color(options.background);
    this.camera = new THREE.PerspectiveCamera(
      options.fov ?? 52,
      1,
      options.near ?? 0.1,
      options.far ?? 1200,
    );
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(mount);
  }

  resize(): void {
    const width = this.mount.clientWidth || 1;
    const height = this.mount.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** Draw after `update`. The callback does not schedule the next frame. */
  start(update: (frame: StageFrame) => void): void {
    this.last = performance.now();
    const loop = (time: number) => {
      if (this.disposed) return;
      const dt = frameDelta(this.last, time);
      this.last = time;
      update({ time, dt });
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.unsubscribeQuality();
    this.scene.environment = null;
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
