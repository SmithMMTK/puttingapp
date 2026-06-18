# Copilot Instructions — Putting Green Physics Simulator

## Project Overview

A Single Page App (SPA) that simulates a golf ball's path on a putting green using real physics (rolling resistance + slope force). Users adjust 3 inputs and see an animated, physics-accurate putt path. Target audience: kids (age 8) through touring pros — UI must be simple yet precise.

**Constraint**: 100% client-side, no backend. Deployed on GitHub Pages.

---

## Tech Stack & Build

- **Plain HTML + CSS + JS only** — no build step, no framework, no external physics library
- No `package.json`, no `npm install`, no bundler
- Local dev: `python -m http.server` or VS Code Live Server (do **not** open `file://` directly — CORS issues)
- Deploy: push to `main`, serve from repo root via GitHub Pages Settings → Pages

---

## File Structure

```
index.html       # Single entry point; imports ./style.css and ./script.js
style.css
script.js        # Or split into physics.js, render.js, ui.js if code grows long
README.md
```

If using a Vite/React build (only if a component library is truly needed):
- Set `base: '/<repo-name>/'` in `vite.config.js`
- Use relative asset paths only; never hardcode absolute paths
- Deploy via GitHub Actions (`actions/deploy-pages`), not by pushing `dist/`

---

## Physics Model

### Coordinate System
Origin at ball position; +y = direction toward hole along initial straight line.

### Inputs
| Parameter | Range | Step |
|---|---|---|
| Distance | 1–30 ft | 1 |
| Slope magnitude | 1–7% | 0.5 |
| Slope direction | 0–360° compass | — |
| Green speed (Stimp) | 8–12 | 0.5 |

**Compass convention (must be consistent throughout)**: 0° = uphill, 90° = right break, 180° = downhill, 270° = left break.

### Slope Decomposition
```js
slopeParallel = slopeMagnitude * Math.cos(angleRad)  // affects speed (uphill/downhill)
slopePerp     = slopeMagnitude * Math.sin(angleRad)  // affects direction (sideways break)
```
Display both derived values in the UI next to the compass dial (e.g., "Uphill 3.2% / Right break 2.1%").

### Friction from Stimp
**Do not use a hardcoded μ.** Derive it from USGA Stimpmeter calibration physics:
- USGA ramp releases ball at a fixed initial velocity `v₀`
- Ball travels distance = Stimp (in feet) before stopping on flat surface
- Use `v² = 2·a·d` → `μ = v₀² / (2·g·Stimp)` for each Stimp value

### Numerical Integration (core loop)
Use time-step integration (dt = 0.001–0.005s). **No closed-form approximations** — break must be asymmetric (heavier curve at end as ball slows, matching real putt behavior).

```
each step:
  1. friction deceleration: magnitude = μg, direction = opposite current velocity vector
  2. slope force: decompose relative to CURRENT ball direction (not initial direction)
  3. update velocity vector, position vector (Euler or RK4)
  4. store {x, y, t, speed}
stop when:
  - speed ≈ 0 → record miss distance
  - position within (hole_radius + ball_radius) = (2.125" + 0.84")/12 ft
    AND speed ≤ reasonable entry threshold → "holed"
```

### Initial Speed (Reverse-Solve)
Users do not set hit speed. **Iteratively solve** for the initial speed that delivers the ball to the hole (binary search over v₀ values, simulate full path each time, converge). This is required because non-linear break makes closed-form solving impossible.

---

## UI Conventions

- **Real-time reactive**: every input change immediately recalculates and re-renders — no submit button
- **Canvas preferred over SVG** for smooth animation (redraws every frame)
- Animation must be **time-accurate**: drive ball position from the `t` values in the simulation array, not linear interpolation (ball must visibly decelerate at end)
- Show clear outcome: "⛳ Holed" or "Missed — X ft Y in short/left/right"
- Include Replay/Reset button
- **Disclaimer** (small, non-prominent): model assumes uniform slope throughout; does not account for compound break, undulation, or grain of real greens

---

## GitHub Pages Deployment Checklist

1. Verify all asset paths are relative (`./script.js`, not `/script.js`)
2. Test on non-root deploy path (asset path errors are the most common GitHub Pages issue)
3. Check canvas/SVG renders correctly on mobile viewport (users may open on phone at the course)
