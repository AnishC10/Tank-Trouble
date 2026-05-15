/* ──────────────────────────────────────────────────────────────────────────
   3. MAZE GENERATOR — Depth-First Search (Technical Component D)
   Generates a perfect maze (every cell reachable, no loops) using a
   recursive-DFS carve algorithm with a seeded PRNG so both players can
   reproduce the identical maze from just the seed value.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Simple seeded PRNG (linear-congruential generator).
 * Returns a closure that produces deterministic floats in [0, 1).
 * @param {number} seed
 * @returns {Function} rng
 */
function seededRng(seed) {
  let state = seed >>> 0; // ensure unsigned 32-bit
  return function () {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Fisher-Yates shuffle using the provided rng function.
 * Mutates the array in place.
 * @param {Array} arr
 * @param {Function} rng
 */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Generate a perfect maze using recursive DFS.
 * Each cell stores booleans for which walls (N/S/E/W) are still standing.
 * @param {number} seed - determines maze layout
 * @returns {Array<Array<{n,s,e,w,visited}>>} 2-D grid of cells
 */
function makeMaze(seed) {
  const rng = seededRng(seed);

  // Initialise every cell with all four walls intact
  const grid = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ n: 1, s: 1, e: 1, w: 1, visited: 0 }))
  );

  /**
   * Recursively carve passages from cell (row, col).
   * Visits neighbours in random order (shuffle) so the maze is unique per seed.
   */
  function carve(row, col) {
    grid[row][col].visited = 1;

    // The four possible directions to carve: [delta-row, delta-col, wall-here, wall-there]
    const dirs = [
      { dr: -1, dc:  0, fromWall: 's', toWall: 'n' }, // north
      { dr:  1, dc:  0, fromWall: 'n', toWall: 's' }, // south
      { dr:  0, dc:  1, fromWall: 'w', toWall: 'e' }, // east
      { dr:  0, dc: -1, fromWall: 'e', toWall: 'w' }, // west
    ];
    shuffle(dirs, rng);

    for (const { dr, dc, fromWall, toWall } of dirs) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      const inBounds = nextRow >= 0 && nextRow < ROWS && nextCol >= 0 && nextCol < COLS;
      if (inBounds && !grid[nextRow][nextCol].visited) {
        // Remove the wall between current cell and the chosen neighbour
        grid[row][col][toWall]         = 0;
        grid[nextRow][nextCol][fromWall] = 0;
        carve(nextRow, nextCol);
      }
    }
  }

  // Start carving from a random cell
  carve(Math.floor(rng() * ROWS), Math.floor(rng() * COLS));
  return grid;
}

/**
 * Convert a cell grid into a flat list of wall segments (line coordinates).
 * Only south and east walls are emitted per cell (north/west are neighbours'
 * south/east walls) to avoid duplicates. Outer border is added separately.
 * @param {Array} cells - output of makeMaze()
 * @returns {Array<{x1,y1,x2,y2}>}
 */
function buildWalls(cells) {
  const wallList = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const px = col * CELL;
      const py = row * CELL;
      // South wall
      if (cells[row][col].s) wallList.push({ x1: px, y1: py + CELL, x2: px + CELL, y2: py + CELL });
      // East wall
      if (cells[row][col].e) wallList.push({ x1: px + CELL, y1: py, x2: px + CELL, y2: py + CELL });
    }
  }

  // Add the four border walls
  wallList.push(
    { x1: 0,        y1: 0,        x2: CANVAS_W, y2: 0        }, // top
    { x1: 0,        y1: CANVAS_H, x2: CANVAS_W, y2: CANVAS_H }, // bottom
    { x1: 0,        y1: 0,        x2: 0,        y2: CANVAS_H }, // left
    { x1: CANVAS_W, y1: 0,        x2: CANVAS_W, y2: CANVAS_H }  // right
  );

  return wallList;
}

// Global wall list — rebuilt each round by initRound()
let walls = [];
