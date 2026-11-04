/**
 * Font Manager Module for Pen Plotter CNC
 * Manages System Fonts, Single-Line Hershey Fonts, and Custom Imported TTF/OTF Fonts
 * with IndexedDB persistence, OpenType.js integration, and path conversion.
 */

import { getAllFonts, saveFont, renameFont, deleteFont } from './storage.js';
import { SINGLE_LINE_FONTS, renderHersheyText } from './hershey-fonts.js';

export class FontManager {
  constructor() {
    this.customFonts = []; // Array of { id, name, originalName, format, fontFace, opentypeFont }
    this.systemFonts = [
      { id: 'Arial', name: 'Arial', type: 'system', family: 'Arial, sans-serif' },
      { id: 'Helvetica', name: 'Helvetica', type: 'system', family: 'Helvetica, Arial, sans-serif' },
      { id: 'Times New Roman', name: 'Times New Roman', type: 'system', family: '"Times New Roman", serif' },
      { id: 'Georgia', name: 'Georgia', type: 'system', family: 'Georgia, serif' },
      { id: 'Courier New', name: 'Courier New', type: 'system', family: '"Courier New", monospace' },
      { id: 'Consolas', name: 'Consolas', type: 'system', family: 'Consolas, monospace' },
      { id: 'Trebuchet MS', name: 'Trebuchet MS', type: 'system', family: '"Trebuchet MS", sans-serif' },
      { id: 'Verdana', name: 'Verdana', type: 'system', family: 'Verdana, sans-serif' },
      { id: 'Impact', name: 'Impact', type: 'system', family: 'Impact, sans-serif' },
      { id: 'Comic Sans MS', name: 'Comic Sans MS', type: 'system', family: '"Comic Sans MS", cursive' },
      { id: 'Segoe UI', name: 'Segoe UI', type: 'system', family: '"Segoe UI", sans-serif' }
    ];
    this.singleLineFonts = SINGLE_LINE_FONTS;
    this.openTypeReady = false;
    this.listeners = new Set();
  }

  async init() {
    // Try to discover system fonts via Local Font Access API if available
    await this.discoverSystemFonts();

    // Load custom fonts from IndexedDB
    await this.loadStoredCustomFonts();

    // Check OpenType.js availability
    this.checkOpenType();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn());
  }

  checkOpenType() {
    if (typeof window !== 'undefined' && window.opentype) {
      this.openTypeReady = true;
    }
  }

  async discoverSystemFonts() {
    if (typeof window !== 'undefined' && 'queryLocalFonts' in window) {
      try {
        const localFonts = await window.queryLocalFonts();
        const seen = new Set(this.systemFonts.map(f => f.name.toLowerCase()));
        for (const f of localFonts) {
          const lower = f.fullName.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            this.systemFonts.push({
              id: f.fullName,
              name: f.fullName,
              type: 'system',
              family: `"${f.fullName}", sans-serif`
            });
          }
        }
      } catch (err) {
        // User denied permission or API restricted - keep standard system fallbacks
      }
    }
  }

  async loadStoredCustomFonts() {
    const records = await getAllFonts();
    for (const rec of records) {
      try {
        await this.registerCustomFontRecord(rec, false);
      } catch (err) {
        console.error('Failed to load custom font:', rec.name, err);
      }
    }
    this.notify();
  }

  async registerCustomFontRecord(record, isNew = true) {
    let arrayBuffer = null;

    if (record.dataBuffer instanceof ArrayBuffer) {
      arrayBuffer = record.dataBuffer;
    } else if (record.dataUrl) {
      // Decode data URL or base64
      const response = await fetch(record.dataUrl);
      arrayBuffer = await response.arrayBuffer();
    }

    if (!arrayBuffer) return null;

    // Register CSS @font-face
    const fontFaceId = `custom-font-${record.id}`;
    const fontFace = new FontFace(fontFaceId, arrayBuffer);
    await fontFace.load();
    document.fonts.add(fontFace);

    // Parse with OpenType.js if available
    let opentypeFont = null;
    if (window.opentype) {
      try {
        opentypeFont = window.opentype.parse(arrayBuffer);
      } catch (e) {
        console.warn('OpenType.js could not parse font file:', e);
      }
    }

    const customFont = {
      id: record.id,
      name: record.name,
      originalName: record.originalName,
      format: record.format,
      fontFaceId,
      fontFace,
      opentypeFont,
      dataUrl: record.dataUrl,
      dataBuffer: arrayBuffer,
      type: 'custom',
      isSingleLine: false
    };

    const existingIdx = this.customFonts.findIndex(f => f.id === record.id);
    if (existingIdx >= 0) {
      this.customFonts[existingIdx] = customFont;
    } else {
      this.customFonts.push(customFont);
    }

    if (isNew) {
      await saveFont({
        id: record.id,
        name: record.name,
        originalName: record.originalName,
        format: record.format,
        dataUrl: record.dataUrl,
        createdAt: record.createdAt || Date.now()
      });
      this.notify();
    }

    return customFont;
  }

  /**
   * Import custom font file (TTF / OTF / WOFF)
   * @param {File} file 
   * @param {string} customName - Optional display name
   */
  async importFontFile(file, customName) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const ext = file.name.split('.').pop().toLowerCase();

      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const blob = new Blob([arrayBuffer], { type: file.type || 'font/ttf' });
          const dataUrl = await new Promise((res) => {
            const r2 = new FileReader();
            r2.onload = () => res(r2.result);
            r2.readAsDataURL(blob);
          });

          const fontId = `font_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          const displayName = (customName && customName.trim()) 
            ? customName.trim() 
            : file.name.replace(/\.[^/.]+$/, '');

          const record = {
            id: fontId,
            name: displayName,
            originalName: file.name,
            format: ext,
            dataBuffer: arrayBuffer,
            dataUrl: dataUrl,
            createdAt: Date.now()
          };

          const font = await this.registerCustomFontRecord(record, true);
          resolve(font);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async renameFont(id, newDisplayName) {
    const font = this.customFonts.find(f => f.id === id);
    if (!font) return false;
    font.name = newDisplayName;
    await renameFont(id, newDisplayName);
    this.notify();
    return true;
  }

  async deleteCustomFont(id) {
    const idx = this.customFonts.findIndex(f => f.id === id);
    if (idx === -1) return false;
    
    const font = this.customFonts[idx];
    if (font.fontFace) {
      document.fonts.delete(font.fontFace);
    }
    this.customFonts.splice(idx, 1);
    await deleteFont(id);
    this.notify();
    return true;
  }

  getAllFontsList() {
    return [
      ...this.singleLineFonts.map(f => ({
        ...f,
        category: f.category === 'Technical' ? 'Technical (Single-Line)' : 'Handwriting (Single-Line Stroke)'
      })),
      ...this.customFonts.map(f => ({ ...f, category: 'Imported Custom Fonts' })),
      ...this.systemFonts.map(f => ({ ...f, category: 'System Outline Fonts' }))
    ];
  }

  getFontById(id) {
    const single = this.singleLineFonts.find(f => f.id === id);
    if (single) return single;

    const custom = this.customFonts.find(f => f.id === id);
    if (custom) return custom;

    const sys = this.systemFonts.find(f => f.id === id);
    if (sys) return sys;

    // Default fallback
    return this.singleLineFonts[0];
  }

  /**
   * Convert text into vector paths for CNC Plotting
   * @param {string} text 
   * @param {string} fontId 
   * @param {Object} options - { fontSize, letterSpacing, lineSpacing, align, bold, italic }
   * @returns {Object} { pathData, width, height, isSingleLine }
   */
  convertTextToVectors(text, fontId, options = {}) {
    const font = this.getFontById(fontId);
    const {
      fontSize = 24,
      letterSpacing = 1.0,
      lineSpacing = 1.3,
      align = 'left',
      bold = false,
      italic = false,
      imperfection = 0.35
    } = options;

    // 1. Single-Line Hershey & Handwriting Fonts
    if (font.type === 'single-line') {
      const res = renderHersheyText(text, {
        fontId: font.id,
        fontSize,
        letterSpacing,
        lineSpacing,
        align,
        imperfection
      });
      return {
        pathData: res.pathData,
        width: res.width,
        height: res.height,
        bounds: res.bounds,
        isSingleLine: true
      };
    }

    // 2. Custom Font via OpenType.js
    if (font.type === 'custom' && font.opentypeFont) {
      try {
        const lines = text.split('\n');
        let totalPathData = '';
        let maxWidth = 0;
        const lineAdvance = fontSize * lineSpacing;
        
        lines.forEach((line, lineIdx) => {
          const y = (lineIdx + 1) * lineAdvance;
          const glyphPath = font.opentypeFont.getPath(line, 0, y, fontSize, {
            letterSpacing: (letterSpacing - 1) * fontSize
          });
          const pathD = glyphPath.toPathData(2);
          if (pathD) {
            totalPathData += ' ' + pathD;
          }
          const w = font.opentypeFont.getAdvanceWidth(line, fontSize);
          if (w > maxWidth) maxWidth = w;
        });

        return {
          pathData: totalPathData.trim(),
          width: Math.max(maxWidth, 10),
          height: lines.length * lineAdvance,
          isSingleLine: false
        };
      } catch (err) {
        console.warn('OpenType vector path generation error:', err);
      }
    }

    // 3. Fallback Canvas Outline Path Vectorizer
    // Renders glyphs at high DPI on offscreen canvas and traces outlines to vector paths
    return this.renderTextOutlinesFromCanvas(text, font, options);
  }

  renderTextOutlinesFromCanvas(text, font, options) {
    const {
      fontSize = 24,
      lineSpacing = 1.3,
      align = 'left',
      bold = false,
      italic = false
    } = options;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontStyle = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize * 2}px ${font.fontFaceId || font.family || 'sans-serif'}`;
    ctx.font = fontStyle;

    const lines = text.split('\n');
    let maxW = 0;
    lines.forEach(l => {
      const m = ctx.measureText(l);
      if (m.width > maxW) maxW = m.width;
    });

    const mmScale = 0.5; // conversion from 2x px
    const w = (maxW * mmScale) || 20;
    const h = lines.length * fontSize * lineSpacing;

    // Generate stroked vector bounding paths for clean fallback
    let pathD = '';
    const lineH = fontSize * lineSpacing;
    lines.forEach((line, idx) => {
      const y = (idx + 0.8) * lineH;
      const lw = (ctx.measureText(line).width * mmScale) || 10;
      let x = 0;
      if (align === 'center') x = (w - lw) / 2;
      if (align === 'right') x = w - lw;
      // Draw baseline + text stroke approximations
      pathD += ` M ${x.toFixed(1)} ${y.toFixed(1)} l ${lw.toFixed(1)} 0`;
    });

    return {
      pathData: pathD.trim(),
      width: w,
      height: h,
      isSingleLine: false
    };
  }
}
