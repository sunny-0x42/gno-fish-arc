import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadQuality, subscribeQuality, writeQuality } from "./quality";
import { frameDelta, Stage } from "./stage";

// Keep real scene/camera/color behavior, but never allocate a WebGL context.
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: vi.fn(function () {
      return {
        domElement: { className: "", remove: vi.fn() },
        setPixelRatio: vi.fn(),
        setClearColor: vi.fn(),
        setSize: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
      };
    }),
    PMREMGenerator: vi.fn(function () {
      return {
        fromScene: vi.fn(() => ({ texture: new actual.Texture(), dispose: vi.fn() })),
        dispose: vi.fn(),
      };
    }),
  };
});

vi.mock("three/addons/environments/RoomEnvironment.js", () => ({
  RoomEnvironment: vi.fn(function () { return { dispose: vi.fn() }; }),
}));

// Exercise the real subscription/unsubscription mechanism without browser storage.
vi.mock("./quality", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./quality")>();
  return {
    ...actual,
    loadQuality: vi.fn(() => "balanced"),
    subscribeQuality: vi.fn((listener: () => void) => vi.fn(actual.subscribeQuality(listener))),
  };
});

const stages: Stage[] = [];
let observers: { callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[];
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

function mount(width = 800, height = 400) {
  return { clientWidth: width, clientHeight: height, appendChild: vi.fn() };
}

function createStage(host = mount(), options: ConstructorParameters<typeof Stage>[1] = {}) {
  const stage = new Stage(host as unknown as HTMLElement, options);
  stages.push(stage);
  return stage;
}

function environmentTarget(index = 0) {
  const generator = vi.mocked(THREE.PMREMGenerator).mock.results[index].value as THREE.PMREMGenerator;
  return vi.mocked(generator.fromScene).mock.results[0].value as THREE.WebGLRenderTarget;
}

beforeEach(() => {
  writeQuality("balanced");
  vi.clearAllMocks();
  vi.mocked(loadQuality).mockReturnValue("balanced");
  observers = [];
  frames = new Map();
  nextFrame = 1;
  vi.stubGlobal("window", { devicePixelRatio: 3 });
  vi.stubGlobal("ResizeObserver", vi.fn(function (callback: ResizeObserverCallback) {
    const observer = { callback, observe: vi.fn(), disconnect: vi.fn() };
    observers.push(observer);
    return observer;
  }));
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
});

afterEach(() => {
  for (const stage of stages.splice(0)) stage.dispose();
  writeQuality("balanced");
  vi.unstubAllGlobals();
});

describe("stage clock", () => {
  it("caps a stall and ignores a clock step backward", () => {
    expect(frameDelta(1000, 1016)).toBeCloseTo(0.016);
    expect(frameDelta(1000, 1100)).toBeCloseTo(0.033);
    expect(frameDelta(1000, 1000)).toBe(0);
    expect(frameDelta(1000, 900)).toBe(0);
  });
});

describe("stage renderer color policy", () => {
  it("uses sRGB output, ACES tone mapping and the default exposure on an opaque canvas", () => {
    const host = mount();
    const stage = createStage(host);
    expect(THREE.WebGLRenderer).toHaveBeenCalledWith({ antialias: true, alpha: false });
    expect(stage.renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(stage.renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(stage.renderer.toneMappingExposure).toBe(1.18);
    expect(stage.renderer.setClearColor).toHaveBeenCalledExactlyOnceWith("#071c26", 1);
    expect(stage.scene.background).toBeNull();
    expect(stage.scene.fog).toBeNull();
    expect(host.appendChild).toHaveBeenCalledExactlyOnceWith(stage.renderer.domElement);
  });

  it("honors custom opaque clear/background colors and an explicit zero exposure", () => {
    const stage = createStage(mount(), { clear: "#123456", background: "#abcdef", exposure: 0, canvasClass: "fish-card" });
    expect(stage.renderer.setClearColor).toHaveBeenCalledExactlyOnceWith("#123456", 1);
    expect(stage.scene.background).toEqual(new THREE.Color("#abcdef"));
    expect(stage.renderer.toneMappingExposure).toBe(0);
    expect(stage.renderer.domElement.className).toBe("fish-card");
  });

  it("does not force an opaque clear color on an alpha canvas", () => {
    const stage = createStage(mount(), { alpha: true, clear: "#123456", exposure: 1.4 });
    expect(THREE.WebGLRenderer).toHaveBeenCalledWith({ antialias: true, alpha: true });
    expect(stage.renderer.setClearColor).not.toHaveBeenCalled();
    expect(stage.renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(stage.renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(stage.renderer.toneMappingExposure).toBe(1.4);
  });
});

describe("stage environment ownership and teardown", () => {
  it("generates one procedural PMREM per Stage and owns each target independently", () => {
    const first = createStage();
    const second = createStage();
    expect(RoomEnvironment).toHaveBeenCalledTimes(2);
    expect(THREE.PMREMGenerator).toHaveBeenCalledTimes(2);
    for (const [index, stage] of [first, second].entries()) {
      const room = vi.mocked(RoomEnvironment).mock.results[index].value as RoomEnvironment;
      const generator = vi.mocked(THREE.PMREMGenerator).mock.results[index].value as THREE.PMREMGenerator;
      const target = environmentTarget(index);
      expect(THREE.PMREMGenerator).toHaveBeenNthCalledWith(index + 1, stage.renderer);
      expect(generator.fromScene).toHaveBeenCalledExactlyOnceWith(room, 0.08);
      expect(stage.scene.environment).toBe(target.texture);
      expect(stage.scene.environmentIntensity).toBe(0.32);
      expect(room.dispose).toHaveBeenCalledTimes(1);
      expect(generator.dispose).toHaveBeenCalledTimes(1);
      expect(target.dispose).not.toHaveBeenCalled();
    }
    expect(first.scene.environment).not.toBe(second.scene.environment);
    first.dispose();
    expect(environmentTarget(0).dispose).toHaveBeenCalledTimes(1);
    expect(environmentTarget(1).dispose).not.toHaveBeenCalled();
    expect(second.scene.environment).toBe(environmentTarget(1).texture);
    second.dispose();
    expect(environmentTarget(1).dispose).toHaveBeenCalledTimes(1);
  });

  it("tears down once, cancels the frame and detaches resize/quality subscriptions", () => {
    const stage = createStage();
    const update = vi.fn();
    stage.start(update);
    const pendingFrame = frames.get(1)!;
    const unsubscribe = vi.mocked(subscribeQuality).mock.results[0].value;
    const sizeCalls = vi.mocked(stage.renderer.setSize).mock.calls.length;
    const ratioCalls = vi.mocked(stage.renderer.setPixelRatio).mock.calls.length;
    stage.dispose();
    stage.dispose();
    expect(cancelAnimationFrame).toHaveBeenCalledExactlyOnceWith(1);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(stage.scene.environment).toBeNull();
    expect(environmentTarget().dispose).toHaveBeenCalledTimes(1);
    expect(stage.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(stage.renderer.domElement.remove).toHaveBeenCalledTimes(1);
    writeQuality("high");
    pendingFrame(1000);
    expect(stage.renderer.setPixelRatio).toHaveBeenCalledTimes(ratioCalls);
    expect(stage.renderer.setSize).toHaveBeenCalledTimes(sizeCalls);
    expect(update).not.toHaveBeenCalled();
    expect(stage.renderer.render).not.toHaveBeenCalled();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
});

describe("stage quality and resize", () => {
  it.each([
    [3, "high", 2],
    [1.25, "high", 1.25],
    [0, "balanced", 1],
  ] as const)("caps device DPR %s using loaded quality %s", (devicePixelRatio, quality, expected) => {
    vi.stubGlobal("window", { devicePixelRatio });
    vi.mocked(loadQuality).mockReturnValue(quality);
    const stage = createStage();
    expect(loadQuality).toHaveBeenCalledTimes(1);
    expect(stage.renderer.setPixelRatio).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it("updates pixel ratio and current dimensions on quality changes and observer notifications", () => {
    const host = mount();
    const stage = createStage(host);
    const projection = vi.spyOn(stage.camera, "updateProjectionMatrix");
    expect(subscribeQuality).toHaveBeenCalledTimes(1);
    expect(stage.renderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(stage.renderer.setSize).toHaveBeenLastCalledWith(800, 400);
    expect(stage.camera.aspect).toBe(2);
    expect(observers[0].observe).toHaveBeenCalledExactlyOnceWith(host);
    host.clientWidth = 900;
    host.clientHeight = 300;
    writeQuality("low");
    expect(stage.renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
    expect(stage.renderer.setSize).toHaveBeenLastCalledWith(900, 300);
    expect(stage.camera.aspect).toBe(3);
    expect(projection).toHaveBeenCalledTimes(1);
    vi.stubGlobal("window", { devicePixelRatio: 1.25 });
    writeQuality("high");
    expect(stage.renderer.setPixelRatio).toHaveBeenLastCalledWith(1.25);
    host.clientWidth = 0;
    host.clientHeight = 0;
    observers[0].callback([], {} as ResizeObserver);
    expect(stage.renderer.setSize).toHaveBeenLastCalledWith(1, 1);
    expect(stage.camera.aspect).toBe(1);
    expect(projection).toHaveBeenCalledTimes(3);
    expect(THREE.PMREMGenerator).toHaveBeenCalledTimes(1);
    expect(environmentTarget().dispose).not.toHaveBeenCalled();
  });
});
