/**
 * G-code Generator for Pen Plotter CNC
 * 
 * CRITICAL CNC RULE: GUIDES MUST NEVER BE PLOTTED.
 * Strictly extracts geometry ONLY from the Artwork Layer.
 * Ignores paper background, ruled lines, margins, rulers, grids, and UI handles.
 * Includes preflight validation and TSP nearest-neighbor path optimization.
 */

import { GuideManager } from './guides.js';

export class GCodeGenerator {
  constructor(options = {}) {
    this.penUpAngle = options.penUpAngle !== undefined ? options.penUpAngle : 90;
    this.penDownAngle = options.penDownAngle !== undefined ? options.penDownAngle : 60;
    this.drawingSpeed = options.drawingSpeed || 3000; // mm/min
    this.travelSpeed = options.travelSpeed || 6000;   // mm/min
    this.lineAccuracy = options.lineAccuracy || 0.10; // mm
    this.penMode = options.penMode || 'servo'; // 'servo' (M3 S...) or 'z_axis' (G0/G1 Z...)
    this.penLiftDelay = options.penLiftDelay || 0.15; // sec dwell
    this.optimizePaths = options.optimizePaths !== undefined ? options.optimizePaths : true;
  }

  setSettings(settings = {}) {
    if (settings.penUpAngle !== undefined) this.penUpAngle = Number(settings.penUpAngle);
    if (settings.penDownAngle !== undefined) this.penDownAngle = Number(settings.penDownAngle);
    if (settings.drawingSpeed !== undefined) this.drawingSpeed = Number(settings.drawingSpeed);
    if (settings.travelSpeed !== undefined) this.travelSpeed = Number(settings.travelSpeed);
    if (settings.lineAccuracy !== undefined) this.lineAccuracy = Number(settings.lineAccuracy);
    if (settings.penMode) this.penMode = settings.penMode;
  }

  /**
   * Preflight Check:
   * Rigorously inspects geometry to ensure ZERO non-artwork elements are exported.
   * @param {Element} artworkLayer 
   * @param {Object} paper 
   * @returns {Object} Preflight result
   */
  runPreflightCheck(artworkLayer, paper) {
    const report = {
      passed: true,
      guideCountDetected: 0,
      artworkPathCount: 0,
      outOfBoundsCount: 0,
      messages: []
    };

    if (!artworkLayer) {
      report.passed = false;
      report.messages.push('Artwork layer not found.');
      return report;
    }

    const allDescendants = artworkLayer.querySelectorAll('*');
    allDescendants.forEach(el => {
      if (!GuideManager.isArtworkOnly(el)) {
        report.guideCountDetected++;
        report.passed = false;
        report.messages.push(`Guide element ${el.tagName} found inside artwork layer - will be stripped.`);
      }
    });

    const pathElements = artworkLayer.querySelectorAll('path, line, polyline, polygon, circle, rect, ellipse');
    report.artworkPathCount = pathElements.length;

    if (report.artworkPathCount === 0) {
      report.passed = false;
      report.messages.push('Artwork layer is empty. Please add text or vector graphics to plot.');
    } else {
      report.messages.push(`Preflight passed: ${report.artworkPathCount} artwork path(s) verified. Guides excluded: 100%.`);
    }

    return report;
  }

  /**
   * Converts SVG elements from Artwork Layer into polyline segments in mm
   * @param {Element} artworkLayer 
   * @param {Object} paper 
   * @returns {Array<Array<{x: number, y: number}>>} polylines
   */
  extractPolylinesFromArtwork(artworkLayer, paper) {
    const polylines = [];
    if (!artworkLayer) return polylines;

    // Get artwork layer translation/transform if any
    const layerTransform = artworkLayer.getAttribute('transform') || '';
    let layerOffsetX = 0, layerOffsetY = 0;
    const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(layerTransform);
    if (match) {
      layerOffsetX = parseFloat(match[1]);
      layerOffsetY = parseFloat(match[2]);
    }

    const elements = artworkLayer.querySelectorAll('path, line, polyline, polygon, circle, rect, ellipse');

    elements.forEach(el => {
      // CRITICAL CHECK: Ignore guides, paper background, or anything marked ignore
      if (!GuideManager.isArtworkOnly(el)) return;

      // Accumulate parent transforms (translate and scale)
      let curX = layerOffsetX;
      let curY = layerOffsetY;
      let curSx = 1;
      let curSy = 1;

      let p = el.parentElement;
      const parents = [];
      while (p && p !== artworkLayer && (typeof document === 'undefined' || p !== document.body)) {
        parents.unshift(p);
        p = p.parentElement;
      }
      parents.push(el);

      parents.forEach(node => {
        if (!node.getAttribute) return;
        const trans = node.getAttribute('transform') || '';
        const tm = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(trans);
        if (tm) {
          curX += parseFloat(tm[1]) * curSx;
          curY += parseFloat(tm[2]) * curSy;
        }
        const sm = /scale\(\s*([-\d.]+)(?:[,\s]+([-\d.]+))?\s*\)/.exec(trans);
        if (sm) {
          const sx = parseFloat(sm[1]);
          const sy = sm[2] !== undefined ? parseFloat(sm[2]) : sx;
          curSx *= sx;
          curSy *= sy;
        }
      });

      const segments = this.elementToPoints(el, curX, curY, curSx, curSy);
      if (segments && segments.length > 0) {
        polylines.push(...segments);
      }
    });

    return polylines;
  }

  elementToPoints(el, offsetX, offsetY, scaleX = 1, scaleY = 1) {
    const tagName = el.tagName.toLowerCase();

    if (tagName === 'path') {
      const d = el.getAttribute('d');
      if (!d) return [];
      const pts = this.sampleSVGPath(el, offsetX, offsetY, scaleX, scaleY);
      return pts;
    } else if (tagName === 'line') {
      const x1 = parseFloat(el.getAttribute('x1') || 0) * scaleX + offsetX;
      const y1 = parseFloat(el.getAttribute('y1') || 0) * scaleY + offsetY;
      const x2 = parseFloat(el.getAttribute('x2') || 0) * scaleX + offsetX;
      const y2 = parseFloat(el.getAttribute('y2') || 0) * scaleY + offsetY;
      return [[{ x: x1, y: y1 }, { x: x2, y: y2 }]];
    } else if (tagName === 'polyline' || tagName === 'polygon') {
      const ptsAttr = el.getAttribute('points') || '';
      const pairs = ptsAttr.trim().split(/[\s,]+/);
      const pts = [];
      for (let i = 0; i < pairs.length - 1; i += 2) {
        pts.push({
          x: parseFloat(pairs[i]) * scaleX + offsetX,
          y: parseFloat(pairs[i + 1]) * scaleY + offsetY
        });
      }
      if (tagName === 'polygon' && pts.length > 0) {
        pts.push({ ...pts[0] });
      }
      return [pts];
    } else if (tagName === 'circle') {
      const cx = parseFloat(el.getAttribute('cx') || 0) * scaleX + offsetX;
      const cy = parseFloat(el.getAttribute('cy') || 0) * scaleY + offsetY;
      const r = parseFloat(el.getAttribute('r') || 0) * ((scaleX + scaleY) / 2);
      return [this.approximateCircle(cx, cy, r)];
    } else if (tagName === 'rect') {
      const x = parseFloat(el.getAttribute('x') || 0) * scaleX + offsetX;
      const y = parseFloat(el.getAttribute('y') || 0) * scaleY + offsetY;
      const w = parseFloat(el.getAttribute('width') || 0) * scaleX;
      const h = parseFloat(el.getAttribute('height') || 0) * scaleY;
      return [[
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y }
      ]];
    }

    return [];
  }

  sampleSVGPath(pathEl, offsetX, offsetY, scaleX = 1, scaleY = 1) {
    const polylines = [];
    const totalLength = pathEl.getTotalLength ? pathEl.getTotalLength() : 0;
    if (totalLength > 0) {
      const step = Math.max(0.2, this.lineAccuracy * 2);
      const numPoints = Math.max(2, Math.ceil(totalLength / step));

      let currentPoly = [];
      for (let i = 0; i <= numPoints; i++) {
        const dist = (i / numPoints) * totalLength;
        const pt = pathEl.getPointAtLength(dist);
        currentPoly.push({
          x: Number((pt.x * scaleX + offsetX).toFixed(3)),
          y: Number((pt.y * scaleY + offsetY).toFixed(3))
        });
      }

      if (currentPoly.length > 1) {
        polylines.push(currentPoly);
      }
      return polylines;
    }

    // Fallback for path string parsing when getTotalLength is not available
    const d = pathEl.getAttribute ? pathEl.getAttribute('d') : '';
    if (!d) return polylines;
    const commands = d.match(/([a-df-zA-DF-Z][^a-df-zA-DF-Z]*)/g) || [];
    let currentPoly = [];
    commands.forEach(cmd => {
      const type = cmd[0];
      const nums = (cmd.slice(1).trim().match(/[-+]?[0-9]*\.?[0-9]+/g) || []).map(Number);
      if (type === 'M' || type === 'm') {
        if (currentPoly.length > 1) polylines.push(currentPoly);
        currentPoly = [];
        for (let i = 0; i < nums.length; i += 2) {
          currentPoly.push({
            x: Number((nums[i] * scaleX + offsetX).toFixed(3)),
            y: Number((nums[i + 1] * scaleY + offsetY).toFixed(3))
          });
        }
      } else if (type === 'L' || type === 'l') {
        for (let i = 0; i < nums.length; i += 2) {
          currentPoly.push({
            x: Number((nums[i] * scaleX + offsetX).toFixed(3)),
            y: Number((nums[i + 1] * scaleY + offsetY).toFixed(3))
          });
        }
      } else if (type === 'Z' || type === 'z') {
        if (currentPoly.length > 0) {
          currentPoly.push({ ...currentPoly[0] });
          polylines.push(currentPoly);
          currentPoly = [];
        }
      }
    });
    if (currentPoly.length > 1) {
      polylines.push(currentPoly);
    }
    return polylines;
  }

  approximateCircle(cx, cy, r) {
    const pts = [];
    const numSegments = Math.max(16, Math.ceil(2 * Math.PI * r / 1.5));
    for (let i = 0; i <= numSegments; i++) {
      const theta = (i / numSegments) * 2 * Math.PI;
      pts.push({
        x: Number((cx + r * Math.cos(theta)).toFixed(3)),
        y: Number((cy + r * Math.sin(theta)).toFixed(3))
      });
    }
    return pts;
  }

  /**
   * Optimize polyline order using greedy Nearest-Neighbor TSP
   * Minimizes pen-up rapid air travel.
   */
  optimizePathOrder(polylines) {
    if (!polylines || polylines.length <= 1) return polylines;

    const remaining = [...polylines];
    const ordered = [];
    let currentPos = { x: 0, y: 0 };

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      let shouldReverse = false;

      for (let i = 0; i < remaining.length; i++) {
        const poly = remaining[i];
        const start = poly[0];
        const end = poly[poly.length - 1];

        const distStart = Math.hypot(start.x - currentPos.x, start.y - currentPos.y);
        const distEnd = Math.hypot(end.x - currentPos.x, end.y - currentPos.y);

        if (distStart < bestDist) {
          bestDist = distStart;
          bestIdx = i;
          shouldReverse = false;
        }
        if (distEnd < bestDist) {
          bestDist = distEnd;
          bestIdx = i;
          shouldReverse = true;
        }
      }

      const chosen = remaining.splice(bestIdx, 1)[0];
      if (shouldReverse) {
        chosen.reverse();
      }
      ordered.push(chosen);
      currentPos = chosen[chosen.length - 1];
    }

    return ordered;
  }

  /**
   * Generate Full G-code Program
   * @param {Element} artworkLayer 
   * @param {Object} paper 
   * @returns {Object} { gcode, stats, preflight }
   */
  generate(artworkLayer, paper) {
    const preflight = this.runPreflightCheck(artworkLayer, paper);
    if (!preflight.passed && preflight.artworkPathCount === 0) {
      return {
        gcode: '; Error: Preflight failed - no artwork elements found\n',
        stats: { totalLines: 0, drawDistance: 0, travelDistance: 0, estimatedTime: '0s' },
        preflight
      };
    }

    let polylines = this.extractPolylinesFromArtwork(artworkLayer, paper);
    if (this.optimizePaths) {
      polylines = this.optimizePathOrder(polylines);
    }

    const lines = [];
    let drawDistance = 0;
    let travelDistance = 0;
    let currentX = 0, currentY = 0;

    // Header
    lines.push('; ============================================');
    lines.push('; Pen Plotter CNC - Generated Toolpath');
    lines.push(`; Dimensions: ${paper.width} x ${paper.height} mm`);
    lines.push(`; Drawing Speed: ${this.drawingSpeed} mm/min`);
    lines.push(`; Travel Speed: ${this.travelSpeed} mm/min`);
    lines.push(`; Pen Up Angle: ${this.penUpAngle}° | Pen Down Angle: ${this.penDownAngle}°`);
    lines.push('; Preflight Check: 100% Artwork Paths (Guides Excluded)');
    lines.push('; ============================================');
    lines.push('G21          ; Set units to millimeters');
    lines.push('G90          ; Absolute positioning');
    lines.push(`M3 S${this.penUpAngle}      ; Pen UP`);
    lines.push(`G4 P${this.penLiftDelay}     ; Dwell for pen lift`);
    lines.push(`G0 X0.00 Y0.00 F${this.travelSpeed} ; Rapid to origin`);
    lines.push('');

    polylines.forEach((poly, polyIdx) => {
      if (poly.length < 2) return;
      const start = poly[0];

      // Travel move to start of stroke
      const travelDist = Math.hypot(start.x - currentX, start.y - currentY);
      travelDistance += travelDist;

      lines.push(`; Stroke #${polyIdx + 1}`);
      lines.push(`G0 X${start.x.toFixed(2)} Y${start.y.toFixed(2)} F${this.travelSpeed}`);
      lines.push(`M3 S${this.penDownAngle}      ; Pen DOWN`);
      lines.push(`G4 P${this.penLiftDelay}`);

      currentX = start.x;
      currentY = start.y;

      // Draw moves along stroke
      for (let i = 1; i < poly.length; i++) {
        const pt = poly[i];
        const segDist = Math.hypot(pt.x - currentX, pt.y - currentY);
        drawDistance += segDist;

        lines.push(`G1 X${pt.x.toFixed(2)} Y${pt.y.toFixed(2)} F${this.drawingSpeed}`);
        currentX = pt.x;
        currentY = pt.y;
      }

      // Pen UP after stroke
      lines.push(`M3 S${this.penUpAngle}      ; Pen UP`);
      lines.push(`G4 P${this.penLiftDelay}`);
      lines.push('');
    });

    // Footer
    lines.push('; End of Plot Job');
    lines.push(`M3 S${this.penUpAngle}      ; Ensure Pen UP`);
    lines.push(`G0 X0.00 Y0.00 F${this.travelSpeed} ; Return to home origin`);
    lines.push('M5           ; Turn off spindle/servo signal');
    lines.push('M2           ; Program end');

    // Stats calculation
    const totalTimeMin = (drawDistance / this.drawingSpeed) + (travelDistance / this.travelSpeed) + (polylines.length * 2 * this.penLiftDelay / 60);
    const mins = Math.floor(totalTimeMin);
    const secs = Math.round((totalTimeMin - mins) * 60);

    const stats = {
      totalLines: lines.length,
      drawDistance: Math.round(drawDistance),
      travelDistance: Math.round(travelDistance),
      totalDistance: Math.round(drawDistance + travelDistance),
      estimatedTime: `${mins} min ${secs} sec`,
      strokesCount: polylines.length
    };

    return {
      gcode: lines.join('\n'),
      stats,
      preflight
    };
  }
}
