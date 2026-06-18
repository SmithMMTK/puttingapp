# Putting Green Simulator

A physics-accurate putting green simulator built as a static Single Page App. Simulates golf ball path using real rolling resistance and slope physics.

**[Live Demo](https://smithmmtk.github.io/puttingApp/)**

## Features

- Numerical time-step physics integration (no approximations)
- Rolling friction derived from USGA Stimpmeter calibration
- Reverse-solves initial putt speed automatically
- Time-accurate animation (ball visibly decelerates near hole)
- Compass dial for slope direction
- Mobile-friendly

## Local Dev

```bash
python -m http.server
# Open http://localhost:8000
```

> Do not open `index.html` directly via `file://` — use a local HTTP server.

## Deploy

Push to `main` branch → GitHub Pages Settings → Pages → serve from root of `main`.
