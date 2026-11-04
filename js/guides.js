/**
 * Guide System for Pen Plotter CNC
 * Handles Margins, Ruled Writing Lines, and Alignment Grids in the #guide-layer.
 * 
 * CRITICAL CNC RULE: GUIDES MUST NEVER BE PLOTTED.
 * All elements generated here are strictly visual and flagged with data-cnc-ignore="true".
 */

export class GuideManager {
  constructor(options = {}) {
    this.visible = options.visible !== undefined ? options.visible : true;
    this.marginLeft = options.marginLeft || 25; // mm
    this.marginRight = options.marginRight || 20; // mm
    this.marginTop = options.marginTop || 25; // mm
    this.marginBottom = options.marginBottom || 20; // mm
    this.lineSpacing = options.lineSpacing || 10; // mm horizontal ruled spacing
    this.showGrid = options.showGrid !== undefined ? options.showGrid : true;
    this.gridSpacing = options.gridSpacing || 10; // 10mm grid
  }

  setMargins(left, right, top, bottom) {
    this.marginLeft = Math.max(0, Number(left));
    this.marginRight = Math.max(0, Number(right));
    this.marginTop = Math.max(0, Number(top));
    this.marginBottom = Math.max(0, Number(bottom));
  }

  setLineSpacing(spacing) {
    this.lineSpacing = Math.max(2, Number(spacing));
  }

  toggleVisibility(visible) {
    this.visible = visible !== undefined ? visible : !this.visible;
  }

  /**
   * Render guides into SVG #guide-layer
   * @param {SVGElement} guideLayer 
   * @param {PaperManager} paper 
   */
  render(guideLayer, paper) {
    if (!guideLayer) return;
    guideLayer.innerHTML = '';

    if (!this.visible) {
      guideLayer.style.display = 'none';
      return;
    }
    guideLayer.style.display = 'block';

    const width = paper.width;
    const height = paper.height;
    const isDesignMode = paper.isDesignMode;
    const style = paper.style; // 'blank', 'margined', 'ruled'

    const docFrag = document.createDocumentFragment();

    // 1. Grid Background (in plot/machine mode or when requested)
    if (!isDesignMode && this.showGrid) {
      const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      gridGroup.setAttribute('class', 'cnc-guide-element cnc-grid');
      gridGroup.setAttribute('data-cnc-layer', 'guide');
      gridGroup.setAttribute('data-cnc-ignore', 'true');

      // 10mm minor grid lines & 50mm major lines
      for (let x = 0; x <= width; x += 10) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', 0);
        line.setAttribute('x2', x);
        line.setAttribute('y2', height);
        const isMajor = x % 50 === 0;
        line.setAttribute('stroke', isMajor ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)');
        line.setAttribute('stroke-width', isMajor ? '0.6' : '0.3');
        line.setAttribute('data-cnc-ignore', 'true');
        gridGroup.appendChild(line);
      }

      for (let y = 0; y <= height; y += 10) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', 0);
        line.setAttribute('y1', y);
        line.setAttribute('x2', width);
        line.setAttribute('y2', y);
        const isMajor = y % 50 === 0;
        line.setAttribute('stroke', isMajor ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)');
        line.setAttribute('stroke-width', isMajor ? '0.6' : '0.3');
        line.setAttribute('data-cnc-ignore', 'true');
        gridGroup.appendChild(line);
      }
      docFrag.appendChild(gridGroup);
    }

    guideLayer.appendChild(docFrag);
  }

  /**
   * Preflight verification function:
   * Guarantees zero guide elements ever exist inside the artwork layer or exported paths.
   * @param {Element} element 
   * @returns {boolean} true if element is safe artwork, false if guide or paper
   */
  static isArtworkOnly(element) {
    if (!element) return false;
    if (element.hasAttribute && element.hasAttribute('data-cnc-ignore')) return false;
    if (element.closest && (element.closest('#paper-layer') || element.closest('#guide-layer'))) return false;
    if (element.classList && element.classList.contains('cnc-guide-element')) return false;
    if (element.id === 'cnc-paper-background') return false;
    return true;
  }
}
