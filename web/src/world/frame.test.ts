import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { facingFromForward, inBiteArc } from "../sim/rules";
import { aimQuaternion, blendAngle, dampAngle, followPose, forwardFromAim, forwardFromYaw, PITCH_LIMIT, placeChaseCamera, stepSwim, swimWish, yawFromDirection, type SwimGlide } from "./frame";

describe("fish frame", () => {
  it("matches Object3D local -Z at yaw 0 and a left turn", () => {
    const group = new THREE.Group();
    const local = new THREE.Vector3(0, 0, -1);
    const fromHelper = new THREE.Vector3();

    group.rotation.y = 0;
    const faced = local.clone().applyQuaternion(group.quaternion);
    forwardFromYaw(0, fromHelper);
    expect(faced.x).toBeCloseTo(0);
    expect(faced.z).toBeCloseTo(-1);
    expect(fromHelper.distanceTo(faced)).toBeLessThan(1e-6);

    group.rotation.y = Math.PI / 2;
    const left = local.clone().applyQuaternion(group.quaternion);
    forwardFromYaw(Math.PI / 2, fromHelper);
    expect(left.x).toBeCloseTo(-1);
    expect(left.z).toBeCloseTo(0, 5);
    expect(fromHelper.distanceTo(left)).toBeLessThan(1e-6);
  });

  it("maps W A S D onto the nose and its right", () => {
    const out = new THREE.Vector3();
    swimWish(0, 1, 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
    swimWish(0, -1, 0, out);
    expect(out.z).toBeCloseTo(1);
    expect(out.x).toBeCloseTo(0);
    swimWish(0, 0, 1, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
    swimWish(0, 0, -1, out);
    expect(out.x).toBeCloseTo(-1);
    expect(out.z).toBeCloseTo(0);
    swimWish(Math.PI / 2, 0, 1, out);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(-1);
  });

  it("eases along the nose, arcs on A and D, and coasts after release", () => {
    const dt = 1 / 60;
    const pace = 16;
    const turnRate = 2;
    const still = (): SwimGlide => ({ yaw: 0, speed: 0, yawRate: 0 });

    const glideFor = (glide: SwimGlide, forward: number, strafe: number, seconds: number, paceNow = pace, turnNow = turnRate) => {
      let body = glide;
      let x = 0;
      let z = 0;
      let align = 1;
      const group = new THREE.Group();
      const local = new THREE.Vector3(0, 0, -1);
      const faced = new THREE.Vector3();
      const steps = Math.round(seconds / dt);
      for (let i = 0; i < steps; i += 1) {
        const step = stepSwim(body, forward, strafe, turnNow * dt, paceNow, dt);
        body = { yaw: step.yaw, speed: step.speed, yawRate: step.yawRate };
        const travel = Math.hypot(step.dx, step.dz);
        if (travel > 1e-8) {
          group.rotation.y = step.yaw;
          faced.copy(local).applyQuaternion(group.quaternion);
          const along = (faced.x * step.dx + faced.z * step.dz) / travel;
          // Forward steps keep the worst nose match. Reverse steps keep the least-negative one.
          align = step.speed >= 0 ? Math.min(align, along) : Math.max(align === 1 ? along : align, along);
        }
        x += step.dx;
        z += step.dz;
      }
      return { body, x, z, align };
    };

    const noseOf = (yaw: number) => {
      const group = new THREE.Group();
      group.rotation.y = yaw;
      return new THREE.Vector3(0, 0, -1).applyQuaternion(group.quaternion);
    };

    const first = stepSwim(still(), 1, 0, turnRate * dt, pace, dt);
    const instant = pace * dt;
    expect(first.moving).toBe(true);
    expect(first.yaw).toBeCloseTo(0);
    expect(first.dx).toBeCloseTo(0);
    expect(Math.abs(first.dz)).toBeLessThan(instant * 0.2);
    expect(Math.abs(first.dz)).toBeGreaterThan(instant * 0.01);
    expect(first.dz).toBeLessThan(0);
    const firstNose = noseOf(first.yaw);
    const firstTravel = new THREE.Vector3(first.dx, 0, first.dz).normalize();
    expect(firstNose.dot(firstTravel)).toBeGreaterThan(0.9);

    const surge = glideFor(still(), 1, 0, 0.5);
    expect(surge.body.speed).toBeGreaterThan(pace * 0.7);
    expect(surge.body.speed).toBeLessThan(pace);
    expect(surge.z).toBeLessThan(0);
    expect(Math.abs(surge.x)).toBeLessThan(Math.abs(surge.z) * 0.05);
    expect(surge.align).toBeGreaterThan(0.9);

    const coast = glideFor(surge.body, 0, 0, 0.25);
    expect(coast.body.speed).toBeGreaterThan(pace * 0.3);
    expect(coast.z).toBeLessThan(0);
    const settled = glideFor(surge.body, 0, 0, 1.2);
    expect(settled.body.speed).toBeLessThan(pace * 0.15);
    expect(settled.body.speed).toBeGreaterThan(0);

    const left = glideFor(still(), 0, -1, 0.6);
    expect(left.body.yaw).toBeGreaterThan(0.5);
    expect(left.body.yaw).toBeLessThan(turnRate * 0.6 * 0.92);
    expect(left.x).toBeLessThan(0);
    expect(left.z).toBeLessThan(0);
    expect(Math.abs(left.z)).toBeGreaterThan(Math.abs(left.x) * 0.15);
    const leftNose = noseOf(left.body.yaw);
    expect(leftNose.x).toBeLessThan(-0.4);
    expect(left.align).toBeGreaterThan(0.9);

    const right = glideFor(still(), 0, 1, 0.6);
    expect(right.body.yaw).toBeLessThan(-0.5);
    expect(right.x).toBeGreaterThan(0);
    expect(right.z).toBeLessThan(0);
    expect(noseOf(right.body.yaw).x).toBeGreaterThan(0.4);
    expect(right.align).toBeGreaterThan(0.9);

    const back = glideFor(still(), -1, 0, 0.5);
    expect(back.body.speed).toBeLessThan(0);
    expect(back.z).toBeGreaterThan(0);
    expect(Math.abs(back.x)).toBeLessThan(0.01);
    const backNose = noseOf(back.body.yaw);
    expect(backNose.z).toBeLessThan(-0.99);
    expect(back.align).toBeLessThan(-0.9);

    const held = stepSwim({ yaw: 0.4, speed: 9, yawRate: 1.5 }, 1, 0, 0, 0, 0.5);
    expect(held.dx).toBeCloseTo(0);
    expect(held.dz).toBeCloseTo(0);
    expect(held.moving).toBe(false);
    expect(held.yaw).toBeCloseTo(0.4);
    expect(held.speed).toBeCloseTo(0);
    expect(held.yawRate).toBeCloseTo(0);

    const idle = stepSwim({ yaw: 0.4, speed: 0, yawRate: 0 }, 0, 0, turnRate * dt, pace, dt);
    expect(idle.yaw).toBeCloseTo(0.4);
    expect(idle.moving).toBe(false);
    expect(idle.dx).toBeCloseTo(0);
    expect(idle.dz).toBeCloseTo(0);
  });

  it("turns a -Z direction back into yaw 0", () => {
    expect(yawFromDirection(0, -1)).toBeCloseTo(0);
    expect(yawFromDirection(-1, 0)).toBeCloseTo(Math.PI / 2);
  });

  it("quantizes yaw 0 into the forward sector and refuses the cell behind", () => {
    const fwd = new THREE.Vector3();
    forwardFromYaw(0, fwd);
    const face = facingFromForward(fwd.x, fwd.z);
    expect(face).toEqual({ dx: 0, dz: -1 });
    expect(inBiteArc({ sx: 0, sz: 0 }, { sx: 0, sz: -1 }, face)).toBe(true);
    expect(inBiteArc({ sx: 0, sz: 0 }, { sx: 0, sz: 1 }, face)).toBe(false);
    expect(inBiteArc({ sx: 0, sz: 0 }, { sx: 2, sz: -1 }, face)).toBe(false);
    expect(inBiteArc({ sx: 0, sz: 0 }, { sx: 0, sz: 0 }, face)).toBe(true);
    expect(inBiteArc({ sx: 0, sz: 0 }, { sx: 0, sz: -3 }, face, 3)).toBe(true);
    expect(inBiteArc({ sx: 0, sz: 0 }, { sx: 0, sz: 3 }, face, 3)).toBe(false);
    expect(inBiteArc({ sx: 0, sz: 0 }, { sx: 4, sz: -1 }, face, 3)).toBe(false);
  });

  it("takes the short way around", () => {
    const next = dampAngle(0.1, Math.PI * 2 - 0.1, 1);
    expect(next).toBeLessThan(0.1);
  });

  it("blends yaw the short way and keeps the chase frame rigid", () => {
    expect(blendAngle(0, 0.4, 0.5)).toBeCloseTo(0.2);
    expect(blendAngle(0.1, Math.PI * 2 - 0.1, 1)).toBeCloseTo(-0.1);
    const pose = followPose(
      { x: 0, y: 1, z: 0, yaw: 0, pitch: 0 },
      { x: 10, y: 1, z: -8, yaw: 0.4, pitch: 0.4 },
      0.5,
      { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
    );
    expect(pose.x).toBeCloseTo(5);
    expect(pose.z).toBeCloseTo(-4);
    expect(pose.yaw).toBeCloseTo(0.2);
    expect(pose.pitch).toBeCloseTo(0.2);

    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    placeChaseCamera({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, 10, 4, pos, look);
    expect(pos.x).toBeCloseTo(4.2);
    expect(pos.y).toBeCloseTo(4);
    expect(pos.z).toBeCloseTo(8.2);
    expect(look.x).toBeCloseTo(0);
    expect(look.y).toBeCloseTo(0);
    expect(look.z).toBeCloseTo(-3.5);
    const fwd = new THREE.Vector3();
    forwardFromYaw(0, fwd);
    const ahead = look.clone().sub(new THREE.Vector3(0, 0, 0));
    expect(ahead.normalize().dot(fwd)).toBeGreaterThan(0.9);
  });

  it("raises and lowers a -Z nose and matches the mesh quaternion", () => {
    const group = new THREE.Group();
    const local = new THREE.Vector3(0, 0, -1);
    const faced = new THREE.Vector3();
    const fromHelper = new THREE.Vector3();
    for (const [yaw, pitch] of [
      [0, 0],
      [0, 0.4],
      [0, -0.5],
      [Math.PI / 2, 0.4],
      [-1.1, -0.3],
    ] as const) {
      aimQuaternion(yaw, pitch, group.quaternion);
      faced.copy(local).applyQuaternion(group.quaternion);
      forwardFromAim(yaw, pitch, fromHelper);
      expect(fromHelper.distanceTo(faced)).toBeLessThan(1e-6);
    }
    forwardFromAim(0, 0.4, fromHelper);
    expect(fromHelper.y).toBeGreaterThan(0.3);
    expect(fromHelper.z).toBeLessThan(-0.8);
    expect(fromHelper.x).toBeCloseTo(0);
    forwardFromAim(0, -0.4, fromHelper);
    expect(fromHelper.y).toBeLessThan(-0.3);
    expect(fromHelper.z).toBeLessThan(0);
    forwardFromAim(Math.PI / 2, 0, fromHelper);
    expect(fromHelper.x).toBeCloseTo(-1);
    expect(fromHelper.y).toBeCloseTo(0);
    expect(PITCH_LIMIT).toBeGreaterThan(1);
    expect(Math.cos(PITCH_LIMIT)).toBeGreaterThan(0.3);
  });
});
