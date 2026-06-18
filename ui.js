/**
 * ui.js — State machine + interactions
 * States: SETUP → ROLLING → RESULT → SETUP
 */

import { stimpToMu, standardV0, simulate, solveCorrectAim } from './physics.js';
import { Renderer } from './render.js';

export function initUI() {
  const canvas     = document.getElementById('green-canvas');
  const renderer   = new Renderer(canvas);

  const distSlider  = document.getElementById('distance');
  const distVal     = document.getElementById('distance-val');
  const stimpSlider = document.getElementById('stimp');
  const stimpVal    = document.getElementById('stimp-val');
  const breakSlider = document.getElementById('break-mag');
  const breakVal    = document.getElementById('break-val');
  const pastSlider  = document.getElementById('past-feet');
  const pastVal     = document.getElementById('past-val');
  const btnLeft     = document.getElementById('btn-left');
  const btnStraight = document.getElementById('btn-straight');
  const btnRight    = document.getElementById('btn-right');
  const puttBtn     = document.getElementById('btn-putt');
  const retryBtn    = document.getElementById('btn-retry');
  const randomBtn   = document.getElementById('btn-random');
  const aimDisplay  = document.getElementById('aim-display');
  const resultLegend = document.getElementById('result-legend');

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    distanceFt:  12,
    stimp:        9,
    breakMag:     2,    // 0–7 %
    breakDir:     1,    // +1=right, -1=left, 0=straight
    pastFeet:     1.5,  // how far past hole ball would roll on flat miss (1–5 ft)
    aimOffsetM:   0,    // user's lateral aim offset (metres at hole level; −=left)
    phase:       'SETUP', // SETUP | ROLLING | RESULT
    correctAimM:  null,
  };

  let tracking = false; // canvas drag in progress

  // ── Helpers ────────────────────────────────────────────────────────────
  function slopePerp() { return state.breakDir * state.breakMag; }
  function holeDistM()  { return state.distanceFt * 0.3048; }

  function clampAim(offsetM) {
    const max = holeDistM() * 0.6;
    return Math.max(-max, Math.min(max, offsetM));
  }

  function aimLabel() {
    const inches = Math.abs(state.aimOffsetM) * 39.37;
    if (Math.abs(state.aimOffsetM) < 0.008) return 'Aim: Straight at hole';
    const dir = state.aimOffsetM < 0 ? 'left' : 'right';
    return `Aim: ${inches.toFixed(1)}" ${dir} of hole`;
  }

  function redrawSetup() {
    renderer.drawSetup(holeDistM(), state.aimOffsetM, slopePerp());
    aimDisplay.textContent = aimLabel();
  }

  // ── Break direction buttons ────────────────────────────────────────────
  function syncBreakBtns() {
    btnLeft.classList.toggle('active',     state.breakDir === -1);
    btnStraight.classList.toggle('active', state.breakDir ===  0);
    btnRight.classList.toggle('active',    state.breakDir ===  1);
  }

  btnLeft.addEventListener('click', () => {
    state.breakDir = -1;
    if (state.breakMag === 0) { state.breakMag = 1; breakSlider.value = 1; breakVal.textContent = '1.0%'; }
    syncBreakBtns(); redrawSetup();
  });
  btnStraight.addEventListener('click', () => {
    state.breakDir = 0; state.breakMag = 0;
    breakSlider.value = 0; breakVal.textContent = '0%';
    syncBreakBtns(); redrawSetup();
  });
  btnRight.addEventListener('click', () => {
    state.breakDir = 1;
    if (state.breakMag === 0) { state.breakMag = 1; breakSlider.value = 1; breakVal.textContent = '1.0%'; }
    syncBreakBtns(); redrawSetup();
  });

  // ── Sliders ────────────────────────────────────────────────────────────
  distSlider.addEventListener('input', () => {
    state.distanceFt = parseFloat(distSlider.value);
    distVal.textContent = state.distanceFt + ' ft';
    state.aimOffsetM = clampAim(state.aimOffsetM);
    if (state.phase === 'SETUP') redrawSetup();
  });

  stimpSlider.addEventListener('input', () => {
    state.stimp = parseFloat(stimpSlider.value);
    stimpVal.textContent = state.stimp.toFixed(1);
    if (state.phase === 'SETUP') redrawSetup();
  });

  breakSlider.addEventListener('input', () => {
    state.breakMag = parseFloat(breakSlider.value);
    breakVal.textContent = state.breakMag.toFixed(1) + '%';
    if (state.breakMag === 0) { state.breakDir = 0; syncBreakBtns(); }
    if (state.phase === 'SETUP') redrawSetup();
  });

  pastSlider.addEventListener('input', () => {
    state.pastFeet = parseFloat(pastSlider.value);
    pastVal.textContent = state.pastFeet.toFixed(1) + ' ft';
  });

  // ── Canvas: aimpoint drag ──────────────────────────────────────────────
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  function applyCanvasX(cx) {
    state.aimOffsetM = clampAim(renderer.canvasXToAimOffset(cx));
    redrawSetup();
  }

  canvas.addEventListener('mousedown', (e) => {
    if (state.phase !== 'SETUP') return;
    tracking = true;
    applyCanvasX(canvasPos(e).x);
  });
  canvas.addEventListener('touchstart', (e) => {
    if (state.phase !== 'SETUP') return;
    e.preventDefault(); tracking = true;
    applyCanvasX(canvasPos(e).x);
  }, { passive: false });

  window.addEventListener('mousemove', (e) => {
    if (!tracking || state.phase !== 'SETUP') return;
    applyCanvasX(canvasPos(e).x);
  });
  window.addEventListener('touchmove', (e) => {
    if (!tracking || state.phase !== 'SETUP') return;
    e.preventDefault(); applyCanvasX(canvasPos(e).x);
  }, { passive: false });

  window.addEventListener('mouseup',  () => { tracking = false; });
  window.addEventListener('touchend', () => { tracking = false; });

  // ── PUTT button ────────────────────────────────────────────────────────
  puttBtn.addEventListener('click', () => {
    if (state.phase !== 'SETUP') return;

    // Compute correct aim for post-result display
    const mu = stimpToMu(state.stimp);
    state.correctAimM = solveCorrectAim(mu, slopePerp(), state.distanceFt, state.pastFeet);

    // Simulate with user's aim + selected putt firmness
    const v0     = standardV0(mu, holeDistM(), state.pastFeet);
    const aimDeg = Math.atan2(state.aimOffsetM, holeDistM()) * (180 / Math.PI);
    const result = simulate(v0, aimDeg, mu, slopePerp(), holeDistM());

    state.phase = 'ROLLING';
    setPhaseUI();

    renderer.animate(result.path, holeDistM(), result.holed, result.stopDist, () => {
      state.phase = 'RESULT';
      setPhaseUI();
      renderer.drawResult(
        result.path, holeDistM(), result.holed, result.stopDist,
        state.aimOffsetM, state.correctAimM
      );
    });
  });

  // ── TRY AGAIN button ──────────────────────────────────────────────────
  retryBtn.addEventListener('click', () => {
    state.phase = 'SETUP';
    setPhaseUI();
    redrawSetup();
  });

  // ── RANDOM button ─────────────────────────────────────────────────────
  function randomiseParams() {
    // Distance: 1–30 ft in 1 ft steps
    state.distanceFt = Math.floor(Math.random() * 30) + 1;
    // Stimp: 8–12 in 0.5 steps
    state.stimp = 8 + Math.round(Math.random() * 8) * 0.5;
    // Slope: 0–7% in 0.5 steps
    state.breakMag = Math.round(Math.random() * 14) * 0.5;
    // Break direction (if slope > 0: random left/right; else straight)
    if (state.breakMag === 0) {
      state.breakDir = 0;
    } else {
      state.breakDir = Math.random() < 0.5 ? -1 : 1;
    }
    // Firmness: 1–5 ft in 0.5 steps (bias toward 1–2.5 ft — realistic range)
    state.pastFeet = 1 + Math.round(Math.random() * 6) * 0.5;
    // Reset aim to straight — let user discover the break
    state.aimOffsetM = 0;

    // Sync all DOM controls
    distSlider.value  = state.distanceFt;
    stimpSlider.value = state.stimp;
    breakSlider.value = state.breakMag;
    pastSlider.value  = state.pastFeet;
    distVal.textContent  = state.distanceFt + ' ft';
    stimpVal.textContent = state.stimp.toFixed(1);
    breakVal.textContent = state.breakMag.toFixed(1) + '%';
    pastVal.textContent  = state.pastFeet.toFixed(1) + ' ft';
    syncBreakBtns();
  }

  randomBtn.addEventListener('click', () => {
    renderer.stopAnimation();
    randomiseParams();
    state.phase = 'SETUP';
    setPhaseUI();
    redrawSetup();
  });

  // ── Phase UI sync ──────────────────────────────────────────────────────
  function setPhaseUI() {
    const isSetup  = state.phase === 'SETUP';
    const isResult = state.phase === 'RESULT';

    puttBtn.style.display    = isResult ? 'none' : '';
    puttBtn.disabled         = !isSetup;
    retryBtn.style.display   = isResult ? ''     : 'none';

    // Swap aim-display ↔ result-legend (same height slot, no layout shift)
    aimDisplay.style.display    = isResult ? 'none'  : '';
    resultLegend.style.display  = isResult ? 'flex'  : 'none';

    [distSlider, stimpSlider, breakSlider, pastSlider, btnLeft, btnStraight, btnRight]
      .forEach(el => { el.disabled = !isSetup; });
    randomBtn.disabled = false;  // always pressable
  }

  // ── Redraw on resize (orientation change, etc.) ──────────────────────
  window.addEventListener('resize', () => {
    if (state.phase === 'SETUP') redrawSetup();
  });

  // ── Init ───────────────────────────────────────────────────────────────
  distSlider.value  = state.distanceFt;
  stimpSlider.value = state.stimp;
  breakSlider.value = state.breakMag;
  pastSlider.value  = state.pastFeet;
  distVal.textContent  = state.distanceFt + ' ft';
  stimpVal.textContent = state.stimp.toFixed(1);
  breakVal.textContent = state.breakMag.toFixed(1) + '%';
  pastVal.textContent  = state.pastFeet.toFixed(1) + ' ft';
  syncBreakBtns();
  setPhaseUI();
  redrawSetup();
}
