/**
 * physics.js
 * Coordinate system: origin at ball; +y toward hole; +x = right (facing hole).
 * slopePerp > 0 = RIGHT break (ball curves right); < 0 = LEFT break; 0 = straight.
 */

const GRAVITY      = 9.80665;
const FT_TO_M      = 0.3048;
const STIMP_V0     = 1.83;                            // USGA ramp release speed (m/s)
const HOLE_CAP_R   = (2.125 / 12) * FT_TO_M;         // capture: ball centre within hole radius
const MAX_ENTRY_SPD = 1.37;                            // max hole-entry speed (m/s) ~4.5 ft/s

/** μ from Stimp: v₀² = 2·μ·g·d  →  μ = v₀²/(2·g·d) */
export function stimpToMu(stimp) {
  return (STIMP_V0 * STIMP_V0) / (2 * GRAVITY * stimp * FT_TO_M);
}

/** "Past hole" standard putt speed.
 *  pastFeet: how far ball would roll past on flat green if it missed straight.
 *  Golf instruction standard: ~17 inches (≈1.4 ft). Default 1.5 ft. */
export function standardV0(mu, holeDist, pastFeet = 1.5) {
  return Math.sqrt(2 * mu * GRAVITY * (holeDist + pastFeet * FT_TO_M));
}

/**
 * Simulate ball path.
 * @param {number} v0       - initial speed (m/s)
 * @param {number} aimDeg   - aim angle from +y; positive = aim right of hole
 * @param {number} mu       - friction coefficient
 * @param {number} slopePerp - lateral slope % (+ = right break)
 * @param {number} holeDist - hole distance (m)
 * @param {number} dt       - time step (s)
 */
export function simulate(v0, aimDeg, mu, slopePerp, holeDist, dt = 0.002) {
  const gx      = (slopePerp / 100) * GRAVITY;   // lateral slope acceleration
  const aimRad  = (aimDeg * Math.PI) / 180;
  let vx = v0 * Math.sin(aimRad);
  let vy = v0 * Math.cos(aimRad);
  let x = 0, y = 0, t = 0;
  const path = [{ x, y, t, speed: v0 }];

  for (let i = 0; i < 60000; i++) {
    const spd = Math.sqrt(vx * vx + vy * vy);
    if (spd < 0.001) { path.push({ x, y, t, speed: 0 }); break; }

    const ux = vx / spd, uy = vy / spd;
    vx += (-mu * GRAVITY * ux + gx) * dt;
    vy +=  -mu * GRAVITY * uy       * dt;
    x  += vx * dt;  y  += vy * dt;  t  += dt;

    const spd2 = Math.sqrt(vx * vx + vy * vy);
    path.push({ x, y, t, speed: spd2 });

    if (Math.sqrt(x * x + (y - holeDist) ** 2) <= HOLE_CAP_R && spd2 <= MAX_ENTRY_SPD) {
      return { path, holed: true, stopDist: 0 };
    }
    if (y > holeDist + 2 || (y < -0.5 && t > 1)) break;
  }

  return { path, holed: false, stopDist: Math.sqrt(x * x + (y - holeDist) ** 2) };
}

/** Apex: point of maximum lateral |x| deviation. */
export function findApex(path) {
  let maxAbs = 0, idx = 0;
  for (let i = 0; i < path.length; i++) {
    if (Math.abs(path[i].x) > maxAbs) { maxAbs = Math.abs(path[i].x); idx = i; }
  }
  return { idx, x: path[idx]?.x ?? 0, y: path[idx]?.y ?? 0 };
}

/**
 * Solve for the correct aimpoint lateral offset (meters at hole level) that holes the ball.
 * Returns negative value for right break (aim left), positive for left break (aim right).
 */
export function solveCorrectAim(mu, slopePerp, holeDistFeet, pastFeet = 1.5) {
  const holeDist = holeDistFeet * FT_TO_M;
  const v0 = standardV0(mu, holeDist, pastFeet);
  if (Math.abs(slopePerp) < 0.01) return 0;

  const breakDir = slopePerp > 0 ? 1 : -1; // +1=right break, -1=left break
  const aimSign  = -breakDir;               // aim opposite to break
  let lo = 0, hi = holeDist * 0.75;

  for (let i = 0; i < 65; i++) {
    const mid        = (lo + hi) / 2;
    const aimOffsetM = aimSign * mid;
    const aimDeg     = Math.atan2(aimOffsetM, holeDist) * (180 / Math.PI);
    const r          = simulate(v0, aimDeg, mu, slopePerp, holeDist);

    if (r.holed) return aimOffsetM;

    // Find closest approach to hole to determine which side ball passed on
    let minDist = Infinity, closeX = 0;
    for (const pt of r.path) {
      const d = Math.sqrt(pt.x * pt.x + (pt.y - holeDist) ** 2);
      if (d < minDist) { minDist = d; closeX = pt.x; }
    }

    // onHighSide: ball is on the same side as the break (needs more aim)
    if (closeX * breakDir > 0) lo = mid; else hi = mid;
    if (hi - lo < 0.0003) break;
  }

  return aimSign * (lo + hi) / 2;
}
