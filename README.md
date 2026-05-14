# 🎯 Tank Trouble

A browser-based two-player tank battle game built with [Kontra.js](https://straker.github.io/kontra/). Navigate a randomly generated maze, fire bouncing shells, and destroy your opponent before they destroy you.

## Play

Open `tank_trouble.html` in any modern browser. No build step, no dependencies to install — it loads Kontra.js from a CDN.

## Controls

| | Forward | Back | Turn Left | Turn Right | Fire |
|---|---|---|---|---|---|
| **Player 1** | `E` | `D` | `S` | `F` | `Q` |
| **Player 2** | `↑` | `↓` | `←` | `→` | `L` |

## Rules

- First player hit by a shell loses the round
- Shells bounce off walls — up to **20 bounces** before disappearing
- Watch out for your own ricochets; they can kill you too
- A new randomly generated maze is loaded each round
- Wins are tracked in the scorebar at the bottom

## How It Works

### Maze Generation
Each round uses a **recursive backtracker** (depth-first search) to carve a perfect maze — every cell is reachable from every other cell, with no loops and no isolated sections.

### Physics
- Tanks use **AABB collision** against wall segments with a multi-pass push-out solver to prevent clipping into corners
- Bullets test X and Y axes independently each frame so they reflect cleanly off wall faces
- A short age grace period prevents bullets from immediately hitting the tank that fired them

### Rendering
Pure Canvas 2D — no sprites or image assets. Everything (tanks, treads, turrets, barrels, walls, particles) is drawn procedurally each frame.

## Project Structure

```
tank_trouble.html   # entire game — HTML, CSS, and JS in one file
README.md
```

## Tech Stack

| | |
|---|---|
| **Engine** | [Kontra.js 9](https://straker.github.io/kontra/) (`GameLoop`) |
| **Rendering** | Canvas 2D API |
| **Language** | Vanilla JS (ES6 classes) |
| **Dependencies** | None (Kontra loaded from cdnjs) |

## Known Limitations

- Two players only 
- No sound
- No AI opponent
