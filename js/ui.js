/* ──────────────────────────────────────────────────────────────────────────
   12. UI — button wiring & audio button
─────────────────────────────────────────────────────────────────────────── */

// "Play Online" button
document.getElementById('onlineBtn').onclick = () => {
  initAudio(); // resume AudioContext (requires user gesture)
  gamePhase = 'waiting';
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('waiting').classList.add('on');
  startMatchmaking();
};

// "Local 2-Player" button
document.getElementById('localBtn').onclick = () => {
  initAudio();
  isLocalGame = true;
  isHost      = false;
  scores      = [0, 0];
  document.getElementById('p1lbl').textContent = 'ESDF · Q';
  document.getElementById('p2lbl').textContent = 'ARROWS · M';
  document.getElementById('c1h').textContent   = 'P1: ESDF · Q fire';
  document.getElementById('c2h').textContent   = 'P2: Arrows · M fire';
  document.getElementById('modeLbl').textContent = 'LOCAL 2P';
  initRound();
  startGame();
};

// "Cancel" button on waiting screen
document.getElementById('cancelBtn').onclick = () => showLobby();

// Mute / unmute audio button
document.getElementById('audioBtn').onclick = () => {
  initAudio(); // initialise if not yet started
  toggleMute();
};
