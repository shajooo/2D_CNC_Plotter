/**
 * Hershey Single-Line Vector Fonts & Human Handwriting Engine
 * With 6 distinct handwriting fonts and an organic imperfection engine.
 */

import { HERSHEY_DATA } from './hershey-data.js';

export const SINGLE_LINE_FONTS = [
  { id: 'hand_casual', name: 'Casual Cursive (Handwriting)', type: 'single-line', category: 'Handwriting' },
  { id: 'hand_architect', name: 'Architect Hand (Draftsman)', type: 'single-line', category: 'Drafting' },
  { id: 'hand_quicknote', name: 'Quick Jot (Fast Notes)', type: 'single-line', category: 'Handwriting' },
  { id: 'hand_fountain', name: 'Fountain Pen (Calligraphy)', type: 'single-line', category: 'Calligraphy' },
  { id: 'hand_organic', name: 'Organic Hand-Print', type: 'single-line', category: 'Hand-Print' },
  { id: 'hand_school', name: 'Neat School Script', type: 'single-line', category: 'Handwriting' },
  { id: 'hershey_simplex', name: 'Hershey Simplex (Technical)', type: 'single-line', category: 'Technical' },
  { id: 'hershey_duplex', name: 'Hershey Duplex (2-Stroke)', type: 'single-line', category: 'Technical' }
];

/**
 * Deterministic pseudo-random noise generator
 */
function pseudoNoise(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Render text using single-line handwriting font to SVG path data with natural human imperfections.
 * @param {string} text - Text to render
 * @param {Object} options - { fontId, fontSize, letterSpacing, lineSpacing, align, imperfection }
 * @returns {Object} { pathData, width, height, bounds }
 */
export function renderHersheyText(text, options = {}) {
  const {
    fontId = 'hand_casual',
    fontSize = 18, // mm
    letterSpacing = 1.05,
    lineSpacing = 1.35,
    align = 'left',
    imperfection = 0.35 // 0.0 (mechanical) to 1.0 (very imperfect), default 0.35
  } = options;

  const font = HERSHEY_DATA[fontId] || HERSHEY_DATA['hand_casual'] || HERSHEY_DATA['hershey_simplex'];
  const baseScale = fontSize / 32;
  const lines = text.split('\n');
  const lineHeights = fontSize * lineSpacing;

  let allPathCommands = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // First pass: measure line widths
  const lineMetrics = lines.map((line, lineIdx) => {
    let width = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const glyph = font.glyphs[char] || font.glyphs['?'] || { width: 14, strokes: [] };
      const charSeed = lineIdx * 3571 + i * 997 + char.charCodeAt(0) * 17;
      const widthJitter = 1.0 + (pseudoNoise(charSeed + 3) - 0.5) * 0.12 * imperfection;
      width += (glyph.width * baseScale * widthJitter) * letterSpacing;
    }
    return width;
  });

  const totalMaxWidth = Math.max(...lineMetrics, 10);

  // Second pass: generate raw strokes with organic imperfections
  const rawSegments = [];

  lines.forEach((line, lineIdx) => {
    const lineWidth = lineMetrics[lineIdx];
    let startX = 0;
    if (align === 'center') {
      startX = (totalMaxWidth - lineWidth) / 2;
    } else if (align === 'right') {
      startX = totalMaxWidth - lineWidth;
    }

    let cursorX = startX;
    const baseCursorY = (lineIdx + 1) * lineHeights;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const glyph = font.glyphs[char] || font.glyphs['?'] || { width: 14, strokes: [] };
      const charSeed = lineIdx * 3571 + i * 997 + char.charCodeAt(0) * 17;

      // Human handwriting imperfections
      const baselineJitter = (pseudoNoise(charSeed + 1) - 0.5) * (fontSize * 0.08) * imperfection;
      const slantJitter = (pseudoNoise(charSeed + 2) - 0.5) * 0.14 * imperfection;
      const widthJitter = 1.0 + (pseudoNoise(charSeed + 3) - 0.5) * 0.12 * imperfection;

      const charWidth = glyph.width * baseScale * widthJitter * letterSpacing;
      const charCursorY = baseCursorY + baselineJitter;

      if (char === ' ') {
        cursorX += charWidth;
        continue;
      }

      if (glyph.strokes && glyph.strokes.length > 0) {
        for (let sIdx = 0; sIdx < glyph.strokes.length; sIdx++) {
          const stroke = glyph.strokes[sIdx];
          if (stroke.length < 2) continue;

          const transformPt = (rawX, rawY, ptIdx) => {
            const sx = rawX * widthJitter - rawY * slantJitter;
            const sy = rawY;

            const ptSeed = charSeed + sIdx * 73 + ptIdx * 19;
            const wobbleX = (pseudoNoise(ptSeed + 4) - 0.5) * (baseScale * 1.5) * imperfection;
            const wobbleY = (pseudoNoise(ptSeed + 5) - 0.5) * (baseScale * 1.5) * imperfection;

            return {
              x: cursorX + sx * baseScale + wobbleX,
              y: charCursorY + sy * baseScale + wobbleY
            };
          };

          const p0 = transformPt(stroke[0][0], stroke[0][1], 0);
          minX = Math.min(minX, p0.x);
          minY = Math.min(minY, p0.y);
          maxX = Math.max(maxX, p0.x);
          maxY = Math.max(maxY, p0.y);

          const subpath = [{ type: 'M', x: p0.x, y: p0.y }];
          let prevPt = p0;

          for (let s = 1; s < stroke.length; s++) {
            const pt = transformPt(stroke[s][0], stroke[s][1], s);
            const segDist = Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y);

            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);

            if (imperfection > 0.1 && segDist > 1.2) {
              const segSeed = charSeed + sIdx * 53 + s * 31;
              const perpX = -(pt.y - prevPt.y) / segDist;
              const perpY = (pt.x - prevPt.x) / segDist;
              const curveWobble = (pseudoNoise(segSeed + 6) - 0.5) * (baseScale * 2.2) * imperfection;

              const ctrlX = (prevPt.x + pt.x) / 2 + perpX * curveWobble;
              const ctrlY = (prevPt.y + pt.y) / 2 + perpY * curveWobble;

              subpath.push({ type: 'Q', cx: ctrlX, cy: ctrlY, x: pt.x, y: pt.y });
            } else {
              subpath.push({ type: 'L', x: pt.x, y: pt.y });
            }

            prevPt = pt;
          }

          rawSegments.push(subpath);
        }
      }

      cursorX += charWidth;
    }
  });

  const normX = minX !== Infinity ? minX : 0;
  const normY = minY !== Infinity ? minY : 0;

  // Normalize all coordinates so text origin is exactly at (0, 0)
  rawSegments.forEach(subpath => {
    subpath.forEach(cmd => {
      if (cmd.type === 'M') {
        allPathCommands.push(`M ${(cmd.x - normX).toFixed(2)} ${(cmd.y - normY).toFixed(2)}`);
      } else if (cmd.type === 'L') {
        allPathCommands.push(`L ${(cmd.x - normX).toFixed(2)} ${(cmd.y - normY).toFixed(2)}`);
      } else if (cmd.type === 'Q') {
        allPathCommands.push(`Q ${(cmd.cx - normX).toFixed(2)} ${(cmd.cy - normY).toFixed(2)} ${(cmd.x - normX).toFixed(2)} ${(cmd.y - normY).toFixed(2)}`);
      }
    });
  });

  const pathData = allPathCommands.join(' ');
  const width = maxX > minX ? (maxX - minX) : totalMaxWidth;
  const height = maxY > minY ? (maxY - minY) : lines.length * lineHeights;

  return {
    pathData,
    width: Math.max(width, 10),
    height: Math.max(height, 10),
    bounds: {
      minX: 0,
      minY: 0,
      maxX: width,
      maxY: height
    }
  };
}
