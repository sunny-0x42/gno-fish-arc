import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SPECIES } from "../sim/catalog";
import { springSlot } from "../sim/cover";
import { flagImageSrc } from "../sim/country";
import { formatGnot } from "../sim/format";
import { PLAYER_ID, type ShoalGame } from "../sim/game";
import { BURST_MULT_DEN, BURST_MULT_NUM, inBiteArc, SECTOR, sectorCenter, sectorOf } from "../sim/rules";
import { biteRadius, biteReach, cruisePace, mouthBite, PREY_BITE_GAP, THREAT_BITE_GAP, turnRateRad, worldUnitsPerSecond } from "../sim/tokenomics";
import { awardChainKill } from "../ui/awardKill";
import { publishAim } from "./aim";
import { lockTarget, readTargetLock, TARGET_LOCK_MS } from "./targetLock";
import { attachRarityFish, preloadRarityFish } from "./rarityGlb";
import { copyFishPose, createFish, disposeRig, poseFish, type FishRig } from "./createFish";
import { ARENA, addScenery, floorY } from "./scenery";
import { biteHold } from "./biteHold";
import { cruiseHold, setCruiseHalted, toggleCruise } from "./cruiseHold";
import { steerHold } from "./steerHold";
import { MOUSE_DEFAULT, steerSettings } from "../ui/steerRates";
import { aimQuaternion, dampAngle, followPose, forwardFromAim, placeChaseCamera, stepSwim, yawFromDirection, type ChasePose } from "./frame";
import { edgeTickPoint, settleStakePlates, type ScreenBox, type StakePlate } from "./plates";
import { clampToDisc, inView, radarBlip, viewPoint } from "./radar";
import { Stage, type StageFrame } from "./stage";
import { allowsGameplayKey, allowsStopKey, INTERACTIVE_TARGET } from "./gameplayInput";
import { readQuality, subscribeQuality } from "./quality";
import { daylightAt, hourOfDay } from "./daylight";
import { addOceanLights, WATER_LEVEL, WaterLighting } from "./water";

export type SeaMode = "overview" | "play" | "watch";

type Actor = {
  id: string;
  rig: FishRig;
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  goal: THREE.Vector3;
  nextThink: number;
  flee: boolean;
  hunt: boolean;
  biteUntil: number;
  /** True while this body is translating. The wag uses it. */
  cruising: boolean;
  /** Units per second along the nose. Negative backs up. Player glide only. */
  speed: number;
  /** Radians per second. Positive turns left. */
  yawRate: number;
  label: HTMLDivElement;
  look: string;
};

type Props = {
  game: ShoalGame;
  mode: SeaMode;
  followId: string | null;
  onFollow: (id: string | null) => void;
};

/** Cruise height. Swim stays on this horizontal plane. */
const SWIM_Y = 1.15;
/** A body this far above or below is another lane. It does not bite or shove. */
const DEPTH_BAND = 3.5;

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _look = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

export function SeaView({ game, mode, followId, onFollow }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ game, mode, followId, onFollow });
  propsRef.current = { game, mode, followId, onFollow };

  useEffect(() => {
    const mount = mountRef.current;
    const radar = radarRef.current;
    if (!mount || !radar) return;
    preloadRarityFish();
    const radarCtx = radar.getContext("2d");

    let stage: Stage;
    try {
      stage = new Stage(mount, {
        clear: "#071c26",
        background: "#081f2d",
        fov: 52,
        near: 0.1,
        far: 1200,
        exposure: 1.38,
        canvasClass: "view",
      });
    } catch {
      const fallback = document.createElement("p");
      fallback.className = "webgl-fallback";
      fallback.setAttribute("role", "alert");
      fallback.textContent = "The 3D ocean needs WebGL. Enable hardware acceleration or try another browser.";
      mount.appendChild(fallback);
      return () => fallback.remove();
    }
    const { renderer, scene, camera } = stage;
    camera.position.set(0, 14, 28);

    const lamps = addOceanLights(scene);
    const water = new WaterLighting();
    const scenery = addScenery(scene, readQuality());
    water.apply(scene);
    const unsubscribeQuality = subscribeQuality(() => scenery.setQuality(readQuality()));
    const springGeo = new THREE.SphereGeometry(1.1, 16, 12);
    const springMat = new THREE.MeshStandardMaterial({
      color: "#9ff3d0",
      roughness: 0.35,
      transparent: true,
      opacity: 0.85,
    });
    const springMesh = new THREE.Mesh(springGeo, springMat);
    springMesh.name = "spring";
    springMesh.visible = false;
    scene.add(springMesh);
    const fxLayer = document.createElement("div");
    fxLayer.className = "fx-layer";
    mount.appendChild(fxLayer);
    const arcPositions = new Float32Array(2048);
    const arcGeom = new THREE.BufferGeometry();
    arcGeom.setAttribute("position", new THREE.BufferAttribute(arcPositions, 3));
    arcGeom.setDrawRange(0, 0);
    const arcLines = new THREE.LineSegments(
      arcGeom,
      new THREE.LineBasicMaterial({ color: 0xd8fff4, transparent: true, opacity: 0.85 }),
    );
    arcLines.frustumCulled = false;
    arcLines.visible = false;
    const actors = new Map<string, Actor>();
    const labelLayer = document.createElement("div");
    labelLayer.className = "tags";
    mount.appendChild(labelLayer);
    const edgeTick = document.createElement("div");
    edgeTick.className = "edge-tick";
    edgeTick.style.display = "none";
    const targetLock = document.createElement("div");
    targetLock.className = "target-lock";
    targetLock.style.display = "none";
    targetLock.setAttribute("aria-hidden", "true");
    const targetArrow = document.createElement("i");
    targetLock.appendChild(targetArrow);
    const springMark = document.createElement("div");
    springMark.className = "spring-mark";
    springMark.textContent = "Spring";
    springMark.style.display = "none";
    const springEdge = document.createElement("div");
    springEdge.className = "spring-edge";
    springEdge.textContent = "+";
    springEdge.setAttribute("aria-label", "Spring");
    springEdge.style.display = "none";
    mount.appendChild(edgeTick);
    mount.appendChild(targetLock);
    mount.appendChild(springMark);
    mount.appendChild(springEdge);
    let springBorn = -1;

    const keys = { left: false, right: false, up: false, down: false };
    let biteQueued = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ensure = (id: string, _index: number) => {
      const fish = game.fishById(id);
      if (!fish) return;
      const look = `${fish.aspect ?? fish.rarity}:${fish.size}:${fish.trait}:${readQuality()}`;
      const prev = actors.get(id);
      if (prev?.look === look) return;
      const rig = createFish(fish.aspect ?? fish.rarity, {
        size: fish.size,
        trait: fish.trait,
        phaseOffset: _index * 2.39996,
        quality: readQuality(),
      });
      water.apply(rig.root);
      rig.root.scale.multiplyScalar(2.2);
      attachRarityFish(rig, fish.aspect ?? fish.rarity, water);
      rig.root.userData.fishId = id;
      if (prev) {
        rig.root.position.copy(prev.pos);
        aimQuaternion(prev.yaw, prev.pitch, rig.root.quaternion);
        copyFishPose(prev.rig, rig);
        scene.remove(prev.rig.root);
        disposeRig(prev.rig);
        prev.rig = rig;
        prev.look = look;
        scene.add(rig.root);
        return;
      }
      const pos = new THREE.Vector3(fish.x, SWIM_Y, fish.z);
      const yaw = fish.yaw ?? yawFromDirection(fish.faceDx, fish.faceDz);
      const pitch = 0;
      aimQuaternion(yaw, pitch, rig.root.quaternion);
      const goal = pos.clone();
      const nextThink = 0;
      const flee = false;
      const hunt = false;
      const biteUntil = 0;
      const label = document.createElement("div");
      label.className = `tag r-${fish.rarity}`;
      labelLayer.appendChild(label);
      const actor: Actor = {
        id,
        rig,
        pos,
        yaw,
        pitch,
        goal,
        nextThink,
        flee,
        hunt,
        biteUntil,
        cruising: false,
        speed: 0,
        yawRate: 0,
        label,
        look,
      };
      actors.set(id, actor);
      scene.add(rig.root);
    };

    const drop = (id: string) => {
      const actor = actors.get(id);
      if (!actor) return;
      scene.remove(actor.rig.root);
      disposeRig(actor.rig);
      actor.label.remove();
      actors.delete(id);
    };

    const moveAxis = (code: string): "left" | "right" | "up" | "down" | null => {
      if (code === "KeyA" || code === "ArrowLeft") return "left";
      if (code === "KeyD" || code === "ArrowRight") return "right";
      if (code === "KeyW" || code === "ArrowUp") return "up";
      if (code === "KeyS" || code === "ArrowDown") return "down";
      return null;
    };
    const onKey = (event: KeyboardEvent, down: boolean) => {
      const axis = moveAxis(event.code);
      // Releases must reach the sea even when focus moved into a control.
      if (!down) {
        if (axis) keys[axis] = false;
        return;
      }
      const typing = event.target instanceof Element && event.target.closest("input, textarea, select") !== null;
      const overlayOpen = document.querySelector('[data-gameplay-blocking="true"]') !== null;
      if (!event.repeat && event.code === "KeyX" && allowsStopKey(propsRef.current.mode, Boolean(game.activeFishId), typing, overlayOpen)) {
        event.preventDefault();
        toggleCruise();
      }
      const interactive = event.target instanceof Element && event.target.closest(INTERACTIVE_TARGET) !== null;
      if (!allowsGameplayKey(propsRef.current.mode, Boolean(game.activeFishId), interactive, overlayOpen)) return;
      if (axis) keys[axis] = true;
      const burstKey = event.code === "Space" || event.code === "ShiftLeft" || event.code === "ShiftRight";
      if (!event.repeat && burstKey && !cruiseHold.halted && propsRef.current.mode === "play" && game.activeFishId) {
        game.tryBurst(game.activeFishId, Date.now());
      }
      if (axis || event.code === "Space") event.preventDefault();
    };
    const down = (event: KeyboardEvent) => onKey(event, true);
    const up = (event: KeyboardEvent) => onKey(event, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const releaseInput = () => {
      keys.left = keys.right = keys.up = keys.down = false;
      steerHold.left = steerHold.right = steerHold.up = steerHold.down = false;
      biteHold.down = false;
      biteQueued = false;
    };
    window.addEventListener("blur", releaseInput);

    const onPointerDown = (event: PointerEvent) => {
      if (document.querySelector('[data-gameplay-blocking="true"]')) return;
      const { mode, onFollow: follow } = propsRef.current;
      if (mode === "play") {
        if (event.button !== 0) return;
        biteQueued = true;
        return;
      }
      if (mode !== "watch") return;
      const rect = renderer.domElement.getBoundingClientRect();
      _ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      _ray.setFromCamera(_ndc, camera);
      const hits = _ray.intersectObjects(
        [...actors.values()].map((actor) => actor.rig.root),
        true,
      );
      if (hits.length === 0) {
        follow(null);
        return;
      }
      let node: THREE.Object3D | null = hits[0].object;
      while (node && node.userData.fishId == null) node = node.parent;
      if (node?.userData.fishId) follow(String(node.userData.fishId));
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    let tickAcc = 0;
    const chase: ChasePose = { x: 0, y: 12, z: 22, yaw: 0, pitch: 0 };
    const chaseTarget: ChasePose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    let chaseId = "";
    let layoutAt = -Infinity;
    let headsCache: ScreenBox[] = [];
    let radarCache: ScreenBox[] = [];
    let dockCache: ScreenBox[] = [];
    let cardCache: ScreenBox[] = [];
    let labelBlocks: ScreenBox[] = [];
    let mountLeft = 0;
    let mountTop = 0;

    const acquire = (actor: Actor): string | null => {
      const fish = game.fishById(actor.id);
      if (!fish) return null;
      let best = 1e9;
      let found: string | null = null;
      for (const other of actors.values()) {
        if (other.id === actor.id) continue;
        const victim = game.fishById(other.id);
        if (!victim || game.allied(fish, victim)) continue;
        if (Math.abs(actor.pos.y - other.pos.y) > DEPTH_BAND) continue;
        const dist = actor.pos.distanceTo(other.pos);
        const reach = biteReach(biteRadius(fish.range), victim.dodge);
        if (
          !mouthBite(fish.x, fish.z, fish.faceDx, fish.faceDz, fish.size, victim.x, victim.z, reach)
        ) {
          continue;
        }
        if (dist < best - 0.01 || (Math.abs(dist - best) <= 0.01 && (found === null || other.id < found))) {
          best = dist;
          found = other.id;
        }
      }
      return found;
    };

    const paintArc = (sx: number, sz: number, faceDx: number, faceDz: number, reach: number) => {
      const face = { dx: faceDx, dz: faceDz };
      const from = { sx, sz };
      const span = Math.max(1, Math.trunc(reach));
      const lit = new Set<string>();
      for (let dx = -span; dx <= span; dx++) {
        for (let dz = -span; dz <= span; dz++) {
          if (inBiteArc(from, { sx: sx + dx, sz: sz + dz }, face, span)) lit.add(`${dx},${dz}`);
        }
      }
      let n = 0;
      const y = 0.25;
      const push = (x0: number, z0: number, x1: number, z1: number) => {
        if (n + 6 > arcPositions.length) return;
        arcPositions[n++] = x0;
        arcPositions[n++] = y;
        arcPositions[n++] = z0;
        arcPositions[n++] = x1;
        arcPositions[n++] = y;
        arcPositions[n++] = z1;
      };
      for (const key of lit) {
        const [dx, dz] = key.split(",").map(Number);
        const x0 = (sx + dx) * SECTOR;
        const z0 = (sz + dz) * SECTOR;
        const x1 = x0 + SECTOR;
        const z1 = z0 + SECTOR;
        if (!lit.has(`${dx},${dz - 1}`)) push(x0, z0, x1, z0);
        if (!lit.has(`${dx + 1},${dz}`)) push(x1, z0, x1, z1);
        if (!lit.has(`${dx},${dz + 1}`)) push(x1, z1, x0, z1);
        if (!lit.has(`${dx - 1},${dz}`)) push(x0, z1, x0, z0);
      }
      const nose = sectorCenter(sx, sz);
      push(nose.x, nose.z, nose.x + faceDx * SECTOR, nose.z + faceDz * SECTOR);
      arcGeom.setDrawRange(0, n / 3);
      arcGeom.getAttribute("position").needsUpdate = true;
    };

    const separate = () => {
      const list = [...actors.values()];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const left = game.fishById(list[i].id);
          const right = game.fishById(list[j].id);
          if (left?.remote || right?.remote) continue;
          if (Math.abs(list[i].pos.y - list[j].pos.y) > DEPTH_BAND) continue;
          _to.copy(list[j].pos).sub(list[i].pos);
          _to.y = 0;
          const dist = _to.length();
          const min = 4.2 + SPECIES[game.fishById(list[i].id)?.rarity ?? "common"].scale * 2.4;
          if (dist > 0.001 && dist < min) {
            _to.multiplyScalar(((min - dist) / dist) * 0.5);
            list[i].pos.sub(_to);
            list[j].pos.add(_to);
          }
        }
      }
    };

    const stepAi = (actor: Actor, nowMs: number, dt: number) => {
      const fish = game.fishById(actor.id);
      if (!fish) return;
      const now = Date.now();
      actor.cruising = true;
      if (nowMs > actor.nextThink) {
        actor.nextThink = nowMs + 900;
        let prey: Actor | null = null;
        let preyBite = Infinity;
        let threat: Actor | null = null;
        let threatCells = Infinity;
        for (const other of actors.values()) {
          if (other.id === actor.id) continue;
          const otherFish = game.fishById(other.id);
          if (!otherFish || game.allied(fish, otherFish)) continue;
          const cells = Math.max(Math.abs(otherFish.sx - fish.sx), Math.abs(otherFish.sz - fish.sz));
          if (cells > 3) continue;
          if (otherFish.bite + PREY_BITE_GAP < fish.bite && (otherFish.bite < preyBite || (otherFish.bite === preyBite && prey && other.id < prey.id))) {
            prey = other;
            preyBite = otherFish.bite;
          }
          if (otherFish.bite > fish.bite + THREAT_BITE_GAP && cells < threatCells) {
            threat = other;
            threatCells = cells;
          }
        }
        actor.flee = threat !== null;
        actor.hunt = threat !== null || prey !== null;
        if (threat) {
          actor.goal.set(actor.pos.x * 2 - threat.pos.x, SWIM_Y, actor.pos.z * 2 - threat.pos.z);
        } else if (prey) {
          actor.goal.set(prey.pos.x, SWIM_Y, prey.pos.z);
        } else {
          const seq = Number(actor.id.split("-").pop()) || 1;
          const phase = ((seq * 997) % 1000) / 1000 * Math.PI * 2 + nowMs * 0.00022;
          const radius = 14 + (seq % 5) * 4;
          const school = sectorCenter(0, 1);
          actor.goal.set(school.x + Math.cos(phase) * radius, SWIM_Y, school.z + Math.sin(phase) * radius);
        }
      }
      const aimX = actor.goal.x - actor.pos.x;
      const aimZ = actor.goal.z - actor.pos.z;
      const desired = yawFromDirection(aimX, aimZ);
      const turn = turnRateRad(fish.speed, fish.size, fish.streak) * dt;
      actor.yaw = dampAngle(actor.yaw, desired, turn);
      actor.pitch = 0;
      forwardFromAim(actor.yaw, 0, _fwd);
      if (actor.hunt && now >= fish.nextBurstAt) game.tryBurst(actor.id, now);
      const units = worldUnitsPerSecond(fish.speed, fish.streak);
      const burst = now < fish.burstUntil ? 7 / 4 : 1;
      actor.pos.addScaledVector(_fwd, units * dt * burst);
    };

    const stepPlayer = (actor: Actor, dt: number) => {
      const fish = game.fishById(actor.id);
      if (!fish) return;
      const forward = (keys.up || steerHold.up ? 1 : 0) - (keys.down || steerHold.down ? 1 : 0);
      const strafe = (keys.right || steerHold.right ? 1 : 0) - (keys.left || steerHold.left ? 1 : 0);
      // Same yaw as the chase camera. Mouse scales the saved turn rate around its default.
      // X holds the body still, so the nose does not keep turning.
      const follow = steerSettings.turn * (steerSettings.mouse / MOUSE_DEFAULT);
      const turnCap = cruiseHold.halted
        ? 0
        : turnRateRad(fish.speed, fish.size, fish.streak) * Math.max(0, dt) * follow;
      const pace = cruisePace(
        worldUnitsPerSecond(fish.speed, fish.streak),
        false,
        Date.now() < fish.burstUntil,
        cruiseHold.halted,
      );
      const step = stepSwim(
        { yaw: actor.yaw, speed: actor.speed, yawRate: actor.yawRate },
        forward,
        strafe,
        turnCap,
        pace,
        dt,
      );
      actor.yaw = step.yaw;
      actor.speed = step.speed;
      actor.yawRate = step.yawRate;
      actor.pitch = 0;
      actor.cruising = step.moving;
      actor.pos.x += step.dx;
      actor.pos.z += step.dz;
    };

    const frame = ({ time: nowMs, dt }: StageFrame) => {
      const { mode, followId: follow } = propsRef.current;
      renderer.domElement.style.cursor = mode === "play" ? "crosshair" : "";
      if (mode !== "play" || document.querySelector('[data-gameplay-blocking="true"]')) {
        releaseInput();
      }
      const now = Date.now();
      if ((mode !== "play" || !game.activeFishId) && cruiseHold.halted) setCruiseHalted(false);
      tickAcc += dt;
      if (tickAcc > 0.4) {
        tickAcc = 0;
        game.tick(now);
      }

      const present = new Set<string>();
      let index = 0;
      for (const fish of game.living()) {
        const show = game.shown(fish);
        if (!show) continue;
        present.add(fish.id);
        ensure(fish.id, index);
        index += 1;
      }
      for (const id of [...actors.keys()]) {
        if (!present.has(id)) drop(id);
      }

      for (const actor of actors.values()) {
        const fish = game.fishById(actor.id);
        if (!fish) continue;
        const playing = mode === "play" && fish.ownerId === PLAYER_ID && fish.id === game.activeFishId;
        if (fish.remote) {
          actor.speed = 0;
          actor.yawRate = 0;
          actor.pos.x = fish.x;
          actor.pos.z = fish.z;
          actor.yaw = fish.yaw ?? yawFromDirection(fish.faceDx, fish.faceDz);
          actor.pitch = 0;
          actor.cruising = true;
          actor.pos.y = SWIM_Y;
          continue;
        }
        if (playing) stepPlayer(actor, dt);
        else {
          actor.speed = 0;
          actor.yawRate = 0;
          if (fish.ai) stepAi(actor, nowMs, dt);
        }
        const dist = Math.hypot(actor.pos.x, actor.pos.z);
        if (dist > ARENA) {
          const scale = ARENA / dist;
          actor.pos.x *= scale;
          actor.pos.z *= scale;
        }
        actor.pitch = 0;
        actor.pos.y = SWIM_Y;
      }
      separate();

      let aimTarget: string | null = null;
      for (const actor of actors.values()) {
        const fish = game.fishById(actor.id);
        if (!fish || fish.remote) continue;
        forwardFromAim(actor.yaw, actor.pitch, _fwd);
        const held = game.commitPose(actor.id, actor.pos.x, actor.pos.z, _fwd.x, _fwd.z, now);
        actor.pos.x = held.x;
        actor.pos.z = held.z;
      }

      const biteActors = [...actors.values()].sort((a, b) => {
        if (a.id === game.activeFishId) return -1;
        if (b.id === game.activeFishId) return 1;
        return 0;
      });
      const clickBite = biteQueued;
      biteQueued = false;
      for (const actor of biteActors) {
        const fish = game.fishById(actor.id);
        if (!fish) continue;
        const playing = mode === "play" && fish.ownerId === PLAYER_ID && fish.id === game.activeFishId;
        const target = acquire(actor);
        if (playing) aimTarget = target;
        const manual = playing && (biteHold.down || clickBite);
        const hunting = actor.hunt && !actor.flee;
        const auto = !playing && !fish.remote && game.shown(fish) && hunting;
        const remoteTarget = target ? game.fishById(target)?.remote === true : false;
        if ((manual || (auto && !remoteTarget)) && fish.matchId && now >= fish.nextBiteAt) {
          if (target) {
            const result = game.tryBite(actor.id, target, now);
            if (result.ok) {
              actor.biteUntil = now + 240;
              if (playing) {
                const damage = result.detail === "kill" ? 0 : Number(result.detail);
                lockTarget(target, now + TARGET_LOCK_MS, Number.isFinite(damage) ? damage : 0);
                if (result.detail === "kill") void awardChainKill(game, actor.id, target);
              }
            }
          } else {
            const shelterId = game.shelterInMouth(actor.id, now);
            if (shelterId) {
              const result = game.tryGnaw(actor.id, shelterId, now);
              if (result.ok) actor.biteUntil = now + 240;
            }
          }
        }
      }

      const selfId = mode === "play" ? game.activeFishId : null;
      const selfFish = selfId ? game.fishById(selfId) : undefined;
      if (selfFish) {
        const victim = aimTarget ? game.fishById(aimTarget) : undefined;
        const preview = victim ? game.previewStrike(selfFish.id, victim.id, now) : null;
        const cell = sectorOf(selfFish.x, selfFish.z);
        publishAim({
          targetId: victim?.id ?? null,
          targetName: victim?.name ?? "",
          targetHp: victim?.hp ?? 0,
          targetHpMax: victim?.hpMax ?? 0,
          targetPool: victim?.poolUgnot ?? 0,
          damage: preview?.damage ?? 0,
          cooldownMs: Math.max(0, selfFish.nextBiteAt - now),
          legal: preview?.legal ?? false,
          sx: cell.sx,
          sz: cell.sz,
        });
        paintArc(cell.sx, cell.sz, selfFish.faceDx, selfFish.faceDz, Math.max(1, Math.round(selfFish.range)));
      } else if (mode === "watch" && follow) {
        const watched = game.fishById(follow);
        if (watched) {
          const cell = sectorOf(watched.x, watched.z);
          paintArc(cell.sx, cell.sz, watched.faceDx, watched.faceDz, Math.max(1, Math.round(watched.range)));
        } else arcGeom.setDrawRange(0, 0);
      } else {
        arcGeom.setDrawRange(0, 0);
        publishAim({
          targetId: null,
          targetName: "",
          targetHp: 0,
          targetHpMax: 0,
          targetPool: 0,
          damage: 0,
          cooldownMs: 0,
          legal: false,
          sx: 0,
          sz: 0,
        });
      }

      let focus: Actor | undefined;
      if (mode === "play" && game.activeFishId) focus = actors.get(game.activeFishId);
      else if (mode === "watch" && follow) focus = actors.get(follow);

      if (focus) {
        const radius = focus.rig.bounds.radius * 2.2;
        const narrow = Math.max(1, 1 / camera.aspect);
        const dist = Math.max(10, radius * 2.6 * narrow);
        const height = Math.max(3.6, focus.rig.bounds.height * 2.2 * 0.8);
        const switched = chaseId !== focus.id;
        chaseId = focus.id;
        chaseTarget.x = focus.pos.x;
        chaseTarget.y = focus.pos.y;
        chaseTarget.z = focus.pos.z;
        chaseTarget.yaw = focus.yaw;
        chaseTarget.pitch = focus.pitch;
        followPose(chase, chaseTarget, switched ? 1 : 1 - Math.exp(-Math.max(0, dt) / 0.08), chase);
        placeChaseCamera(chase, dist, height, _cam, _look);
        camera.position.copy(_cam);
        const camBed = floorY(camera.position.x, camera.position.z) + 0.8;
        if (camera.position.y < camBed) camera.position.y = camBed;
        if (camera.position.y > WATER_LEVEL - 0.35) camera.position.y = WATER_LEVEL - 0.35;
        camera.lookAt(_look);
      } else {
        _cam.set(reduce ? 0 : Math.sin(nowMs * 0.00008) * 6, 14, 28);
        camera.position.lerp(_cam, 1 - Math.exp(-1.4 * dt));
        camera.lookAt(0, 0, 0);
      }

      const refreshLayout = nowMs - layoutAt > 200;
      if (refreshLayout) layoutAt = nowMs;
      const plates: (StakePlate & { el: HTMLDivElement })[] = [];
      const threatIds = new Set<string>();
      const threatBite = new Set<string>();
      const playerActor = mode === "play" && game.activeFishId ? actors.get(game.activeFishId) : undefined;
      const playerFish = playerActor ? game.fishById(playerActor.id) : undefined;
      if (playerActor && playerFish) {
        for (const actor of actors.values()) {
          if (actor.id === playerActor.id) continue;
          const fish = game.fishById(actor.id);
          if (!fish || game.allied(playerFish, fish)) continue;
          if (Math.abs(actor.pos.y - playerActor.pos.y) > DEPTH_BAND) continue;
          const biting = mouthBite(
            fish.x,
            fish.z,
            fish.faceDx,
            fish.faceDz,
            fish.size,
            playerFish.x,
            playerFish.z,
            biteRadius(fish.range),
          );
          let preyId: string | null = null;
          let preyBite = Infinity;
          let bigger = false;
          for (const other of actors.values()) {
            if (other.id === actor.id) continue;
            const otherFish = game.fishById(other.id);
            if (!otherFish || game.allied(fish, otherFish)) continue;
            const away = Math.max(Math.abs(otherFish.sx - fish.sx), Math.abs(otherFish.sz - fish.sz));
            if (away > 3) continue;
            if (otherFish.bite > fish.bite + THREAT_BITE_GAP) bigger = true;
            if (otherFish.bite + PREY_BITE_GAP < fish.bite && (otherFish.bite < preyBite || (otherFish.bite === preyBite && preyId !== null && other.id < preyId))) {
              preyId = other.id;
              preyBite = otherFish.bite;
            }
          }
          if (!biting && (bigger || preyId !== playerActor.id)) continue;
          threatIds.add(actor.id);
          if (biting) threatBite.add(actor.id);
        }
      }
      const viewW = mount.clientWidth;
      const viewH = mount.clientHeight;
      for (const actor of actors.values()) {
        const fish = game.fishById(actor.id);
        if (!fish) continue;
        actor.rig.root.position.copy(actor.pos);
        aimQuaternion(actor.yaw, actor.pitch, actor.rig.root.quaternion);
        const biting = now < actor.biteUntil;
        const playerHalted = cruiseHold.halted && mode === "play" && actor.id === game.activeFishId;
        const burstPose = playerHalted ? 0 : now < fish.burstUntil ? BURST_MULT_NUM / BURST_MULT_DEN : 1;
        const wag = actor.cruising && !playerHalted ? (worldUnitsPerSecond(fish.speed, fish.streak) / 12) * burstPose : 0;
        const biteProgress = biting ? 1 - (actor.biteUntil - now) / 240 : 0;
        const biteEnvelope = biting ? Math.sin(Math.PI * Math.min(1, Math.max(0, biteProgress))) : 0;
        poseFish(actor.rig, nowMs * 0.001, biteEnvelope, wag, dt, reduce);
        const hp = Math.max(0, fish.hp / fish.hpMax);
        const safe = (value: string) => value.replace(/[&<>"]/g, (ch) => (
          ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;"
        ));
        const mine = game.fishById(game.activeFishId ?? "");
        const heldLock = readTargetLock();
        const heldNow = heldLock.id === actor.id && now < heldLock.until;
        actor.label.classList.toggle("locked", actor.id === aimTarget || heldNow);
        actor.label.classList.toggle("you", actor.id === game.activeFishId);
        actor.label.classList.toggle("ally", mine != null && fish.id !== mine.id && game.allied(mine, fish));
        actor.label.classList.toggle("threat", threatIds.has(actor.id));
        const pool = formatGnot(fish.poolUgnot);
        const you = actor.id === game.activeFishId;
        const shown = game.displayName(fish);
        const code = game.flagCode(fish.ownerId);
        const flagSrc = flagImageSrc(code);
        const flag = flagSrc ? `<img class="flag-img" alt="" width="18" height="14" src="${flagSrc}">` : "";
        const stake = fish.remote
          ? ""
          : `<span class="stake" aria-label="${pool} USDC"><span class="amt">${pool}</span><span class="unit">USDC</span></span>`;
        const sig = `${shown}|${code}|${fish.remote ? "room" : pool}|${you ? "you" : "other"}`;
        if (actor.label.dataset.sig !== sig) {
          actor.label.dataset.sig = sig;
          delete actor.label.dataset.pw;
          const barHtml = you ? "" : `<span class="bar"><i></i></span>`;
          actor.label.innerHTML = `<span class="head">${flag}<b>${safe(shown)}</b>${stake}</span>${barHtml}`;
        }
        const bar = you ? null : actor.label.querySelector("i");
        if (bar instanceof HTMLElement) bar.style.width = `${(hp * 100).toFixed(1)}%`;
        _look.copy(actor.pos);
        _look.y += actor.rig.bounds.height * 2.2 * 0.6;
        _look.project(camera);
        const sx = (_look.x * 0.5 + 0.5) * viewW;
        const sy = (-_look.y * 0.5 + 0.5) * viewH;
        const near = _look.z < 1 && sx > -120 && sx < viewW + 120 && sy > -80 && sy < viewH + 80;
        if (!near) {
          actor.label.style.display = "none";
        } else {
          const full = sx > 24 && sx < viewW - 24 && sy > 64 && sy < viewH - 168;
          actor.label.classList.toggle("compact", !full);
          actor.label.style.display = "block";
          const pri = heldNow ? 3 : actor.id === aimTarget ? 2 : actor.id === game.activeFishId ? 1 : 0;
          plates.push({ el: actor.label, cx: sx, y: sy, w: 0, h: 0, pri });
        }
      }
      if (refreshLayout) {
        const mountBox = mount.getBoundingClientRect();
        mountLeft = mountBox.left;
        mountTop = mountBox.top;
        const uiBoxes = (selector: string): ScreenBox[] => Array.from(document.querySelectorAll(selector)).flatMap((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return [];
          return [{ l: rect.left - mountLeft, t: rect.top - mountTop,
            r: rect.right - mountLeft, b: rect.bottom - mountTop }];
        });
        headsCache = uiBoxes(".topbar, .identity, .pursebox");
        radarCache = uiBoxes(".radar, .radar-side");
        dockCache = uiBoxes(".dock, .corner-social, .target-hp");
        cardCache = uiBoxes(".card");
      }
      const heads = headsCache;
      const radarBoxes = radarCache;
      const dockBoxes = dockCache;
      const obstacles = [...radarBoxes, ...dockBoxes, ...cardCache];
      if (plates.length > 0) {
        for (const plate of plates) {
          if (refreshLayout || !plate.el.dataset.pw) {
            plate.el.dataset.pw = String(plate.el.offsetWidth);
            plate.el.dataset.ph = String(plate.el.offsetHeight);
          }
          plate.w = Number(plate.el.dataset.pw) || 1;
          plate.h = Number(plate.el.dataset.ph) || 1;
        }
        const view: ScreenBox = {
          l: 8,
          t: Math.max(64, ...heads.map((box) => box.b)) + 4,
          r: viewW - 8,
          b: viewH - 8,
        };
        settleStakePlates(plates, view, obstacles);
        for (const plate of plates) {
          plate.el.style.left = `${plate.cx}px`;
          plate.el.style.top = `${plate.y}px`;
        }
      }

      const biteLock = readTargetLock();
      const lockedActor = biteLock.id && now < biteLock.until ? actors.get(biteLock.id) : undefined;
      const lockedFish = lockedActor ? game.fishById(lockedActor.id) : undefined;
      if (!lockedActor || !lockedFish) {
        targetLock.style.display = "none";
      } else {
        const markY = lockedActor.pos.y + 0.45;
        let fdx = lockedFish.faceDx;
        let fdz = lockedFish.faceDz;
        if (fdx === 0 && fdz === 0) fdz = -1;
        _look.set(lockedActor.pos.x, markY, lockedActor.pos.z);
        _look.project(camera);
        const here = {
          x: (_look.x * 0.5 + 0.5) * viewW,
          y: (-_look.y * 0.5 + 0.5) * viewH,
          behind: _look.z > 1,
        };
        _look.set(lockedActor.pos.x + fdx * 6, markY, lockedActor.pos.z + fdz * 6);
        _look.project(camera);
        const ahead = {
          x: (_look.x * 0.5 + 0.5) * viewW,
          y: (-_look.y * 0.5 + 0.5) * viewH,
        };
        const inset = 36;
        const onScreen = !here.behind && here.x >= inset && here.x <= viewW - inset && here.y >= 72 && here.y <= viewH - 80;
        let x = here.x;
        let y = here.y;
        let angle = Math.atan2(ahead.y - here.y, ahead.x - here.x);
        if (!onScreen) {
          let tx = here.x;
          let ty = here.y;
          if (here.behind) {
            tx = viewW - tx;
            ty = viewH - ty;
          }
          const cx = viewW / 2;
          const cy = viewH / 2;
          const dx = tx - cx;
          const dy = ty - cy;
          const maxX = Math.max(1, viewW / 2 - inset);
          const maxY = Math.max(1, viewH / 2 - 72);
          const scale = Math.max(Math.abs(dx) / maxX, Math.abs(dy) / maxY, 0.001);
          x = Math.min(viewW - inset, Math.max(inset, cx + dx / scale));
          y = Math.min(viewH - 72, Math.max(72, cy + dy / scale));
          angle = Math.atan2(dy, dx);
        }
        targetLock.style.display = "block";
        targetLock.style.left = `${x}px`;
        targetLock.style.top = `${y}px`;
        targetArrow.style.transform = `rotate(${angle}rad)`;
      }

      let edgeActor: Actor | undefined;
      let edgeBite = false;
      let edgeDist = Infinity;
      if (playerActor) {
        for (const actor of actors.values()) {
          if (!threatIds.has(actor.id) || actor.label.style.display !== "none") continue;
          const biting = threatBite.has(actor.id);
          const dist = actor.pos.distanceTo(playerActor.pos);
          const nearer = dist < edgeDist - 0.01 || (Math.abs(dist - edgeDist) <= 0.01 && edgeActor !== undefined && actor.id < edgeActor.id);
          if (!edgeActor || (biting && !edgeBite) || (biting === edgeBite && nearer)) {
            edgeActor = actor;
            edgeBite = biting;
            edgeDist = dist;
          }
        }
      }
      if (!edgeActor) {
        edgeTick.style.display = "none";
      } else {
        _look.copy(edgeActor.pos);
        _look.y += 1.15;
        _look.project(camera);
        const w = viewW;
        const h = viewH;
        let tx = (_look.x * 0.5 + 0.5) * w;
        let ty = (-_look.y * 0.5 + 0.5) * h;
        if (_look.z > 1) {
          tx = w - tx;
          ty = h - ty;
        }
        const safe: ScreenBox = {
          l: 28,
          t: Math.max(84, ...heads.map((box) => box.b)) + 16,
          r: Math.min(w - 28, ...radarBoxes.map((box) => box.l - 18)),
          b: Math.min(h - 28, ...dockBoxes.map((box) => box.t - 22)),
        };
        if (refreshLayout) {
          labelBlocks = [];
          for (const node of labelLayer.children) {
            const el = node as HTMLElement;
            if (el.style.display === "none") continue;
            const rect = el.getBoundingClientRect();
            labelBlocks.push({
              l: rect.left - mountLeft,
              t: rect.top - mountTop,
              r: rect.right - mountLeft,
              b: rect.bottom - mountTop,
            });
          }
        }
        const blocks = [...obstacles, ...labelBlocks];
        const crowded = (x: number, y: number) => blocks.some((box) => x > box.l - 16 && x < box.r + 16 && y > box.t - 10 && y < box.b + 10);
        if (safe.l >= safe.r - 4 || safe.t >= safe.b - 4) {
          edgeTick.style.display = "none";
        } else {
          let spot = edgeTickPoint(w / 2, h / 2, tx, ty, safe);
          if (crowded(spot.x, spot.y)) {
            const alongY = Math.abs(spot.x - safe.l) < 3 || Math.abs(spot.x - safe.r) < 3;
            let clear = false;
            for (const sign of [1, -1]) {
              for (let step = 1; step <= 8; step++) {
                const x = Math.min(safe.r, Math.max(safe.l, spot.x + (alongY ? 0 : sign * step * 24)));
                const y = Math.min(safe.b, Math.max(safe.t, spot.y + (alongY ? sign * step * 24 : 0)));
                if (!crowded(x, y)) {
                  spot = { x, y, angle: spot.angle };
                  clear = true;
                  break;
                }
              }
              if (clear) break;
            }
            if (!clear) spot = { x: Number.NaN, y: Number.NaN, angle: spot.angle };
          }
          if (Number.isNaN(spot.x)) {
            edgeTick.style.display = "none";
          } else {
            edgeTick.style.display = "block";
            edgeTick.classList.toggle("hot", edgeBite);
            edgeTick.style.left = `${spot.x}px`;
            edgeTick.style.top = `${spot.y}px`;
            edgeTick.style.transform = `translate(-50%, -50%) rotate(${spot.angle}rad)`;
          }
        }
      }

      if (radarCtx) {
        const w = radar.width;
        const h = radar.height;
        radarCtx.clearRect(0, 0, w, h);
        radarCtx.fillStyle = "rgba(4, 18, 24, 0.55)";
        radarCtx.beginPath();
        radarCtx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
        radarCtx.fill();
        const origin = focus?.pos;
        for (const actor of actors.values()) {
          const fish = game.fishById(actor.id);
          if (!fish) continue;
          const dx = origin ? actor.pos.x - origin.x : actor.pos.x;
          const dz = origin ? actor.pos.z - origin.z : actor.pos.z;
          const { x: px, y: py } = radarBlip(dx, dz, ARENA, w, h);
          const focusFish = focus ? game.fishById(focus.id) : null;
          const allied = focusFish != null && fish.id !== focusFish.id && game.allied(focusFish, fish);
          const blip = actor.id === focus?.id
            ? "#ffffff"
            : threatIds.has(actor.id)
              ? "#ff6d7d"
              : actor.id === aimTarget
                ? "#f0c14a"
                : allied
                  ? "#7eb6ff"
                  : "#7ef0c8";
          radarCtx.fillStyle = blip;
          radarCtx.beginPath();
          radarCtx.arc(px, py, actor.id === focus?.id ? 3.4 : 2.3, 0, Math.PI * 2);
          radarCtx.fill();
        }
        const springNow = springSlot(now);
        if (springNow) {
          const dx = origin ? springNow.x - origin.x : springNow.x;
          const dz = origin ? springNow.z - origin.z : springNow.z;
          const raw = radarBlip(dx, dz, ARENA, w, h);
          const mark = clampToDisc(raw.x, raw.y, w / 2, h / 2, w / 2 - 6);
          radarCtx.strokeStyle = "#9ff3d0";
          radarCtx.lineWidth = 1.5;
          radarCtx.beginPath();
          radarCtx.arc(mark.x, mark.y, 4.2, 0, Math.PI * 2);
          radarCtx.moveTo(mark.x - 2.4, mark.y);
          radarCtx.lineTo(mark.x + 2.4, mark.y);
          radarCtx.moveTo(mark.x, mark.y - 2.4);
          radarCtx.lineTo(mark.x, mark.y + 2.4);
          radarCtx.stroke();
        }
      }

      water.time.value = nowMs * 0.001 * (reduce ? 0.3 : 1);
      water.detail.value = readQuality() === "low" ? 0.35 : 1;
      for (const shelter of game.shelters) {
        const standing = scene.getObjectByName(`cover-${shelter.id}`);
        const rubble = scene.getObjectByName(`rubble-${shelter.id}`);
        const up = shelter.hp > 0;
        if (standing) standing.visible = up;
        if (rubble) rubble.visible = !up;
      }
      const spot = springSlot(now);
      springMesh.visible = spot !== null;
      if (!spot) {
        springMark.style.display = "none";
        springEdge.style.display = "none";
        springBorn = -1;
      } else {
        springMesh.position.set(spot.x, 0.8, spot.z);
        if (spot.born !== springBorn) {
          springBorn = spot.born;
          springMark.classList.remove("pop");
          if (!reduce) {
            void springMark.offsetWidth;
            springMark.classList.add("pop");
          }
        }
        _look.set(spot.x, 1.6, spot.z);
        _look.project(camera);
        const w = viewW || 1;
        const h = viewH || 1;
        const projected = viewPoint(_look.x, _look.y, w, h);
        if (inView(_look.z, projected.x, projected.y, w, h, 28)) {
          springEdge.style.display = "none";
          springMark.style.display = "grid";
          springMark.style.left = `${projected.x}px`;
          springMark.style.top = `${projected.y}px`;
        } else {
          springMark.style.display = "none";
          let tx = projected.x;
          let ty = projected.y;
          if (_look.z > 1) {
            tx = w - tx;
            ty = h - ty;
          }
          const safe: ScreenBox = { l: 36, t: 72, r: w - 36, b: h - 88 };
          if (safe.l < safe.r && safe.t < safe.b) {
            const guide = edgeTickPoint(w / 2, h / 2, tx, ty, safe);
            springEdge.style.display = "grid";
            springEdge.style.left = `${guide.x}px`;
            springEdge.style.top = `${guide.y}px`;
          } else {
            springEdge.style.display = "none";
          }
        }
      }
      for (const pop of game.takeFx()) {
        const node = document.createElement("div");
        node.className = `fx-pop ${pop.kind}`;
        node.textContent = pop.text;
        _look.set(pop.x, 1.6, pop.z);
        _look.project(camera);
        const w = viewW || 1;
        const h = viewH || 1;
        node.style.left = `${(_look.x * 0.5 + 0.5) * w}px`;
        node.style.top = `${(-_look.y * 0.5 + 0.5) * h}px`;
        fxLayer.appendChild(node);
        window.setTimeout(() => node.remove(), 1100);
      }
      const day = daylightAt(hourOfDay(new Date(nowMs)));
      lamps.apply(day);
      water.setDay(day);
      scenery.setDaylight(day);
      scene.environmentIntensity = 0.22 + 0.1 * (day.sunIntensity / 2.1);
      scenery.update(nowMs * 0.001 * (reduce ? 0.3 : 1));
    };
    stage.start(frame);

    return () => {
      setCruiseHalted(false);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseInput);
      releaseInput();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      for (const id of [...actors.keys()]) drop(id);
      edgeTick.remove();
      targetLock.remove();
      springMark.remove();
      springEdge.remove();
      fxLayer.remove();
      springGeo.dispose();
      springMat.dispose();
      scene.remove(springMesh);
      unsubscribeQuality();
      scenery.dispose();
      scene.remove(arcLines);
      arcGeom.dispose();
      (arcLines.material as THREE.Material).dispose();
      publishAim({
        targetId: null,
        targetName: "",
        targetHp: 0,
        targetHpMax: 0,
        targetPool: 0,
        damage: 0,
        cooldownMs: 0,
        legal: false,
        sx: 0,
        sz: 0,
      });
      stage.dispose();
      labelLayer.remove();
    };
  }, [game]);

  return (
    <div className="sea" ref={mountRef}>
      <canvas className="radar" ref={radarRef} width={128} height={128} />
    </div>
  );
}
