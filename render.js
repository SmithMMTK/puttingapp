/**
 * render.js — Canvas rendering
 * Coordinate system: sim origin at ball (+y toward hole, +x right).
 * Canvas: ball at bottom-center, hole at top-center.
 */

export class Renderer {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this._animId = null;
    this._scale  = 1;
    this._holeRPx = 9;
    this._ballRPx = 4;
    this._ballPx = { x: 0, y: 0 };
    this._holePx = { x: 0, y: 0 };
    this._aimPx  = { x: 0, y: 0 };
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const el = this.canvas.parentElement;
    const W  = el.clientWidth;
    const H  = el.clientHeight;
    if (W > 0 && H > 0) {
      this.canvas.width  = W;
      this.canvas.height = H;
    }
  }

  /**
   * Compute scale with physical padding so short putts zoom in and long putts zoom out.
   * PAD_M metres of green are shown above the hole and below the ball —
   * a 3-ft putt feels closer than a 30-ft putt.
   * If `path` is provided, the view expands to keep the ball always visible.
   */
  _setupGeometry(holeDistM, path) {
    const W = this.canvas.width, H = this.canvas.height;
    const PAD_M = 0.55; // green padding above hole and below ball (~1.8 ft)

    // Compute the furthest extent the ball travels (y = forward, x = lateral)
    let maxY = holeDistM, maxAbsX = holeDistM * 0.5;
    if (path && path.length) {
      for (const pt of path) {
        if (pt.y > maxY) maxY = pt.y;
        if (Math.abs(pt.x) > maxAbsX) maxAbsX = Math.abs(pt.x);
      }
    }

    // Pad beyond the furthest point so the ball doesn't sit on the edge
    const spanY = maxY + PAD_M;        // top of view (ball starts at 0, travels to maxY)
    const spanX = maxAbsX * 2 + 0.3;  // lateral span with a little breathing room

    const scaleY = (H - 20) / (spanY + PAD_M); // PAD_M below ball too
    const scaleX = (W - 20) / spanX;
    const scale  = Math.min(scaleY, scaleX);

    this._scale     = scale;
    this._W = W; this._H = H;
    this._holeDistM = holeDistM;
    this._ballPx = { x: W / 2, y: H - 10 - PAD_M * scale };
    this._holePx = { x: W / 2, y: this._ballPx.y - holeDistM * scale };

    // Physical sizes — scale with px/m, clamped so they stay visible at all distances
    // Hole diameter = 4.25" = 0.108 m  →  radius 0.054 m
    // Ball diameter = 1.68" = 0.0427 m →  radius 0.0213 m
    this._holeRPx = Math.max(6,  Math.min(18, 0.054  * scale));
    this._ballRPx = Math.max(3.5, Math.min(11, 0.0213 * scale));
  }

  _toCanvas(sx, sy) {
    return { cx: this._ballPx.x + sx * this._scale,
             cy: this._ballPx.y - sy * this._scale };
  }

  /** Convert canvas x-coordinate to sim lateral offset (metres). */
  canvasXToAimOffset(cx) {
    return (cx - this._ballPx.x) / this._scale;
  }

  /** Is canvas point (cx,cy) within tap radius of the aimpoint dot? */
  hitTestAimpoint(cx, cy) {
    const dx = cx - this._aimPx.cx, dy = cy - this._aimPx.cy;
    return Math.sqrt(dx * dx + dy * dy) <= 24;
  }

  // ─── Drawing helpers ─────────────────────────────────────────────────────

  _drawGreen() {
    const { ctx, _W: W, _H: H } = this;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1b5e2a';
    ctx.fillRect(0, 0, W, H);
    // Subtle mowing stripes
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 18) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
    }
    ctx.restore();
  }

  _drawHole(cx, cy) {
    const { ctx } = this;
    const r  = this._holeRPx;
    const fH = r * 4.5;   // flagstick height proportional to hole size
    const fW = r * 2.5;   // flag triangle width
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Flagstick
    ctx.save();
    ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - fH); ctx.stroke();
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.moveTo(cx, cy - fH); ctx.lineTo(cx + fW, cy - fH * 0.75); ctx.lineTo(cx, cy - fH * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  _drawBall(cx, cy, glowing = false) {
    const { ctx } = this;
    const r = this._ballRPx;
    ctx.save();
    if (glowing) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 12; }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  _drawAimpointDot(cx, cy, color = '#ffd700', label = null) {
    const { ctx } = this;
    ctx.save();
    // Glow ring
    ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = `${color}28`; ctx.fill();
    // Solid dot
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    if (label) {
      ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff'; ctx.fillText(label, cx, cy + 7);
    }
    ctx.restore();
  }

  _drawAimLine(fromX, fromY, toX, toY) {
    const { ctx } = this;
    ctx.save();
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
    ctx.restore();
  }

  _drawCenterLine() {
    const { ctx, _ballPx, _holePx } = this;
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(_ballPx.x, _ballPx.y); ctx.lineTo(_holePx.x, _holePx.y);
    ctx.stroke();
    ctx.restore();
  }

  _drawResultOverlay(holed, stopDist) {
    const { ctx, _W: W, _H: H } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    const bw = 224, bh = 52, bx = W / 2 - bw / 2, by = H / 2 - bh / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 10);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (holed) {
      ctx.font = 'bold 22px system-ui'; ctx.fillStyle = '#4ade80';
      ctx.fillText('⛳  Holed!', W / 2, H / 2);
    } else {
      const totalIn = (stopDist / 0.3048) * 12;
      const ft = Math.floor(totalIn / 12), inch = Math.round(totalIn % 12);
      const dist = ft > 0 ? `${ft}′ ${inch}″` : `${inch}″`;
      ctx.font = 'bold 17px system-ui'; ctx.fillStyle = '#f87171';
      ctx.fillText(`Missed — ${dist} from hole`, W / 2, H / 2);
    }
    ctx.restore();
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * SETUP state: green + hole + ball + aim line + draggable aimpoint.
   * @param {number} holeDistM
   * @param {number} aimOffsetM  - user's lateral aim offset (m); - = left
   * @param {number} slopePerp   - for break direction label (not drawn on canvas)
   */
  drawSetup(holeDistM, aimOffsetM, slopePerp) {
    this._setupGeometry(holeDistM);
    this._drawGreen();
    this._drawCenterLine();

    const aimCanv = this._toCanvas(aimOffsetM, holeDistM);
    this._aimPx   = aimCanv;

    // Aim line
    this._drawAimLine(this._ballPx.x, this._ballPx.y, aimCanv.cx, aimCanv.cy);

    // Hole (drawn after aim line so it's on top)
    this._drawHole(this._holePx.x, this._holePx.y);

    // Aimpoint dot (at hole y level, offset by aim)
    this._drawAimpointDot(aimCanv.cx, aimCanv.cy);

    // Ball (at origin)
    this._drawBall(this._ballPx.x, this._ballPx.y);
  }

  /**
   * ROLLING state: time-accurate ball animation.
   */
  animate(path, holeDistM, holed, stopDist, onDone) {
    this.stopAnimation();
    this._setupGeometry(holeDistM, path); // zoom out if ball travels past hole

    // Generation guard: stale onDone callbacks from a cancelled animation are dropped.
    const gen = (this._animGen = (this._animGen || 0) + 1);

    const tScale = 1.0; // real-time: animation speed matches actual physics time
    let t0 = null;

    const frame = (now) => {
      if (gen !== this._animGen) return; // cancelled — drop silently
      // Resync geometry if canvas was resized since last frame
      if (this.canvas.width !== this._W || this.canvas.height !== this._H) {
        this._setupGeometry(holeDistM, path);
      }
      if (!t0) t0 = now;
      const simT = ((now - t0) / 1000) * tScale;
      let idx = path.findIndex(p => p.t >= simT);
      if (idx < 0) idx = path.length - 1;

      this._drawGreen();

      // Faint future path
      if (idx < path.length - 2) {
        const ctx = this.ctx;
        ctx.save(); ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(255,220,50,0.13)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        const pf = this._toCanvas(path[idx].x, path[idx].y);
        ctx.moveTo(pf.cx, pf.cy);
        for (let i = idx + 1; i < path.length; i++) {
          const p = this._toCanvas(path[i].x, path[i].y); ctx.lineTo(p.cx, p.cy);
        }
        ctx.stroke(); ctx.restore();
      }

      // Past path (solid)
      if (idx > 0) {
        const ctx = this.ctx;
        ctx.save(); ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,220,50,0.75)'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        const p0 = this._toCanvas(path[0].x, path[0].y); ctx.moveTo(p0.cx, p0.cy);
        for (let i = 1; i <= idx; i++) {
          const p = this._toCanvas(path[i].x, path[i].y); ctx.lineTo(p.cx, p.cy);
        }
        ctx.stroke(); ctx.restore();
      }

      this._drawHole(this._holePx.x, this._holePx.y);

      // Moving ball
      const cur = this._toCanvas(path[idx].x, path[idx].y);
      this._drawBall(cur.cx, cur.cy, true);

      if (idx < path.length - 1) {
        this._animId = requestAnimationFrame(frame);
      } else {
        this._drawResultOverlay(holed, stopDist);
        onDone && onDone();
      }
    };

    this._animId = requestAnimationFrame(frame);
  }

  /**
   * RESULT state: full path + user aim dot (gold) + correct aim dot (green).
   */
  drawResult(path, holeDistM, holed, stopDist, aimOffsetM, correctAimM) {
    this._setupGeometry(holeDistM, path); // zoom out if ball travelled past hole
    this._drawGreen();

    // Full path
    if (path.length > 1) {
      const ctx = this.ctx;
      ctx.save(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,220,50,0.65)'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      const p0 = this._toCanvas(path[0].x, path[0].y); ctx.moveTo(p0.cx, p0.cy);
      for (const pt of path) { const p = this._toCanvas(pt.x, pt.y); ctx.lineTo(p.cx, p.cy); }
      ctx.stroke(); ctx.restore();
    }

    this._drawHole(this._holePx.x, this._holePx.y);

    // Correct aimpoint (green)
    if (correctAimM !== null) {
      const cp = this._toCanvas(correctAimM, holeDistM);
      this._drawAimpointDot(cp.cx, cp.cy, '#4ade80', 'Optimal');
    }

    // User's aimpoint (gold)
    const ap = this._toCanvas(aimOffsetM, holeDistM);
    this._drawAimpointDot(ap.cx, ap.cy, '#ffd700', 'Your aim');

    // Final ball position
    const last = path[path.length - 1];
    const lp   = this._toCanvas(last.x, last.y);
    this._drawBall(lp.cx, lp.cy);

    this._drawResultOverlay(holed, stopDist);
  }

  stopAnimation() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
    this._animGen = (this._animGen || 0) + 1; // invalidate any in-flight frame callbacks
  }

  /** Initial idle state before first interaction. */
  drawIdle(holeDistM) {
    this._setupGeometry(holeDistM);
    this._drawGreen();
    this._drawCenterLine();
    this._drawHole(this._holePx.x, this._holePx.y);
    this._drawBall(this._ballPx.x, this._ballPx.y);
    // Aimpoint starts at hole center
    this._aimPx = { cx: this._holePx.x, cy: this._holePx.y };
    this._drawAimpointDot(this._holePx.x, this._holePx.y);
  }
}
