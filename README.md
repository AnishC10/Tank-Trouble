# 🎯 Tank Trouble

A real-time browser-based multiplayer tank battle game built for CS181. Two players fight through a procedurally generated maze — bullets bounce, power-ups spawn, and only one tank survives each round.

**No build step. No external assets. No audio files. Open a link and play.**

![JavaScript](https://img.shields.io/badge/JavaScript-56.4%25-f7df1e?logo=javascript&logoColor=black)
![HTML](https://img.shields.io/badge/HTML-37.4%25-e34f26?logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-6.2%25-1572b6?logo=css3&logoColor=white)
![Engine](https://img.shields.io/badge/Engine-Kontra.js%209-orange)

---

## Table of Contents

- [Play the Game](#play-the-game)
- [Controls](#controls)
- [Features](#features)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
  - [Maze Generation (DFS)](#maze-generation-dfs---technical-component-d)
  - [Physics Engine](#physics-engine)
  - [Multiplayer Architecture](#multiplayer-architecture---technical-component-g)
  - [Procedural Audio](#procedural-audio)
- [Running Locally](#running-locally)
- [Online Multiplayer with ngrok](#online-multiplayer-with-ngrok)
- [Deploying to Netlify + Render](#deploying-to-netlify--render)
- [Team](#team)

---

## Play the Game

### Local (same computer)
```bash
python server.py
# Open http://localhost:8081 — click Local 2-Player
```

### Online (two computers)
```bash
# Terminal 1
python server.py

# Terminal 2
ngrok http 8081
# Share the https://xxxx.ngrok-free.app link — both players open it and click Play Online
```

> **Prerequisites:** Python 3.10+, `pip install fastapi uvicorn`

---

## Controls

|              | Move Forward | Move Back | Turn Left | Turn Right | Fire |
|:-------------|:------------:|:---------:|:---------:|:----------:|:----:|
| **Player 1** | `E`          | `D`       | `S`       | `F`        | `Q`  |
| **Player 2** | `↑`          | `↓`       | `←`       | `→`        | `M`  |

Toggle audio: **🔊 button** (top-right corner)

---

## Features

| Feature | Details |
|---|---|
| 🌐 **Online Multiplayer** | FastAPI WebSocket server with server-authoritative role assignment |
| 🗺️ **Procedural Mazes** | DFS algorithm generates a unique perfect maze every round |
| 💥 **6 Power-Ups** | Missile, Laser, Triple Shot, Speed Boost, Shield, Big Bullet |
| 🔊 **Procedural Audio** | Web Audio API synthesis — zero audio files |
| ⚡ **Bullet Bouncing** | Bullets reflect off walls up to 20 times |
| 🛡️ **Shield System** | Absorbs one hit from any weapon type |
| 🎮 **Local 2-Player** | Share a keyboard — no server needed |
| 🎨 **Particle FX** | 36 radial sparks + expanding ring on every explosion |

---

## Project Structure

```
csgame2/
├── index.html          # Markup only — zero inline JS or CSS
├── server.py           # FastAPI WebSocket relay server
├── launch.py           # One-command launcher (server + ngrok)
├── requirements.txt    # Python dependencies
├── css/
│   └── style.css       # All styles with CSS custom properties
└── js/
    ├── constants.js    # All magic numbers and key maps
    ├── audio.js        # Web Audio engine — music + 4 SFX
    ├── maze.js         # DFS maze generator + seeded PRNG
    ├── particles.js    # Explosion particle pool
    ├── powerups.js     # PowerUpItem class + 6 type definitions
    ├── projectiles.js  # Bullet, Laser, Missile classes
    ├── tank.js         # Tank class (wraps kontra.Sprite)
    ├── drawing.js      # Maze renderer + roundRect helper
    ├── gamestate.js    # Round logic, scoring, spawning
    ├── gameloop.js     # kontra.GameLoop — update + render
    ├── network.js      # FastAPI WebSocket client + matchmaking
    └── ui.js           # Button event wiring
```

Each file owns exactly one concern. `index.html` loads them in dependency order via `<script src="...">` tags — no bundler required.

---

## How It Works

### Maze Generation (DFS) — Technical Component D

Every round a brand-new maze is generated using **Recursive Depth-First Search**. The algorithm starts from a random cell and carves passages by visiting every cell exactly once, backtracking when it gets stuck. The result is a *perfect maze* — every cell is reachable, with no loops.

The key multiplayer insight: both clients use a **seeded linear congruential generator (LCG)** instead of `Math.random()`. Player 1 generates a random seed and sends it to Player 2 in a single network message. Both clients call `makeMaze(seed)` independently and produce byte-for-byte identical mazes — the entire 15×10 maze (600 wall flags) travels as one 24-bit integer.

```
Seed: 0xAB3F2C  →  Player 1 builds maze  →  sends seed to Player 2
                                          →  Player 2 builds identical maze
                                          →  zero extra data transferred
```

**Files:** `js/maze.js`

---

### Physics Engine

**Tank movement** uses angle-based velocity. Each frame, the tank's rotation angle is updated by keyboard input, then `Math.cos(angle)` and `Math.sin(angle)` convert the angle into an X/Y velocity vector. All movement is multiplied by `dt` (delta time) to stay frame-rate independent.

**Wall collision** uses AABB (Axis-Aligned Bounding Box) — pure comparisons with no square root needed. A 3-pass resolution loop runs each frame to prevent tunneling through thin walls at high speed.

**Bullet bouncing** works like light off a mirror (specular reflection). Hitting a horizontal wall flips the Y velocity; hitting a vertical wall flips the X velocity. After each bounce the bullet is nudged away from the wall surface to prevent getting stuck. Bullets die after 20 bounces.

**Laser** pre-computes its entire bounced path at the moment of firing using ray casting — it checks each wall segment for intersection, reflects the direction, and stores the waypoints. Hit detection checks if the enemy is within 4px of any segment. It's an instant hit with no travel time.

**Missile** steers toward the enemy each frame using a proportional controller. It calculates the angle to the target, normalises it to `[-π, π]`, and rotates by at most `2.8 rad/s`. The capped turn rate is the key design decision — unlimited turning would make missiles impossible to dodge.

**Files:** `js/tank.js`, `js/projectiles.js`, `js/gamestate.js`

---

### Multiplayer Architecture — Technical Component G

The game uses a **host-authoritative** model. All physics and game logic run on one client (the host). The other client sends only keyboard input and displays what the host tells it.

```
Player 2 keyboard  →  [WebSocket]  →  Player 1 (Host)
                                       runs full physics
                                       detects collisions
                                       decides scores
Player 2 display   ←  [WebSocket]  ←  sends world state at 20Hz
```

**Role assignment** is server-authoritative. When a player clicks Play Online, the client sends `{ t: 'join' }`. The server assigns slot 0 as P1 and slot 1 as P2 — no timers, no heartbeat polling, no race conditions.

**Host loop (60Hz physics, 20Hz network):**
- Runs `tank.update()` for both players — P2's tank uses the most recently received remote input
- Runs `checkProjectileHits()` and `checkPowerupPickups()` — all collision is resolved authoritatively here
- Every 50ms: serialises the world state (`tanks`, `powerupItems`, `scores`, `roundover`) and sends it to P2

**Joiner loop:**
- Every 50ms: sends `{ t: 'inp', inp: { up, down, left, right, fire } }` to the host
- On receiving `{ t: 'state' }`: calls `tank.applyJSON()` to overwrite local positions with the host's version — never runs physics

The 20Hz network rate is intentional. Physics needs 60Hz to feel smooth; the network only needs 20 updates/sec for online play to feel responsive. Sending every frame would triple bandwidth with no visible improvement.

**Files:** `js/network.js`, `js/gameloop.js`, `server.py`

**WebSocket protocol:**

| Message | Direction | Purpose |
|---|---|---|
| `{ t: 'join' }` | Client → Server | Request a room slot |
| `{ t: 'assigned', role }` | Server → Client | Authoritative role assignment |
| `{ t: 'ready' }` | Server → P1 | P2 has connected |
| `{ t: 'start', seed, scores }` | P1 → P2 | Begin game with maze seed |
| `{ t: 'state', tanks, pus, scores, ... }` | P1 → P2 | World state at 20Hz |
| `{ t: 'inp', inp }` | P2 → P1 | Keyboard snapshot at 20Hz |
| `{ t: 'newround', seed, scores }` | P1 → P2 | Next round |
| `{ t: 'ping' }` / `{ t: 'pong' }` | P1 ↔ P2 | Latency measurement |
| `{ t: 'peer_left' }` | Server → Client | Opponent disconnected |

---

### Procedural Audio

All sound is synthesised at runtime using the **Web Audio API** — no `.mp3`, `.wav`, or `.ogg` files anywhere in the project.

| Sound | Synthesis method |
|---|---|
| Background music | Minor-pentatonic chiptune — square-wave lead + triangle-wave bass, scheduled with `audioCtx.currentTime` |
| Shoot SFX | Sawtooth oscillator with pitch-drop envelope, tuned per player colour |
| Explosion SFX | White noise buffer (0.4s) with exponential gain decay |
| Pickup SFX | Ascending 4-note chime using sine oscillators |
| Bounce SFX | Square-wave tick with fast frequency sweep |

`audioCtx.currentTime` is used for all scheduling — the audio thread runs at ~0.02ms resolution, far more precise than JavaScript's event loop.

**File:** `js/audio.js`

---

## Running Locally

**1. Install dependencies**
```bash
pip install fastapi uvicorn
```

**2. Start the server**
```bash
python server.py
# Server running on http://localhost:8081
```

**3. Open the game**

Go to `http://localhost:8081` in your browser.

- **Local 2-Player** — both players share one keyboard on the same browser window
- **Play Online** — opens matchmaking (needs a second player to also open the same URL)

> ⚠️ Do not open `index.html` directly as a `file://` URL — the browser will block the CSS and JS files. Always go through `http://localhost:8081`.

---

## Online Multiplayer with ngrok

ngrok creates a public HTTPS tunnel to your local server, letting anyone worldwide connect.

**One-time setup:**
1. Download ngrok at [ngrok.com/download](https://ngrok.com/download)
2. Create a free account at [dashboard.ngrok.com](https://dashboard.ngrok.com)
3. Add your auth token:
   ```bash
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

**Every time you want to play online:**
```bash
# Terminal 1 — keep running
python server.py

# Terminal 2
ngrok http 8081
# You'll see: Forwarding  https://abc123.ngrok-free.app → http://localhost:8081
```

Share the `https://` URL with your friend. Both players open it and click **Play Online**. First to click becomes Player 1 (host), second becomes Player 2 — game starts automatically.

---

## Deploying to Netlify + Render

For a permanent public URL that works without your laptop running:

**Backend (Render):**
1. Push the repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service → connect your repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Copy your Render URL (e.g. `https://tank-trouble-server.onrender.com`)

**Frontend (Netlify):**
1. Open `js/network.js` and set the server URL:
   ```js
   const WS_SERVER_URL = 'wss://tank-trouble-server.onrender.com';
   ```
2. Go to [netlify.com](https://netlify.com) → Add New Site → Deploy Manually → drag your project folder

Share the Netlify URL — online play works worldwide with no local server needed.

> **Note:** Render's free tier sleeps after 15 minutes of inactivity. The first connection after idle takes ~30 seconds to wake up.

---

## Team

| Name | GitHub |
|---|---|
| Anish Chakraborty | [@AnishC10](https://github.com/AnishC10) |
| Aditya Rustagi | — |
| Tushar Janarthanan Ramesh Babu | — |

**CS181 — Advanced JavaScript Game Development**

**Tech stack:**

| | |
|---|---|
| Game engine | [Kontra.js 9](https://straker.github.io/kontra/) (`kontra.GameLoop`, `kontra.Sprite`) |
| Backend | [FastAPI](https://fastapi.tiangolo.com/) + [uvicorn](https://www.uvicorn.org/) |
| Rendering | Canvas 2D API |
| Audio | Web Audio API |
| Language | Vanilla JavaScript (ES6 classes, no TypeScript) |
| Dependencies | None client-side (Kontra loaded from cdnjs) |
