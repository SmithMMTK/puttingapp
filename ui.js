/**
 * ui.js — State machine + interactions
 * States: SETUP → ROLLING → RESULT → SETUP  (or GAMEOVER after all 100 scenarios)
 */

import { stimpToMu, standardV0, simulate, solveCorrectAim } from './physics.js';
import { Renderer } from './render.js';
import { SCENARIOS } from './scenarios.js';

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
  const btnRight    = document.getElementById('btn-right');
  const puttBtn     = document.getElementById('btn-putt');
  const retryBtn    = document.getElementById('btn-retry');
  const randomBtn   = document.getElementById('btn-random');
  const nextBtn     = document.getElementById('btn-next');
  const aimDisplay  = document.getElementById('aim-display');
  const resultLegend = document.getElementById('result-legend');
  const gameScoreBadge = document.getElementById('game-score-badge');
  const gamePts        = document.getElementById('game-pts');
  const gameOverOverlay = document.getElementById('game-over-overlay');
  const gameOverScore   = document.getElementById('game-over-score');
  const gameOverRating  = document.getElementById('game-over-rating');
  const modePracticeBtn = document.getElementById('btn-mode-practice');
  const modeGameBtn     = document.getElementById('btn-mode-game');

  // ── State ──────────────────────────────────────────────────────────────
  const state = {
    distanceFt:  12,
    stimp:        9,
    breakMag:     2,    // 1–4 %
    breakDir:     1,    // +1=right, -1=left
    pastFeet:     1.5,
    aimOffsetM:   0,    // user's lateral aim offset (metres; −=left)
    phase:       'SETUP', // SETUP | ROLLING | RESULT | GAMEOVER
    correctAimM:  null,
    mode:        'practice', // 'practice' | 'game'
  };

  // gameState tracks progress through the 100 fixed scenarios
  const gameState = {
    scenarioIdx: 0,   // 0-based index into SCENARIOS
    score:       0,   // points earned
  };
  const TOTAL = SCENARIOS.length; // 100

  let tracking = false;
  let lastResult = null;

  // ── Helpers ────────────────────────────────────────────────────────────
  function slopePerp() { return state.breakDir * state.breakMag; }
  function holeDistM()  { return state.distanceFt * 0.3048; }

  function clampAim(offsetM) {
    const max = holeDistM() * 0.6;
    return Math.max(-max, Math.min(max, offsetM));
  }

  function aimLabel() {
    const inches = Math.abs(state.aimOffsetM) * 39.37;
    if (Math.abs(state.aimOffsetM) < 0.008) return 'Aim: At hole';
    const dir = state.aimOffsetM < 0 ? 'left' : 'right';
    return `Aim: ${inches.toFixed(1)}" ${dir} of hole`;
  }

  function redrawSetup() {
    renderer.drawSetup(holeDistM(), state.aimOffsetM, slopePerp());
    aimDisplay.textContent = aimLabel();
  }

  // ── Game helpers ──────────────────────────────────────────────────────
  function gameRating(score) {
    const pct = score / TOTAL;
    if (pct === 1)   return 'Perfect round! 🏆';
    if (pct >= 0.8)  return 'Excellent! 🌟';
    if (pct >= 0.6)  return 'Great game 👍';
    if (pct >= 0.4)  return 'Not bad 🤔';
    if (pct >= 0.2)  return 'Keep practicing 💪';
    return 'Try again! 😅';
  }

  function updateScoreBadge() {
    gamePts.textContent = gameState.score;
  }

  // Load a fixed scenario by 0-based index into state + DOM controls
  function loadScenario(idx) {
    const s = SCENARIOS[idx];
    state.distanceFt = s.distanceFt;
    state.stimp      = s.stimp;
    state.breakMag   = s.breakMag;
    state.breakDir   = s.breakDir;
    state.pastFeet   = s.pastFeet;
    state.aimOffsetM = 0;

    distSlider.value  = s.distanceFt;
    stimpSlider.value = s.stimp;
    breakSlider.value = s.breakMag;
    pastSlider.value  = s.pastFeet;
    distVal.textContent  = s.distanceFt + ' ft';
    stimpVal.textContent = s.stimp.toFixed(1);
    breakVal.textContent = s.breakMag.toFixed(1) + '%';
    pastVal.textContent  = s.pastFeet.toFixed(1) + ' ft';
    syncBreakBtns();
  }

  function startGame() {
    gameState.scenarioIdx = 0;
    gameState.score       = 0;
    state.phase = 'SETUP';
    renderer.stopAnimation();
    lastResult = null;
    loadScenario(0);
    updateScoreBadge();
    setPhaseUI();
    redrawSetup();
  }

  // ── Mode toggle ────────────────────────────────────────────────────────
  modePracticeBtn.addEventListener('click', () => {
    if (state.mode === 'practice') return;
    renderer.stopAnimation();
    state.mode = 'practice';
    state.phase = 'SETUP';
    lastResult = null;
    modePracticeBtn.classList.add('active');
    modeGameBtn.classList.remove('active');
    setPhaseUI();
    redrawSetup();
  });

  modeGameBtn.addEventListener('click', () => {
    if (state.mode === 'game') return;
    state.mode = 'game';
    modePracticeBtn.classList.remove('active');
    modeGameBtn.classList.add('active');
    startGame();
  });

  // ── Break direction buttons ────────────────────────────────────────────
  function syncBreakBtns() {
    btnLeft.classList.toggle('active',  state.breakDir === -1);
    btnRight.classList.toggle('active', state.breakDir ===  1);
  }

  btnLeft.addEventListener('click', () => {
    state.breakDir = -1;
    syncBreakBtns(); redrawSetup();
  });
  btnRight.addEventListener('click', () => {
    state.breakDir = 1;
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

    const mu = stimpToMu(state.stimp);
    state.correctAimM = solveCorrectAim(mu, slopePerp(), state.distanceFt, state.pastFeet);

    const v0     = standardV0(mu, holeDistM(), state.pastFeet);
    const aimDeg = Math.atan2(state.aimOffsetM, holeDistM()) * (180 / Math.PI);
    const result = simulate(v0, aimDeg, mu, slopePerp(), holeDistM());

    state.phase = 'ROLLING';
    setPhaseUI();

    renderer.animate(result.path, holeDistM(), result.holed, result.stopDist, () => {
      state.phase = 'RESULT';
      if (state.mode === 'game' && result.holed) {
        gameState.score++;
        updateScoreBadge();
      }
      setPhaseUI();
      const hDist = holeDistM();
      lastResult = {
        path: result.path, hDist, holed: result.holed, stopDist: result.stopDist,
        aimOffsetM: state.aimOffsetM, correctAimM: state.correctAimM,
      };
      renderer.drawResult(
        result.path, hDist, result.holed, result.stopDist,
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

  // ── NEXT PUTT / PLAY AGAIN button (game mode) ─────────────────────────
  nextBtn.addEventListener('click', () => {
    if (state.phase === 'GAMEOVER') {
      // Play Again — restart from scenario 1
      startGame();
      return;
    }
    const isLastPutt = gameState.scenarioIdx >= TOTAL - 1;
    if (isLastPutt) {
      // Show game-over screen
      state.phase = 'GAMEOVER';
      gameOverScore.textContent  = `${gameState.score} / ${TOTAL}`;
      gameOverRating.textContent = gameRating(gameState.score);
      setPhaseUI();
    } else {
      gameState.scenarioIdx++;
      state.phase = 'SETUP';
      renderer.stopAnimation();
      lastResult = null;
      loadScenario(gameState.scenarioIdx);
      setPhaseUI();
      redrawSetup();
    }
  });

  // ── RANDOM button (practice mode only) ───────────────────────────────
  function randomiseParams() {
    state.distanceFt = Math.floor(Math.random() * 30) + 1;
    state.stimp      = 8 + Math.round(Math.random() * 8) * 0.5;
    state.breakMag   = 1 + Math.round(Math.random() * 6) * 0.5;
    state.breakDir   = Math.random() < 0.5 ? -1 : 1;
    state.pastFeet   = 1 + Math.round(Math.random() * 4) * 0.5;
    state.aimOffsetM = 0;

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
    const isSetup    = state.phase === 'SETUP';
    const isResult   = state.phase === 'RESULT';
    const isGameOver = state.phase === 'GAMEOVER';
    const isGame     = state.mode === 'game';
    const isLastPutt = isGame && gameState.scenarioIdx >= TOTAL - 1;

    // Score badge: visible in game mode (even on game-over screen)
    gameScoreBadge.style.display = isGame ? '' : 'none';

    // Game-over overlay
    gameOverOverlay.style.display = isGameOver ? 'flex' : 'none';

    // Putt button: hidden during result/gameover
    puttBtn.style.display = (isResult || isGameOver) ? 'none' : '';
    puttBtn.disabled      = !isSetup;

    // Practice-only buttons
    retryBtn.style.display  = (!isGame && isResult) ? '' : 'none';
    randomBtn.style.display = isGame ? 'none' : '';
    randomBtn.disabled      = false;

    // Game-only next button
    nextBtn.style.display = (isGame && (isResult || isGameOver)) ? '' : 'none';
    if (isGameOver)       nextBtn.textContent = '🔄 Play Again';
    else if (isLastPutt)  nextBtn.textContent = '🏆 Finish';
    else                  nextBtn.textContent = 'Next Putt →';

    // Swap aim-display ↔ result-legend
    aimDisplay.style.display   = (isResult || isGameOver) ? 'none' : '';
    resultLegend.style.display = isResult ? 'flex' : 'none';

    // Lock controls during rolling/result in game mode, or during gameover
    const lockControls = !isSetup || isGame || isGameOver;
    [distSlider, stimpSlider, breakSlider, pastSlider, btnLeft, btnRight]
      .forEach(el => { el.disabled = lockControls; });
  }

  // ── Redraw on resize ──────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    if (state.phase === 'SETUP') redrawSetup();
    else if (state.phase === 'RESULT' && lastResult) {
      renderer.drawResult(
        lastResult.path, lastResult.hDist, lastResult.holed, lastResult.stopDist,
        lastResult.aimOffsetM, lastResult.correctAimM
      );
    }
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
