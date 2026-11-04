/**
 * Built-in Page Border System for Pen Plotter CNC
 * Provides architectural, formal, decorative, and technical vector borders
 * that render in real-time on the document sheet and export directly to CNC G-code.
 */

export const BORDER_STYLES = [
  { id: 'none', name: 'None (Clean Borderless)', desc: 'Pure white page without any border frame' },
  { id: 'single', name: 'Classic Single Line', desc: 'Clean, professional rectangular precision frame' },
  { id: 'double', name: 'Executive Double Line', desc: 'Dual-line border with bold outer and thin inner frame' },
  { id: 'corners', name: 'Vintage Ornamental Corners', desc: 'Classic ornamental flourish brackets at all 4 corners' },
  { id: 'certificate', name: 'Certificate & Diploma', desc: 'Multi-tiered formal border with decorative corner accents' },
  { id: 'cad', name: 'Technical CAD / Drafting', desc: 'Engineering drafting frame with grid reference ticks and title block' },
  { id: 'modern', name: 'Modern Floating Inset', desc: 'Architectural minimalist floating corner frames' },
  { id: 'dashed', name: 'Blueprint Precision Dashed', desc: 'Dashed precision frame with corner crosshair ticks' }
];

export class BorderManager {
  /**
   * Calculates safe text writing margins (in mm) so document handwriting
   * automatically nests cleanly inside any active border without overlapping.
   * @param {string} style - Border style id
   * @param {number} inset - Border margin inset in mm
   * @returns {{ top: number, right: number, bottom: number, left: number }}
   */
  static getBorderSafeMargins(style = 'none', inset = 12) {
    const i = Math.max(4, Number(inset) || 12);
    if (!style || style === 'none') {
      return { top: 14, right: 14, bottom: 14, left: 14 };
    }

    switch (style) {
      case 'single':
        return { top: i + 8, right: i + 8, bottom: i + 8, left: i + 8 };
      case 'double':
        return { top: i + 11, right: i + 11, bottom: i + 11, left: i + 11 };
      case 'corners':
        return { top: i + 16, right: i + 16, bottom: i + 16, left: i + 16 };
      case 'certificate':
        return { top: i + 18, right: i + 18, bottom: i + 18, left: i + 18 };
      case 'cad':
        return { top: i + 14, right: i + 14, bottom: i + 26, left: i + 14 };
      case 'modern':
        return { top: i + 16, right: i + 16, bottom: i + 16, left: i + 16 };
      case 'dashed':
        return { top: i + 10, right: i + 10, bottom: i + 10, left: i + 10 };
      default:
        return { top: i + 10, right: i + 10, bottom: i + 10, left: i + 10 };
    }
  }

  /**
   * Generates SVG path data strings (in mm coordinates) for the given border style.
   * @param {number} width - Page width in mm
   * @param {number} height - Page height in mm
   * @param {string} style - Border style id
   * @param {number} inset - Margin inset in mm (default 12)
   * @returns {string[]} Array of SVG path 'd' strings
   */
  static getBorderPaths(width, height, style = 'single', inset = 12) {
    if (!style || style === 'none') return [];

    const w = Number(width);
    const h = Number(height);
    const i = Math.max(4, Math.min(inset, Math.min(w, h) / 4));
    const paths = [];

    switch (style) {
      case 'single': {
        // Single crisp rectangular frame
        paths.push(`M ${i.toFixed(2)} ${i.toFixed(2)} H ${(w - i).toFixed(2)} V ${(h - i).toFixed(2)} H ${i.toFixed(2)} Z`);
        break;
      }

      case 'double': {
        // Outer frame
        const i1 = i;
        paths.push(`M ${i1.toFixed(2)} ${i1.toFixed(2)} H ${(w - i1).toFixed(2)} V ${(h - i1).toFixed(2)} H ${i1.toFixed(2)} Z`);
        // Inner frame
        const i2 = i + 3.5;
        if (w - 2 * i2 > 10 && h - 2 * i2 > 10) {
          paths.push(`M ${i2.toFixed(2)} ${i2.toFixed(2)} H ${(w - i2).toFixed(2)} V ${(h - i2).toFixed(2)} H ${i2.toFixed(2)} Z`);
        }
        break;
      }

      case 'corners': {
        // Outer boundary
        paths.push(`M ${i.toFixed(2)} ${i.toFixed(2)} H ${(w - i).toFixed(2)} V ${(h - i).toFixed(2)} H ${i.toFixed(2)} Z`);
        
        // 4 Vintage corner brackets & diamonds
        const arm = 14;
        const dia = 3.5;

        // Top-Left Corner
        paths.push(`M ${(i + 4).toFixed(2)} ${(i + 4 + arm).toFixed(2)} L ${(i + 4).toFixed(2)} ${(i + 4).toFixed(2)} L ${(i + 4 + arm).toFixed(2)} ${(i + 4).toFixed(2)}`);
        paths.push(`M ${(i + 4).toFixed(2)} ${(i + 4).toFixed(2)} L ${(i + 4 + arm).toFixed(2)} ${(i + 4 + arm).toFixed(2)}`);
        // TL diamond
        paths.push(`M ${(i + 7).toFixed(2)} ${(i + 7 - dia).toFixed(2)} L ${(i + 7 + dia).toFixed(2)} ${(i + 7).toFixed(2)} L ${(i + 7).toFixed(2)} ${(i + 7 + dia).toFixed(2)} L ${(i + 7 - dia).toFixed(2)} ${(i + 7).toFixed(2)} Z`);

        // Top-Right Corner
        paths.push(`M ${(w - i - 4 - arm).toFixed(2)} ${(i + 4).toFixed(2)} L ${(w - i - 4).toFixed(2)} ${(i + 4).toFixed(2)} L ${(w - i - 4).toFixed(2)} ${(i + 4 + arm).toFixed(2)}`);
        paths.push(`M ${(w - i - 4).toFixed(2)} ${(i + 4).toFixed(2)} L ${(w - i - 4 - arm).toFixed(2)} ${(i + 4 + arm).toFixed(2)}`);
        // TR diamond
        paths.push(`M ${(w - i - 7).toFixed(2)} ${(i + 7 - dia).toFixed(2)} L ${(w - i - 7 + dia).toFixed(2)} ${(i + 7).toFixed(2)} L ${(w - i - 7).toFixed(2)} ${(i + 7 + dia).toFixed(2)} L ${(w - i - 7 - dia).toFixed(2)} ${(i + 7).toFixed(2)} Z`);

        // Bottom-Right Corner
        paths.push(`M ${(w - i - 4).toFixed(2)} ${(h - i - 4 - arm).toFixed(2)} L ${(w - i - 4).toFixed(2)} ${(h - i - 4).toFixed(2)} L ${(w - i - 4 - arm).toFixed(2)} ${(h - i - 4).toFixed(2)}`);
        paths.push(`M ${(w - i - 4).toFixed(2)} ${(h - i - 4).toFixed(2)} L ${(w - i - 4 - arm).toFixed(2)} ${(h - i - 4 - arm).toFixed(2)}`);
        // BR diamond
        paths.push(`M ${(w - i - 7).toFixed(2)} ${(h - i - 7 - dia).toFixed(2)} L ${(w - i - 7 + dia).toFixed(2)} ${(h - i - 7).toFixed(2)} L ${(w - i - 7).toFixed(2)} ${(h - i - 7 + dia).toFixed(2)} L ${(w - i - 7 - dia).toFixed(2)} ${(h - i - 7).toFixed(2)} Z`);

        // Bottom-Left Corner
        paths.push(`M ${(i + 4 + arm).toFixed(2)} ${(h - i - 4).toFixed(2)} L ${(i + 4).toFixed(2)} ${(h - i - 4).toFixed(2)} L ${(i + 4).toFixed(2)} ${(h - i - 4 - arm).toFixed(2)}`);
        paths.push(`M ${(i + 4).toFixed(2)} ${(h - i - 4).toFixed(2)} L ${(i + 4 + arm).toFixed(2)} ${(h - i - 4 - arm).toFixed(2)}`);
        // BL diamond
        paths.push(`M ${(i + 7).toFixed(2)} ${(h - i - 7 - dia).toFixed(2)} L ${(i + 7 + dia).toFixed(2)} ${(h - i - 7).toFixed(2)} L ${(i + 7).toFixed(2)} ${(h - i - 7 + dia).toFixed(2)} L ${(i + 7 - dia).toFixed(2)} ${(h - i - 7).toFixed(2)} Z`);
        break;
      }

      case 'certificate': {
        // Multi-tiered formal border
        const i1 = i;
        const i2 = i + 2.5;
        const i3 = i + 5.5;

        paths.push(`M ${i1.toFixed(2)} ${i1.toFixed(2)} H ${(w - i1).toFixed(2)} V ${(h - i1).toFixed(2)} H ${i1.toFixed(2)} Z`);
        paths.push(`M ${i2.toFixed(2)} ${i2.toFixed(2)} H ${(w - i2).toFixed(2)} V ${(h - i2).toFixed(2)} H ${i2.toFixed(2)} Z`);
        paths.push(`M ${i3.toFixed(2)} ${i3.toFixed(2)} H ${(w - i3).toFixed(2)} V ${(h - i3).toFixed(2)} H ${i3.toFixed(2)} Z`);

        // Corner rosette squares
        const roset = 4;
        [
          [i2, i2],
          [w - i2 - roset, i2],
          [w - i2 - roset, h - i2 - roset],
          [i2, h - i2 - roset]
        ].forEach(([rx, ry]) => {
          paths.push(`M ${rx.toFixed(2)} ${ry.toFixed(2)} H ${(rx + roset).toFixed(2)} V ${(ry + roset).toFixed(2)} H ${rx.toFixed(2)} Z`);
          paths.push(`M ${rx.toFixed(2)} ${ry.toFixed(2)} L ${(rx + roset).toFixed(2)} ${(ry + roset).toFixed(2)}`);
          paths.push(`M ${(rx + roset).toFixed(2)} ${ry.toFixed(2)} L ${rx.toFixed(2)} ${(ry + roset).toFixed(2)}`);
        });
        break;
      }

      case 'cad': {
        // Industrial engineering drafting border
        const iOut = Math.max(5, i - 4);
        const iIn = i;
        // Outer margin
        paths.push(`M ${iOut.toFixed(2)} ${iOut.toFixed(2)} H ${(w - iOut).toFixed(2)} V ${(h - iOut).toFixed(2)} H ${iOut.toFixed(2)} Z`);
        // Inner margin
        paths.push(`M ${iIn.toFixed(2)} ${iIn.toFixed(2)} H ${(w - iIn).toFixed(2)} V ${(h - iIn).toFixed(2)} H ${iIn.toFixed(2)} Z`);

        // Coordinate ticks along top edge (1, 2, 3, 4, 5)
        const stepX = (w - 2 * iIn) / 6;
        for (let col = 1; col <= 5; col++) {
          const tx = iIn + col * stepX;
          paths.push(`M ${tx.toFixed(2)} ${iOut.toFixed(2)} V ${iIn.toFixed(2)}`);
        }

        // Coordinate ticks along left edge (A, B, C, D)
        const stepY = (h - 2 * iIn) / 5;
        for (let row = 1; row <= 4; row++) {
          const ty = iIn + row * stepY;
          paths.push(`M ${iOut.toFixed(2)} ${ty.toFixed(2)} H ${iIn.toFixed(2)}`);
        }

        // Engineering Title Block in bottom-right corner
        const tbW = Math.min(75, (w - 2 * iIn) * 0.45);
        const tbH = Math.min(22, (h - 2 * iIn) * 0.35);
        const tbX = w - iIn - tbW;
        const tbY = h - iIn - tbH;

        // Title box outer boundary
        paths.push(`M ${tbX.toFixed(2)} ${(h - iIn).toFixed(2)} V ${tbY.toFixed(2)} H ${(w - iIn).toFixed(2)}`);
        // Title box dividers
        paths.push(`M ${tbX.toFixed(2)} ${(tbY + tbH * 0.5).toFixed(2)} H ${(w - iIn).toFixed(2)}`);
        paths.push(`M ${(tbX + tbW * 0.55).toFixed(2)} ${(tbY + tbH * 0.5).toFixed(2)} V ${(h - iIn).toFixed(2)}`);
        break;
      }

      case 'modern': {
        // Modern Floating L-bracket frame
        const arm = 18;
        // Top-Left L
        paths.push(`M ${i.toFixed(2)} ${(i + arm).toFixed(2)} L ${i.toFixed(2)} ${i.toFixed(2)} L ${(i + arm).toFixed(2)} ${i.toFixed(2)}`);
        // Top-Right L
        paths.push(`M ${(w - i - arm).toFixed(2)} ${i.toFixed(2)} L ${(w - i).toFixed(2)} ${i.toFixed(2)} L ${(w - i).toFixed(2)} ${(i + arm).toFixed(2)}`);
        // Bottom-Right L
        paths.push(`M ${(w - i).toFixed(2)} ${(h - i - arm).toFixed(2)} L ${(w - i).toFixed(2)} ${(h - i).toFixed(2)} L ${(w - i - arm).toFixed(2)} ${(h - i).toFixed(2)}`);
        // Bottom-Left L
        paths.push(`M ${(i + arm).toFixed(2)} ${(h - i).toFixed(2)} L ${i.toFixed(2)} ${(h - i).toFixed(2)} L ${i.toFixed(2)} ${(h - i - arm).toFixed(2)}`);

        // Inset subtle thin rectangle
        const iSub = i + 3;
        paths.push(`M ${(iSub + arm).toFixed(2)} ${iSub.toFixed(2)} H ${(w - iSub - arm).toFixed(2)}`);
        paths.push(`M ${(w - iSub).toFixed(2)} ${(iSub + arm).toFixed(2)} V ${(h - iSub - arm).toFixed(2)}`);
        paths.push(`M ${(w - iSub - arm).toFixed(2)} ${(h - iSub).toFixed(2)} H ${(iSub + arm).toFixed(2)}`);
        paths.push(`M ${iSub.toFixed(2)} ${(h - iSub - arm).toFixed(2)} V ${(iSub + arm).toFixed(2)}`);
        break;
      }

      case 'dashed': {
        // Blueprint precision dashed border with crosshairs
        paths.push(`M ${i.toFixed(2)} ${i.toFixed(2)} H ${(w - i).toFixed(2)} V ${(h - i).toFixed(2)} H ${i.toFixed(2)} Z`);
        
        // 4 Corner Crosshairs (+)
        const ch = 4;
        // TL Cross
        paths.push(`M ${(i - ch).toFixed(2)} ${i.toFixed(2)} H ${(i + ch).toFixed(2)} M ${i.toFixed(2)} ${(i - ch).toFixed(2)} V ${(i + ch).toFixed(2)}`);
        // TR Cross
        paths.push(`M ${(w - i - ch).toFixed(2)} ${i.toFixed(2)} H ${(w - i + ch).toFixed(2)} M ${(w - i).toFixed(2)} ${(i - ch).toFixed(2)} V ${(i + ch).toFixed(2)}`);
        // BR Cross
        paths.push(`M ${(w - i - ch).toFixed(2)} ${(h - i).toFixed(2)} H ${(w - i + ch).toFixed(2)} M ${(w - i).toFixed(2)} ${(h - i - ch).toFixed(2)} V ${(h - i + ch).toFixed(2)}`);
        // BL Cross
        paths.push(`M ${(i - ch).toFixed(2)} ${(h - i).toFixed(2)} H ${(i + ch).toFixed(2)} M ${i.toFixed(2)} ${(h - i - ch).toFixed(2)} V ${(h - i + ch).toFixed(2)}`);
        break;
      }

      default:
        break;
    }

    return paths;
  }

  /**
   * Renders the border directly into the document sheet's SVG overlay.
   * @param {SVGSVGElement} svgElement - The SVG element inside the document sheet
   * @param {number} width - Page width in mm
   * @param {number} height - Page height in mm
   * @param {string} style - Border style id
   * @param {number} inset - Inset in mm
   * @param {string} strokeColor - Stroke color (default CNC dark charcoal / gold)
   */
  static renderToSVG(svgElement, width, height, style = 'single', inset = 12, strokeColor = '#1e293b') {
    if (!svgElement) return;
    svgElement.innerHTML = '';

    if (!style || style === 'none') return;

    svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const paths = this.getBorderPaths(width, height, style, inset);

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', `doc-border-group border-${style}`);

    paths.forEach(d => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', strokeColor);
      p.setAttribute('stroke-width', style === 'double' ? '0.7' : '0.9');
      if (style === 'dashed') {
        p.setAttribute('stroke-dasharray', '4 2');
      }
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      group.appendChild(p);
    });

    svgElement.appendChild(group);
  }
}
