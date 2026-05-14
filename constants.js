/* ──────────────────────────────────────────────────────────────────────────
   1. CONSTANTS
   All magic numbers live here so they're easy to tune.
─────────────────────────────────────────────────────────────────────────── */
const COLS         = 15;    // maze columns
const ROWS         = 10;    // maze rows
const CELL         = 52;    // pixel size of each cell
const CANVAS_W     = COLS * CELL;  // 780
const CANVAS_H     = ROWS * CELL;  // 520
const WALL_THICK   = 4;
const TANK_RADIUS  = 13;
const BULLET_RADIUS = 4;
const BULLET_SPEED  = 300;  // px/s
const TANK_SPEED    = 95;   // px/s
const TANK_ROTATION = 2.3;  // rad/s
const MAX_BOUNCES   = 20;   // bullets die after this many wall bounces
const MAX_BULLETS   = 5;    // max normal bullets per tank on screen
const RESPAWN_DELAY = 3;    // seconds between rounds
const FIRE_COOLDOWN = 0.32; // seconds between shots (normal)

// Player colours
const COLOR_P1 = '#00e5ff';
const COLOR_P2 = '#ff3d71';

// Keyboard maps for each player (local mode)
const KEYS_P1 = { up:'KeyE', down:'KeyD', left:'KeyS', right:'KeyF', fire:'KeyQ' };
const KEYS_P2 = { up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight', fire:'KeyM' };
