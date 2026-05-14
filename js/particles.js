/* ──────────────────────────────────────────────────────────────────────────
   4. PARTICLE SYSTEM
   A simple pool of spark particles used for explosions.
   tick() advances all particles and removes dead ones.
   draw() renders them onto the canvas.
─────────────────────────────────────────────────────────────────────────── */

/** @type {Array<Object>} active particles */
let particles = [];

/**
 * Spawn an explosion at (x, y) with the given colour.
 * Creates 36 radial sparks + 1 expanding ring.
 * @param {number} x
 * @param {number} y
 * @param {string} color
 */
function spawnExplosion(x, y, color) {
  // Radial sparks
  for (let i = 0; i < 36; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 220;
    particles.push({
      x, y,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      life:  1,
      decay: 0.8 + Math.random() * 0.6,
      radius: 3 + Math.random() * 5,
      color,
      ring: false,
    });
  }
  // Expanding ring
  particles.push({ x, y, life: 1, decay: 2.5, radius: 0, maxRadius: 50, color, ring: true });
}

/**
 * Advance all particles by dt seconds. Remove dead ones.
 * @param {number} dt - seconds since last frame
 */
function tickParticles(dt) {
  for (const p of particles) {
    if (!p.ring) {
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.vx *= 0.87; // drag
      p.vy *= 0.87;
    }
    p.life -= p.decay * dt;
    if (p.ring) p.radius = p.maxRadius * (1 - p.life);
  }
  particles = particles.filter(p => p.life > 0);
}

/**
 * Draw all particles onto ctx.
 * @param {CanvasRenderingContext2D} ctx
 */
function drawParticles(ctx) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.ring ? p.life * 0.8 : p.life * 0.85);
    if (p.ring) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth   = 2;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.radius), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.radius), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
