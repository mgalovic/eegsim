'use strict';

/**
 * headmap.js
 * Renders the 10-20 head diagram and handles interactive source placement.
 *
 * Phase 2: click / drag anywhere inside the head circle to move the source.
 *          The amber crosshair marker shows the current source position.
 */

const HeadMap = (() => {

  let _svg          = null;
  let _onMove       = null;   // callback(x, y)
  let _isDragging   = false;

  // Default source position: left central (near C3)
  let _src = { x: -46, y: 0 };

  // Dipole state
  let _dipoleType  = 'monopole';
  let _dipoleAngle = 0;       // radians

  // Montage overlay state
  let _showMontage = false;

  // Half-separation in SVG units (must match dipole.js)
  const DIPOLE_D = 20;

  // Heatmap offscreen resolution
  const HM_RES = 200;

  // ── SVG helper ────────────────────────────────────────────────

  function el(tag, attrs = {}, text = null) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== null) node.textContent = text;
    return node;
  }

  // ── Coordinate conversion ─────────────────────────────────────

  /** Convert browser client coords → SVG viewBox coords. */
  function clientToSvg(clientX, clientY) {
    const r = _svg.getBoundingClientRect();
    return {
      x: (clientX - r.left) / r.width  * 260 - 130,
      y: (clientY - r.top)  / r.height * 260 - 130,
    };
  }

  /** Clamp position to just inside the head circle. */
  function clamp(x, y) {
    const d = Math.sqrt(x * x + y * y);
    return d <= 98 ? { x, y } : { x: x / d * 98, y: y / d * 98 };
  }

  // ── Label placement ───────────────────────────────────────────

  function labelPos(name, pos) {
    const { x, y } = pos;
    const dist = Math.sqrt(x * x + y * y);

    if (dist < 2) return { lx: 0, ly: -13, anchor: 'middle', baseline: 'auto' };

    const offset = pos.mastoid ? 13 : 12;
    const nx = x / dist, ny = y / dist;
    const lx = x + nx * offset;
    const ly = y + ny * offset;

    const anchor   = nx < -0.25 ? 'end'     : nx > 0.25 ? 'start'   : 'middle';
    const baseline = ny < -0.25 ? 'auto'    : ny > 0.25 ? 'hanging' : 'middle';

    return { lx, ly, anchor, baseline };
  }

  // ── SVG defs (clip path) ──────────────────────────────────────

  function drawDefs() {
    const defs = el('defs', {});
    const cp   = el('clipPath', { id: 'hm-head-clip' });
    cp.appendChild(el('circle', { cx: 0, cy: 0, r: 100 }));
    defs.appendChild(cp);
    _svg.appendChild(defs);
  }

  // ── Static drawing ────────────────────────────────────────────

  function drawGuides(g) {
    for (const r of [33, 66]) {
      g.appendChild(el('circle', {
        cx: 0, cy: 0, r,
        fill: 'none', stroke: '#141f30',
        'stroke-width': '0.7', 'stroke-dasharray': '3 4',
      }));
    }
    for (const [x1, y1, x2, y2] of [[-96, 0, 96, 0], [0, -96, 0, 96]]) {
      g.appendChild(el('line', {
        x1, y1, x2, y2,
        stroke: '#141f30', 'stroke-width': '0.7', 'stroke-dasharray': '3 4',
      }));
    }
  }

  function drawHead(g) {
    g.appendChild(el('circle', { cx: 0, cy: 0, r: 100, class: 'head-circle' }));
    g.appendChild(el('path',   { d: 'M -13,-97 Q 0,-120 13,-97', class: 'head-nose' }));
    g.appendChild(el('ellipse', { cx: -107, cy: 5, rx: 8, ry: 14, class: 'head-ear' }));
    g.appendChild(el('ellipse', { cx:  107, cy: 5, rx: 8, ry: 14, class: 'head-ear' }));
  }

  function drawDirectionLabels(g) {
    for (const [text, x, y, anchor, baseline] of [
      ['A',  0,    -118, 'middle', 'auto'   ],
      ['P',  0,     118, 'middle', 'hanging'],
      ['L', -122,    5,  'end',    'middle' ],
      ['R',  122,    5,  'start',  'middle' ],
    ]) {
      g.appendChild(el('text', {
        x, y,
        'text-anchor': anchor,
        'dominant-baseline': baseline,
        class: 'head-dir-label',
      }, text));
    }
  }

  function drawElectrodes(g) {
    for (const [name, pos] of Object.entries(ELECTRODES)) {
      const { x, y, mastoid = false } = pos;
      const r = mastoid ? 4 : 5.5;
      const { lx, ly, anchor, baseline } = labelPos(name, pos);

      if (!mastoid) {
        g.appendChild(el('circle', {
          cx: x, cy: y, r: r + 3.5,
          fill: 'rgba(59,130,246,0.07)', stroke: 'none',
        }));
      }

      g.appendChild(el('circle', {
        cx: x, cy: y, r,
        class: mastoid ? 'electrode-dot mastoid' : 'electrode-dot',
        'data-name': name,
      }));

      g.appendChild(el('text', {
        x: lx, y: ly,
        'text-anchor': anchor,
        'dominant-baseline': baseline,
        class: mastoid ? 'electrode-label mastoid' : 'electrode-label',
      }, name));
    }
  }

  // ── Source indicator (amber crosshair) ────────────────────────

  function buildSourceIndicator() {
    const { x, y } = _src;
    const g = el('g', { id: 'hm-source', transform: `translate(${x},${y})` });

    // Outer glow
    g.appendChild(el('circle', { r: 18, fill: 'rgba(245,158,11,0.10)', stroke: 'none' }));
    // Dashed ring
    g.appendChild(el('circle', {
      r: 10, fill: 'none',
      stroke: 'rgba(245,158,11,0.55)', 'stroke-width': '1',
      'stroke-dasharray': '3 2',
    }));
    // Crosshair arms
    for (const [x1, y1, x2, y2] of [[-13, 0, 13, 0], [0, -13, 0, 13]]) {
      g.appendChild(el('line', {
        x1, y1, x2, y2,
        stroke: '#f59e0b', 'stroke-width': '1.3', 'stroke-linecap': 'round',
      }));
    }
    // Centre dot
    g.appendChild(el('circle', { r: 3.5, fill: '#f59e0b' }));

    // Dipole orientation arrow (tangential mode only; hidden by default)
    // Arrow drawn pointing in −y direction (anterior at 0°); rotate for other angles.
    const arrow = el('g', {
      id: 'hm-dipole-arrow',
      visibility: 'hidden',
      transform: 'rotate(0)',
    });
    // Shaft: centre → near tip
    arrow.appendChild(el('line', {
      x1: 0, y1: 0, x2: 0, y2: -14,
      stroke: '#f59e0b', 'stroke-width': '2', 'stroke-linecap': 'round',
    }));
    // Arrowhead: small amber triangle at positive pole end
    arrow.appendChild(el('polygon', {
      points: '0,-20 -4,-14 4,-14',
      fill: '#f59e0b',
    }));
    g.appendChild(arrow);

    return g;
  }

  function updateSourcePos() {
    const indicator = _svg.querySelector('#hm-source');
    if (indicator) {
      indicator.setAttribute('transform', `translate(${_src.x},${_src.y})`);
    }
  }

  // ── Interaction ───────────────────────────────────────────────

  function handleMove(clientX, clientY) {
    const raw = clientToSvg(clientX, clientY);
    if (!_isDragging && raw.x * raw.x + raw.y * raw.y > 100 * 100) return;
    const { x, y } = clamp(raw.x, raw.y);
    _src = { x, y };
    updateSourcePos();
    if (_onMove) _onMove(x, y);
  }

  function onPointerDown(e) {
    const raw = clientToSvg(e.clientX, e.clientY);
    if (raw.x * raw.x + raw.y * raw.y > 100 * 100) return;
    _isDragging = true;
    _svg.setPointerCapture(e.pointerId);
    handleMove(e.clientX, e.clientY);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!_isDragging) return;
    handleMove(e.clientX, e.clientY);
    e.preventDefault();
  }

  function onPointerUp(e) {
    _isDragging = false;
    _svg.releasePointerCapture(e.pointerId);
  }

  // ── Public API ────────────────────────────────────────────────

  function init(svgId, onMove) {
    _svg    = document.getElementById(svgId);
    _onMove = onMove;

    _svg.addEventListener('pointerdown', onPointerDown);
    _svg.addEventListener('pointermove', onPointerMove);
    _svg.addEventListener('pointerup',   onPointerUp);
    _svg.addEventListener('pointercancel', onPointerUp);

    render();
  }

  function render() {
    _svg.innerHTML = '';

    drawDefs();   // <defs> must come first

    const gGuides     = el('g', { id: 'hm-guides' });
    const gHead       = el('g', { id: 'hm-head' });
    const gHeatmap    = el('g', { id: 'hm-heatmap-layer' });
    const gMontage    = el('g', { id: 'hm-montage-layer', visibility: 'hidden' });
    const gDirLabels  = el('g', { id: 'hm-dir-labels' });
    const gElectrodes = el('g', { id: 'hm-electrodes' });
    const gSource     = el('g', { id: 'hm-source-layer' });

    drawGuides(gGuides);
    drawHead(gHead);

    // Heatmap image placeholder — href set by renderHeatmap()
    gHeatmap.appendChild(el('image', {
      id: 'hm-heatmap-img',
      x: -130, y: -130, width: 260, height: 260,
      'clip-path': 'url(#hm-head-clip)',
      'preserveAspectRatio': 'none',
    }));

    drawDirectionLabels(gDirLabels);
    drawElectrodes(gElectrodes);
    gSource.appendChild(buildSourceIndicator());

    _svg.appendChild(gGuides);
    _svg.appendChild(gHead);
    _svg.appendChild(gHeatmap);    // above head fill, below montage lines
    _svg.appendChild(gMontage);    // above heatmap, below electrodes
    _svg.appendChild(gDirLabels);
    _svg.appendChild(gElectrodes);
    _svg.appendChild(gSource);     // on top
  }

  function getSource() { return { ..._src }; }

  function setSource(x, y) {
    _src = clamp(x, y);
    updateSourcePos();
  }

  // ── Scalp potential heatmap ───────────────────────────────────

  /**
   * Render a Gaussian potential field as a colour overlay inside the head.
   * Monopole: negative amplitude → blue; positive → red.
   * Tangential: biphasic — red where V > 0, blue where V < 0.
   */
  function renderHeatmap(srcX, srcY, amplitude, spread,
                         dipoleType = 'monopole', dipoleAngle = 0, dipoleD = DIPOLE_D) {
    const img = _svg.querySelector('#hm-heatmap-img');
    if (!img) return;

    if (Math.abs(amplitude) < 0.5) {
      img.removeAttribute('href');
      return;
    }

    const oc  = document.createElement('canvas');
    oc.width  = HM_RES;
    oc.height = HM_RES;
    const ctx  = oc.getContext('2d');
    const data = ctx.createImageData(HM_RES, HM_RES);
    const d    = data.data;

    const sig2 = 2 * spread * spread;

    if (dipoleType === 'tangential') {
      // Biphasic field from oriented dipole
      const pPosX = srcX + dipoleD * Math.sin(dipoleAngle);
      const pPosY = srcY - dipoleD * Math.cos(dipoleAngle);
      const pNegX = srcX - dipoleD * Math.sin(dipoleAngle);
      const pNegY = srcY + dipoleD * Math.cos(dipoleAngle);

      for (let py = 0; py < HM_RES; py++) {
        for (let px = 0; px < HM_RES; px++) {
          const sx = (px + 0.5) / HM_RES * 260 - 130;
          const sy = (py + 0.5) / HM_RES * 260 - 130;
          if (sx * sx + sy * sy > 100 * 100) continue;

          const dxP = sx - pPosX, dyP = sy - pPosY;
          const dxN = sx - pNegX, dyN = sy - pNegY;
          const v = Math.exp(-(dxP * dxP + dyP * dyP) / sig2)
                  - Math.exp(-(dxN * dxN + dyN * dyN) / sig2);  // -1..1

          const idx = (py * HM_RES + px) * 4;
          if (amplitude > 0 ? v > 0 : v < 0) {
            d[idx] = 248; d[idx + 1] = 113; d[idx + 2] = 113;  // red
          } else {
            d[idx] = 59;  d[idx + 1] = 130; d[idx + 2] = 246;  // blue
          }
          d[idx + 3] = Math.round(Math.abs(v) * 210);
        }
      }
    } else {
      // Monopole: single-polarity Gaussian
      const isNeg = amplitude < 0;
      for (let py = 0; py < HM_RES; py++) {
        for (let px = 0; px < HM_RES; px++) {
          const sx = (px + 0.5) / HM_RES * 260 - 130;
          const sy = (py + 0.5) / HM_RES * 260 - 130;
          if (sx * sx + sy * sy > 100 * 100) continue;

          const dx = sx - srcX, dy = sy - srcY;
          const t  = Math.exp(-(dx * dx + dy * dy) / sig2);

          const idx = (py * HM_RES + px) * 4;
          if (isNeg) {
            d[idx] = 59;  d[idx + 1] = 130; d[idx + 2] = 246;  // blue
          } else {
            d[idx] = 248; d[idx + 1] = 113; d[idx + 2] = 113;  // red
          }
          d[idx + 3] = Math.round(t * 210);
        }
      }
    }

    ctx.putImageData(data, 0, 0);
    img.setAttribute('href', oc.toDataURL());
  }

  /**
   * Update dipole type and arrow orientation on the head map.
   * @param {string} type     'monopole' | 'tangential'
   * @param {number} angleRad Orientation in radians (0 = positive pole anterior)
   */
  function setDipole(type, angleRad, dipoleD = DIPOLE_D) {
    _dipoleType  = type;
    _dipoleAngle = angleRad;

    const arrow = _svg.querySelector('#hm-dipole-arrow');
    if (!arrow) return;

    // Resize arrow shaft and arrowhead to match current dipoleD
    const shaftEnd = -(Math.max(dipoleD - 6, 2));
    const shaft = arrow.querySelector('line');
    const head  = arrow.querySelector('polygon');
    if (shaft) shaft.setAttribute('y2', shaftEnd);
    if (head)  head.setAttribute('points', `0,${-dipoleD} -4,${shaftEnd} 4,${shaftEnd}`);

    const deg = angleRad * 180 / Math.PI;
    arrow.setAttribute('visibility', type === 'tangential' ? 'visible' : 'hidden');
    arrow.setAttribute('transform', `rotate(${deg})`);
  }

  /**
   * Draw (or hide) electrode connection lines for the current montage.
   * Average reference is skipped — its "virtual" reference has no scalp position.
   * @param {object}  montage  MONTAGES entry
   * @param {boolean} visible  Whether to show the overlay
   */
  function renderMontage(montage, visible) {
    _showMontage = visible;

    const g = _svg.querySelector('#hm-montage-layer');
    if (!g) return;

    // Clear previous lines
    while (g.firstChild) g.removeChild(g.firstChild);

    // Average reference cannot be shown on a 2-D head map
    if (!visible || montage.reference === 'average') {
      g.setAttribute('visibility', 'hidden');
      return;
    }

    g.setAttribute('visibility', 'visible');

    // Helper: append a styled line segment
    function ln(x1, y1, x2, y2, alpha) {
      g.appendChild(el('line', {
        x1, y1, x2, y2,
        stroke: `rgba(100, 165, 215, ${alpha})`,
        'stroke-width': '0.9',
        'stroke-linecap': 'round',
      }));
    }

    if (montage.reference === 'linkedMastoids') {
      const a1 = ELECTRODES.A1, a2 = ELECTRODES.A2;
      // The A1–A2 "link" wire
      ln(a1.x, a1.y, a2.x, a2.y, 0.55);
      // Each electrode → both mastoids
      const seen = new Set();
      for (const chain of montage.chains) {
        for (const [anode] of chain.channels) {
          if (seen.has(anode)) continue;
          seen.add(anode);
          const p = ELECTRODES[anode];
          if (!p) continue;
          ln(p.x, p.y, a1.x, a1.y, 0.28);
          ln(p.x, p.y, a2.x, a2.y, 0.28);
        }
      }

    } else if (montage.reference === 'Cz') {
      const cz = ELECTRODES.Cz;
      const seen = new Set();
      for (const chain of montage.chains) {
        for (const [anode] of chain.channels) {
          if (seen.has(anode) || anode === 'Cz') continue;
          seen.add(anode);
          const p = ELECTRODES[anode];
          if (!p) continue;
          ln(p.x, p.y, cz.x, cz.y, 0.42);
        }
      }

    } else {
      // Bipolar: draw one segment per unique electrode pair
      const seen = new Set();
      for (const chain of montage.chains) {
        for (const [anode, cathode] of chain.channels) {
          if (cathode === 'REF') continue;
          const key = anode < cathode ? `${anode}|${cathode}` : `${cathode}|${anode}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const p1 = ELECTRODES[anode], p2 = ELECTRODES[cathode];
          if (!p1 || !p2) continue;
          ln(p1.x, p1.y, p2.x, p2.y, 0.52);
        }
      }
    }
  }

  /**
   * Highlight phase-reversal electrodes with an amber dashed ring.
   * Clears previous highlights first.
   * @param {string[]} electrodeNames — e.g. ['F7', 'T3']
   */
  function setHighlights(electrodeNames) {
    // Remove any previous highlight rings
    _svg.querySelectorAll('.electrode-highlight').forEach(n => n.remove());

    if (!electrodeNames || !electrodeNames.length) return;

    const gElec = _svg.querySelector('#hm-electrodes');
    if (!gElec) return;

    for (const name of electrodeNames) {
      const pos = ELECTRODES[name];
      if (!pos) continue;

      // Outer glow
      gElec.appendChild(el('circle', {
        cx: pos.x, cy: pos.y, r: 15,
        fill: 'rgba(180,83,9,0.12)',
        stroke: 'none',
        class: 'electrode-highlight',
      }));

      // Dashed amber ring
      gElec.appendChild(el('circle', {
        cx: pos.x, cy: pos.y, r: 10,
        fill: 'none',
        stroke: '#b45309',
        'stroke-width': '1.6',
        'stroke-dasharray': '3 2.5',
        class: 'electrode-highlight',
      }));
    }
  }

  return { init, render, getSource, setSource, setHighlights, renderHeatmap, setDipole, renderMontage };
})();
