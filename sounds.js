let _ctx = null;

function _getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

export function unlockAudio() {
  try {
    const ctx = _getCtx();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (_) {}
}

// Square waves + compressor for outdoor audibility
function _makeSink(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 3;
  comp.ratio.value = 20;
  comp.attack.value = 0.001;
  comp.release.value = 0.1;
  comp.connect(ctx.destination);
  return comp;
}

function _tone(ctx, sink, freq, startTime, duration, gain = 0.7) {
  for (const detune of [0, 5]) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env);
    env.connect(sink);
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    env.gain.setValueAtTime(gain, startTime);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}

// Two-tone attention chime for "lineup soon" warning
export function playWarning() {
  try {
    const ctx = _getCtx();
    if (ctx.state !== 'running') return;
    const sink = _makeSink(ctx);
    const t = ctx.currentTime;
    const span = 0.18 + 0.22 + 0.22;
    for (let i = 0; i < 3; i++) {
      _tone(ctx, sink, 880,  t + i * span,        0.18);
      _tone(ctx, sink, 1046, t + i * span + 0.22, 0.22);
    }
  } catch (_) {}
}

// Rising three-tone chime for "lineup now / GO"
export function playLineup() {
  try {
    const ctx = _getCtx();
    if (ctx.state !== 'running') return;
    const sink = _makeSink(ctx);
    const t = ctx.currentTime;
    const span = 0.14 + 0.16 + 0.14 + 0.28;
    for (let i = 0; i < 3; i++) {
      _tone(ctx, sink, 523, t + i * span,        0.14);
      _tone(ctx, sink, 659, t + i * span + 0.16, 0.14);
      _tone(ctx, sink, 784, t + i * span + 0.32, 0.28);
    }
  } catch (_) {}
}
