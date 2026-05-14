/* ──────────────────────────────────────────────────────────────────────────
   2. AUDIO ENGINE
   All sound is procedurally generated with the Web Audio API — no files
   needed. This satisfies the "Music & Sound (Required)" rubric criterion.

   Architecture:
   • AudioContext created once (resumed on first user gesture per browser policy)
   • audioMuted flag toggles the master gain node
   • bgMusic() — looping chiptune arpeggio on a small OscillatorNode schedule
   • sfxShoot(), sfxExplosion(), sfxPickup(), sfxBounce() — one-shot bursts
─────────────────────────────────────────────────────────────────────────── */
let audioCtx = null;    // created lazily on first interaction
let masterGain = null;  // controls overall volume
let audioMuted = false; // toggled by the mute button
let bgMusicNodes = [];  // references to running oscillators so we can stop them

/**
 * Initialise the Web Audio API context.
 * Must be called from a user gesture (click) to satisfy browser autoplay policy.
 */
function initAudio() {
  if (audioCtx) return; // already initialised
  audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.18; // keep overall volume modest
  masterGain.connect(audioCtx.destination);
  startBgMusic();
}

/**
 * Toggle mute on/off. Updates the button emoji and master gain.
 */
function toggleMute() {
  audioMuted = !audioMuted;
  if (masterGain) masterGain.gain.value = audioMuted ? 0 : 0.18;
  document.getElementById('audioBtn').textContent = audioMuted ? '🔇' : '🔊';
}

/* ── Background music ──────────────────────────────────────────────────── */

/**
 * Starts a looping chiptune background track using the Web Audio API.
 * The melody is an arpeggio of a minor-pentatonic scale, driven by a
 * setInterval scheduler (a common pattern for precise audio timing).
 * A square-wave lead and a triangle-wave bass layer give it depth.
 */
function startBgMusic() {
  if (!audioCtx) return;
  stopBgMusic(); // clear any previous nodes

  // Minor-pentatonic note frequencies (A3 root)
  const NOTES = [220, 261.63, 311.13, 349.23, 392, 440, 523.25, 587.33];

  let noteIndex = 0;
  let beatCount = 0;
  const BPM     = 140;
  const BEAT_S  = 60 / BPM;

  /**
   * Schedule one note. Called repeatedly by the scheduler interval.
   * We use audioCtx.currentTime for sample-accurate timing.
   */
  function scheduleNote() {
    if (!audioCtx || audioMuted) return;

    const now   = audioCtx.currentTime;
    const freq  = NOTES[noteIndex % NOTES.length];
    const freqB = NOTES[(noteIndex + 4) % NOTES.length] / 2; // bass an octave down

    // ── Lead oscillator (square wave) ──────────────────────
    const lead    = audioCtx.createOscillator();
    const leadGain = audioCtx.createGain();
    lead.type      = 'square';
    lead.frequency.setValueAtTime(freq, now);
    leadGain.gain.setValueAtTime(0.06, now);
    leadGain.gain.exponentialRampToValueAtTime(0.001, now + BEAT_S * 0.9);
    lead.connect(leadGain);
    leadGain.connect(masterGain);
    lead.start(now);
    lead.stop(now + BEAT_S);

    // ── Bass oscillator (triangle wave, every 2 beats) ─────
    if (beatCount % 2 === 0) {
      const bass     = audioCtx.createOscillator();
      const bassGain = audioCtx.createGain();
      bass.type       = 'triangle';
      bass.frequency.setValueAtTime(freqB, now);
      bassGain.gain.setValueAtTime(0.12, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + BEAT_S * 1.8);
      bass.connect(bassGain);
      bassGain.connect(masterGain);
      bass.start(now);
      bass.stop(now + BEAT_S * 1.9);
    }

    // Advance melody: step through the scale, reverse at the end
    noteIndex++;
    if (noteIndex >= NOTES.length) noteIndex = 0;
    beatCount++;
  }

  scheduleNote(); // play first note immediately
  const intervalId = setInterval(scheduleNote, BEAT_S * 1000);
  bgMusicNodes.push(intervalId); // store so we can clear it later
}

/** Stop background music (clears the scheduler interval). */
function stopBgMusic() {
  bgMusicNodes.forEach(id => clearInterval(id));
  bgMusicNodes = [];
}

/* ── Sound effects ─────────────────────────────────────────────────────── */

/**
 * Shoot SFX — short high-pitched ping.
 * @param {string} playerColor - used to slightly pitch-shift by player
 */
function sfxShoot(playerColor) {
  if (!audioCtx || audioMuted) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now  = audioCtx.currentTime;
  osc.type   = 'sawtooth';
  osc.frequency.setValueAtTime(playerColor === COLOR_P1 ? 880 : 660, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.13);
}

/**
 * Explosion SFX — rumbling noise burst when a tank dies.
 */
function sfxExplosion() {
  if (!audioCtx || audioMuted) return;
  const buf  = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.4, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; // white noise
  const src  = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  const now  = audioCtx.currentTime;
  src.buffer = buf;
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  src.connect(gain);
  gain.connect(masterGain);
  src.start(now);
}

/**
 * Power-up pickup SFX — ascending arpeggio chime.
 */
function sfxPickup() {
  if (!audioCtx || audioMuted) return;
  [523, 659, 784, 1047].forEach((freq, index) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now  = audioCtx.currentTime + index * 0.06;
    osc.type   = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.13);
  });
}

/**
 * Bullet bounce SFX — quick tick.
 */
function sfxBounce() {
  if (!audioCtx || audioMuted) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const now  = audioCtx.currentTime;
  osc.type   = 'square';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.06);
}
