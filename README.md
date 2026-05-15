# 🎯 Tank Trouble

A real-time browser-based multiplayer tank battle game. Two players fight through a procedurally generated maze — bullets bounce up to 20 times, six power-ups change the dynamic every round, and everything is synthesized in code with no external assets.

**Built for CS181 — Advanced JavaScript Game Development**

![JavaScript](https://img.shields.io/badge/JavaScript-56.4%25-f7df1e?logo=javascript&logoColor=black)
![HTML](https://img.shields.io/badge/HTML-37.4%25-e34f26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-6.2%25-1572b6?logo=css3&logoColor=white)
![Engine](https://img.shields.io/badge/Engine-Kontra.js%209-orange)
![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)

---

## Team

| Name |
|---|
| Anish Chakraborty |
| Aditya Rustagi |
| Tushar Janarthanan Ramesh Babu |

---

## Table of Contents

- [Live Demo](#live-demo)
- [Controls](#controls)
- [Features](#features)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
  - [Maze Generation — Technical Component D](#maze-generation--technical-component-d)
  - [Physics Engine](#physics-engine)
  - [Client-Side Multiplayer — Technical Component G](#client-side-multiplayer--technical-component-g)
  - [Procedural Audio](#procedural-audio)
- [Running Locally](#running-locally)
- [Deployment](#deployment)
  - [Backend — Railway](#backend--railway)
  - [Frontend — Netlify](#frontend--netlify)

---

## Live Demo

> Add your Netlify URL here once deployed.

Both players open the same Netlify link and click **Play Online**. First to click is Player 1 (host), second is Player 2. The game starts automatically when both are connected.

---

## Controls

|              | Forward | Back | Turn Left | Turn Right | Fire |
|:-------------|:-------:|:----:|:---------:|:----------:|:----:|
| **Player 1** | `E`     | `D`  | `S`       | `F`        | `Q`  |
| **Player 2** | `↑`     | `↓`  | `←`       | `→`        | `M`  |

**🔊** — mute/unmute button in the top-right corner of the game.

---

## Features

| Feature | Details |
|---|---|
| 🌐 **Online Multiplayer** | FastAPI WebSocket server with server-authoritative role assignment — no timing race |
| 🗺️ **Procedural Mazes** | Recursive DFS generates a unique perfect maze every round from a single shared seed |
| 💥 **6 Power-Ups** | Missile, Laser, Triple Shot, Speed Boost, Shield, Big Bullet |
| 🔊 **Procedural Audio** | Web Audio API synthesis — background music + 4 SFX, zero audio files |
| ⚡ **Bullet Bouncing** | Specular reflection off walls, up to 20 bounces before expiring |
| 🛡️ **Shield** | Absorbs one hit from any weapon type |
| 🎮 **Local 2-Player** | Share a keyboard — works with no server connection |
| 🎨 **Particle FX** | 36 radial sparks + expanding shockwave ring on every explosion |

---

## Project Structure

```
csgame2/
├── index.html            # Markup only — zero inline JS or CSS
├── game.html             # Original single-file prototype (reference only)
├── server.py             # FastAPI WebSocket relay server (deploy to Railway)
├── requirements.txt      # Python dependencies for Railway
├── Procfile              # Railway start command
├── _redirects            # Netlify SPA routing rule
├── css/
│   └── style.css         # All styles using CSS custom properties
└── js/
    ├── constants.js      # All magic numbers and key maps
    ├── audio.js          # Web Audio engine — chiptune BGM + 4 SFX
    ├── maze.js           # DFS maze generator + seeded LCG PRNG
    ├── particles.js      # Explosion particle pool
    ├── powerups.js       # PowerUpItem class + 6 type definitions
    ├── projectiles.js    # Bullet, Laser, and Missile classes
    ├── tank.js           # Tank class (wraps kontra.Sprite)
    ├── drawing.js        # Maze renderer + roundRect canvas helper
    ├── gamestate.js      # Round logic, scoring, power-up spawning
    ├── gameloop.js       # kontra.GameLoop — update() and render()
    ├── network.js        # WebSocket client, matchmaking, state sync
    └── ui.js             # Button event wiring
```

`index.html` loads the JS files in dependency order via `<script src="...">` tags. No bundler, no build step, no compilation required.

---

## How It Works

### Maze Generation — Technical Component D

Every round, `js/maze.js` generates a brand-new maze using **Recursive Depth-First Search (DFS)**. The algorithm starts from a random cell and carves passages by knocking down walls between neighbours — visiting every cell exactly once and backtracking when all neighbours are already visited. The result is a *perfect maze*: every cell reachable, no loops, no isolated areas.

**The seeded PRNG** is what makes multiplayer sync work without extra data. Instead of `Math.random()`, the game uses a custom **linear congruential generator (LCG)**:

```js
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
```

Player 1 generates a random seed and sends it to Player 2 in the `start` message. Both clients call `makeMaze(seed)` independently — because the LCG is deterministic, they produce byte-for-byte identical mazes with **no maze data ever transmitted**. The entire 15×10 maze (600 wall flags) travels as one 24-bit number.

---

### Physics Engine

**Tank movement** is angle-based. Keyboard input updates the tank's rotation angle each frame, and `Math.cos(angle)` / `Math.sin(angle)` convert it into an X/Y velocity vector. All movement is multiplied by `dt` (seconds since last frame) so the game runs identically at any frame rate.

**Wall collision** uses AABB (Axis-Aligned Bounding Box) — fast rectangular overlap checks with no square root. A 3-pass resolution loop runs per frame to prevent fast objects from tunneling through thin walls.

**Bullet bouncing** works like specular reflection. Hitting a horizontal wall flips `vy`; hitting a vertical wall flips `vx`. After each bounce the bullet is nudged away from the wall surface to prevent getting stuck inside it. Bullets expire after 20 bounces.

**Laser** pre-computes its full bounced ray path at the moment of firing — it walks from wall to wall up to 8 times, storing waypoints. Hit detection checks if the enemy tank centre is within 4px of any segment. Instant hit, no travel time.

**Missile** uses a proportional homing controller. Each frame it calculates the angle toward the enemy, normalises the difference to `[-π, π]`, and rotates toward the target at a maximum of 2.8 rad/s. The capped turn rate is intentional — unlimited turning would make missiles undodgeable.

---

### Client-Side Multiplayer — Technical Component G

The game uses a **host-authoritative** model. All physics and game logic run on Player 1's browser. Player 2 sends only keyboard input and renders whatever Player 1 sends back.

```
P2 keyboard input  ──[WebSocket]──►  P1 Host (runs all physics)
P2 display         ◄──[WebSocket]──  P1 sends world state at 20Hz
```

**Role assignment — no race condition:**

When a player clicks Play Online, the client sends `{ t: 'join' }` to the server. The server has two slots — first connection gets `p1`, second gets `p2`. It immediately replies with `{ t: 'assigned', role: 'p1' }` or `{ t: 'assigned', role: 'p2' }`. The client sets `isHost` from `data.role`. No timers, no heartbeat polling, no ambiguity.

**What Player 1 (host) does:**

- Runs `tank.update()` for both tanks — P2's tank is driven by the most recently received remote input
- Runs all collision detection, power-up pickups, and scoring — authoritative only
- Every 50ms: serialises and sends `{ t: 'state', tanks, pus, scores, roundover, ... }` to P2

Physics run at 60Hz; the network ticks at 20Hz. Decoupling these rates is intentional — sending state every frame would triple bandwidth with no perceptible improvement.

**What Player 2 (joiner) does:**

- Every 50ms: sends `{ t: 'inp', inp: { up, down, left, right, fire } }` to Player 1
- On receiving `{ t: 'state' }`: calls `tank.applyJSON()` to overwrite all local positions with the host's version
- Runs zero physics — collision, scoring, and pickup resolution happen only on the host

**WebSocket message reference:**

| Message | Direction | Purpose |
|---|---|---|
| `{ t: 'join' }` | Client → Server | Request a room slot |
| `{ t: 'assigned', role }` | Server → Client | Assign `p1` or `p2` |
| `{ t: 'ready' }` | Server → P1 | P2 has joined the room |
| `{ t: 'start', seed, scores }` | P1 → P2 | Start game, share maze seed |
| `{ t: 'state', tanks, pus, scores, ... }` | P1 → P2 | World snapshot at 20Hz |
| `{ t: 'inp', inp }` | P2 → P1 | Keyboard snapshot at 20Hz |
| `{ t: 'newround', seed, scores }` | P1 → P2 | Begin next round |
| `{ t: 'ping', ts }` / `{ t: 'pong', ts }` | P1 ↔ P2 | Latency measurement |
| `{ t: 'peer_left' }` | Server → Client | Opponent disconnected |

The FastAPI server (`server.py`) is a pure relay — it assigns room slots and forwards messages between the two players. All game logic lives in the browser.

---

### Procedural Audio

All sound is synthesised at runtime using the **Web Audio API**. There are zero `.mp3`, `.wav`, or `.ogg` files in the project.

| Sound | Synthesis method |
|---|---|
| Background music | Minor-pentatonic chiptune — square-wave lead + triangle-wave bass, scheduled with `audioCtx.currentTime` for sample-accurate timing |
| Shoot SFX | Sawtooth oscillator with pitch-drop envelope, tuned per player colour |
| Explosion SFX | White noise buffer (0.4s) with exponential gain decay |
| Power-up pickup | Ascending 4-note sine chime |
| Bullet bounce | Square-wave tick with fast frequency sweep |

Audio is initialised on the first user click to comply with browser autoplay policy. The **🔊** button in the top-right corner toggles a master gain node to mute/unmute everything.

---

## Running Locally

**1. Install Python dependencies**

```bash
pip install fastapi uvicorn
```

**2. Start the server**

```bash
python server.py
```

**3. Open the game**

```
http://localhost:8081
```

- **Local 2-Player** — both players share one keyboard, no server connection needed
- **Play Online** — requires a second person to open the same URL and also click Play Online

> ⚠️ Do not open `index.html` directly as a `file://` URL. Browsers block loading external CSS and JS that way. Always use `http://localhost:8081`.

---

## Deployment

The project deploys across two services: the static frontend on **Netlify** and the WebSocket server on **Railway**.

### Backend — Railway

1. Push the repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → select `csgame2`
3. Railway auto-detects `Procfile` and `requirements.txt` and deploys automatically
4. In your service dashboard: **Settings → Networking → Generate Domain**
5. Copy your domain — it will look like `tank-trouble-server.up.railway.app`

### Frontend — Netlify

1. Set your Railway domain in `js/network.js`:

2. Commit and push that change to GitHub

3. Go to [netlify.com](https://netlify.com) → **Add New Site → Import from Git** → connect your GitHub repo

4. Configure the build settings:
   - **Build command:** *(leave blank)*
   - **Publish directory:** `.`

5. Click **Deploy Site**

Netlify gives you a permanent URL like `https://tank-trouble.netlify.app`. Share it with anyone — both players open the link, click **Play Online**, and the game starts.

> **Note:** Railway's free tier may pause after inactivity. The first connection after a sleep period can take a few seconds to wake the server.
