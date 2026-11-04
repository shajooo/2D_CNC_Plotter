/**
 * Text-to-Plot Editor & Font Management Controller for Pen Plotter CNC
 * Provides rich typography controls and converts text to vector paths (Hershey strokes or TTF outlines).
 */

export class TextEditor {
  constructor(workspace, fontManager) {
    this.workspace = workspace;
    this.fontManager = fontManager;

    this.text = 'Pen Plotter CNC\nPrecision Handwriting';
    this.currentFontId = 'hershey_simplex';
    this.fontSize = 18; // mm
    this.letterSpacing = 1.0;
    this.lineSpacing = 1.3;
    this.align = 'left';
    this.bold = false;
    this.italic = false;
    this.posX = 35;
    this.posY = 50;
    this.rotation = 0;

    this.listeners = new Set();
  }

  setText(text) {
    this.text = text;
    this.notify();
  }

  setFont(fontId) {
    this.currentFontId = fontId;
    this.notify();
  }

  setProperties(props = {}) {
    if (props.fontSize !== undefined) this.fontSize = Number(props.fontSize);
    if (props.letterSpacing !== undefined) this.letterSpacing = Number(props.letterSpacing);
    if (props.lineSpacing !== undefined) this.lineSpacing = Number(props.lineSpacing);
    if (props.align !== undefined) this.align = props.align;
    if (props.bold !== undefined) this.bold = Boolean(props.bold);
    if (props.italic !== undefined) this.italic = Boolean(props.italic);
    if (props.posX !== undefined) this.posX = Number(props.posX);
    if (props.posY !== undefined) this.posY = Number(props.posY);
    if (props.rotation !== undefined) this.rotation = Number(props.rotation);
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn());
  }

  /**
   * Generates live vector preview of current text settings
   */
  getVectorPreview() {
    return this.fontManager.convertTextToVectors(this.text, this.currentFontId, {
      fontSize: this.fontSize,
      letterSpacing: this.letterSpacing,
      lineSpacing: this.lineSpacing,
      align: this.align,
      bold: this.bold,
      italic: this.italic
    });
  }

  /**
   * Convert Text to Vector Paths and place onto Artwork Layer!
   * Guarantees clean vector geometry ready for plotting.
   */
  convertToPaths() {
    const vectorResult = this.getVectorPreview();
    if (!vectorResult.pathData) return null;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'cnc-text-artwork');
    group.setAttribute('data-text-content', this.text.substring(0, 30));
    group.setAttribute('transform', `translate(${this.posX.toFixed(2)}, ${this.posY.toFixed(2)}) rotate(${this.rotation})`);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', vectorResult.pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#ffffff');
    path.setAttribute('stroke-width', vectorResult.isSingleLine ? '1.0' : '0.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');

    group.appendChild(path);
    this.workspace.artworkLayer.appendChild(group);
    this.workspace.selectArtwork(group);
    this.workspace.render();

    return group;
  }
}
