/* ──────────────────────────────────────────────────────────────────────────
   11. NETWORKING — FastAPI WebSocket (Technical Component G)

   Protocol messages (JSON):
   • {t:'hello', role:'p1'|'p2'}      — announce role on connect
   • {t:'inp',   inp:{...}}            — P2 → host: input snapshot
   • {t:'state', tanks, pus, scores,  — host → P2: authoritative state
               roundover, playing, roundWinner}
   • {t:'start', seed, scores}         — host → P2: begin game
   • {t:'newround', seed, scores}      — host → P2: next round
   • {t:'ping', ts} / {t:'pong', ts}   — latency measurement

   The FastAPI server simply broadcasts every message to all connected clients.
   The role negotiation (who is p1/host vs p2/joiner) happens client-side by
   listening for 1.5 s to detect an existing host's heartbeat.
─────────────────────────────────────────────────────────────────────────── */

let wsConnection = null;  // active WebSocket instance
let myRole       = null;  // 'p1' (host) or 'p2' (joiner)
let pingInterval = null;  // interval ID for latency pings

/**
 * Helper: update a row in the diagnostic panel.
 * @param {string} id        - one of 'ws', 'role', 'lobby', 'game'
 * @param {string} icon      - emoji icon
 * @param {string} statusTxt - text shown on the right
 * @param {string} cssClass  - 'ds-ok' | 'ds-fail' | 'ds-spin'
 */
function diagSetStep(id, icon, statusTxt, cssClass) {
  const row = document.getElementById('d-' + id);
  const st  = document.getElementById('ds-' + id);
  if (!row || !st) return;
  row.querySelector('.diag-icon').textContent = icon;
  st.textContent = statusTxt;
  st.className   = 'diag-status ' + (cssClass || '');
}

/** Set the status message below the diagnostic panel. */
function diagSetMessage(msg, color) {
  const el = document.getElementById('waitMsg');
  if (el) { el.textContent = msg; el.style.color = color || '#f5c518'; }
}

/** Reset all diagnostic rows to their initial "waiting" state. */
function diagReset() {
  ['ws','role','lobby','game'].forEach(id => diagSetStep(id, '⏳', 'waiting…', 'ds-spin'));
  diagSetMessage('');
  document.getElementById('waitTitle').textContent = 'Connecting…';
}

/**
 * Build the WebSocket URL from the current page origin.
 * Works whether served from the FastAPI server or opened from file://.
 */
function getWebSocketUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host  = (location.hostname === '127.0.0.1' ||
                 location.hostname === 'localhost'  ||
                 location.hostname === '')
                ? 'localhost:8081'
                : location.host;
  return 'wss://csfinal1-production.up.railway.app/ws';
}

/**
 * Open a WebSocket connection to the FastAPI server.
 * Returns a Promise that resolves when the connection is open,
 * or rejects after a 10-second timeout.
 */
function connectWebSocket() {
  return new Promise((resolve, reject) => {
    const url = getWebSocketUrl();
    diagSetStep('ws', '🔄', 'connecting to ' + url, 'ds-spin');
    try {
      wsConnection = new WebSocket(url);
    } catch (err) {
      diagSetStep('ws', '❌', 'could not open', 'ds-fail');
      reject(err); return;
    }

    const timeout = setTimeout(() => {
      diagSetStep('ws', '❌', 'timed out', 'ds-fail');
      reject(new Error('WebSocket connection timed out'));
    }, 10000);

    wsConnection.onopen = () => {
      clearTimeout(timeout);
      diagSetStep('ws', '✅', 'connected', 'ds-ok');
      resolve(wsConnection);
    };
    wsConnection.onerror = () => {
      clearTimeout(timeout);
      diagSetStep('ws', '❌', 'error', 'ds-fail');
      reject(new Error('WebSocket error'));
    };
    wsConnection.onclose = () => {
      document.getElementById('pingEl').textContent = '⚠ disconnected';
    };
  });
}

/** Send a JSON-encoded message through the WebSocket (if open). */
function sendWsMessage(obj) {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify(obj));
  }
}

/** Send authoritative game state from host to joiner at ~20 Hz. */
function netSendState() {
  if (myRole !== 'p1') return;
  sendWsMessage({
    t:           'state',
    tanks:       tanks.map(t => t.toJSON()),
    pus:         powerupItems.map(p => p.toJSON()),
    scores,
    roundover:   gamePhase === 'roundover',
    playing:     gamePhase === 'playing',
    roundWinner,
  });
}

/** Send local input snapshot from joiner to host at ~20 Hz. */
function netSendInput() {
  if (myRole !== 'p2') return;
  sendWsMessage({ t: 'inp', inp: getInputSnapshot(KEYS_P2) });
}

/**
 * Handle an incoming WebSocket message.
 * Branches on myRole ('p1' = host receives joiner data; 'p2' = joiner receives host state).
 * @param {MessageEvent} evt
 */
function onWebSocketMessage(evt) {
  let data;
  try { data = JSON.parse(evt.data); } catch { return; }
  if (!data || !data.t) return;

  if (myRole === 'p1') {
    // ── HOST receives ───────────────────────────────────────────────────────
    if (data.t === 'hello' && data.role === 'p2') {
      // A joiner has appeared — start the game
      diagSetStep('game', '✅', 'P2 connected!', 'ds-ok');
      diagSetMessage('Opponent connected! Starting…', '#4caf50');
      isHost   = true;
      const seed = Math.floor(Math.random() * 0xFFFFFF);
      initRound(seed);
      sendWsMessage({ t: 'start', seed, scores: [0, 0] });
      startGame();
      startPingLoop();
    }
    if (data.t === 'inp')  remoteInput = data.inp || {};
    if (data.t === 'pong') {
      document.getElementById('pingEl').textContent = (Date.now() - data.ts) + 'ms';
    }
  }

  if (myRole === 'p2') {
    // ── JOINER receives ─────────────────────────────────────────────────────
    if (data.t === 'start') {
      scores = data.scores || [0, 0];
      initRound(data.seed);
      startGame();
      startPingLoop();
    }
    if (data.t === 'state') {
      // Apply authoritative state from host
      if (data.tanks && tanks.length === 2) {
        data.tanks.forEach((d, i) => { if (tanks[i]) tanks[i].applyJSON(d); });
      }
      if (data.pus) {
        powerupItems = (data.pus || [])
          .map(p => {
            const type = POWERUP_TYPES.find(t => t.id === p.typeId) || POWERUP_TYPES[0];
            const item = new PowerUpItem(p.x, p.y, type, p.pulse);
            item.alive = p.alive;
            return item;
          })
          .filter(p => p.alive);
      }
      if (data.scores) { scores = data.scores; updateScoreHUD(); }
      updatePowerupHUD();
      if (data.roundover && gamePhase !== 'roundover') { roundWinner = data.roundWinner; showRoundOver(); }
      if (data.playing   && gamePhase === 'roundover') hideRoundOver();
    }
    if (data.t === 'newround') {
      hideRoundOver();
      initRound(data.seed);
      scores = data.scores || scores;
      updateScoreHUD();
    }
    if (data.t === 'ping') sendWsMessage({ t: 'pong', ts: data.ts });
  }
}

/** Start the ping/pong interval to measure round-trip latency. */
function startPingLoop() {
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = setInterval(() => {
    if (myRole === 'p1') sendWsMessage({ t: 'ping', ts: Date.now() });
  }, 2500);
}

/** Tear down WebSocket and ping loop. */
function stopNetwork() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  if (wsConnection) { try { wsConnection.close(); } catch {} wsConnection = null; }
  myRole = null;
}

/**
 * Full matchmaking flow:
 *  1. Connect to the FastAPI WebSocket server.
 *  2. Listen for 1.5 s to detect an existing host (state broadcasts).
 *  3. Become host (P1) or joiner (P2) accordingly.
 *  4. As host: broadcast presence heartbeat until a P2 arrives.
 *  5. As joiner: wait for the host's 'start' message.
 */
async function startMatchmaking() {
  diagReset();
  diagSetMessage('Step 1/3 — Connecting to game server…');

  // Step 1: WebSocket connection
  try {
    await connectWebSocket();
  } catch {
    diagSetMessage('Cannot reach server at ' + getWebSocketUrl() + '. Is the FastAPI server running?', '#ff3d71');
    return;
  }

  wsConnection.onmessage = onWebSocketMessage;

  // Step 2: detect whether a host is already broadcasting
  diagSetStep('role', '🔄', 'detecting host…', 'ds-spin');
  diagSetMessage('Step 2/3 — Listening for existing host…');
  let existingHostDetected = false;
  const detectListener = evt => {
    let msg; try { msg = JSON.parse(evt.data); } catch { return; }
    if (msg && (msg.t === 'state' || msg.t === 'start')) existingHostDetected = true;
  };
  wsConnection.addEventListener('message', detectListener);
  await new Promise(r => setTimeout(r, 1500));
  wsConnection.removeEventListener('message', detectListener);

  // Step 3: claim role
  if (existingHostDetected) {
    // Join as P2
    myRole      = 'p2';
    isHost      = false;
    isLocalGame = false;
    diagSetStep('role',  '✅', 'joined as Player 2', 'ds-ok');
    diagSetStep('lobby', '✅', 'found host',         'ds-ok');
    diagSetStep('game',  '🔄', 'waiting for start…', 'ds-spin');
    diagSetMessage('Step 3/3 — Found a host! Waiting for game start…');
    setOnlineLabels(false);
    sendWsMessage({ t: 'hello', role: 'p2' });
  } else {
    // Become P1 / host
    myRole      = 'p1';
    isHost      = true;
    isLocalGame = false;
    diagSetStep('role',  '✅', 'you are Player 1 (host)', 'ds-ok');
    diagSetStep('lobby', '🔄', 'waiting for Player 2…',   'ds-spin');
    diagSetStep('game',  '🔄', 'waiting for opponent…',   'ds-spin');
    diagSetMessage('Step 3/3 — Waiting for an opponent to open the same page…');
    document.getElementById('waitTitle').textContent = 'Waiting for opponent…';
    setOnlineLabels(true);

    // Broadcast our presence so a latecomer P2 can detect us
    sendWsMessage({ t: 'hello', role: 'p1' });
    const presenceInterval = setInterval(() => {
      if (gamePhase !== 'waiting') { clearInterval(presenceInterval); return; }
      sendWsMessage({ t: 'hello', role: 'p1' });
    }, 2000);

    // Also broadcast empty state so P2 detection works
    const heartbeat = setInterval(() => {
      if (gamePhase !== 'waiting') { clearInterval(heartbeat); return; }
      sendWsMessage({ t: 'state', tanks: [], pus: [], scores: [0,0], roundover: false, playing: false, roundWinner: null });
    }, 500);
  }
}

/** Update the HUD labels to reflect online roles. */
function setOnlineLabels(amHost) {
  if (amHost) {
    document.getElementById('p1lbl').textContent = 'ESDF · Q (YOU)';
    document.getElementById('p2lbl').textContent = 'REMOTE';
    document.getElementById('c1h').textContent   = 'YOU: ESDF · Q fire';
    document.getElementById('c2h').textContent   = 'Opponent: remote';
  } else {
    document.getElementById('p1lbl').textContent = 'REMOTE';
    document.getElementById('p2lbl').textContent = 'ARROWS · M (YOU)';
    document.getElementById('c1h').textContent   = 'Opponent: remote';
    document.getElementById('c2h').textContent   = 'YOU: Arrows · M fire';
  }
  document.getElementById('modeLbl').textContent = 'ONLINE';
}

/** Return to the lobby screen and stop any active network session. */
function showLobby() {
  stopNetwork();
  gamePhase = 'lobby';
  gameLoop.stop();
  document.getElementById('waiting').classList.remove('on');
  document.getElementById('lobby').style.display = 'flex';
}
