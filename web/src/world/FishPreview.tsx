import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import type { Rarity } from "../sim/catalog";
import type { Trait } from "../sim/tokenomics";
import { copyFishPose, createFish, disposeRig, poseFish, type FishSize } from "./createFish";
import { attachRarityFish } from "./rarityGlb";
import { aimQuaternion } from "./frame";
import { dragPreview, PREVIEW_BITE_MS, previewBite, previewView, type PreviewMotion, type PreviewView } from "./previewControls";
import { readQuality, subscribeQuality } from "./quality";
import { Stage } from "./stage";

type Props = {
  rarity: Rarity;
  size?: FishSize;
  trait?: Trait;
  className?: string;
  interactive?: boolean;
  /** Fraction of the framed radius used to place the camera. Smaller sits the fish closer. */
  frame?: number;
  /** Frame the loaded model. The card uses this so the picture stays inside the square. */
  fit?: boolean;
};

export function FishPreview({ rarity, size = "medium", trait, className, interactive = false, frame = 1.15, fit = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const selection = useRef({ rarity, size, trait });
  const replace = useRef<(() => void) | null>(null);
  const cancelDrag = useRef<(() => void) | null>(null);
  const controls = useRef({ aim: previewView("side"), motion: "idle" as PreviewMotion, biteAt: null as number | null });
  const frameRef = useRef(frame);
  const fitRef = useRef(fit);
  frameRef.current = frame;
  fitRef.current = fit;
  const [view, setView] = useState<PreviewView | null>("side");
  const [motion, setMotion] = useState<PreviewMotion>("idle");
  const [unavailable, setUnavailable] = useState(false);
  const hintId = useId();
  selection.current = { rarity, size, trait };

  useEffect(() => {
    const mount = ref.current;
    if (!mount) return;
    let stage: Stage;
    try {
      stage = new Stage(mount, { alpha: true, fov: 38, near: 0.05, far: 150 });
      setUnavailable(false);
    } catch {
      setUnavailable(true);
      // Stage may have appended a canvas before WebGL initialization failed.
      mount.replaceChildren();
      const fallback = document.createElement("p");
      fallback.className = "preview-fallback";
      fallback.textContent = "3D preview unavailable. Enable WebGL to see this fish.";
      mount.appendChild(fallback);
      return () => fallback.remove();
    }
    const { scene, camera } = stage;
    scene.add(new THREE.HemisphereLight("#d8edf1", "#163b36", 0.85));
    const sun = new THREE.DirectionalLight("#fff3df", 2.1);
    sun.position.set(-3, 4, -2);
    const rim = new THREE.DirectionalLight("#c5dee3", 0.65);
    rim.position.set(3, 2, 4);
    scene.add(sun, rim);
    const initial = selection.current;
    let rig = createFish(initial.rarity, { size: initial.size, trait: initial.trait, quality: readQuality() });
    attachRarityFish(rig, initial.rarity);
    scene.add(rig.root);
    replace.current = () => {
      const current = selection.current;
      const next = createFish(current.rarity, { size: current.size, trait: current.trait, quality: readQuality() });
      attachRarityFish(next, current.rarity);
      copyFishPose(rig, next);
      next.root.position.copy(rig.root.position);
      next.root.quaternion.copy(rig.root.quaternion);
      scene.remove(rig.root);
      disposeRig(rig);
      rig = next;
      scene.add(rig.root);
    };
    const unsubscribe = subscribeQuality(() => replace.current?.());
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = media.matches;
    const onMotionChange = () => { reduced = media.matches; };
    media.addEventListener("change", onMotionChange);

    let drag: { id: number; x: number; y: number } | null = null;
    const release = () => {
      const id = drag?.id;
      drag = null;
      if (id !== undefined && mount.hasPointerCapture(id)) mount.releasePointerCapture(id);
    };
    const onDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try { mount.setPointerCapture(event.pointerId); } catch { drag = null; return; }
      event.preventDefault();
    };
    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      controls.current.aim = dragPreview(controls.current.aim, event.clientX - drag.x, event.clientY - drag.y);
      drag.x = event.clientX;
      drag.y = event.clientY;
      setView(null);
      event.preventDefault();
    };
    const onEnd = (event: PointerEvent) => { if (drag?.id === event.pointerId) release(); };
    const onBlur = () => { release(); controls.current.biteAt = null; };
    if (interactive) {
      cancelDrag.current = release;
      mount.addEventListener("pointerdown", onDown);
      mount.addEventListener("pointermove", onMove);
      mount.addEventListener("pointerup", onEnd);
      mount.addEventListener("pointercancel", onEnd);
      mount.addEventListener("lostpointercapture", onEnd);
      window.addEventListener("blur", onBlur);
    }
    let elapsed = 0;
    const fitBox = new THREE.Box3();
    const fitSphere = new THREE.Sphere();
    const look = new THREE.Vector3();
    stage.start(({ time, dt }) => {
      elapsed += dt;
      if (interactive) {
        const { aim, motion, biteAt } = controls.current;
        aimQuaternion(aim.yaw, aim.pitch, rig.root.quaternion);
        const bite = previewBite(time, biteAt);
        if (biteAt !== null && time - biteAt >= PREVIEW_BITE_MS) controls.current.biteAt = null;
        // Reduced motion attenuates the existing gait; Bite is only ever explicitly requested.
        poseFish(rig, time * 0.001, bite, motion === "swim" ? 2 : 0, dt, reduced);
      } else {
        const sway = reduced ? 0 : Math.sin(elapsed * 0.18) * (fitRef.current ? 0.05 : 0.3);
        // The card looks along the side so the body sits in the square. Species keeps the swimming angle.
        rig.root.rotation.y = (fitRef.current ? Math.PI / 2 : 1.05) + sway;
        poseFish(rig, time * 0.001, 0, 0.8, dt, reduced);
      }
      const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const horizontal = Math.atan(Math.tan(halfFov) * camera.aspect);
      look.set(0, 0, 0);
      let radius = rig.bounds.radius;
      let fitted = false;
      if (fitRef.current) {
        const model = rig.visual.getObjectByName("rarity-glb");
        if (model) {
          fitBox.setFromObject(model);
          if (!fitBox.isEmpty()) {
            fitBox.getBoundingSphere(fitSphere);
            if (fitSphere.radius > 0.05) {
              radius = fitSphere.radius;
              look.copy(fitSphere.center);
              fitted = true;
            }
          }
        }
      }
      // Screen right is the nose. Shift the look target so that end stays inside the square.
      if (fitted) look.x -= radius * 0.18;
      const dist = radius * frameRef.current / Math.sin(Math.min(halfFov, horizontal));
      if (interactive) camera.position.set(look.x, look.y, look.z - dist);
      else if (fitRef.current) camera.position.set(look.x, look.y + dist * 0.04, look.z - dist);
      else camera.position.set(look.x + dist * 0.34, look.y + dist * 0.14, look.z - dist);
      const far = Math.max(50, dist * 8);
      if (camera.far !== far) {
        camera.far = far;
        camera.updateProjectionMatrix();
      }
      camera.lookAt(look);
    });
    return () => {
      release();
      cancelDrag.current = null;
      mount.removeEventListener("pointerdown", onDown);
      mount.removeEventListener("pointermove", onMove);
      mount.removeEventListener("pointerup", onEnd);
      mount.removeEventListener("pointercancel", onEnd);
      mount.removeEventListener("lostpointercapture", onEnd);
      window.removeEventListener("blur", onBlur);
      media.removeEventListener("change", onMotionChange);
      controls.current.biteAt = null;
      replace.current = null;
      unsubscribe();
      disposeRig(rig);
      stage.dispose();
    };
  }, [interactive]);

  const previous = useRef({ rarity, size, trait });
  useEffect(() => {
    const old = previous.current;
    if (old.rarity !== rarity || old.size !== size || old.trait !== trait) replace.current?.();
    previous.current = { rarity, size, trait };
  }, [rarity, size, trait]);

  const label = `${size} ${rarity} fish 3D preview`;
  const classes = className ? `preview ${className}` : "preview";
  if (!interactive) return <div className={classes} ref={ref} role="img" aria-label={label} />;

  const chooseView = (next: PreviewView) => {
    cancelDrag.current?.();
    controls.current.aim = previewView(next);
    setView(next);
  };
  const chooseMotion = (next: PreviewMotion) => {
    controls.current.motion = next;
    setMotion(next);
  };
  const reset = () => {
    chooseView("side");
    chooseMotion("idle");
    controls.current.biteAt = null;
  };
  return (
    <div className={`${classes} preview-interactive`}>
      <div className="preview-canvas" ref={ref} role="img" aria-label={label} aria-describedby={hintId} style={{ touchAction: "none" }} />
      <p className="preview-hint" id={hintId}>Drag to rotate, or choose a view below. Presentation only; no gameplay actions.</p>
      <div className="preview-controls">
        <div className="preview-controls-group" role="group" aria-label="Fish view">
          {(["side", "front", "rear"] as const).map((next) => (
            <button type="button" key={next} className={view === next ? "on" : ""} aria-pressed={view === next} disabled={unavailable} onClick={() => chooseView(next)}>{next === "side" ? "Side" : next === "front" ? "Front" : "Rear"}</button>
          ))}
          <button type="button" disabled={unavailable} onClick={reset}>Reset</button>
        </div>
        <div className="preview-controls-group" role="group" aria-label="Fish presentation motion">
          {(["idle", "swim"] as const).map((next) => (
            <button type="button" key={next} className={motion === next ? "on" : ""} aria-pressed={motion === next} disabled={unavailable} onClick={() => chooseMotion(next)}>{next === "idle" ? "Idle" : "Swim"}</button>
          ))}
          <button type="button" disabled={unavailable} onClick={() => { controls.current.biteAt = performance.now(); }}>Bite</button>
        </div>
      </div>
    </div>
  );
}
