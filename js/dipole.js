'use strict';

/**
 * dipole.js
 * Gaussian surface potential model for a focal cortical source.
 *
 * Model:  V(r) = amplitude × exp( −‖r − r_src‖² / 2σ² )
 *
 * This simplified monopole is sufficient to demonstrate:
 *   – Phase reversal in bipolar montages
 *   – End-of-chain amplitude asymmetry
 *   – Reference contamination in referential montages
 *   – Effect of source spread (σ) on field distribution
 *
 * Phase 3+ will extend this to a true oriented dipole.
 */

const Dipole = (() => {

  // Half-separation between dipole poles in SVG units
  const DIPOLE_D = 20;

  /**
   * Compute scalp potential (µV) at every electrode.
   *
   * @param {number} srcX      Source x in SVG head-map units (head radius = 100)
   * @param {number} srcY      Source y
   * @param {number} amplitude Peak amplitude in µV (positive or negative)
   * @param {number} spread    Gaussian σ in the same SVG units
   * @returns {Object}         { electrodeName: voltage_µV, … }
   */
  function computePotentials(srcX, srcY, amplitude, spread) {
    const potentials = {};
    const twoSigSq  = 2 * spread * spread;

    for (const [name, pos] of Object.entries(ELECTRODES)) {
      const dx = pos.x - srcX;
      const dy = pos.y - srcY;
      potentials[name] = amplitude * Math.exp(-(dx * dx + dy * dy) / twoSigSq);
    }

    return potentials;
  }

  /**
   * Compute scalp potential for a tangential dipole (biphasic field).
   *
   * @param {number} srcX      Source centre x in SVG units
   * @param {number} srcY      Source centre y
   * @param {number} amplitude Peak amplitude in µV
   * @param {number} spread    Gaussian σ
   * @param {number} angleRad  Dipole orientation (0 = positive pole anterior)
   * @returns {Object}         { electrodeName: voltage_µV, … }
   */
  function computePotentialsTangential(srcX, srcY, amplitude, spread, angleRad, dipoleD = DIPOLE_D) {
    const potentials = {};
    const twoSigSq   = 2 * spread * spread;

    // Positive pole: (srcX + D·sinα, srcY − D·cosα)
    const pPosX = srcX + dipoleD * Math.sin(angleRad);
    const pPosY = srcY - dipoleD * Math.cos(angleRad);
    // Negative pole: opposite direction
    const pNegX = srcX - dipoleD * Math.sin(angleRad);
    const pNegY = srcY + dipoleD * Math.cos(angleRad);

    for (const [name, pos] of Object.entries(ELECTRODES)) {
      const dxP = pos.x - pPosX, dyP = pos.y - pPosY;
      const dxN = pos.x - pNegX, dyN = pos.y - pNegY;
      const vPos = Math.exp(-(dxP * dxP + dyP * dyP) / twoSigSq);
      const vNeg = Math.exp(-(dxN * dxN + dyN * dyN) / twoSigSq);
      potentials[name] = amplitude * (vPos - vNeg);
    }

    return potentials;
  }

  /**
   * Apply a montage to electrode potentials → one voltage per channel (µV).
   *
   * Convention: channel voltage = V(anode) − V(cathode).
   * Positive channel voltage → downward deflection (EEG convention: neg. up).
   *
   * @param {Object} potentials  { electrodeName: voltage_µV }
   * @param {Object} montage     Montage definition from MONTAGES
   * @returns {Object}           { channelLabel: voltage_µV }
   */
  function applyMontage(potentials, montage) {
    const voltages = {};

    // ── Compute reference voltage ────────────────────────────
    let refV = 0;
    switch (montage.reference) {

      case 'linkedMastoids':
        refV = ((potentials.A1 ?? 0) + (potentials.A2 ?? 0)) / 2;
        break;

      case 'average': {
        const vals = Object.entries(potentials)
          .filter(([k]) => !ELECTRODES[k]?.mastoid)
          .map(([, v]) => v);
        refV = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        break;
      }

      case 'Cz':
        refV = potentials.Cz ?? 0;
        break;

      default:
        refV = 0; // bipolar montage: cathode is the next electrode, not a shared ref
    }

    // ── Compute channel voltages ─────────────────────────────
    for (const chain of montage.chains) {
      for (const [anode, cathode] of chain.channels) {
        const label = cathode === 'REF'
          ? `${anode}–Ref`
          : `${anode}–${cathode}`;
        const va = potentials[anode]   ?? 0;
        const vc = cathode === 'REF'   ? refV : (potentials[cathode] ?? 0);
        voltages[label] = va - vc;
      }
    }

    return voltages;
  }

  return { computePotentials, computePotentialsTangential, applyMontage };
})();
