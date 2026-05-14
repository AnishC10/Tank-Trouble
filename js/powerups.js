/* ──────────────────────────────────────────────────────────────────────────
   5. POWER-UPS
   Six power-up types spawn periodically in random maze cells.
   Each is a PowerUpItem that tanks can collect by driving over.
─────────────────────────────────────────────────────────────────────────── */

/** All power-up type definitions */
const POWERUP_TYPES = [
  { id: 'missile',   label: '🚀', color: '#ff6600' }, // homing missile
  { id: 'laser',     label: '⚡', color: '#00ffaa' }, // instant laser beam
  { id: 'triple',    label: '💥', color: '#ff44ff' }, // three-way shot
  { id: 'speed',     label: '💨', color: '#ffff00' }, // speed boost
  { id: 'shield',    label: '🛡', color: '#4488ff' }, // absorb one hit
  { id: 'bigbullet', label: '💣', color: '#ff8800' }, // oversized bullet
];

/**
 * A collectible power-up that floats in the maze.
 */
class PowerUpItem {
  /**
   * @param {number} x
   * @param {number} y
   * @param {{id,label,color}} type
   * @param {number} [pulseOffset] - pre-set pulse phase (for network sync)
   */
  constructor(x, y, type, pulseOffset = Math.random() * Math.PI * 2) {
    this.x      = x;
    this.y      = y;
    this.type   = type;
    this.alive  = true;
    this.pulse  = pulseOffset; // drives the glow animation
    this.radius = 16;
  }

  /** Advance animation. @param {number} dt */
  update(dt) { this.pulse += dt * 2.5; }

  /** Draw glow ring + emoji icon. @param {CanvasRenderingContext2D} ctx */
  draw(ctx) {
    if (!this.alive) return;
    const alpha = 0.6 + Math.sin(this.pulse) * 0.4;
    ctx.save();
    ctx.globalAlpha   = alpha;
    ctx.strokeStyle   = this.type.color;
    ctx.lineWidth     = 2;
    ctx.shadowColor   = this.type.color;
    ctx.shadowBlur    = 12;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha  = alpha * 0.3;
    ctx.fillStyle    = this.type.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha  = alpha;
    ctx.shadowBlur   = 0;
    ctx.font         = '16px serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#fff';
    ctx.fillText(this.type.label, this.x, this.y + 1);
    ctx.restore();
  }

  /** Serialise for network transmission. */
  toJSON() {
    return { x: this.x, y: this.y, typeId: this.type.id, alive: this.alive, pulse: this.pulse };
  }
}
