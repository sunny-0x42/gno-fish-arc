export type StakePlate = {
  cx: number;
  y: number;
  w: number;
  h: number;
  pri: number;
  homeCx?: number;
  homeCy?: number;
};
export type ScreenBox = { l: number; t: number; r: number; b: number };

/** Matches `.tag { transform: translate(-50%, -130%) }`. The visible top sits 1.3 heights above `y`. */
export const STAKE_PLATE_SHIFT_Y = 1.3;

export function stakePlateBox(plate: StakePlate): ScreenBox {
  return {
    l: plate.cx - plate.w / 2,
    r: plate.cx + plate.w / 2,
    t: plate.y - plate.h * STAKE_PLATE_SHIFT_Y,
    b: plate.y - plate.h * (STAKE_PLATE_SHIFT_Y - 1),
  };
}

function overlap(a: ScreenBox, b: ScreenBox): { ox: number; oy: number } | null {
  const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  if (ox <= 0 || oy <= 0) return null;
  return { ox, oy };
}

function keepNearHome(plate: StakePlate) {
  const max = 110;
  const dx = plate.cx - (plate.homeCx ?? plate.cx);
  const dy = plate.y - (plate.homeCy ?? plate.y);
  const dist = Math.hypot(dx, dy);
  if (dist <= max || dist === 0) return;
  plate.cx = (plate.homeCx ?? plate.cx) + (dx / dist) * max;
  plate.y = (plate.homeCy ?? plate.y) + (dy / dist) * max;
}

function clampPlate(plate: StakePlate, view: ScreenBox) {
  const half = plate.w / 2;
  const minCx = view.l + half;
  const maxCx = view.r - half;
  plate.cx = minCx <= maxCx ? Math.min(maxCx, Math.max(minCx, plate.cx)) : (view.l + view.r) / 2;
  const minY = view.t + plate.h * STAKE_PLATE_SHIFT_Y;
  const maxY = view.b + plate.h * (STAKE_PLATE_SHIFT_Y - 1);
  if (minY <= maxY) plate.y = Math.min(maxY, Math.max(minY, plate.y));
}

function separate(a: StakePlate, b: StakePlate, ox: number, oy: number, gap: number) {
  if (ox < oy) {
    const push = ox + gap;
    if (a.pri !== b.pri) {
      const mover = a.pri < b.pri ? a : b;
      const stay = mover === a ? b : a;
      mover.cx += mover.cx <= stay.cx ? -push : push;
    } else {
      const half = push / 2;
      if (a.cx <= b.cx) {
        a.cx -= half;
        b.cx += half;
      } else {
        a.cx += half;
        b.cx -= half;
      }
    }
    return;
  }
  const push = oy + gap;
  if (a.pri !== b.pri) {
    const mover = a.pri < b.pri ? a : b;
    const stay = mover === a ? b : a;
    mover.y += mover.y >= stay.y ? push : -push;
    return;
  }
  if (a.y <= b.y) b.y += push;
  else a.y += push;
}

/** Point on the safe rectangle toward a fish that is off the plate area. */
export function edgeTickPoint(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  box: ScreenBox,
): { x: number; y: number; angle: number } {
  const ox = Math.min(box.r - 1, Math.max(box.l + 1, cx));
  const oy = Math.min(box.b - 1, Math.max(box.t + 1, cy));
  let dx = tx - ox;
  let dy = ty - oy;
  if (dx === 0 && dy === 0) dx = 1;
  const scales: number[] = [];
  if (dx !== 0) scales.push((dx > 0 ? box.r - ox : box.l - ox) / dx);
  if (dy !== 0) scales.push((dy > 0 ? box.b - oy : box.t - oy) / dy);
  const scale = Math.min(...scales.filter((value) => value > 0));
  return {
    x: ox + dx * scale,
    y: oy + dy * scale,
    angle: Math.atan2(dy, dx),
  };
}

/** Keep each stake plate fully inside `view` and off the other plates and HUD boxes. */
export function settleStakePlates(plates: StakePlate[], view: ScreenBox, obstacles: ScreenBox[]) {
  const gap = 4;
  const blocked = (plate: StakePlate) => obstacles.some((item) => overlap(stakePlateBox(plate), item));
  const commit = (plate: StakePlate) => {
    const pushedX = plate.cx;
    const pushedY = plate.y;
    keepNearHome(plate);
    clampPlate(plate, view);
    if (blocked(plate)) {
      plate.cx = pushedX;
      plate.y = pushedY;
      clampPlate(plate, view);
    }
  };
  for (const plate of plates) {
    plate.homeCx ??= plate.cx;
    plate.homeCy ??= plate.y;
    clampPlate(plate, view);
  }
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < plates.length; i++) {
      for (let j = i + 1; j < plates.length; j++) {
        const hit = overlap(stakePlateBox(plates[i]), stakePlateBox(plates[j]));
        if (!hit) continue;
        separate(plates[i], plates[j], hit.ox, hit.oy, gap);
        moved = true;
      }
    }
    for (const plate of plates) {
      for (let guard = 0; guard < 6; guard++) {
        const box = stakePlateBox(plate);
        const block = obstacles.find((item) => overlap(box, item));
        if (!block) break;
        const hit = overlap(box, block);
        if (!hit) break;
        const pcx = (box.l + box.r) / 2;
        const pcy = (box.t + box.b) / 2;
        const ocx = (block.l + block.r) / 2;
        const ocy = (block.t + block.b) / 2;
        if (hit.ox < hit.oy) plate.cx += pcx < ocx ? -(hit.ox + gap) : hit.ox + gap;
        else plate.y += pcy < ocy ? -(hit.oy + gap) : hit.oy + gap;
        moved = true;
      }
    }
    for (const plate of plates) commit(plate);
    if (!moved) break;
  }
}
