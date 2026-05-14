/* ──────────────────────────────────────────────────────────────────────────
   10. MAIN GAME LOOP — Kontra.gameLoop
   Kontra's gameLoop handles requestAnimationFrame and provides dt in seconds.
   update() runs game logic; render() draws the frame.
─────────────────────────────────────────────────────────────────────────── */

/** Kontra canvas + context setup */
const { canvas, context } = kontra.init('gc');

/**
 * The Kontra game loop — the heart of the engine integration.
 * kontra.GameLoop calls update(dt) then render() every frame.
 */
const gameLoop = kontra.GameLoop({

  /**
   * update(dt) — advance game logic.
   * dt is provided in seconds by Kontra.
   * @param {number} dt
   */
  update(dt) {
    if (gamePhase !== 'playing' && gamePhase !== 'roundover') return;

    // Advance particles every frame regardless of round state
    tickParticles(dt);

    if (gamePhase === 'playing') {
      if (isLocalGame) {
        // ── Local 2-player: both tanks are controlled locally ──────────────
        tanks[0].update(dt, getInputSnapshot(KEYS_P1), tanks[1]);
        tanks[1].update(dt, getInputSnapshot(KEYS_P2), tanks[0]);
        powerupSpawnTimer -= dt;
        if (powerupSpawnTimer <= 0) {
          spawnPowerup();
          powerupSpawnTimer = 8 + Math.random() * 6;
        }
        for (const item of powerupItems) item.update(dt);
        checkPowerupPickups();
        checkProjectileHits();

      } else if (isHost) {
        // ── Online host: P1 is local, P2 input comes via WebSocket ─────────
        tanks[0].update(dt, getInputSnapshot(KEYS_P1), tanks[1]);
        tanks[1].update(dt, {
          up:    !!remoteInput.up,
          down:  !!remoteInput.down,
          left:  !!remoteInput.left,
          right: !!remoteInput.right,
          fire:  !!remoteInput.fire,
        }, tanks[0]);
        powerupSpawnTimer -= dt;
        if (powerupSpawnTimer <= 0) {
          spawnPowerup();
          powerupSpawnTimer = 8 + Math.random() * 6;
        }
        for (const item of powerupItems) item.update(dt);
        checkPowerupPickups();
        checkProjectileHits();
        // Send authoritative state to the joiner at 20 Hz
        networkSendTimer += dt;
        if (networkSendTimer > 0.05) { netSendState(); networkSendTimer = 0; }

      } else {
        // ── Online joiner (P2): send inputs, receive state from host ────────
        networkSendTimer += dt;
        if (networkSendTimer > 0.05) { netSendInput(); networkSendTimer = 0; }
      }
    }

    // ── Round-over countdown (only host / local advances) ─────────────────
    if (gamePhase === 'roundover' && (isLocalGame || isHost)) {
      roundTimer -= dt;
      if (roundTimer <= 0) {
        hideRoundOver();
        const nextSeed = Math.floor(Math.random() * 0xFFFFFF);
        initRound(nextSeed);
        if (isHost && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
          sendWsMessage({ t: 'newround', seed: nextSeed, scores });
        }
      }
    }
  },

  /**
   * render() — draw the frame.
   * Called after update() each tick.
   */
  render() {
    if (gamePhase !== 'playing' && gamePhase !== 'roundover') return;

    drawMaze(context);

    // Draw power-up items
    for (const item of powerupItems) item.draw(context);

    // Draw tanks (and their projectiles)
    for (const tank of tanks) tank.draw(context);

    // Draw particles on top
    drawParticles(context);
  },
});

/** Accumulator for network send throttle (reset in gameLoop.update). */
let networkSendTimer = 0;

/** Transition to the in-game view and start the Kontra loop. */
function startGame() {
  gamePhase = 'playing';
  document.getElementById('lobby').style.display   = 'none';
  document.getElementById('waiting').classList.remove('on');
  document.getElementById('hud').classList.add('on');
  document.getElementById('roundOverlay').classList.remove('on');
  updateScoreHUD();
  gameLoop.start(); // Kontra handles rAF from here
}
