// Synthesized sound effects using Web Audio API
// Inspired by skribbl.io / Super Battle Golf style UI sounds

let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

// Returns true only if the AudioContext is running (user has interacted).
// Prevents sounds from queueing while suspended and all playing at once.
function isAudioReady(): boolean {
  if (audioUnlocked) return true;
  if (!audioCtx) return false;
  if (audioCtx.state === "running") {
    audioUnlocked = true;
    return true;
  }
  return false;
}

// Call this on any user interaction to warm up the AudioContext early
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx.state === "running") {
    audioUnlocked = true;
  }
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.15,
  rampDown = true
) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);

  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume = 0.08) {
  const ctx = getAudioContext();
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * volume;
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

// --- Hover snap: very short crisp tick on button hover ---
// Silently skips if audio hasn't been unlocked yet (prevents queueing)
export function playHoverSnap() {
  if (!isAudioReady()) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1800, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.025);
  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.035);
}

// --- Button click: short bright pop ---
// Also unlocks audio since clicks are real user interactions
export function playButtonClick() {
  const ctx = getAudioContext();
  audioUnlocked = true;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.03);
  osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

// --- Round start: ascending arpeggio C5 -> E5 -> G5 -> C6 ---
export function playRoundStart() {
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2, "triangle", 0.13), i * 80);
  });
}

// --- Round end: descending arpeggio C6 -> G5 -> E5 -> C5 (reverse of start) ---
export function playRoundEnd() {
  const notes = [1047, 784, 659, 523]; // C6, G5, E5, C5
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2, "triangle", 0.13), i * 80);
  });
}

// --- Clock tick: subtle click at low time ---
export function playClockTick() {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(1000, ctx.currentTime);
  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.04);
}

// --- Correct guess: happy two-note chime ---
export function playCorrectGuess() {
  playTone(660, 0.15, "sine", 0.13);
  setTimeout(() => playTone(880, 0.2, "sine", 0.13), 100);
}

// --- Game over: dramatic fanfare ---
export function playGameOver() {
  const fanfare = [
    { freq: 392, delay: 0 },     // G4
    { freq: 494, delay: 120 },   // B4
    { freq: 587, delay: 240 },   // D5
    { freq: 784, delay: 400 },   // G5
    { freq: 988, delay: 560 },   // B5
    { freq: 1175, delay: 720 },  // D6
  ];
  fanfare.forEach(({ freq, delay }) => {
    setTimeout(() => playTone(freq, 0.35, "triangle", 0.12), delay);
  });
}

// --- Confetti cannon: burst of noise + rising tone ---
export function playConfettiCannon() {
  playNoise(0.25, 0.1);
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.07, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}
