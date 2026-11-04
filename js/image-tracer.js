/**
 * Advanced Image-to-Plot Vectorizer for Pen Plotter CNC
 * High-accuracy vector conversion with 27 specialized algorithms & master combos:
 * - Master Combos (Spider-Man Master, Comic Inking, Architectural Blueprint, Detail 1)
 * - Edge Filters (Edge 1 - 6, DoG High-Pass, Canny, Multi-scale Gradient)
 * - Internal Tonal Isolines (Internal 1 - 5, Multi-tone Topographic Depth)
 * - Stippling (Floyd-Steinberg Error Diffusion & Density Adaptive Dots)
 * - Hatching & Cross-Hatching (45°, 135°, Triple Engraver 0°/60°/120°)
 * - Halftoning (Sine Waveform Halftone, Concentric Rings, Diamond Grid)
 * - Smooth & Clean (Organic Curves, High-Tension Bezier, Silhouette, Sharp Draft)
 */

export class ImageTracer {
  /**
   * Process raster image into SVG path data
   * @param {HTMLImageElement|ImageBitmap} image 
   * @param {Object} options - { mode, details, threshold, invert, step, targetWidth, targetHeight }
   * @returns {Object} { pathData, width, height, strokeCount }
   */
  static trace(image, options = {}) {
    const {
      mode = 'combo_spider',
      details = 'strong',
      threshold = 128,
      invert = false,
      step = 4,
      targetWidth = 160,
      targetHeight = 160,
      preserveAspectRatio = true
    } = options;

    let w = image.naturalWidth || image.width || image.svgWidth || 300;
    let h = image.naturalHeight || image.height || image.svgHeight || 200;
    const maxDimension = 550;

    if (w > maxDimension || h > maxDimension) {
      if (w > h) {
        h = Math.max(1, Math.round((h * maxDimension) / w));
        w = maxDimension;
      } else {
        w = Math.max(1, Math.round((w * maxDimension) / h));
        h = maxDimension;
      }
    }

    let gray;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      // Pre-fill canvas with crisp white background so transparent PNGs and SVGs don't turn black
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(image, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      gray = new Uint8Array(w * h);
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3] / 255;
        // Alpha blend onto pure white background
        const r = Math.round(data[i] * a + 255 * (1 - a));
        const g = Math.round(data[i + 1] * a + 255 * (1 - a));
        const b = Math.round(data[i + 2] * a + 255 * (1 - a));
        const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        gray[i / 4] = invert ? (255 - luminance) : luminance;
      }
    } else {
      // Headless / Mock fallback
      gray = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) gray[i] = 120;
    }

    // Determine target dimensions and exact scale factors to preserve true aspect ratio
    let finalTargetWidth = targetWidth;
    let finalTargetHeight = targetHeight;
    let scaleX, scaleY;

    if (preserveAspectRatio) {
      const imgAspect = w / h;
      const boxAspect = targetWidth / targetHeight;

      if (imgAspect >= boxAspect) {
        // Landscape or wider than bounding box
        finalTargetHeight = Math.max(1, Math.round(targetWidth / imgAspect));
        const scale = targetWidth / w;
        scaleX = scale;
        scaleY = scale;
      } else {
        // Portrait or taller than bounding box (e.g. user portrait drawing)
        finalTargetWidth = Math.max(1, Math.round(targetHeight * imgAspect));
        const scale = targetHeight / h;
        scaleX = scale;
        scaleY = scale;
      }
    } else {
      scaleX = targetWidth / w;
      scaleY = targetHeight / h;
    }

    // Density and details multiplier
    const dmMap = { 'ultra': 0.7, 'strong': 0.85, 'medium': 1.0, 'light': 1.4 };
    const dm = dmMap[details] || 0.85;
    const effStep = Math.max(2, Math.round(step * dm));
    const effThresh = threshold * (details === 'ultra' ? 0.88 : (details === 'strong' ? 0.94 : 1.0));

    let pathCommands = [];

    switch (mode) {
      // -------------------------------------------------------------
      // MASTER COMBOS & DIRECT VECTOR PASSTHROUGH
      // -------------------------------------------------------------
      case 'svg_direct': {
        if (image.rawSvgPaths && image.rawSvgPaths.length > 0) {
          pathCommands = image.rawSvgPaths.map(d => this.scaleSvgPath(d, scaleX, scaleY));
        } else {
          const edges = this.detectDoGEdges(gray, w, h, effThresh, 1, 2.5);
          pathCommands = this.traceEdgePolylines(edges, w, h, scaleX, scaleY);
        }
        break;
      }
      case 'combo_spider': {
        // 1. High-Pass DoG Edges (crisp architectural lines, webs, faces, eyes)
        const edges = this.detectDoGEdges(gray, w, h, effThresh * 0.9, 1, 3);
        const edgePaths = this.traceEdgePolylines(edges, w, h, scaleX, scaleY);
        // 2. Tonal Depth Isolines (shading volume on muscles, suits, hair)
        const isoPaths = this.generateMultiToneIsolines(gray, w, h, scaleX, scaleY, [0.35, 0.65], 1.0);
        // 3. Dense 45° & 135° Cross-Hatching in deep shadow areas
        const h45 = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 45, effStep * 1.3, effThresh * 0.65);
        const h135 = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 135, effStep * 1.5, effThresh * 0.42);
        pathCommands = [...edgePaths, ...isoPaths, ...h45, ...h135];
        break;
      }

      case 'artistic_1': {
        // Graphic Novel Inking (Bold Edge + 45° directional shadow lines + midtone isoline)
        const edges = this.detectDoGEdges(gray, w, h, effThresh, 1, 2.5);
        const edgePaths = this.traceEdgePolylines(edges, w, h, scaleX, scaleY);
        const isoPaths = this.generateMultiToneIsolines(gray, w, h, scaleX, scaleY, [0.5], 1.0);
        const hatch = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 45, effStep, effThresh * 0.7);
        pathCommands = [...edgePaths, ...isoPaths, ...hatch];
        break;
      }

      case 'artistic_2': {
        // Architectural Blueprint (DoG Edge + Technical Grid Hatch)
        const edges = this.detectDoGEdges(gray, w, h, effThresh * 0.85, 1, 3);
        const edgePaths = this.traceEdgePolylines(edges, w, h, scaleX, scaleY);
        const gridH = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 0, effStep * 1.4, effThresh * 0.6);
        const gridV = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 90, effStep * 1.4, effThresh * 0.5);
        pathCommands = [...edgePaths, ...gridH, ...gridV];
        break;
      }

      case 'detail_1': {
        // Extreme Multi-Pass Detail (DoG Edge + 4 Tone Isolines + Micro Cross Hatch)
        const edges = this.detectDoGEdges(gray, w, h, effThresh * 0.8, 1, 3);
        const edgePaths = this.traceEdgePolylines(edges, w, h, scaleX, scaleY);
        const isoPaths = this.generateMultiToneIsolines(gray, w, h, scaleX, scaleY, [0.25, 0.45, 0.65, 0.85], 0.8);
        const cross = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 45, effStep * 1.2, effThresh * 0.5);
        pathCommands = [...edgePaths, ...isoPaths, ...cross];
        break;
      }

      // -------------------------------------------------------------
      // EDGE FILTERS (1 through 6)
      // -------------------------------------------------------------
      case 'edge_1': {
        // High-Pass Architectural Linework (DoG)
        const edges = this.detectDoGEdges(gray, w, h, effThresh, 1, 3);
        pathCommands = this.traceEdgePolylines(edges, w, h, scaleX, scaleY);
        break;
      }

      case 'edge_2': {
        // Canny / Directional Sobel Outlines
        const edges = this.detectSobelEdges(gray, w, h, effThresh);
        pathCommands = this.traceEdgePolylines(edges, w, h, scaleX, scaleY);
        break;
      }

      case 'edge_3': {
        // Multi-Scale Gradient Edges (Fine + Broad)
        const fine = this.detectDoGEdges(gray, w, h, effThresh * 0.9, 1, 2);
        const broad = this.detectSobelEdges(gray, w, h, effThresh * 1.2);
        const combined = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) combined[i] = (fine[i] || broad[i]) ? 1 : 0;
        pathCommands = this.traceEdgePolylines(combined, w, h, scaleX, scaleY);
        break;
      }

      case 'edge_4': {
        // Bold Graphic Inking (Dilated outline)
        const edges = this.detectSobelEdges(gray, w, h, effThresh * 0.85);
        const dilated = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const idx = y * w + x;
            if (edges[idx] || edges[idx - 1] || edges[idx + 1] || edges[idx - w] || edges[idx + w]) {
              dilated[idx] = 1;
            }
          }
        }
        pathCommands = this.traceEdgePolylines(dilated, w, h, scaleX, scaleY);
        break;
      }

      case 'edge_5': {
        // Pencil Sketch & Fine Linework
        const edges = this.detectDoGEdges(gray, w, h, effThresh * 0.75, 1, 2);
        pathCommands = this.traceEdgePolylines(edges, w, h, scaleX, scaleY);
        break;
      }

      case 'edge_6': {
        // Inverted Negative Outline (Chalkboard style)
        const invGray = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) invGray[i] = 255 - gray[i];
        const edges = this.detectDoGEdges(invGray, w, h, effThresh, 1, 3);
        pathCommands = this.traceEdgePolylines(edges, w, h, scaleX, scaleY);
        break;
      }

      // -------------------------------------------------------------
      // INTERNAL TONAL DEPTH & ISOLINES (1 through 5)
      // -------------------------------------------------------------
      case 'internal_1': {
        // 4-Band Topographic Depth Isolines
        pathCommands = this.generateMultiToneIsolines(gray, w, h, scaleX, scaleY, [0.25, 0.5, 0.75, 0.95], 0.9);
        break;
      }

      case 'internal_2': {
        // 6-Band High-Density Depth Isolines
        pathCommands = this.generateMultiToneIsolines(gray, w, h, scaleX, scaleY, [0.15, 0.3, 0.45, 0.6, 0.75, 0.9], 0.8);
        break;
      }

      case 'internal_3': {
        // Deep Shadow Tone Loops
        pathCommands = this.generateMultiToneIsolines(gray, w, h, scaleX, scaleY, [0.15, 0.3, 0.45], 0.9);
        break;
      }

      case 'internal_4': {
        // Shadow Fill Density (Isolines + Tone Hatch)
        const iso = this.generateMultiToneIsolines(gray, w, h, scaleX, scaleY, [0.35, 0.65], 0.9);
        const hatch = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 45, effStep * 1.5, effThresh * 0.5);
        pathCommands = [...iso, ...hatch];
        break;
      }

      case 'internal_5': {
        // Highlights & Midtone Contours
        pathCommands = this.generateMultiToneIsolines(gray, w, h, scaleX, scaleY, [0.55, 0.75, 0.92], 1.0);
        break;
      }

      // -------------------------------------------------------------
      // STIPPLING (POINTILLISM & DOTS)
      // -------------------------------------------------------------
      case 'stipple_diffusion': {
        // Floyd-Steinberg Error Diffusion Stippling Dots
        pathCommands = this.generateStipplingDiffusion(gray, w, h, scaleX, scaleY, effStep, effThresh);
        break;
      }

      case 'stipple_adaptive': {
        // Density-Adaptive Pointillism Dots
        pathCommands = this.generateStipplingAdaptive(gray, w, h, scaleX, scaleY, effStep, effThresh);
        break;
      }

      // -------------------------------------------------------------
      // HATCHING & CROSS-HATCHING
      // -------------------------------------------------------------
      case 'hatch_45': {
        // 45° Directional Shading Lines
        pathCommands = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 45, effStep, effThresh);
        break;
      }

      case 'crosshatch_dual': {
        // Dual Cross-Hatching (45° & 135° Intersecting)
        const p1 = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 45, effStep, effThresh * 0.85);
        const p2 = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 135, effStep * 1.2, effThresh * 0.55);
        pathCommands = [...p1, ...p2];
        break;
      }

      case 'crosshatch_triple': {
        // Triple Cross-Hatch (0°, 60°, 120° Classical Engraving)
        const p1 = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 0, effStep, effThresh * 0.85);
        const p2 = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 60, effStep * 1.2, effThresh * 0.6);
        const p3 = this.generateAngledHatching(gray, w, h, scaleX, scaleY, 120, effStep * 1.4, effThresh * 0.38);
        pathCommands = [...p1, ...p2, ...p3];
        break;
      }

      case 'hatch': {
        // Horizontal Line Hatching
        const hatchSegments = this.generateHatchLines(gray, w, h, effThresh, effStep, scaleX, scaleY, false);
        pathCommands = hatchSegments.map(seg => `M ${seg.x1.toFixed(2)} ${seg.y1.toFixed(2)} L ${seg.x2.toFixed(2)} ${seg.y2.toFixed(2)}`);
        break;
      }

      case 'crosshatch': {
        // Standard Cross-Hatch
        const hatchSegments = this.generateHatchLines(gray, w, h, effThresh, effStep, scaleX, scaleY, true);
        pathCommands = hatchSegments.map(seg => `M ${seg.x1.toFixed(2)} ${seg.y1.toFixed(2)} L ${seg.x2.toFixed(2)} ${seg.y2.toFixed(2)}`);
        break;
      }

      // -------------------------------------------------------------
      // HALFTONING (WAVY LINES & PATTERNS)
      // -------------------------------------------------------------
      case 'halftone_wave': {
        // Oscillating Sine Wave Halftone (Zero pen lifts, continuous modulation)
        pathCommands = this.generateHalftoneWaves(gray, w, h, scaleX, scaleY, effStep);
        break;
      }

      case 'halftone_circle': {
        // Concentric Rings / Circles Halftone
        pathCommands = this.generateHalftoneCircles(gray, w, h, scaleX, scaleY, effStep * 1.2);
        break;
      }

      case 'halftone_grid': {
        // Diamond Pattern Grid Screen
        pathCommands = this.generateHalftoneGrid(gray, w, h, scaleX, scaleY, effStep, effThresh);
        break;
      }

      // -------------------------------------------------------------
      // SMOOTH & CLEAN OUTLINES
      // -------------------------------------------------------------
      case 'smooth_1': {
        // Organic Smooth Contours (Higher RDP tolerance)
        const binary = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) binary[i] = gray[i] < effThresh ? 1 : 0;
        pathCommands = this.traceContours(binary, w, h, scaleX, scaleY, 1.6);
        break;
      }

      case 'smooth_2': {
        // Ultra-Smooth Bezier Approximation
        const binary = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) binary[i] = gray[i] < effThresh ? 1 : 0;
        pathCommands = this.traceContours(binary, w, h, scaleX, scaleY, 2.2);
        break;
      }

      case 'clean_1': {
        // Silhouette & High Contrast Outlines
        const binary = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) binary[i] = gray[i] < (effThresh * 0.8) ? 1 : 0;
        pathCommands = this.traceContours(binary, w, h, scaleX, scaleY, 1.1);
        break;
      }

      case 'sharp_1': {
        // Precision Drafting (Tight tolerance)
        const binary = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) binary[i] = gray[i] < effThresh ? 1 : 0;
        pathCommands = this.traceContours(binary, w, h, scaleX, scaleY, 0.5);
        break;
      }

      case 'contour':
      default: {
        const binary = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) binary[i] = gray[i] < effThresh ? 1 : 0;
        pathCommands = this.traceContours(binary, w, h, scaleX, scaleY, 0.9);
        break;
      }
    }

    return {
      pathData: pathCommands.join(' '),
      width: finalTargetWidth,
      height: finalTargetHeight,
      strokeCount: pathCommands.length
    };
  }

  /**
   * Proportional SVG path coordinate scaler for 1:1 vector passthrough
   */
  static scaleSvgPath(pathStr, sx, sy) {
    if (!pathStr) return '';
    const cmdRegex = /([a-df-z])([^a-df-z]*)/gi;
    let result = '';
    let match;
    while ((match = cmdRegex.exec(pathStr)) !== null) {
      const cmd = match[1];
      const argsStr = match[2].trim();
      if (!argsStr) {
        result += cmd + ' ';
        continue;
      }
      const upper = cmd.toUpperCase();
      const numRegex = /[-+]?(?:[0-9]*\.[0-9]+|[0-9]+)(?:[eE][-+]?[0-9]+)?/g;
      const nums = [];
      let numMatch;
      while ((numMatch = numRegex.exec(argsStr)) !== null) {
        nums.push(parseFloat(numMatch[0]));
      }

      if (upper === 'H') {
        const scaled = nums.map(n => (n * sx).toFixed(2));
        result += `${cmd} ${scaled.join(' ')} `;
      } else if (upper === 'V') {
        const scaled = nums.map(n => (n * sy).toFixed(2));
        result += `${cmd} ${scaled.join(' ')} `;
      } else if (upper === 'A') {
        // A rx ry rot large sweep x y
        const scaled = [];
        for (let i = 0; i < nums.length; i += 7) {
          if (i + 6 < nums.length) {
            scaled.push((nums[i] * sx).toFixed(2));
            scaled.push((nums[i + 1] * sy).toFixed(2));
            scaled.push(nums[i + 2]);
            scaled.push(nums[i + 3]);
            scaled.push(nums[i + 4]);
            scaled.push((nums[i + 5] * sx).toFixed(2));
            scaled.push((nums[i + 6] * sy).toFixed(2));
          }
        }
        result += `${cmd} ${scaled.join(' ')} `;
      } else {
        const scaled = [];
        for (let i = 0; i < nums.length; i += 2) {
          scaled.push((nums[i] * sx).toFixed(2));
          if (i + 1 < nums.length) {
            scaled.push((nums[i + 1] * sy).toFixed(2));
          }
        }
        result += `${cmd} ${scaled.join(' ')} `;
      }
    }
    return result.trim() || pathStr;
  }

  // =============================================================
  // MATHEMATICAL ALGORITHMS & FILTERS
  // =============================================================

  /**
   * Fast Separable Box Blur for Difference of Gaussians (DoG)
   */
  static separableBlur(src, w, h, radius) {
    const tmp = new Float32Array(w * h);
    const dst = new Float32Array(w * h);
    const r = Math.max(1, Math.round(radius));
    const win = 2 * r + 1;

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) {
        const px = Math.min(w - 1, Math.max(0, x));
        sum += src[row + px];
      }
      tmp[row] = sum / win;
      for (let x = 1; x < w; x++) {
        const addX = Math.min(w - 1, x + r);
        const remX = Math.max(0, x - r - 1);
        sum += src[row + addX] - src[row + remX];
        tmp[row + x] = sum / win;
      }
    }

    // Vertical pass
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) {
        const py = Math.min(h - 1, Math.max(0, y));
        sum += tmp[py * w + x];
      }
      dst[x] = sum / win;
      for (let y = 1; y < h; y++) {
        const addY = Math.min(h - 1, y + r);
        const remY = Math.max(0, y - r - 1);
        sum += tmp[addY * w + x] - tmp[remY * w + x];
        dst[y * w + x] = sum / win;
      }
    }

    return dst;
  }

  /**
   * High-Pass Difference of Gaussians (DoG) Edge Detection
   * Extracts clean, crisp architectural lines, web structures, and character contours.
   */
  static detectDoGEdges(gray, w, h, threshold, r1 = 1, r2 = 3) {
    const b1 = this.separableBlur(gray, w, h, r1);
    const b2 = this.separableBlur(gray, w, h, r2);
    const edges = new Uint8Array(w * h);
    const cutoff = Math.max(8, threshold * 0.11);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const diff = Math.abs(b1[idx] - b2[idx]);
        edges[idx] = diff > cutoff ? 1 : 0;
      }
    }
    return edges;
  }

  /**
   * Sobel Edge Detection
   */
  static detectSobelEdges(gray, w, h, threshold) {
    const edges = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const gx = -gray[idx - w - 1] + gray[idx - w + 1]
                   -2 * gray[idx - 1] + 2 * gray[idx + 1]
                   -gray[idx + w - 1] + gray[idx + w + 1];
        const gy = -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1]
                   +gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1];
        const mag = Math.hypot(gx, gy);
        edges[idx] = mag > threshold ? 1 : 0;
      }
    }
    return edges;
  }

  /**
   * Vectorize Edge Pixels into Smooth Polylines with RDP Simplification
   */
  static traceEdgePolylines(edges, w, h, scaleX, scaleY) {
    const visited = new Uint8Array(w * h);
    const paths = [];

    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const idx = y * w + x;
        if (edges[idx] === 1 && !visited[idx]) {
          const pts = [];
          let curX = x, curY = y;

          while (curX >= 1 && curX < w - 1 && curY >= 1 && curY < h - 1) {
            const curIdx = curY * w + curX;
            if (visited[curIdx] || edges[curIdx] !== 1) break;
            visited[curIdx] = 1;
            pts.push({ x: curX * scaleX, y: curY * scaleY });

            let foundNext = false;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = curX + dx;
                const ny = curY + dy;
                const nIdx = ny * w + nx;
                if (!visited[nIdx] && edges[nIdx] === 1) {
                  curX = nx;
                  curY = ny;
                  foundNext = true;
                  break;
                }
              }
              if (foundNext) break;
            }
            if (!foundNext) break;
          }

          if (pts.length >= 3) {
            const simplified = this.simplifyRDP(pts, 0.9);
            if (simplified.length >= 2) {
              let cmd = `M ${simplified[0].x.toFixed(2)} ${simplified[0].y.toFixed(2)}`;
              for (let i = 1; i < simplified.length; i++) {
                cmd += ` L ${simplified[i].x.toFixed(2)} ${simplified[i].y.toFixed(2)}`;
              }
              paths.push(cmd);
            }
          }
        }
      }
    }

    return paths;
  }

  /**
   * High-Precision Moore-Neighbor Contour Vectorizer
   */
  static traceContours(binary, w, h, scaleX, scaleY, epsilon = 0.9) {
    const dx = [0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [-1, -1, 0, 1, 1, 1, 0, -1];
    const visited = new Uint8Array(w * h);
    const paths = [];

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (binary[idx] === 1 && !visited[idx]) {
          const isBoundary = (
            binary[idx - 1] === 0 || binary[idx + 1] === 0 ||
            binary[idx - w] === 0 || binary[idx + w] === 0
          );
          if (!isBoundary) continue;

          const pts = [];
          let cx = x, cy = y;
          let dir = 0;
          let startX = cx, startY = cy;
          let steps = 0;
          const maxSteps = w * h;

          while (steps < maxSteps) {
            pts.push({ x: cx * scaleX, y: cy * scaleY });
            visited[cy * w + cx] = 1;

            let nextFound = false;
            const backtrackDir = (dir + 4) % 8;
            const startScan = (backtrackDir + 1) % 8;

            for (let i = 0; i < 8; i++) {
              const checkDir = (startScan + i) % 8;
              const nx = cx + dx[checkDir];
              const ny = cy + dy[checkDir];
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                if (binary[ny * w + nx] === 1) {
                  cx = nx;
                  cy = ny;
                  dir = checkDir;
                  nextFound = true;
                  break;
                }
              }
            }

            steps++;
            if (!nextFound || (cx === startX && cy === startY && steps > 2)) break;
          }

          if (pts.length >= 4) {
            const simplified = this.simplifyRDP(pts, epsilon);
            if (simplified.length >= 3) {
              let cmd = `M ${simplified[0].x.toFixed(2)} ${simplified[0].y.toFixed(2)}`;
              for (let k = 1; k < simplified.length; k++) {
                cmd += ` L ${simplified[k].x.toFixed(2)} ${simplified[k].y.toFixed(2)}`;
              }
              cmd += ' Z';
              paths.push(cmd);
            }
          }
        }
      }
    }

    return paths;
  }

  /**
   * Multi-Tone Topographic Isolines for Shading Depth
   */
  static generateMultiToneIsolines(gray, w, h, scaleX, scaleY, ratios, epsilon = 0.9) {
    const allPaths = [];
    ratios.forEach(ratio => {
      const threshLevel = Math.round(255 * ratio);
      const bin = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        bin[i] = gray[i] < threshLevel ? 1 : 0;
      }
      const paths = this.traceContours(bin, w, h, scaleX, scaleY, epsilon);
      allPaths.push(...paths);
    });
    return allPaths;
  }

  /**
   * Angled Hatching Shading (e.g. 45°, 135°, 60°, 120°)
   */
  static generateAngledHatching(gray, w, h, scaleX, scaleY, angleDeg, step, threshold, maxDarkness = 255) {
    const paths = [];
    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    // Diagonal bound
    const diag = Math.hypot(w, h);
    const halfDiag = diag / 2;
    const cx = w / 2;
    const cy = h / 2;

    for (let offset = -halfDiag; offset <= halfDiag; offset += step) {
      let inStroke = false;
      let strokePts = [];

      for (let t = -halfDiag; t <= halfDiag; t += 2) {
        // Parametric line point rotated around center
        const imgX = Math.round(cx + (t * cosA - offset * sinA));
        const imgY = Math.round(cy + (t * sinA + offset * cosA));

        if (imgX >= 0 && imgX < w && imgY >= 0 && imgY < h) {
          const darkness = 255 - gray[imgY * w + imgX];
          const isDark = darkness >= (255 - threshold) && darkness <= maxDarkness;

          if (isDark) {
            strokePts.push({ x: imgX * scaleX, y: imgY * scaleY });
            inStroke = true;
          } else if (inStroke) {
            if (strokePts.length >= 2) {
              paths.push(`M ${strokePts[0].x.toFixed(2)} ${strokePts[0].y.toFixed(2)} L ${strokePts[strokePts.length - 1].x.toFixed(2)} ${strokePts[strokePts.length - 1].y.toFixed(2)}`);
            }
            strokePts = [];
            inStroke = false;
          }
        } else if (inStroke) {
          if (strokePts.length >= 2) {
            paths.push(`M ${strokePts[0].x.toFixed(2)} ${strokePts[0].y.toFixed(2)} L ${strokePts[strokePts.length - 1].x.toFixed(2)} ${strokePts[strokePts.length - 1].y.toFixed(2)}`);
          }
          strokePts = [];
          inStroke = false;
        }
      }

      if (inStroke && strokePts.length >= 2) {
        paths.push(`M ${strokePts[0].x.toFixed(2)} ${strokePts[0].y.toFixed(2)} L ${strokePts[strokePts.length - 1].x.toFixed(2)} ${strokePts[strokePts.length - 1].y.toFixed(2)}`);
      }
    }

    return paths;
  }

  /**
   * Floyd-Steinberg Error Diffusion Stippling (Converts dark areas into collections of dots)
   */
  static generateStipplingDiffusion(gray, w, h, scaleX, scaleY, step = 4, threshold = 128) {
    const paths = [];
    const dotR = 0.35; // mm
    const gridW = Math.floor(w / step);
    const gridH = Math.floor(h / step);
    const errMap = new Float32Array(gridW * gridH);

    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        // Average darkness in cell
        let sumDark = 0;
        let count = 0;
        for (let dy = 0; dy < step; dy++) {
          for (let dx = 0; dx < step; dx++) {
            const px = gx * step + dx;
            const py = gy * step + dy;
            if (px < w && py < h) {
              sumDark += (255 - gray[py * w + px]);
              count++;
            }
          }
        }
        const avgDark = count > 0 ? (sumDark / count) : 0;
        const gIdx = gy * gridW + gx;
        const total = avgDark + errMap[gIdx];

        if (total > threshold) {
          const cx = (gx * step + step / 2) * scaleX;
          const cy = (gy * step + step / 2) * scaleY;
          paths.push(`M ${(cx - dotR).toFixed(2)} ${cy.toFixed(2)} A ${dotR} ${dotR} 0 1 0 ${(cx + dotR).toFixed(2)} ${cy.toFixed(2)} A ${dotR} ${dotR} 0 1 0 ${(cx - dotR).toFixed(2)} ${cy.toFixed(2)} Z`);
          const err = total - 255;
          // Diffuse error
          if (gx + 1 < gridW) errMap[gIdx + 1] += err * (7 / 16);
          if (gy + 1 < gridH) {
            if (gx - 1 >= 0) errMap[gIdx + gridW - 1] += err * (3 / 16);
            errMap[gIdx + gridW] += err * (5 / 16);
            if (gx + 1 < gridW) errMap[gIdx + gridW + 1] += err * (1 / 16);
          }
        } else {
          const err = total;
          if (gx + 1 < gridW) errMap[gIdx + 1] += err * (7 / 16);
          if (gy + 1 < gridH) {
            if (gx - 1 >= 0) errMap[gIdx + gridW - 1] += err * (3 / 16);
            errMap[gIdx + gridW] += err * (5 / 16);
            if (gx + 1 < gridW) errMap[gIdx + gridW + 1] += err * (1 / 16);
          }
        }
      }
    }

    return paths;
  }

  /**
   * Density-Adaptive Pointillism Dots
   */
  static generateStipplingAdaptive(gray, w, h, scaleX, scaleY, step = 4, threshold = 128) {
    const paths = [];
    const dotR = 0.35;
    for (let y = Math.floor(step / 2); y < h; y += step) {
      for (let x = Math.floor(step / 2); x < w; x += step) {
        const darkness = 255 - gray[y * w + x];
        if (darkness > threshold * 0.75) {
          const cx = x * scaleX;
          const cy = y * scaleY;
          paths.push(`M ${(cx - dotR).toFixed(2)} ${cy.toFixed(2)} A ${dotR} ${dotR} 0 1 0 ${(cx + dotR).toFixed(2)} ${cy.toFixed(2)} A ${dotR} ${dotR} 0 1 0 ${(cx - dotR).toFixed(2)} ${cy.toFixed(2)} Z`);
        }
      }
    }
    return paths;
  }

  /**
   * Oscillating Sine Wave Halftone (Zero pen lifts, continuous modulation)
   */
  static generateHalftoneWaves(gray, w, h, scaleX, scaleY, step = 4) {
    const paths = [];
    const wavelength = 3.5; // mm
    const xStep = Math.max(1, Math.round(w / 120));

    for (let y = Math.floor(step / 2); y < h; y += step) {
      const yBase = y * scaleY;
      const pts = [];
      for (let x = 0; x <= w; x += xStep) {
        const curX = Math.min(w - 1, x);
        const darkness = (255 - gray[y * w + curX]) / 255;
        const amp = darkness * (step * scaleY * 0.62);
        const xMm = curX * scaleX;
        const yMm = yBase + Math.sin((xMm / wavelength) * Math.PI * 2) * amp;
        pts.push({ x: xMm, y: yMm });
      }
      if (pts.length > 2) {
        let cmd = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
        for (let i = 1; i < pts.length; i++) {
          cmd += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
        }
        paths.push(cmd);
      }
    }
    return paths;
  }

  /**
   * Concentric Rings Halftone Screen
   */
  static generateHalftoneCircles(gray, w, h, scaleX, scaleY, step = 5) {
    const paths = [];
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(w, h) / 2;

    for (let r = step; r <= maxR; r += step) {
      const circ = 2 * Math.PI * r;
      const arcSteps = Math.max(24, Math.round(circ / 4));
      let inStroke = false;
      let strokePts = [];

      for (let i = 0; i <= arcSteps; i++) {
        const theta = (i / arcSteps) * Math.PI * 2;
        const px = Math.round(cx + r * Math.cos(theta));
        const py = Math.round(cy + r * Math.sin(theta));

        if (px >= 0 && px < w && py >= 0 && py < h) {
          const dark = 255 - gray[py * w + px];
          if (dark > 60) {
            strokePts.push({ x: px * scaleX, y: py * scaleY });
            inStroke = true;
          } else if (inStroke) {
            if (strokePts.length >= 2) {
              let cmd = `M ${strokePts[0].x.toFixed(2)} ${strokePts[0].y.toFixed(2)}`;
              for (let k = 1; k < strokePts.length; k++) cmd += ` L ${strokePts[k].x.toFixed(2)} ${strokePts[k].y.toFixed(2)}`;
              paths.push(cmd);
            }
            strokePts = [];
            inStroke = false;
          }
        }
      }

      if (inStroke && strokePts.length >= 2) {
        let cmd = `M ${strokePts[0].x.toFixed(2)} ${strokePts[0].y.toFixed(2)}`;
        for (let k = 1; k < strokePts.length; k++) cmd += ` L ${strokePts[k].x.toFixed(2)} ${strokePts[k].y.toFixed(2)}`;
        paths.push(cmd);
      }
    }
    return paths;
  }

  /**
   * Diamond Pattern Grid Halftone Screen
   */
  static generateHalftoneGrid(gray, w, h, scaleX, scaleY, step = 5, threshold = 128) {
    const paths = [];
    for (let y = Math.floor(step / 2); y < h; y += step) {
      for (let x = Math.floor(step / 2); x < w; x += step) {
        const dark = 255 - gray[y * w + x];
        if (dark > threshold * 0.7) {
          const len = (dark / 255) * (step * 0.85);
          const cx = x * scaleX;
          const cy = y * scaleY;
          const hLenX = (len * scaleX) / 2;
          const hLenY = (len * scaleY) / 2;
          // Diamond / micro-cross
          paths.push(`M ${(cx - hLenX).toFixed(2)} ${cy.toFixed(2)} L ${(cx + hLenX).toFixed(2)} ${cy.toFixed(2)}`);
          paths.push(`M ${cx.toFixed(2)} ${(cy - hLenY).toFixed(2)} L ${cx.toFixed(2)} ${(cy + hLenY).toFixed(2)}`);
        }
      }
    }
    return paths;
  }

  /**
   * Horizontal and Cross Hatching
   */
  static generateHatchLines(gray, w, h, threshold, step, scaleX, scaleY, isCross = false) {
    const segments = [];
    for (let y = 0; y < h; y += step) {
      let inLine = false;
      let startX = 0;
      for (let x = 0; x < w; x++) {
        const dark = gray[y * w + x] < threshold;
        if (dark && !inLine) {
          inLine = true;
          startX = x;
        } else if (!dark && inLine) {
          inLine = false;
          if (x - startX >= 2) {
            segments.push({ x1: startX * scaleX, y1: y * scaleY, x2: x * scaleX, y2: y * scaleY });
          }
        }
      }
      if (inLine && w - startX >= 2) {
        segments.push({ x1: startX * scaleX, y1: y * scaleY, x2: w * scaleX, y2: y * scaleY });
      }
    }

    if (isCross) {
      for (let x = 0; x < w; x += step * 1.5) {
        let inLine = false;
        let startY = 0;
        for (let y = 0; y < h; y++) {
          const veryDark = gray[y * w + x] < (threshold * 0.7);
          if (veryDark && !inLine) {
            inLine = true;
            startY = y;
          } else if (!veryDark && inLine) {
            inLine = false;
            if (y - startY >= 2) {
              segments.push({ x1: x * scaleX, y1: startY * scaleY, x2: x * scaleX, y2: y * scaleY });
            }
          }
        }
        if (inLine && h - startY >= 2) {
          segments.push({ x1: x * scaleX, y1: startY * scaleY, x2: x * scaleX, y2: h * scaleY });
        }
      }
    }
    return segments;
  }

  /**
   * Ramer-Douglas-Peucker (RDP) Polyline Simplification
   */
  static simplifyRDP(points, epsilon) {
    if (points.length <= 2) return points;
    let maxDist = 0;
    let index = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.perpendicularDistance(points[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.simplifyRDP(points.slice(0, index + 1), epsilon);
      const right = this.simplifyRDP(points.slice(index), epsilon);
      return left.slice(0, left.length - 1).concat(right);
    } else {
      return [first, last];
    }
  }

  static perpendicularDistance(pt, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(pt.x - lineStart.x, pt.y - lineStart.y);
    const num = Math.abs(dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
    return num / Math.sqrt(lenSq);
  }
}
