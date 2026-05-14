/* ──────────────────────────────────────────────────────────────────────────
   6. PROJECTILES — Bullet, Laser, Missile
─────────────────────────────────────────────────────────────────────────── */

/* ── Bullet ────────────────────────────────────────────────────────────── */

/**
 * A standard bullet that bounces off walls up to MAX_BOUNCES times.
 * Supports oversized "big" bullets spawned by the bigbullet power-up.
 */
class Bullet {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} angle - radians
   * @param {number} ownerIndex - 0 = P1, 1 = P2
   * @param {boolean} big - oversized bullet flag
   */
  constructor(x, y, angle, ownerIndex, big = false) {
    this.x        = x;
    this.y        = y;
    this.vx       = Math.cos(angle) * BULLET_SPEED;
    this.vy       = Math.sin(angle) * BULLET_SPEED;
    this.owner    = ownerIndex;
    this.bounces  = 0;
    this.age      = 0;
    this.dead     = false;
    this.radius   = big ? 9 : BULLET_RADIUS;
    this.big      = big;
    this.trail    = []; // recent positions for motion trail rendering
  }

  /** Advance physics by dt. Checks wall collisions and bounces. @param {number} dt */
  update(dt) {
    this.age += dt;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 10) this.trail.shift();
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    for (const wall of walls) {
      if (this._hitsWall(wall)) {
        this._bounce(wall);
        this.bounces++;
        sfxBounce();
        if (this.bounces > MAX_BOUNCES) { this.dead = true; break; }
      }
    }
  }

  /**
   * AABB check: does this bullet overlap a wall segment?
   * @param {{x1,y1,x2,y2}} wall
   */
  _hitsWall(wall) {
    const isHorizontal = wall.y1 === wall.y2;
    const pad          = this.radius + 3;
    if (isHorizontal) {
      return this.x >= Math.min(wall.x1, wall.x2) &&
             this.x <= Math.max(wall.x1, wall.x2) &&
             Math.abs(this.y - wall.y1) < pad;
    } else {
      return this.y >= Math.min(wall.y1, wall.y2) &&
             this.y <= Math.max(wall.y1, wall.y2) &&
             Math.abs(this.x - wall.x1) < pad;
    }
  }

  /**
   * Reflect velocity off a wall and nudge the bullet away to prevent sticking.
   * @param {{x1,y1,x2,y2}} wall
   */
  _bounce(wall) {
    if (wall.y1 === wall.y2) {
      this.vy = -this.vy;
      this.y  = wall.y1 + (this.y < wall.y1 ? -1 : 1) * (this.radius + 4);
    } else {
      this.vx = -this.vx;
      this.x  = wall.x1 + (this.x < wall.x1 ? -1 : 1) * (this.radius + 4);
    }
  }

  /** Draw bullet + motion trail. @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    const color = this.owner === 0 ? COLOR_P1 : COLOR_P2;
    // Draw fading trail
    for (let i = 0; i < this.trail.length; i++) {
      const pt = this.trail[i];
      ctx.save();
      ctx.globalAlpha = (i / this.trail.length) * 0.4;
      ctx.fillStyle   = color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, this.radius * (i / this.trail.length), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Draw bullet core
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur  = this.big ? 18 : 12;
    ctx.fillStyle   = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Serialise for network. */
  toJSON() {
    return {
      x: this.x, y: this.y, vx: this.vx, vy: this.vy,
      owner: this.owner, bounces: this.bounces, age: this.age,
      radius: this.radius, big: this.big,
    };
  }

  /** Deserialise from network data. */
  static from(data) {
    const bullet    = new Bullet(data.x, data.y, 0, data.owner, data.big);
    bullet.vx       = data.vx;
    bullet.vy       = data.vy;
    bullet.bounces  = data.bounces;
    bullet.age      = data.age;
    bullet.radius   = data.radius;
    return bullet;
  }
}

/* ── Laser ─────────────────────────────────────────────────────────────── */

/**
 * Casts a ray from (x,y) in the given direction, bouncing off walls.
 * Returns an array of {x,y} waypoints tracing the laser beam.
 * @param {number} x
 * @param {number} y
 * @param {number} angle - radians
 * @param {number} maxBounces
 * @returns {Array<{x,y}>}
 */
function castLaserRay(x, y, angle, maxBounces) {
  const waypoints = [{ x, y }];
  let curX = x, curY = y;
  let dirX = Math.cos(angle), dirY = Math.sin(angle);

  for (let bounce = 0; bounce < maxBounces; bounce++) {
    let minT   = Infinity;
    let hitWall = null;

    // Find the nearest wall the ray hits
    for (const wall of walls) {
      const t = rayWallIntersect(curX, curY, dirX, dirY, wall);
      if (t > 1 && t < minT) { minT = t; hitWall = wall; }
    }
    if (!hitWall || minT > 2000) break;

    curX += dirX * minT;
    curY += dirY * minT;
    waypoints.push({ x: curX, y: curY });

    // Reflect direction off the wall's normal
    if (hitWall.y1 === hitWall.y2) dirY = -dirY; // horizontal wall
    else                            dirX = -dirX; // vertical wall
  }

  return waypoints;
}

/**
 * Ray–segment intersection: returns parametric t along the ray to the wall.
 * Returns Infinity if no intersection.
 */
function rayWallIntersect(rx, ry, rdx, rdy, wall) {
  const wallDx = wall.x2 - wall.x1;
  const wallDy = wall.y2 - wall.y1;
  const denom  = rdx * wallDy - rdy * wallDx;
  if (Math.abs(denom) < 0.0001) return Infinity; // parallel

  const t = ((wall.x1 - rx) * wallDy - (wall.y1 - ry) * wallDx) / denom;
  const u = ((wall.x1 - rx) * rdy    - (wall.y1 - ry) * rdx)    / denom;
  return (t > 0.5 && u >= 0 && u <= 1) ? t : Infinity;
}

/**
 * Minimum distance from point (px, py) to line segment [a, b].
 * Used for laser hit detection.
 */
function pointSegmentDist(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - a.x, py - a.y);
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/**
 * A laser beam that persists for ~0.6s and can bounce 8 times.
 */
class Laser {
  constructor(x, y, angle, ownerIndex, color) {
    this.owner    = ownerIndex;
    this.color    = color;
    this.life     = 1;    // fades from 1 → 0
    this.age      = 0;
    this.dead     = false;
    // Pre-compute the bounced ray waypoints at construction time
    this.segments = castLaserRay(x, y, angle, 8);
  }

  /** @param {number} dt */
  update(dt) {
    this.age  += dt;
    this.life -= dt * 1.6;
    if (this.life <= 0) this.dead = true;
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 3;
    ctx.shadowColor = this.color;
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    for (let i = 0; i < this.segments.length - 1; i++) {
      ctx.moveTo(this.segments[i].x, this.segments[i].y);
      ctx.lineTo(this.segments[i + 1].x, this.segments[i + 1].y);
    }
    ctx.stroke();
    // White core line
    ctx.lineWidth   = 1;
    ctx.strokeStyle = '#fff';
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    for (let i = 0; i < this.segments.length - 1; i++) {
      ctx.moveTo(this.segments[i].x, this.segments[i].y);
      ctx.lineTo(this.segments[i + 1].x, this.segments[i + 1].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Check whether a point (px, py) with radius r lies on any laser segment.
   * Only checks during the first frame (age < 0.05) to act as an instant hit.
   */
  hitsPoint(px, py, r) {
    for (let i = 0; i < this.segments.length - 1; i++) {
      if (pointSegmentDist(px, py, this.segments[i], this.segments[i + 1]) < r + 4) return true;
    }
    return false;
  }
}

/* ── Missile ───────────────────────────────────────────────────────────── */

/**
 * Check if a missile (circular) overlaps a wall segment.
 * @param {{x,y,radius}} missile
 * @param {{x1,y1,x2,y2}} wall
 */
function missileHitsWall(missile, wall) {
  const isHorizontal = wall.y1 === wall.y2;
  const pad          = missile.radius + 3;
  if (isHorizontal) {
    return missile.x >= Math.min(wall.x1, wall.x2) &&
           missile.x <= Math.max(wall.x1, wall.x2) &&
           Math.abs(missile.y - wall.y1) < pad;
  } else {
    return missile.y >= Math.min(wall.y1, wall.y2) &&
           missile.y <= Math.max(wall.y1, wall.y2) &&
           Math.abs(missile.x - wall.x1) < pad;
  }
}

/**
 * A homing missile that steers toward the enemy tank.
 * Bounces off walls (simple reflection) and expires after 8 seconds.
 */
class Missile {
  constructor(x, y, angle, ownerIndex, color) {
    this.x       = x;
    this.y       = y;
    this.angle   = angle;
    this.owner   = ownerIndex;
    this.color   = color;
    this.speed   = 220;
    this.dead    = false;
    this.age     = 0;
    this.trail   = [];
    this.radius  = 6;
  }

  /**
   * Advance missile physics.
   * Steers toward the target tank using a simple proportional controller.
   * @param {number} dt
   * @param {Tank|null} targetTank - the enemy tank to home toward
   */
  update(dt, targetTank) {
    this.age += dt;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 20) this.trail.shift();

    // Homing: steer toward target if it's alive
    if (targetTank && targetTank.alive) {
      const desiredAngle = Math.atan2(targetTank.y - this.y, targetTank.x - this.x);
      let delta = desiredAngle - this.angle;
      // Normalise to [-π, π]
      while (delta >  Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.angle += Math.sign(delta) * Math.min(Math.abs(delta), 2.8 * dt);
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    // Bounce off walls
    for (const wall of walls) {
      if (missileHitsWall(this, wall)) {
        if (wall.y1 === wall.y2) this.angle = Math.atan2(-Math.sin(this.angle), Math.cos(this.angle));
        else                     this.angle = Math.atan2( Math.sin(this.angle),-Math.cos(this.angle));
      }
    }

    // Clamp inside canvas
    this.x = Math.max(this.radius, Math.min(CANVAS_W - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(CANVAS_H - this.radius, this.y));

    if (this.age > 8) this.dead = true; // lifetime limit
  }

  /** @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    // Fading trail
    for (let i = 0; i < this.trail.length; i++) {
      const pt = this.trail[i];
      ctx.save();
      ctx.globalAlpha = (i / this.trail.length) * 0.5;
      ctx.fillStyle   = this.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, this.radius * (i / this.trail.length) * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Body
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.shadowColor = this.color;
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius + 2, this.radius - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose highlight
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(this.radius, 0, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Engine flame flicker
    ctx.globalAlpha = 0.7 + Math.random() * 0.3;
    ctx.fillStyle   = '#ff8800';
    ctx.beginPath();
    ctx.ellipse(-this.radius - 2, 0, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Serialise for network. */
  toJSON() {
    return { x: this.x, y: this.y, angle: this.angle, owner: this.owner, age: this.age };
  }
}
