/* ──────────────────────────────────────────────────────────────────────────
   9. GAME STATE & ROUND LOGIC
─────────────────────────────────────────────────────────────────────────── */

/** Active tanks (always two). */
let tanks = [];
/** Active power-up items on the map. */
let powerupItems = [];
/** Scores — index 0 = P1, index 1 = P2. */
let scores = [0, 0];
/** Current phase: 'lobby' | 'waiting' | 'playing' | 'roundover' */
let gamePhase = 'lobby';
/** Countdown timer (seconds) during 'roundover' phase. */
let roundTimer = 0;
/** Index (0 or 1) of the player who won the current round. */
let roundWinner = null;
/** True if running a local 2-player game. */
let isLocalGame = false;
/** True if this client is the host in an online game. */
let isHost = false;
/** Seed used for the current round's maze. */
let currentSeed = 1;

// Key state tracking
const heldKeys = {};
window.addEventListener('keydown', e => {
  heldKeys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { heldKeys[e.code] = false; });

/** Remote player's latest input (received over WebSocket). */
let remoteInput = {};

/** Time accumulator for spawning power-ups. */
let powerupSpawnTimer = 0;

/** Build an input snapshot from held keys for the given key map. */
function getInputSnapshot(keyMap) {
  return {
    up:    !!heldKeys[keyMap.up],
    down:  !!heldKeys[keyMap.down],
    left:  !!heldKeys[keyMap.left],
    right: !!heldKeys[keyMap.right],
    fire:  !!heldKeys[keyMap.fire],
  };
}

/** Update the power-up HUD slots in the header for both players. */
function updatePowerupHUD() {
  [0, 1].forEach(i => {
    const el   = document.getElementById('pu' + (i + 1));
    if (!el) return;
    const tank = tanks[i];
    if (!tank || !tank.powerupId) { el.innerHTML = ''; return; }
    const pu = POWERUP_TYPES.find(p => p.id === tank.powerupId);
    if (!pu) return;
    el.innerHTML = `<div class="pu-slot active"
                        style="border-color:${pu.color};box-shadow:0 0 8px ${pu.color}44">
                      ${pu.label}
                    </div>`;
  });
}

/**
 * Pick a spawn position in a random cell, ensuring it's far from `otherPos`.
 * @param {Function} rng - seeded PRNG
 * @param {{x,y}|null} otherPos
 * @returns {{x,y}}
 */
function pickSpawnPosition(rng, otherPos) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const col = Math.floor(rng() * COLS);
    const row = Math.floor(rng() * ROWS);
    const x   = col * CELL + CELL / 2;
    const y   = row * CELL + CELL / 2;
    if (!otherPos || Math.hypot(x - otherPos.x, y - otherPos.y) > CELL * 5) return { x, y };
  }
  return { x: CELL * 1.5, y: CELL * 1.5 }; // fallback
}

/**
 * Initialise a new round: generate maze, place tanks, clear projectiles & particles.
 * @param {number} [seed] - if omitted, a random seed is chosen
 */
function initRound(seed) {
  currentSeed   = seed || Math.floor(Math.random() * 0xFFFFFF);
  const rng     = seededRng(currentSeed);
  walls         = buildWalls(makeMaze(currentSeed));
  particles     = [];
  powerupItems  = [];
  powerupSpawnTimer = 5; // first power-up appears after 5 seconds

  const pos1 = pickSpawnPosition(rng, null);
  const pos2 = pickSpawnPosition(rng, pos1);

  tanks = [
    new Tank(0, pos1.x, pos1.y, 0,         COLOR_P1),
    new Tank(1, pos2.x, pos2.y, Math.PI,   COLOR_P2),
  ];
  updatePowerupHUD();
}

/**
 * Attempt to spawn a power-up at a random open cell (max 4 on map at once).
 */
function spawnPowerup() {
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  for (let attempt = 0; attempt < 50; attempt++) {
    const col = Math.floor(Math.random() * COLS);
    const row = Math.floor(Math.random() * ROWS);
    const x   = col * CELL + CELL / 2;
    const y   = row * CELL + CELL / 2;
    const farFromTanks = tanks.every(t => !t.alive || Math.hypot(t.x - x, t.y - y) > CELL * 2);
    if (farFromTanks && powerupItems.length < 4) {
      powerupItems.push(new PowerUpItem(x, y, type));
      return;
    }
  }
}

/**
 * Check each living tank against all power-up items.
 * If a tank overlaps an item, collect it.
 */
function checkPowerupPickups() {
  for (const item of powerupItems) {
    if (!item.alive) continue;
    for (const tank of tanks) {
      if (!tank.alive) continue;
      if (Math.hypot(tank.x - item.x, tank.y - item.y) < TANK_RADIUS + item.radius) {
        item.alive = false;
        tank.activatePowerup(item.type.id);
        spawnExplosion(item.x, item.y, item.type.color);
        sfxPickup();
      }
    }
  }
  powerupItems = powerupItems.filter(p => p.alive);
}

/**
 * Check all projectiles against all tanks.
 * Kills tanks on hit (respecting the shield power-up).
 * Returns early after the first kill (one death per frame is enough).
 */
function checkProjectileHits() {
  for (const shooter of tanks) {

    // ── Normal bullets ────────────────────────────────────────────────────
    for (const bullet of shooter.bullets) {
      for (const target of tanks) {
        if (!target.alive) continue;
        if (bullet.owner === target.id && bullet.age < 0.15) continue; // grace period at spawn
        if (Math.hypot(bullet.x - target.x, bullet.y - target.y) < TANK_RADIUS + bullet.radius) {
          bullet.dead = true;
          if (target.shieldActive) {
            target.shieldActive = false;
            target.powerupId    = null;
            spawnExplosion(target.x, target.y, '#4488ff');
            sfxExplosion();
            updatePowerupHUD();
            continue;
          }
          killTank(target, bullet.owner);
          return;
        }
      }
    }

    // ── Missiles ──────────────────────────────────────────────────────────
    for (const missile of shooter.missiles) {
      for (const target of tanks) {
        if (!target.alive) continue;
        if (missile.owner === target.id && missile.age < 0.3) continue;
        if (Math.hypot(missile.x - target.x, missile.y - target.y) < TANK_RADIUS + missile.radius + 2) {
          missile.dead = true;
          if (target.shieldActive) {
            target.shieldActive = false;
            target.powerupId    = null;
            spawnExplosion(target.x, target.y, '#4488ff');
            sfxExplosion();
            updatePowerupHUD();
            continue;
          }
          killTank(target, missile.owner);
          return;
        }
      }
    }

    // ── Lasers (only instant hit on frame of creation, age < 0.05) ────────
    for (const laser of shooter.lasers) {
      if (laser.age > 0.05) continue;
      for (const target of tanks) {
        if (!target.alive) continue;
        if (laser.owner === target.id) continue;
        if (laser.hitsPoint(target.x, target.y, TANK_RADIUS)) {
          if (target.shieldActive) {
            target.shieldActive = false;
            target.powerupId    = null;
            spawnExplosion(target.x, target.y, '#4488ff');
            sfxExplosion();
            updatePowerupHUD();
            continue;
          }
          killTank(target, laser.owner);
          return;
        }
      }
    }
  }
}

/**
 * Kill a tank, credit the score, and show the round-over overlay.
 * @param {Tank} target - tank that was hit
 * @param {number} shooterIndex - index of the tank that fired
 */
function killTank(target, shooterIndex) {
  target.alive = false;
  spawnExplosion(target.x, target.y, target.color);
  sfxExplosion();

  // Award the point: if shooter killed themselves, the other player scores
  const winnerIndex = (shooterIndex === target.id) ? 1 - target.id : shooterIndex;
  scores[winnerIndex]++;
  roundWinner = winnerIndex;
  showRoundOver();
}

/** Display the round-over overlay and update the HUD scores. */
function showRoundOver() {
  gamePhase   = 'roundover';
  roundTimer  = RESPAWN_DELAY;
  const label = document.getElementById('rwText');
  label.textContent  = `PLAYER ${roundWinner + 1} WINS`;
  label.style.color  = roundWinner === 0 ? COLOR_P1 : COLOR_P2;
  label.style.textShadow = `0 0 30px ${roundWinner === 0 ? COLOR_P1 : COLOR_P2}`;
  document.getElementById('roundOverlay').classList.add('on');
  updateScoreHUD();
}

/** Hide the round-over overlay and resume playing. */
function hideRoundOver() {
  gamePhase = 'playing';
  document.getElementById('roundOverlay').classList.remove('on');
}

/** Sync score display in the HUD header. */
function updateScoreHUD() {
  document.getElementById('sc1').textContent = scores[0];
  document.getElementById('sc2').textContent = scores[1];
}
