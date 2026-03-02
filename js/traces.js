'use strict';

/**
 * traces.js
 * Renders EEG channel traces on an HTML5 canvas.
 *
 * Phase 3 additions:
 *   – Phase reversal annotation: amber vertical bracket at spike peak,
 *     electrode label, and amber channel label text.
 *   – End-of-chain marker: small ∎ symbol at right edge of trace.
 */

const Traces = (() => {

  // ── Layout constants ─────────────────────────────────────────
  const LABEL_W   = 88;
  const RIGHT_PAD = 20;
  const MIN_CHAN_H = 22;   // px — minimum readable channel height
  const MAX_CHAN_H = 72;   // px — cap so sparse montages don't sprawl
  const GROUP_GAP  = 16;  // px between chains
  const TOP_PAD    = 14;
  const BOT_PAD    = 24;

  // ── Colours ───────────────────────────────────────────────────
  const C = {
    bg:          '#ffffff',
    labelBg:     '#f8fafc',
    baseline:    '#c8d3dd',
    trace:       '#1e293b',
    label:       '#475569',
    labelPR:     '#b45309',   // amber-700 — phase reversal channel label
    labelEOC:    '#64748b',   // slightly lighter for end-of-chain
    divider:     '#e2e8f0',
    groupLine:   '#e2e8f0',
    tickText:    '#94a3b8',
    hint:        '#cbd5e1',
    prBracket:   'rgba(180, 83, 9, 0.75)',   // amber bracket line
    prFill:      'rgba(217,119,6, 0.06)',     // very faint amber row tint
    eocMarker:   '#94a3b8',
  };

  // ── Waveform ──────────────────────────────────────────────────
  const N_PTS     = 1000;
  const DURATION  = 5.0;    // seconds shown — doubled pixel density vs 10 s
  const PEAK_T    = 1.25;   // spike at ¼ of the trace
  const PX_PER_MM = 3.0;

  function spikeAt(dt) {
    // Time constants halved vs original so the spike occupies the same
    // pixel width despite the doubled time scale.
    if (dt < 0) return Math.exp(dt / 0.03) * 0.9;
    const spk = Math.exp(-dt / 0.05);
    const sw  = -0.40 * (1 - Math.exp(-dt / 0.04)) * Math.exp(-dt / 0.19);
    return spk + sw;
  }

  const SPIKE_SHAPE = new Float32Array(N_PTS);
  for (let i = 0; i < N_PTS; i++) {
    SPIKE_SHAPE[i] = spikeAt((i / (N_PTS - 1)) * DURATION - PEAK_T);
  }

  // ── State ─────────────────────────────────────────────────────
  let _canvas      = null;
  let _ctx         = null;
  let _montage     = null;
  let _voltages    = null;
  let _gainUvPmm   = 7;
  let _annotations = null;
  let _bgAmplitude = 0;    // µV
  let _bgFreq      = 10;   // Hz

  // Animation state
  let _playing  = false;
  let _playhead = 0;     // seconds, 0..DURATION
  let _rafId    = null;
  let _lastTs   = null;

  // ── Background rhythm helper ──────────────────────────────────

  /** Deterministic phase (0..2π) derived from channel label string hash. */
  function labelPhase(label) {
    let h = 0;
    for (let i = 0; i < label.length; i++) {
      h = ((h << 5) - h + label.charCodeAt(i)) & 0xFFFFFFFF;
    }
    return (h >>> 0) / 4294967295 * 2 * Math.PI;
  }

  // ── Sizing ────────────────────────────────────────────────────

  function setSize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    _canvas.width        = w * dpr;
    _canvas.height       = h * dpr;
    _canvas.style.width  = `${w}px`;
    _canvas.style.height = `${h}px`;
    _ctx.scale(dpr, dpr);
  }

  // ── Layout ────────────────────────────────────────────────────

  function buildLayout(montage) {
    // Count channels and inter-chain gaps to compute chanH
    let chanCount = 0, gapCount = 0;
    montage.chains.forEach((chain, i) => {
      if (i > 0) gapCount++;
      chanCount += chain.channels.length;
    });

    const wrap   = _canvas ? _canvas.parentElement : null;
    const availH = (wrap ? wrap.clientHeight : 0) || 600;
    const chanH  = Math.min(MAX_CHAN_H, Math.max(MIN_CHAN_H,
      Math.floor((availH - TOP_PAD - BOT_PAD - gapCount * GROUP_GAP) / (chanCount || 1))
    ));

    const items = [];
    let y = TOP_PAD;

    montage.chains.forEach((chain, chainIdx) => {
      if (chainIdx > 0) {
        items.push({ type: 'gap', y });
        y += GROUP_GAP;
      }
      chain.channels.forEach(([anode, cathode]) => {
        const label = cathode === 'REF' ? `${anode}–Ref` : `${anode}–${cathode}`;
        items.push({ type: 'channel', label, chainIdx, centreY: y + chanH / 2, topY: y, chanH });
        y += chanH;
      });
    });

    return { items, totalH: y + BOT_PAD };
  }

  // ── Drawing ───────────────────────────────────────────────────

  function drawBackground(w, h) {
    _ctx.fillStyle = C.bg;
    _ctx.fillRect(0, 0, w, h);
    _ctx.fillStyle = C.labelBg;
    _ctx.fillRect(0, 0, LABEL_W, h);
    _ctx.strokeStyle = C.divider;
    _ctx.lineWidth = 0.8;
    _ctx.beginPath();
    _ctx.moveTo(LABEL_W, TOP_PAD / 2);
    _ctx.lineTo(LABEL_W, h - BOT_PAD / 2);
    _ctx.stroke();
  }

  function drawTimeAxis(w, h) {
    const traceW = w - LABEL_W - RIGHT_PAD;
    const baseY  = h - BOT_PAD + 12;

    _ctx.save();
    _ctx.font         = `400 9px 'JetBrains Mono', monospace`;
    _ctx.fillStyle    = C.tickText;
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'top';
    _ctx.strokeStyle  = C.groupLine;
    _ctx.lineWidth    = 0.8;

    for (let s = 0; s <= DURATION; s++) {
      const x = LABEL_W + (s / DURATION) * traceW;
      _ctx.beginPath();
      _ctx.moveTo(x, baseY - 5);
      _ctx.lineTo(x, baseY);
      _ctx.stroke();
      if (s > 0 && s < DURATION) _ctx.fillText(`${s}s`, x, baseY + 3);
    }
    _ctx.restore();
  }

  function drawChannel(item, w, voltages, annotations) {
    const { centreY, topY, label, chanH } = item;
    const traceW   = w - LABEL_W - RIGHT_PAD;
    const traceX0  = LABEL_W;
    const traceX1  = LABEL_W + traceW;
    const ampV     = voltages ? (voltages[label] ?? 0) : 0;
    const pixPerUv = PX_PER_MM / _gainUvPmm;

    const isPR  = annotations?.phaseReversals.some(
      pr => pr.channelBefore === label || pr.channelAfter === label
    );
    const isEOC = annotations?.endOfChain.has(label);

    // ── Row tint for phase-reversal channels ──────────────────
    if (isPR) {
      _ctx.fillStyle = C.prFill;
      _ctx.fillRect(LABEL_W + 1, topY, traceW - 1, chanH);
    }

    // ── Baseline ──────────────────────────────────────────────
    _ctx.save();
    _ctx.strokeStyle = C.baseline;
    _ctx.lineWidth   = 0.6;
    _ctx.setLineDash([]);
    _ctx.beginPath();
    _ctx.moveTo(traceX0, centreY);
    _ctx.lineTo(traceX1, centreY);
    _ctx.stroke();
    _ctx.restore();

    // ── Channel label ─────────────────────────────────────────
    _ctx.save();
    _ctx.font         = `${isPR ? '600' : '400'} 10.5px 'JetBrains Mono', monospace`;
    _ctx.fillStyle    = isPR ? C.labelPR : isEOC ? C.labelEOC : C.label;
    _ctx.textAlign    = 'right';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(label, LABEL_W - 8, centreY);
    _ctx.restore();

    // ── Trace waveform ────────────────────────────────────────
    _ctx.save();
    _ctx.strokeStyle = C.trace;
    _ctx.lineWidth   = 1.1;
    _ctx.lineJoin    = 'round';
    _ctx.setLineDash([]);
    _ctx.beginPath();

    const phase = labelPhase(label);
    for (let i = 0; i < N_PTS; i++) {
      const px = traceX0 + (i / (N_PTS - 1)) * traceW;
      const t  = (i / (N_PTS - 1)) * DURATION;
      const bg = _bgAmplitude * Math.sin(2 * Math.PI * _bgFreq * t + phase);
      const py = centreY + (ampV * SPIKE_SHAPE[i] + bg) * pixPerUv;
      i === 0 ? _ctx.moveTo(px, py) : _ctx.lineTo(px, py);
    }
    _ctx.stroke();
    _ctx.restore();

    // ── End-of-chain marker (right edge) ─────────────────────
    if (isEOC) {
      _ctx.save();
      _ctx.font         = `400 9px 'JetBrains Mono', monospace`;
      _ctx.fillStyle    = C.eocMarker;
      _ctx.textAlign    = 'left';
      _ctx.textBaseline = 'middle';
      _ctx.fillText('∎', traceX1 + 4, centreY);
      _ctx.restore();
    }
  }

  function drawGroupSeparator(y, w) {
    _ctx.save();
    _ctx.strokeStyle = C.groupLine;
    _ctx.lineWidth   = 0.7;
    _ctx.setLineDash([2, 3]);
    _ctx.beginPath();
    _ctx.moveTo(LABEL_W + 4, y);
    _ctx.lineTo(w - RIGHT_PAD, y);
    _ctx.stroke();
    _ctx.restore();
  }

  /**
   * Phase reversal bracket — drawn as a vertical amber line at the spike
   * peak (x = PEAK_T position on the trace), spanning the two PR channels,
   * with a label naming the shared electrode.
   */
  function drawPRAnnotations(prList, items, w) {
    if (!prList || !prList.length) return;

    const traceW = w - LABEL_W - RIGHT_PAD;
    // X position of the spike peak on canvas
    const peakX  = LABEL_W + (PEAK_T / DURATION) * traceW;

    _ctx.save();

    for (const pr of prList) {
      const ch1 = items.find(i => i.type === 'channel' && i.label === pr.channelBefore);
      const ch2 = items.find(i => i.type === 'channel' && i.label === pr.channelAfter);
      if (!ch1 || !ch2) continue;

      const y1   = ch1.centreY;
      const y2   = ch2.centreY;
      const midY = (y1 + y2) / 2;

      // Vertical bracket line
      _ctx.strokeStyle = C.prBracket;
      _ctx.lineWidth   = 1.8;
      _ctx.setLineDash([]);
      _ctx.beginPath();
      _ctx.moveTo(peakX, y1);
      _ctx.lineTo(peakX, y2);
      _ctx.stroke();

      // Horizontal ticks at channel centres
      _ctx.lineWidth = 1.5;
      for (const ty of [y1, y2]) {
        _ctx.beginPath();
        _ctx.moveTo(peakX - 5, ty);
        _ctx.lineTo(peakX + 5, ty);
        _ctx.stroke();
      }

      // Electrode name badge next to midpoint
      _ctx.font         = `600 9px 'Inter', sans-serif`;
      _ctx.fillStyle    = C.prBracket;
      _ctx.textAlign    = 'left';
      _ctx.textBaseline = 'middle';
      _ctx.fillText(`◀ ${pr.electrode}`, peakX + 8, midY);
    }

    _ctx.restore();
  }

  function drawNoSourceHint(w, h) {
    _ctx.save();
    _ctx.font         = `400 12px 'Inter', sans-serif`;
    _ctx.fillStyle    = C.hint;
    _ctx.textAlign    = 'center';
    _ctx.textBaseline = 'middle';
    _ctx.fillText(
      'Click or drag on the head map to place a source',
      LABEL_W + (w - LABEL_W - RIGHT_PAD) / 2,
      h / 2
    );
    _ctx.restore();
  }

  // ── Sweep overlay ─────────────────────────────────────────────

  /** Blank area right of playhead and draw the blue playhead line. */
  function overlay(w, h) {
    if (!_playing) return;
    const traceW = w - LABEL_W - RIGHT_PAD;
    const playX  = LABEL_W + (_playhead / DURATION) * traceW;

    // White rect covers everything right of the playhead
    _ctx.fillStyle = C.bg;
    _ctx.fillRect(playX, 0, w - playX, h);

    // Playhead line
    _ctx.save();
    _ctx.strokeStyle = '#3b82f6';
    _ctx.lineWidth   = 1.5;
    _ctx.setLineDash([]);
    _ctx.beginPath();
    _ctx.moveTo(playX, TOP_PAD / 2);
    _ctx.lineTo(playX, h - BOT_PAD / 2);
    _ctx.stroke();
    _ctx.restore();
  }

  // ── Animation loop ────────────────────────────────────────────

  function tick(ts) {
    if (_lastTs !== null) {
      _playhead += (ts - _lastTs) / 1000;
      if (_playhead >= DURATION) _playhead = 0;
    }
    _lastTs = ts;
    if (_montage) render(_montage, _voltages, null, _annotations);
    _rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (_playing) return;
    _playing = true;
    _lastTs  = null;
    _rafId   = requestAnimationFrame(tick);
  }

  function pause() {
    _playing = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    _lastTs  = null;
    if (_montage) render(_montage, _voltages, null, _annotations);
  }

  function isPlaying() { return _playing; }

  // ── Public API ────────────────────────────────────────────────

  function init(canvasId) {
    _canvas = document.getElementById(canvasId);
    _ctx    = _canvas.getContext('2d');
  }

  /**
   * @param {object}      montage      MONTAGES entry
   * @param {object|null} voltages     { channelLabel: µV }
   * @param {number}      [gainUvPmm]  µV per paper-mm
   * @param {object}      [annotations] { phaseReversals, endOfChain }
   */
  function render(montage, voltages, gainUvPmm, annotations) {
    _montage     = montage;
    _voltages    = voltages;
    _annotations = annotations ?? null;
    if (gainUvPmm != null) _gainUvPmm = gainUvPmm;

    const wrap  = _canvas.parentElement;
    const w     = wrap.clientWidth  || 900;
    const h     = wrap.clientHeight || 600;
    const { items } = buildLayout(montage);

    setSize(w, h);
    drawBackground(w, h);

    let showHint = true;
    items.forEach(item => {
      if (item.type === 'gap') {
        drawGroupSeparator(item.y, w);
      } else {
        drawChannel(item, w, voltages, _annotations);
        if (voltages && Math.abs(voltages[item.label] ?? 0) > 0.1) showHint = false;
      }
    });

    if (showHint) {
      drawNoSourceHint(w, h);
    } else {
      // Show PR bracket only when sweep has passed the spike peak
      if (!_playing || _playhead > PEAK_T) {
        drawPRAnnotations(_annotations?.phaseReversals, items, w);
      }
    }

    drawTimeAxis(w, h);
    overlay(w, h);   // sweep mask drawn last, on top of everything
  }

  function resize() {
    if (_montage) render(_montage, _voltages, null, _annotations);
  }

  function setBg(amplitude, freq) {
    _bgAmplitude = amplitude;
    _bgFreq      = freq;
  }

  return { init, render, resize, play, pause, isPlaying, setBg };
})();
