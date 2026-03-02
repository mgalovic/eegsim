'use strict';

/**
 * electrodes.js
 * 10-20 system electrode data and montage definitions.
 *
 * Coordinate system (SVG top-down view, head radius = 100 units):
 *   (0, 0)  = Cz (vertex, centre of head)
 *   -y axis = anterior (nasion)
 *   +y axis = posterior (inion)
 *   -x axis = left hemisphere
 *   +x axis = right hemisphere
 */

const ELECTRODES = {
  // ── Midline ────────────────────────────────────────────────
  Fz:  { x:   0, y: -45 },
  Cz:  { x:   0, y:   0 },
  Pz:  { x:   0, y:  45 },

  // ── Left hemisphere ────────────────────────────────────────
  Fp1: { x: -27, y: -83 },
  F7:  { x: -67, y: -51 },
  F3:  { x: -37, y: -43 },
  T3:  { x: -90, y:   0 },
  C3:  { x: -46, y:   0 },
  T5:  { x: -67, y:  51 },
  P3:  { x: -37, y:  43 },
  O1:  { x: -27, y:  83 },

  // ── Right hemisphere ───────────────────────────────────────
  Fp2: { x:  27, y: -83 },
  F8:  { x:  67, y: -51 },
  F4:  { x:  37, y: -43 },
  T4:  { x:  90, y:   0 },
  C4:  { x:  46, y:   0 },
  T6:  { x:  67, y:  51 },
  P4:  { x:  37, y:  43 },
  O2:  { x:  27, y:  83 },

  // ── Mastoid references ─────────────────────────────────────
  A1:  { x: -106, y: 6, mastoid: true },
  A2:  { x:  106, y: 6, mastoid: true },
};

/**
 * Montage definitions.
 *
 * Each montage contains one or more named chains.
 * Each chain contains an array of [anode, cathode] channel pairs.
 * 'REF' is a placeholder for the chosen reference.
 */
const MONTAGES = {

  bipolarLongitudinal: {
    name: 'Bipolar Longitudinal',
    shortName: 'Double Banana',
    chains: [
      {
        name: 'Right Temporal',
        channels: [
          ['Fp2', 'F8'],
          ['F8',  'T4'],
          ['T4',  'T6'],
          ['T6',  'O2'],
        ],
      },
      {
        name: 'Left Temporal',
        channels: [
          ['Fp1', 'F7'],
          ['F7',  'T3'],
          ['T3',  'T5'],
          ['T5',  'O1'],
        ],
      },
      {
        name: 'Right Parasagittal',
        channels: [
          ['Fp2', 'F4'],
          ['F4',  'C4'],
          ['C4',  'P4'],
          ['P4',  'O2'],
        ],
      },
      {
        name: 'Left Parasagittal',
        channels: [
          ['Fp1', 'F3'],
          ['F3',  'C3'],
          ['C3',  'P3'],
          ['P3',  'O1'],
        ],
      },
      {
        name: 'Midline',
        channels: [
          ['Fz', 'Cz'],
          ['Cz', 'Pz'],
        ],
      },
    ],
  },

  bipolarTransverse: {
    name: 'Bipolar Transverse',
    shortName: 'Transverse',
    chains: [
      {
        // Fp row as its own chain — creates a visible gap before the frontal row
        name: 'Frontopolar',
        channels: [
          ['Fp2', 'Fp1'],
        ],
      },
      {
        name: 'Frontal',
        channels: [
          ['F8',  'F4'],
          ['F4',  'Fz'],
          ['Fz',  'F3'],
          ['F3',  'F7'],
        ],
      },
      {
        name: 'Central',
        channels: [
          ['T4', 'C4'],
          ['C4', 'Cz'],
          ['Cz', 'C3'],
          ['C3', 'T3'],
        ],
      },
      {
        name: 'Parietal',
        channels: [
          ['T6', 'P4'],
          ['P4', 'Pz'],
          ['Pz', 'P3'],
          ['P3', 'T5'],
        ],
      },
      {
        name: 'Occipital',
        channels: [
          ['O2', 'O1'],
        ],
      },
    ],
  },

  bipolarRing: {
    name: 'Bipolar Ring',
    shortName: 'Temporal Ring',
    chains: [
      {
        name: 'Circumferential Ring',
        channels: [
          ['Fp2', 'Fp1'],
          ['Fp1', 'F7'],
          ['F7',  'T3'],
          ['T3',  'T5'],
          ['T5',  'O1'],
          ['O1',  'O2'],
          ['O2',  'T6'],
          ['T6',  'T4'],
          ['T4',  'F8'],
          ['F8',  'Fp2'],
        ],
      },
    ],
  },

  referentialLinkedMastoids: {
    name: 'Referential (Linked Mastoids)',
    shortName: 'A1+A2 Ref.',
    reference: 'linkedMastoids',
    chains: [
      {
        name: 'Right',
        channels: [
          ['Fp2', 'REF'],
          ['F8',  'REF'],
          ['F4',  'REF'],
          ['T4',  'REF'],
          ['C4',  'REF'],
          ['T6',  'REF'],
          ['P4',  'REF'],
          ['O2',  'REF'],
        ],
      },
      {
        name: 'Left',
        channels: [
          ['Fp1', 'REF'],
          ['F7',  'REF'],
          ['F3',  'REF'],
          ['T3',  'REF'],
          ['C3',  'REF'],
          ['T5',  'REF'],
          ['P3',  'REF'],
          ['O1',  'REF'],
        ],
      },
      {
        name: 'Midline',
        channels: [
          ['Fz',  'REF'],
          ['Cz',  'REF'],
          ['Pz',  'REF'],
        ],
      },
    ],
  },

  referentialAverage: {
    name: 'Referential (Average)',
    shortName: 'Avg Ref.',
    reference: 'average',
    chains: [
      {
        name: 'Right',
        channels: [
          ['Fp2', 'REF'],
          ['F8',  'REF'],
          ['F4',  'REF'],
          ['T4',  'REF'],
          ['C4',  'REF'],
          ['T6',  'REF'],
          ['P4',  'REF'],
          ['O2',  'REF'],
        ],
      },
      {
        name: 'Left',
        channels: [
          ['Fp1', 'REF'],
          ['F7',  'REF'],
          ['F3',  'REF'],
          ['T3',  'REF'],
          ['C3',  'REF'],
          ['T5',  'REF'],
          ['P3',  'REF'],
          ['O1',  'REF'],
        ],
      },
      {
        name: 'Midline',
        channels: [
          ['Fz',  'REF'],
          ['Cz',  'REF'],
          ['Pz',  'REF'],
        ],
      },
    ],
  },

  referentialCz: {
    name: 'Referential (Cz)',
    shortName: 'Cz Ref.',
    reference: 'Cz',
    chains: [
      {
        name: 'Right',
        channels: [
          ['Fp2', 'REF'],
          ['F8',  'REF'],
          ['F4',  'REF'],
          ['T4',  'REF'],
          ['C4',  'REF'],
          ['T6',  'REF'],
          ['P4',  'REF'],
          ['O2',  'REF'],
        ],
      },
      {
        name: 'Left',
        channels: [
          ['Fp1', 'REF'],
          ['F7',  'REF'],
          ['F3',  'REF'],
          ['T3',  'REF'],
          ['C3',  'REF'],
          ['T5',  'REF'],
          ['P3',  'REF'],
          ['O1',  'REF'],
        ],
      },
      {
        name: 'Midline',
        channels: [
          ['Fz',  'REF'],
          ['Pz',  'REF'],
        ],
      },
    ],
  },
};
