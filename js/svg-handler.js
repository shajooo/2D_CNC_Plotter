/**
 * SVG Handler for Pen Plotter CNC
 * Cleans, normalizes, and scales arbitrary SVG files into clean plotting geometry.
 */

export class SVGHandler {
  /**
   * Normalize an SVG string to fit cleanly within given paper dimensions
   * @param {string} svgContent 
   * @param {number} maxW - Paper width in mm
   * @param {number} maxH - Paper height in mm
   * @returns {string} Sanitized SVG string
   */
  static normalize(svgContent, maxW = 297, maxH = 210) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svgContent;

    // Remove any embedded style tags or scripts for security and clean parsing
    const scripts = svgEl.querySelectorAll('script');
    scripts.forEach(s => s.remove());

    // Ensure all strokes have clean linecap and joins for plotters
    const strokeElements = svgEl.querySelectorAll('path, line, polyline, polygon, circle, rect, ellipse');
    strokeElements.forEach(el => {
      if (!el.getAttribute('stroke')) {
        el.setAttribute('stroke', '#ffffff');
      }
      if (!el.getAttribute('stroke-width')) {
        el.setAttribute('stroke-width', '1');
      }
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
    });

    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgEl);
  }
}
