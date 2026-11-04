/**
 * Paper System for Pen Plotter CNC
 * Defines standard paper sizes, orientations, and manages the #paper-layer.
 * strictly segregated from plotter toolpaths.
 */

export const PAPER_PRESETS = {
  'A4-L': { name: 'A4 Landscape', width: 297, height: 210, label: 'A4 (297 × 210 mm)' },
  'A4-P': { name: 'A4 Portrait', width: 210, height: 297, label: 'A4 (210 × 297 mm)' },
  'A3-L': { name: 'A3 Landscape', width: 420, height: 297, label: 'A3 (420 × 297 mm)' },
  'A3-P': { name: 'A3 Portrait', width: 297, height: 420, label: 'A3 (297 × 420 mm)' },
  'A5-L': { name: 'A5 Landscape', width: 210, height: 148, label: 'A5 (210 × 148 mm)' },
  'A5-P': { name: 'A5 Portrait', width: 148, height: 210, label: 'A5 (148 × 210 mm)' },
  'Letter-L': { name: 'Letter Landscape', width: 279.4, height: 215.9, label: 'Letter (279.4 × 215.9 mm)' },
  'Letter-P': { name: 'Letter Portrait', width: 215.9, height: 279.4, label: 'Letter (215.9 × 279.4 mm)' },
  'Custom': { name: 'Custom Size', width: 300, height: 200, label: 'Custom' }
};

export class PaperManager {
  constructor(options = {}) {
    this.currentPresetKey = options.preset || 'A4-L';
    this.width = options.width || 297;
    this.height = options.height || 210;
    this.orientation = options.orientation || 'landscape';
    this.borderStyle = options.borderStyle || 'single'; // 'none' | 'single' | 'double' | 'corners' | 'certificate' | 'cad' | 'modern' | 'dashed'
    this.borderInset = options.borderInset || 12; // mm
    this.plotBorder = options.plotBorder !== undefined ? options.plotBorder : true;
    this.paperColor = options.paperColor || '#181a1f';
    this.isDesignMode = false;
  }

  setBorder(style, inset = 12, plotBorder = true) {
    this.borderStyle = style;
    this.borderInset = Number(inset) || 12;
    this.plotBorder = Boolean(plotBorder);
  }

  setPreset(presetKey) {
    if (PAPER_PRESETS[presetKey]) {
      this.currentPresetKey = presetKey;
      this.width = PAPER_PRESETS[presetKey].width;
      this.height = PAPER_PRESETS[presetKey].height;
      this.orientation = this.width >= this.height ? 'landscape' : 'portrait';
    }
  }

  setCustomSize(width, height) {
    this.currentPresetKey = 'Custom';
    this.width = Math.max(10, Number(width));
    this.height = Math.max(10, Number(height));
    this.orientation = this.width >= this.height ? 'landscape' : 'portrait';
  }

  toggleOrientation() {
    const temp = this.width;
    this.width = this.height;
    this.height = temp;
    this.orientation = this.width >= this.height ? 'landscape' : 'portrait';
  }

  setStyle(styleName) {
    if (['blank', 'margined', 'ruled'].includes(styleName)) {
      this.style = styleName;
    }
  }

  /**
   * Renders paper representation into the SVG #paper-layer.
   * NOTE: This layer is strictly excluded from CNC toolpaths!
   * @param {SVGElement} paperLayer 
   */
  render(paperLayer) {
    if (!paperLayer) return;
    paperLayer.innerHTML = '';

    // Create Paper Background
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('id', 'cnc-paper-background');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', this.width);
    rect.setAttribute('height', this.height);
    
    // In design/notebook mode, white paper; in plot/machine mode, dark grid bed
    if (this.isDesignMode) {
      rect.setAttribute('fill', '#ffffff');
      rect.setAttribute('stroke', '#383d47');
      rect.setAttribute('stroke-width', '0.5');
      rect.setAttribute('filter', 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))');
    } else {
      rect.setAttribute('fill', '#121418');
      rect.setAttribute('stroke', '#2a2d36');
      rect.setAttribute('stroke-width', '1');
    }
    
    rect.setAttribute('data-cnc-layer', 'paper');
    rect.setAttribute('data-cnc-ignore', 'true');
    paperLayer.appendChild(rect);
  }
}
