/* ──────────────────────────────────────────────────────────────────────────
   7. TANK CLASS
   Uses a Kontra Sprite under the hood for position/velocity bookkeeping,
   while the custom draw() renders the detailed tank body.
─────────────────────────────────────────────────────────────────────────── */

/**
 * A player-controlled tank.
 * Kontra.Sprite is used for dt-based position updates and bounding-box access.
 */
class Tank {
  /**
   * @param {number} playerIndex - 0 or 1
   * @param {number} x - initial world x
   * @param {number} y - initial world y
   * @param {number} startAngle - initial facing angle (radians)
   * @param {string} color - hex colour
   */
  constructor(playerIndex, x, y, startAngle, color) {
    this.id     = playerIndex;
    this.color  = color;
    this.alive  = true;

    // ── Kontra Sprite — handles position; we override draw() entirely ──
    this.sprite = kontra.Sprite({
      x, y,
      width:  TANK_RADIUS * 2,
      height: TANK_RADIUS * 2,
      anchor: { x: 0.5, y: 0.5 }, // centre origin
    });

    this.angle       = startAngle;
    this.fireCooldown = 0;    // seconds until next shot allowed
    this.treadOffset  = 0;    // animates tread marks
    this.powerupId    = null; // current power-up ('missile', 'laser', etc.)
    this.powerupTimer = 0;    // seconds remaining
    this.shieldActive = false;
    this.speedMulti   = 1;

    // Projectile lists owned by this tank
    this.bullets  = [];
    this.missiles = [];
    this.lasers   = [];
  }

  // Convenience accessors that delegate to the Kontra Sprite
  get x() { return this.sprite.x; }
  set x(v) { this.sprite.x = v; }
  get y() { return this.sprite.y; }
  set y(v) { this.sprite.y = v; }

  /**
   * Activate a collected power-up.
   * @param {string} typeId
   */
  activatePowerup(typeId) {
    this.powerupId = typeId;
    if (typeId === 'shield') { this.shieldActive = true;  this.powerupTimer = 8; }
    else if (typeId === 'speed') { this.speedMulti = 2.2; this.powerupTimer = 6; }
    else                                                  { this.powerupTimer = 15; }
    updatePowerupHUD();
  }

  /**
   * Main update — called once per frame.
   * Reads input, moves, resolves wall collisions, fires weapons, ticks projectiles.
   * @param {number} dt - seconds since last frame
   * @param {{up,down,left,right,fire}} input - boolean key states
   * @param {Tank} enemyTank - for missile homing target
   */
  update(dt, input, enemyTank) {
    if (!this.alive) return;

    // ── Rotation ──────────────────────────────────────────────────────────
    if (input.left)  this.angle -= TANK_ROTATION * dt;
    if (input.right) this.angle += TANK_ROTATION * dt;

    // ── Translation ───────────────────────────────────────────────────────
    if (input.up || input.down) {
      const direction = input.up ? 1 : -1;
      this.x += Math.cos(this.angle) * TANK_SPEED * this.speedMulti * direction * dt;
      this.y += Math.sin(this.angle) * TANK_SPEED * this.speedMulti * direction * dt;
      this.treadOffset += dt * 9; // animate tread marks
    }

    // Resolve wall overlaps (3 passes for stability)
    for (let pass = 0; pass < 3; pass++) {
      for (const wall of walls) this._resolveWall(wall);
    }
    // Hard clamp to canvas edges
    this.x = Math.max(TANK_RADIUS, Math.min(CANVAS_W - TANK_RADIUS, this.x));
    this.y = Math.max(TANK_RADIUS, Math.min(CANVAS_H - TANK_RADIUS, this.y));

    // ── Cooldowns & power-up expiry ───────────────────────────────────────
    this.fireCooldown -= dt;
    if (this.powerupTimer > 0) {
      this.powerupTimer -= dt;
      if (this.powerupTimer <= 0) {
        if (this.powerupId === 'speed')  this.speedMulti  = 1;
        if (this.powerupId === 'shield') this.shieldActive = false;
        this.powerupId = null;
        updatePowerupHUD();
      }
    }

    // ── Fire ──────────────────────────────────────────────────────────────
    if (input.fire && this.fireCooldown <= 0) this._fire();

    // ── Tick projectiles ──────────────────────────────────────────────────
    for (const bullet  of this.bullets)  bullet.update(dt);
    for (const missile of this.missiles) missile.update(dt, enemyTank);
    for (const laser   of this.lasers)   laser.update(dt);

    this.bullets  = this.bullets.filter(b => !b.dead);
    this.missiles = this.missiles.filter(m => !m.dead);
    this.lasers   = this.lasers.filter(l => !l.dead);
  }

  /**
   * Spawn a projectile based on the active power-up (or default bullet).
   * Fires from the tip of the barrel.
   */
  _fire() {
    const barrelX = this.x + Math.cos(this.angle) * (TANK_RADIUS + 8);
    const barrelY = this.y + Math.sin(this.angle) * (TANK_RADIUS + 8);

    if (this.powerupId === 'missile') {
      this.missiles.push(new Missile(barrelX, barrelY, this.angle, this.id, this.color));
      this.fireCooldown = 0.5;
    } else if (this.powerupId === 'laser') {
      this.lasers.push(new Laser(barrelX, barrelY, this.angle, this.id, this.color));
      this.fireCooldown = 0.4;
    } else if (this.powerupId === 'triple') {
      // Spread three bullets at -13°, 0°, +13°
      for (const offset of [-0.22, 0, 0.22]) {
        if (this.bullets.length < MAX_BULLETS + 3) {
          this.bullets.push(new Bullet(barrelX, barrelY, this.angle + offset, this.id, false));
        }
      }
      this.fireCooldown = FIRE_COOLDOWN;
    } else if (this.powerupId === 'bigbullet') {
      if (this.bullets.length < MAX_BULLETS) {
        this.bullets.push(new Bullet(barrelX, barrelY, this.angle, this.id, true));
      }
      this.fireCooldown = 0.5;
    } else {
      // Default single bullet
      if (this.bullets.length < MAX_BULLETS) {
        this.bullets.push(new Bullet(barrelX, barrelY, this.angle, this.id, false));
      }
      this.fireCooldown = FIRE_COOLDOWN;
    }

    sfxShoot(this.color);
  }

  /**
   * Push the tank out of a wall if overlapping.
   * Operates on one axis at a time (horizontal walls push Y, vertical push X).
   * @param {{x1,y1,x2,y2}} wall
   */
  _resolveWall(wall) {
    const isHorizontal = wall.y1 === wall.y2;
    const pad          = TANK_RADIUS + WALL_THICK;

    if (isHorizontal) {
      // Ignore if tank centre is too far left/right of the wall segment
      if (this.x < Math.min(wall.x1, wall.x2) - TANK_RADIUS) return;
      if (this.x > Math.max(wall.x1, wall.x2) + TANK_RADIUS) return;
      const penetration = this.y - wall.y1;
      if (Math.abs(penetration) < pad) this.y = wall.y1 + (penetration >= 0 ? pad : -pad);
    } else {
      if (this.y < Math.min(wall.y1, wall.y2) - TANK_RADIUS) return;
      if (this.y > Math.max(wall.y1, wall.y2) + TANK_RADIUS) return;
      const penetration = this.x - wall.x1;
      if (Math.abs(penetration) < pad) this.x = wall.x1 + (penetration >= 0 ? pad : -pad);
    }
  }

  /**
   * Draw the tank body using native canvas 2D, positioned via the Kontra Sprite.
   * Also draws all owned projectiles.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    if (!this.alive) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Subtle glow halo
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Shield pulse ring
    if (this.shieldActive) {
      ctx.save();
      ctx.globalAlpha  = 0.25 + Math.sin(Date.now() * 0.005) * 0.1;
      ctx.strokeStyle  = '#4488ff';
      ctx.lineWidth    = 3;
      ctx.shadowColor  = '#4488ff';
      ctx.shadowBlur   = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Speed-boost streaks behind the tank
    if (this.speedMulti > 1) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth   = 1.5;
      for (let i = 0; i < 3; i++) {
        const offsetY = (i - 1) * 8;
        ctx.beginPath();
        ctx.moveTo(-18, offsetY);
        ctx.lineTo(-28, offsetY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Tracks (two rectangles with animated groove marks) ────────────────
    for (const side of [-1, 1]) {
      const trackY = side * 10;
      ctx.fillStyle = '#111a28';
      ctx.beginPath();
      roundRect(ctx, -14, trackY - 4, 28, 8, 2);
      ctx.fill();
      // Animated groove lines
      ctx.strokeStyle = this.color + '55';
      ctx.lineWidth   = 1;
      for (let segment = 0; segment < 7; segment++) {
        const gx = -14 + ((segment * 4 + this.treadOffset * side * 2) % 28 + 28) % 28;
        ctx.beginPath();
        ctx.moveTo(gx, trackY - 4);
        ctx.lineTo(gx, trackY + 4);
        ctx.stroke();
      }
      // Track outline
      ctx.strokeStyle = this.color + '30';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      roundRect(ctx, -14, trackY - 4, 28, 8, 2);
      ctx.stroke();
    }

    // ── Hull body ─────────────────────────────────────────────────────────
    const hullGrad = ctx.createLinearGradient(-11, -7, 11, 7);
    hullGrad.addColorStop(0,   this.color + 'cc');
    hullGrad.addColorStop(0.6, this.color + '77');
    hullGrad.addColorStop(1,   this.color + '33');
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    roundRect(ctx, -11, -7, 22, 14, 3);
    ctx.fill();
    ctx.strokeStyle = this.color + '80';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    roundRect(ctx, -11, -7, 22, 14, 3);
    ctx.stroke();

    // Turret dome
    ctx.fillStyle   = this.color + 'aa';
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Barrel (colour changes to power-up colour when active)
    const barrelColor = this.powerupId
      ? (POWERUP_TYPES.find(p => p.id === this.powerupId)?.color || this.color)
      : this.color;
    ctx.fillStyle   = barrelColor + 'cc';
    ctx.strokeStyle = barrelColor + '99';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.rect(4, -2.5, 14, 5);
    ctx.fill();
    ctx.stroke();
    // Muzzle cap
    ctx.fillStyle = barrelColor;
    ctx.beginPath();
    ctx.rect(16, -3, 3.5, 6);
    ctx.fill();

    // Glint highlight on hull
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.beginPath();
    ctx.ellipse(-1, -3, 4, 1.8, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Draw projectiles (after restoring transform so they draw in world space)
    for (const bullet  of this.bullets)  bullet.draw(ctx);
    for (const missile of this.missiles) missile.draw(ctx);
    for (const laser   of this.lasers)   laser.draw(ctx);
  }

  /** Serialise full tank state for network transmission. */
  toJSON() {
    return {
      id:           this.id,
      x:            this.x,
      y:            this.y,
      angle:        this.angle,
      alive:        this.alive,
      powerupId:    this.powerupId,
      powerupTimer: this.powerupTimer,
      shieldActive: this.shieldActive,
      speedMulti:   this.speedMulti,
      bullets:      this.bullets.map(b => b.toJSON()),
      missiles:     this.missiles.map(m => m.toJSON()),
    };
  }

  /** Apply network state from the host (P2 client-side). */
  applyJSON(data) {
    this.x            = data.x;
    this.y            = data.y;
    this.angle        = data.angle;
    this.alive        = data.alive;
    this.powerupId    = data.powerupId;
    this.powerupTimer = data.powerupTimer;
    this.shieldActive = data.shieldActive;
    this.speedMulti   = data.speedMulti;
    this.bullets  = data.bullets.map(b => Bullet.from(b));
    this.missiles = (data.missiles || []).map(m => {
      const ms = new Missile(m.x, m.y, m.angle, m.owner, m.owner === 0 ? COLOR_P1 : COLOR_P2);
      ms.age = m.age;
      return ms;
    });
  }
}
