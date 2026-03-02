'use strict';

/**
 * app.js
 * Application state, simulation orchestration, annotation detection,
 * scenario presets, and dynamic findings panel.
 */

const App = (() => {

  // ── Application state ──────────────────────────────────────────
  const state = {
    montageKey:  'bipolarLongitudinal',
    gainUvPerMm: 7,
    amplitude:   100,
    spread:      35,
    polarity:    -1,   // negative (standard for most clinical spikes)
    dipoleType:      'monopole',
    dipoleAngle:     0,     // degrees
    dipoleLength:    20,    // SVG units (pole half-separation)
    bgAmplitude:     0,     // µV
    bgFreq:          10,    // Hz
    showAnnotations: false,
    showMontage:     false,
  };

  const $ = id => document.getElementById(id);

  // ── Montage toolbar labels ─────────────────────────────────────
  const DISPLAY_NAME = {
    bipolarLongitudinal:       'Bipolar Longitudinal &mdash; Double Banana',
    bipolarTransverse:         'Bipolar Transverse',
    bipolarRing:               'Bipolar Ring &mdash; Circumferential',
    referentialLinkedMastoids: 'Referential &mdash; Linked Mastoids (A1+A2)',
    referentialAverage:        'Referential &mdash; Average Reference',
    referentialCz:             'Referential &mdash; Cz Reference',
  };

  // ── Scenario presets ───────────────────────────────────────────
  const PRESETS = {
    leftTemporal: {
      label:      'Left Temporal',
      source:     { x: ELECTRODES.F7.x,  y: ELECTRODES.F7.y  },
      amplitude:  100, spread: 35, polarity: -1,
      montageKey: 'bipolarLongitudinal',
    },
    leftCentral: {
      label:      'Left Central',
      source:     { x: ELECTRODES.C3.x,  y: ELECTRODES.C3.y  },
      amplitude:  100, spread: 35, polarity: +1,
      montageKey: 'bipolarLongitudinal',
    },
    occipital: {
      label:      'Occipital',
      source:     { x: ELECTRODES.O1.x,  y: ELECTRODES.O1.y  },
      amplitude:  100, spread: 35, polarity: -1,
      montageKey: 'bipolarLongitudinal',
    },
    refContamination: {
      label:      'Ref. Effect',
      source:     { x: ELECTRODES.T3.x,  y: ELECTRODES.T3.y  },
      amplitude:  100, spread: 35, polarity: -1,
      montageKey: 'referentialLinkedMastoids',
    },
  };

  // ── Channel label helper ───────────────────────────────────────
  const chanLabel = (a, c) => c === 'REF' ? `${a}–Ref` : `${a}–${c}`;

  // ── Annotation detection ───────────────────────────────────────

  /**
   * Detect phase reversals (bipolar only) and end-of-chain channels.
   * Phase reversal: adjacent bipolar channels with opposite sign and both
   * above a minimum threshold (>3 µV) that share a common electrode.
   */
  function detectAnnotations(voltages, montage) {
    const phaseReversals = [];
    const endOfChain     = new Set();
    const isBipolar      = montage.reference == null;

    for (const chain of montage.chains) {
      const chs = chain.channels;
      if (!chs.length) continue;

      // Mark end-of-chain channel labels
      endOfChain.add(chanLabel(...chs[0]));
      endOfChain.add(chanLabel(...chs[chs.length - 1]));

      if (!isBipolar) continue;

      // Scan adjacent channel pairs for sign reversal
      for (let i = 0; i < chs.length - 1; i++) {
        const [a1, c1] = chs[i];
        const [a2, c2] = chs[i + 1];
        const lbl1 = chanLabel(a1, c1);
        const lbl2 = chanLabel(a2, c2);
        const v1   = voltages[lbl1] ?? 0;
        const v2   = voltages[lbl2] ?? 0;

        // Threshold: both channels must exceed ±3 µV and have opposite sign
        if (Math.abs(v1) > 3 && Math.abs(v2) > 3 && v1 * v2 < 0) {
          // Shared electrode = cathode of ch1 (= anode of ch2 in a proper chain)
          phaseReversals.push({
            electrode:     c1,
            channelBefore: lbl1,
            channelAfter:  lbl2,
            chain:         chain.name,
            strength:      Math.min(Math.abs(v1), Math.abs(v2)),
          });
        }
      }
    }

    // Sort by strength so the most prominent reversal is first
    phaseReversals.sort((a, b) => b.strength - a.strength);

    return { phaseReversals, endOfChain, isBipolar };
  }

  // ── Dynamic findings text ──────────────────────────────────────

  function generateFindings(annotations, montage, voltages) {
    const { phaseReversals, endOfChain, isBipolar } = annotations;

    if (!voltages || Object.values(voltages).every(v => Math.abs(v) < 0.5)) {
      return {
        headline: 'No source active',
        detail:   'Click or drag on the head map to place a cortical source. The trace will update in real time.',
        type:     'idle',
      };
    }

    if (!isBipolar) {
      // Referential montage description
      const ref = montage.shortName || montage.name;
      const nearRef = montage.reference === 'linkedMastoids'
        ? 'A source near the temporal electrodes may contaminate the mastoid reference (A1+A2), causing spurious widespread activity across all channels — the reference contamination effect.'
        : montage.reference === 'average'
          ? 'With an average reference, source activity distributes across all channels. A focal spike will appear with opposite polarity at distant electrodes (phantom fields).'
          : 'The Cz reference is contaminated whenever the source has significant potential at the vertex.';

      return {
        headline: `Referential montage — ${ref}`,
        detail:   nearRef,
        type:     'referential',
      };
    }

    if (phaseReversals.length === 0) {
      return {
        headline: 'No phase reversal detected',
        detail:   'The source may be at the end of a chain (no flanking channel for reversal), the field too diffuse (increase spread), or amplitude too low. Channels marked ∎ are end-of-chain.',
        type:     'warning',
      };
    }

    // Bipolar with phase reversal
    const pr     = phaseReversals[0];
    const others = phaseReversals.slice(1).map(p => p.electrode).join(', ');
    const multi  = others ? ` Also at: ${others}.` : '';

    return {
      headline: `Phase reversal at ${pr.electrode} — ${pr.chain}`,
      detail:   `Channels ${pr.channelBefore} and ${pr.channelAfter} deflect in opposite directions. ` +
                `The shared electrode (${pr.electrode}) is the field maximum — this is the bipolar localisation sign.${multi}`,
      type:     'reversal',
    };
  }

  function updateFindingsPanel(findings) {
    const icon = $('findings-icon');
    const head = $('findings-headline');
    const body = $('findings-detail');

    const icons = {
      idle:       '○',
      reversal:   '⇕',
      warning:    '△',
      referential:'≡',
    };

    icon.textContent = icons[findings.type] || '○';
    icon.dataset.type = findings.type;
    head.textContent  = findings.headline;
    body.textContent  = findings.detail;
  }

  // ── Angle display helper ────────────────────────────────────────

  function angleLabel(deg) {
    const d = ((deg % 360) + 360) % 360;
    if (d < 23 || d >= 338) return `${deg}° Ant`;
    if (d < 68)  return `${deg}° Ant-R`;
    if (d < 113) return `${deg}° R`;
    if (d < 158) return `${deg}° Post-R`;
    if (d < 203) return `${deg}° Post`;
    if (d < 248) return `${deg}° Post-L`;
    if (d < 293) return `${deg}° L`;
    return `${deg}° Ant-L`;
  }

  // ── Simulation ─────────────────────────────────────────────────

  function simulate() {
    const src      = HeadMap.getSource();
    const montage  = MONTAGES[state.montageKey];
    const amp      = state.amplitude * state.polarity;
    const angleRad = state.dipoleAngle * Math.PI / 180;

    const potentials = state.dipoleType === 'tangential'
      ? Dipole.computePotentialsTangential(src.x, src.y, amp, state.spread, angleRad, state.dipoleLength)
      : Dipole.computePotentials(src.x, src.y, amp, state.spread);

    const voltages    = Dipole.applyMontage(potentials, montage);
    const annotations = detectAnnotations(voltages, montage);

    // Annotations are computed always (for findings text), but only displayed if toggled on
    const visibleAnnotations = state.showAnnotations ? annotations : null;
    const prElectrodes       = annotations.phaseReversals.map(pr => pr.electrode);

    Traces.setBg(state.bgAmplitude, state.bgFreq);
    Traces.render(montage, voltages, state.gainUvPerMm, visibleAnnotations);
    HeadMap.renderHeatmap(src.x, src.y, amp, state.spread, state.dipoleType, angleRad, state.dipoleLength);
    HeadMap.setDipole(state.dipoleType, angleRad, state.dipoleLength);
    HeadMap.setHighlights(state.showAnnotations ? prElectrodes : []);
    HeadMap.renderMontage(montage, state.showMontage);

    // Update findings panel
    const findings = generateFindings(annotations, montage, voltages);
    updateFindingsPanel(findings);
  }

  function updateMontageName() {
    $('display-montage').innerHTML =
      DISPLAY_NAME[state.montageKey] || MONTAGES[state.montageKey].name;
  }

  // ── Preset loading ─────────────────────────────────────────────

  function loadPreset(key) {
    const p = PRESETS[key];
    if (!p) return;

    // Update state
    state.amplitude  = p.amplitude;
    state.spread     = p.spread;
    state.polarity   = p.polarity;
    state.montageKey = p.montageKey;

    // Update UI controls
    $('ctrl-amplitude').value  = p.amplitude;
    $('val-amplitude').textContent = `${p.amplitude} µV`;
    $('ctrl-spread').value     = p.spread;
    $('val-spread').textContent    = `${p.spread} mm`;
    $('ctrl-montage').value    = p.montageKey;

    document.querySelectorAll('.btn-toggle[data-polarity]').forEach(b => b.classList.remove('active'));
    document.querySelector(`.btn-toggle[data-polarity="${p.polarity === -1 ? 'neg' : 'pos'}"]`)
      ?.classList.add('active');

    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.preset-btn[data-preset="${key}"]`)?.classList.add('active');

    updateMontageName();
    HeadMap.setSource(p.source.x, p.source.y);
    simulate();
  }

  // ── Control wiring ─────────────────────────────────────────────

  function init() {
    HeadMap.init('headmap', () => {
      // Clear active preset when user manually moves source
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      simulate();
    });

    Traces.init('traces-canvas');

    // Source controls
    $('ctrl-amplitude').addEventListener('input', () => {
      state.amplitude = Number($('ctrl-amplitude').value);
      $('val-amplitude').textContent = `${state.amplitude} µV`;
      simulate();
    });

    $('ctrl-spread').addEventListener('input', () => {
      state.spread = Number($('ctrl-spread').value);
      $('val-spread').textContent = `${state.spread} mm`;
      simulate();
    });

    document.querySelectorAll('.btn-toggle[data-polarity]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-toggle[data-polarity]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.polarity = btn.dataset.polarity === 'neg' ? -1 : +1;
        simulate();
      });
    });

    // Dipole type buttons
    document.querySelectorAll('[data-dipole]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-dipole]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.dipoleType = btn.dataset.dipole;
        const show = state.dipoleType === 'tangential' ? 'flex' : 'none';
        $('row-angle').style.display  = show;
        $('row-length').style.display = show;
        simulate();
      });
    });

    // Angle slider
    $('ctrl-angle').addEventListener('input', () => {
      state.dipoleAngle = Number($('ctrl-angle').value);
      $('val-angle').textContent = angleLabel(state.dipoleAngle);
      simulate();
    });

    // Dipole length slider
    $('ctrl-length').addEventListener('input', () => {
      state.dipoleLength = Number($('ctrl-length').value);
      $('val-length').textContent = `${state.dipoleLength}`;
      simulate();
    });

    // Montage overlay toggle
    document.querySelectorAll('[data-montage-vis]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-montage-vis]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.showMontage = btn.dataset.montageVis === 'on';
        simulate();
      });
    });

    // Annotations toggle
    document.querySelectorAll('[data-annot]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-annot]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.showAnnotations = btn.dataset.annot === 'on';
        simulate();
      });
    });

    // Background rhythm controls
    $('ctrl-bg-amp').addEventListener('input', () => {
      state.bgAmplitude = Number($('ctrl-bg-amp').value);
      $('val-bg-amp').textContent = `${state.bgAmplitude} µV`;
      simulate();
    });

    $('ctrl-bg-freq').addEventListener('change', () => {
      state.bgFreq = Number($('ctrl-bg-freq').value);
      simulate();
    });

    // Montage & gain
    $('ctrl-montage').addEventListener('change', e => {
      state.montageKey = e.target.value;
      updateMontageName();
      simulate();
    });

    $('ctrl-gain').addEventListener('change', e => {
      state.gainUvPerMm = Number(e.target.value);
      simulate();
    });

    // Scenario presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
    });

    // Resize
    let raf = null;
    window.addEventListener('resize', () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => Traces.resize());
    });

    // Play / Pause sweep
    $('btn-play')?.addEventListener('click', () => {
      if (Traces.isPlaying()) {
        Traces.pause();
        $('btn-play').dataset.state = 'paused';
      } else {
        Traces.play();
        $('btn-play').dataset.state = 'playing';
      }
    });

    // ── Boot with default preset ─────────────────────────────────
    loadPreset('leftTemporal');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { state, loadPreset };
})();
