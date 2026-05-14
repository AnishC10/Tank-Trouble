/* ──────────────────────────────────────────────────────────────────────────
   8. CANVAS / DRAWING HELPERS
─────────────────────────────────────────────────────────────────────────── */

/**
 * Draw a rounded rectangle path (reusable utility).
 * Must be called between beginPath() and fill()/stroke().
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r,  r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,           r);
  ctx.closePath();
}

/**
 * Draw the maze — dark background, checker tint, wall shadow + wall fill + highlight.
 * Called every frame (walls don't change during a round).
 * @param {CanvasRenderingContext2D} ctx
 */
function drawMaze(ctx) {
  // Background fill
  ctx.fillStyle = '#070f1c';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle checkerboard tint on every other cell
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if ((row + col) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,.012)';
        ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
      }
    }
  }

  ctx.lineCap = 'square';

  // Shadow pass (thick dark stroke behind walls)
  ctx.strokeStyle = 'rgba(0,0,0,.65)';
  ctx.lineWidth   = WALL_THICK + 5;
  for (const wall of walls) {
    ctx.beginPath();
    ctx.moveTo(wall.x1, wall.y1);
    ctx.lineTo(wall.x2, wall.y2);
    ctx.stroke();
  }

  // Main wall colour
  ctx.strokeStyle = '#1a3352';
  ctx.lineWidth   = WALL_THICK;
  for (const wall of walls) {
    ctx.beginPath();
    ctx.moveTo(wall.x1, wall.y1);
    ctx.lineTo(wall.x2, wall.y2);
    ctx.stroke();
  }

  // Highlight (1px offset to fake 3-D bevel)
  ctx.strokeStyle = '#2a5585';
  ctx.lineWidth   = 1;
  for (const wall of walls) {
    const isH = wall.y1 === wall.y2;
    ctx.beginPath();
    ctx.moveTo(wall.x1 + (isH ? 0 : -1), wall.y1 + (isH ? -1 : 0));
    ctx.lineTo(wall.x2 + (isH ? 0 : -1), wall.y2 + (isH ? -1 : 0));
    ctx.stroke();
  }

  // Grid intersection dots
  ctx.fillStyle = '#2a5585';
  for (let row = 0; row <= ROWS; row++) {
    for (let col = 0; col <= COLS; col++) {
      ctx.beginPath();
      ctx.arc(col * CELL, row * CELL, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
