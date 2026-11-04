/**
 * Workspace Engine for Pen Plotter CNC
 * Manages the interactive canvas, rulers, zoom/pan transforms,
 * 3-layer architecture (paper, guide, artwork), selection, and transforms.
 */

import { GuideManager } from './guides.js';

export class Workspace {
  constructor(container, paperManager, guideManager) {
    this.container = container;
    this.paper = paperManager;
    this.guides = guideManager;

    this.scale = 1.0;
    this.panX = 40;
    this.panY = 40;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.activeTool = 'select'; // 'select' | 'pan' | 'transform'
    this.selectedElement = null;
    this.isDraggingArtwork = false;
    this.dragStartPos = { x: 0, y: 0 };
    this.artworkStartPos = { x: 0, y: 0 };

    this.listeners = new Set();
    this.initDOM();
    this.bindEvents();
  }

  initDOM() {
    this.viewport = this.container.querySelector('.workspace-viewport');
    this.svg = this.container.querySelector('#cnc-canvas-svg');
    this.topRuler = this.container.querySelector('#top-ruler');
    this.leftRuler = this.container.querySelector('#left-ruler');

    this.paperLayer = this.svg.querySelector('#paper-layer');
    this.guideLayer = this.svg.querySelector('#guide-layer');
    this.artworkLayer = this.svg.querySelector('#artwork-layer');
    this.simLayer = this.svg.querySelector('#simulation-layer');
    this.selectionLayer = this.svg.querySelector('#selection-layer');

    this.updateSVGDimensions();
    this.render();
  }

  updateSVGDimensions() {
    this.svg.setAttribute('viewBox', `0 0 ${this.paper.width} ${this.paper.height}`);
    this.svg.setAttribute('width', this.paper.width);
    this.svg.setAttribute('height', this.paper.height);
  }

  render() {
    this.paper.render(this.paperLayer);
    this.guides.render(this.guideLayer, this.paper);
    this.updateRulers();
    this.renderSelectionBox();
    this.notify();
  }

  notify() {
    this.listeners.forEach(fn => fn());
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Set Zoom Scale
   */
  setZoom(newScale, centerX, centerY) {
    const minScale = 0.15;
    const maxScale = 5.0;
    newScale = Math.max(minScale, Math.min(maxScale, newScale));

    if (centerX !== undefined && centerY !== undefined) {
      // Zoom centered on specific screen coordinate
      const rect = this.viewport.getBoundingClientRect();
      const vx = centerX - rect.left;
      const vy = centerY - rect.top;

      const wx = (vx - this.panX) / this.scale;
      const wy = (vy - this.panY) / this.scale;

      this.scale = newScale;
      this.panX = vx - wx * this.scale;
      this.panY = vy - wy * this.scale;
    } else {
      this.scale = newScale;
    }

    this.applyTransform();
  }

  zoomIn() {
    this.setZoom(this.scale * 1.25);
  }

  zoomOut() {
    this.setZoom(this.scale / 1.25);
  }

  fitToScreen() {
    if (!this.viewport) return;
    const vRect = this.viewport.getBoundingClientRect();
    const pad = 60; // px
    const availW = Math.max(100, vRect.width - pad * 2);
    const availH = Math.max(100, vRect.height - pad * 2);

    const scaleX = availW / this.paper.width;
    const scaleY = availH / this.paper.height;
    const fitScale = Math.min(scaleX, scaleY, 2.0);

    this.scale = fitScale;
    this.panX = (vRect.width - this.paper.width * this.scale) / 2;
    this.panY = (vRect.height - this.paper.height * this.scale) / 2;

    this.applyTransform();
  }

  applyTransform() {
    this.svg.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this.svg.style.transformOrigin = '0 0';

    this.updateRulers();
    this.updateZoomDisplay();
  }

  updateZoomDisplay() {
    const zoomText = document.querySelector('#zoom-display-btn');
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.scale * 100)}% ▾`;
    }
  }

  /**
   * Renders the calibrated mm rulers matching physical coordinates
   */
  updateRulers() {
    if (!this.topRuler || !this.leftRuler || !this.viewport) return;

    const dpr = window.devicePixelRatio || 1;
    const tWidth = Math.max(100, this.viewport.clientWidth);
    const lHeight = Math.max(100, this.viewport.clientHeight);

    // Top Ruler (Horizontal)
    this.topRuler.width = tWidth * dpr;
    this.topRuler.height = 24 * dpr;
    this.topRuler.style.width = `${tWidth}px`;
    this.topRuler.style.height = `24px`;

    const tCtx = this.topRuler.getContext('2d');
    tCtx.scale(dpr, dpr);
    tCtx.clearRect(0, 0, tWidth, 24);

    tCtx.fillStyle = '#101216';
    tCtx.fillRect(0, 0, tWidth, 24);

    tCtx.strokeStyle = '#323642';
    tCtx.fillStyle = '#8a8f9d';
    tCtx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    tCtx.textAlign = 'center';
    tCtx.lineWidth = 1;

    const mmInPixels = this.scale;
    const startX = this.panX;

    // Ticks every 10mm
    const maxMm = Math.ceil(this.paper.width / 50) * 50 + 50;
    for (let mm = 0; mm <= maxMm; mm += 10) {
      const x = startX + mm * mmInPixels;
      if (x < -20 || x > tWidth + 20) continue;

      const isMajor = mm % 50 === 0;
      tCtx.beginPath();
      tCtx.moveTo(x, isMajor ? 8 : 16);
      tCtx.lineTo(x, 24);
      tCtx.stroke();

      if (isMajor) {
        tCtx.fillText(mm.toString(), x, 7);
      }
    }

    // Left Ruler (Vertical)
    this.leftRuler.width = 28 * dpr;
    this.leftRuler.height = lHeight * dpr;
    this.leftRuler.style.width = `28px`;
    this.leftRuler.style.height = `${lHeight}px`;

    const lCtx = this.leftRuler.getContext('2d');
    lCtx.scale(dpr, dpr);
    lCtx.clearRect(0, 0, 28, lHeight);

    lCtx.fillStyle = '#101216';
    lCtx.fillRect(0, 0, 28, lHeight);

    lCtx.strokeStyle = '#323642';
    lCtx.fillStyle = '#8a8f9d';
    lCtx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    lCtx.textAlign = 'right';
    lCtx.lineWidth = 1;

    const startY = this.panY;
    const maxMmY = Math.ceil(this.paper.height / 50) * 50 + 50;
    for (let mm = 0; mm <= maxMmY; mm += 10) {
      const y = startY + mm * mmInPixels;
      if (y < -20 || y > lHeight + 20) continue;

      const isMajor = mm % 50 === 0;
      lCtx.beginPath();
      lCtx.moveTo(isMajor ? 12 : 20, y);
      lCtx.lineTo(28, y);
      lCtx.stroke();

      if (isMajor) {
        lCtx.fillText(mm.toString(), 22, y + 3);
      }
    }
  }

  screenToSvg(clientX, clientY) {
    const rect = this.viewport.getBoundingClientRect();
    const vx = clientX - rect.left;
    const vy = clientY - rect.top;
    const sx = (vx - this.panX) / this.scale;
    const sy = (vy - this.panY) / this.scale;
    return { x: sx, y: sy };
  }

  bindEvents() {
    this.viewport.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.viewport.addEventListener('dblclick', (e) => this.onDoubleClick(e));

    // Mouse wheel roll & trackpad pinch-to-zoom
    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      let zoomFactor;
      if (e.ctrlKey) {
        // Trackpad pinch-to-zoom gesture
        zoomFactor = Math.exp(-e.deltaY * 0.015);
      } else {
        // Standard mouse wheel roll
        zoomFactor = e.deltaY < 0 ? 1.14 : 0.88;
      }
      zoomFactor = Math.max(0.5, Math.min(2.0, zoomFactor));
      this.setZoom(this.scale * zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    // Touch support for touchpads / touchscreens (1-finger pan, 2-finger pinch)
    let touchStartDist = 0;
    let touchStartScale = 1;
    let touchStartPan = { x: 0, y: 0 };
    let touchStartCenter = { x: 0, y: 0 };

    this.viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isPanning = true;
        this.panStartX = e.touches[0].clientX - this.panX;
        this.panStartY = e.touches[0].clientY - this.panY;
      } else if (e.touches.length === 2) {
        this.isPanning = false;
        touchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStartScale = this.scale;
        touchStartCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
      }
    }, { passive: true });

    this.viewport.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.isPanning) {
        this.panX = e.touches[0].clientX - this.panStartX;
        this.panY = e.touches[0].clientY - this.panStartY;
        this.applyTransform();
      } else if (e.touches.length === 2 && touchStartDist > 0) {
        const curDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = curDist / touchStartDist;
        this.setZoom(touchStartScale * factor, touchStartCenter.x, touchStartCenter.y);
      }
    }, { passive: true });

    this.viewport.addEventListener('touchend', () => {
      this.isPanning = false;
      touchStartDist = 0;
    });

    // Window resize
    window.addEventListener('resize', () => {
      this.updateRulers();
    });
  }

  onMouseDown(e) {
    if (e.button === 0 || e.button === 1) {
      const svgPt = this.screenToSvg(e.clientX, e.clientY);
      const clickedArtwork = this.getArtworkUnderPoint(e.target) || this.getArtworkAtPoint(svgPt);
      const clickedHandle = e.target.closest('#selection-layer');

      // If user clicks on an artwork object or handle, select and prepare dragging artwork
      if (clickedArtwork && this.activeTool !== 'pan') {
        this.selectArtwork(clickedArtwork);
        this.isDraggingArtwork = true;
        this.dragStartPos = svgPt;
        this.artworkStartPos = this.getArtworkTranslate(clickedArtwork);
        return;
      }

      if (clickedHandle && this.selectedElement) {
        this.isDraggingArtwork = true;
        this.dragStartPos = svgPt;
        this.artworkStartPos = this.getArtworkTranslate(this.selectedElement);
        return;
      }

      // If left-click on empty frame, canvas, or paper: PAN THE FRAME!
      this.clearSelection();
      this.isPanning = true;
      this.panStartX = e.clientX - this.panX;
      this.panStartY = e.clientY - this.panY;
      this.viewport.style.cursor = 'grabbing';
    }
  }

  onDoubleClick(e) {
    const svgPt = this.screenToSvg(e.clientX, e.clientY);
    const candidates = this.getAllArtworkAtPoint(svgPt);

    if (candidates.length > 1) {
      // Overlapping elements exist under cursor!
      // Double click cycles selection to the bottom element (or next in z-stack)
      let nextIdx = 0;
      if (this.selectedElement) {
        const curIdx = candidates.indexOf(this.selectedElement);
        if (curIdx !== -1) {
          nextIdx = (curIdx + 1) % candidates.length;
        } else {
          nextIdx = candidates.length - 1; // pick bottommost
        }
      } else {
        nextIdx = candidates.length - 1;
      }
      this.selectArtwork(candidates[nextIdx]);
      return;
    }

    // If single text element under cursor, trigger inline text editor!
    const clickedArtwork = this.getArtworkUnderPoint(e.target) || this.getArtworkAtPoint(svgPt);
    if (clickedArtwork && clickedArtwork.classList.contains('cnc-text-artwork')) {
      if (typeof this.onEditTextRequested === 'function') {
        this.onEditTextRequested(clickedArtwork);
      }
    }
  }

  getAllArtworkAtPoint(svgPt) {
    if (!this.artworkLayer) return [];
    const matches = [];
    const children = Array.from(this.artworkLayer.children).filter(c => c.nodeType === 1);
    // Iterate from top to bottom (reverse order of DOM)
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child.getAttribute('data-cnc-ignore') === 'true') continue;
      const b = this.getElementSvgBounds(child);
      if (b && svgPt.x >= b.x - 2 && svgPt.x <= b.x + b.width + 2 &&
              svgPt.y >= b.y - 2 && svgPt.y <= b.y + b.height + 2) {
        matches.push(child);
      }
    }
    return matches;
  }

  getArtworkAtPoint(svgPt) {
    const list = this.getAllArtworkAtPoint(svgPt);
    return list.length > 0 ? list[0] : null;
  }

  getElementSvgBounds(el) {
    if (!el || typeof el.getBBox !== 'function') return null;
    try {
      const bbox = el.getBBox();
      if (!bbox || (bbox.width === 0 && bbox.height === 0)) return null;

      // In browser SVG, el.getScreenCTM() transforms local coords to screen pixels (including CSS pan/zoom).
      // this.svg.getScreenCTM() transforms root SVG coords to screen pixels (including CSS pan/zoom).
      // svgScreen.inverse().multiply(elScreen) cancels out the CSS pan/zoom and gives exact root SVG coordinates!
      let matrix = null;
      if (typeof el.getScreenCTM === 'function' && typeof this.svg.getScreenCTM === 'function') {
        try {
          const elScreen = el.getScreenCTM();
          const svgScreen = this.svg.getScreenCTM();
          if (elScreen && svgScreen) {
            matrix = svgScreen.inverse().multiply(elScreen);
          }
        } catch (err) {
          matrix = null;
        }
      }

      if (!matrix) {
        const pos = this.getArtworkTranslate(el);
        return {
          x: bbox.x + pos.x,
          y: bbox.y + pos.y,
          width: bbox.width,
          height: bbox.height
        };
      }

      const pt = this.svg.createSVGPoint();
      const corners = [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
        { x: bbox.x, y: bbox.y + bbox.height }
      ].map(c => {
        pt.x = c.x;
        pt.y = c.y;
        return pt.matrixTransform(matrix);
      });

      const xs = corners.map(c => c.x);
      const ys = corners.map(c => c.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        corners
      };
    } catch (e) {
      return null;
    }
  }

  onMouseMove(e) {
    if (this.isPanning) {
      this.panX = e.clientX - this.panStartX;
      this.panY = e.clientY - this.panStartY;
      this.applyTransform();
      return;
    }

    if (this.isDraggingArtwork && this.selectedElement) {
      const svgPt = this.screenToSvg(e.clientX, e.clientY);
      const dx = svgPt.x - this.dragStartPos.x;
      const dy = svgPt.y - this.dragStartPos.y;
      const newX = this.artworkStartPos.x + dx;
      const newY = this.artworkStartPos.y + dy;
      this.setArtworkTranslate(this.selectedElement, newX, newY);
      this.renderSelectionBox();
      this.notify();
    }
  }

  onMouseUp() {
    if (this.isPanning) {
      this.isPanning = false;
      this.viewport.style.cursor = 'grab';
    }
    if (this.isDraggingArtwork) {
      this.isDraggingArtwork = false;
    }
  }

  getArtworkUnderPoint(target) {
    if (!target) return null;
    let node = target;
    while (node && node !== this.svg) {
      if (node.parentElement === this.artworkLayer) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  selectArtwork(element) {
    this.selectedElement = element;
    this.renderSelectionBox();
    this.notify();
  }

  clearSelection() {
    this.selectedElement = null;
    if (this.selectionLayer) this.selectionLayer.innerHTML = '';
    this.notify();
  }

  getArtworkTranslate(el) {
    const transform = el.getAttribute('transform') || '';
    const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(transform);
    if (match) {
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    }
    return { x: 0, y: 0 };
  }

  setArtworkTranslate(el, x, y) {
    const cur = el.getAttribute('transform') || '';
    const withoutTranslate = cur.replace(/translate\([^)]*\)/, '').trim();
    el.setAttribute('transform', `translate(${x.toFixed(2)}, ${y.toFixed(2)}) ${withoutTranslate}`.trim());
  }

  renderSelectionBox() {
    if (!this.selectionLayer) return;
    this.selectionLayer.innerHTML = '';
    if (!this.selectedElement) return;

    try {
      const bounds = this.getElementSvgBounds(this.selectedElement);
      if (!bounds) return;

      const pad = 1.5;
      const x = bounds.x - pad;
      const y = bounds.y - pad;
      const w = bounds.width + pad * 2;
      const h = bounds.height + pad * 2;

      // Clickable bounding frame with subtle gold tint
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', w);
      rect.setAttribute('height', h);
      rect.setAttribute('fill', 'rgba(229, 169, 60, 0.05)');
      rect.setAttribute('stroke', '#e5a93c');
      rect.setAttribute('stroke-width', '1.2');
      rect.setAttribute('stroke-dasharray', '4 3');
      rect.setAttribute('data-cnc-ignore', 'true');
      this.selectionLayer.appendChild(rect);

      // Corner handles
      const corners = [
        { cx: x, cy: y },
        { cx: x + w, cy: y },
        { cx: x, cy: y + h },
        { cx: x + w, cy: y + h }
      ];

      corners.forEach(c => {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        handle.setAttribute('x', c.cx - 3.5);
        handle.setAttribute('y', c.cy - 3.5);
        handle.setAttribute('width', 7);
        handle.setAttribute('height', 7);
        handle.setAttribute('fill', '#e5a93c');
        handle.setAttribute('stroke', '#0e1013');
        handle.setAttribute('stroke-width', '1.2');
        handle.setAttribute('data-cnc-ignore', 'true');
        this.selectionLayer.appendChild(handle);
      });
    } catch (e) {
      // BBox not available yet
    }
  }

  // Transformations
  rotateSelected(deg = 90) {
    if (!this.selectedElement) return;
    const bbox = this.selectedElement.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    const cur = this.selectedElement.getAttribute('transform') || '';
    this.selectedElement.setAttribute('transform', `${cur} rotate(${deg}, ${cx}, ${cy})`);
    this.renderSelectionBox();
    this.notify();
  }

  flipHorizontalSelected() {
    if (!this.selectedElement) return;
    const bbox = this.selectedElement.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cur = this.selectedElement.getAttribute('transform') || '';
    this.selectedElement.setAttribute('transform', `${cur} translate(${cx * 2}, 0) scale(-1, 1)`);
    this.renderSelectionBox();
    this.notify();
  }

  deleteSelected() {
    if (this.selectedElement && this.selectedElement.parentElement === this.artworkLayer) {
      this.artworkLayer.removeChild(this.selectedElement);
      this.clearSelection();
      this.notify();
    }
  }

  /**
   * Load raw SVG string into artwork layer
   * @param {string} svgContent 
   */
  loadArtworkSVG(svgContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;

    this.artworkLayer.innerHTML = '';
    
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'cnc-imported-artwork');

    // Copy all graphics nodes from incoming SVG into artwork layer
    Array.from(svgEl.children).forEach(child => {
      // Strip any imported guide or background rects if present
      if (child.id === 'cnc-paper-background' || child.classList.contains('cnc-guide-element')) return;
      const imported = document.importNode(child, true);
      group.appendChild(imported);
    });

    this.artworkLayer.appendChild(group);

    // Auto-center artwork on paper
    this.centerArtwork();
    this.selectArtwork(group);
    this.render();
  }

  centerArtwork() {
    try {
      const bbox = this.artworkLayer.getBBox();
      if (bbox.width > 0 && bbox.height > 0) {
        const targetX = (this.paper.width - bbox.width) / 2 - bbox.x;
        const targetY = (this.paper.height - bbox.height) / 2 - bbox.y;

        // Apply shift directly to children so artworkLayer itself has NO translation
        Array.from(this.artworkLayer.children).forEach(child => {
          if (child.getAttribute('data-cnc-ignore') === 'true') return;
          const cur = this.getArtworkTranslate(child);
          this.setArtworkTranslate(child, cur.x + targetX, cur.y + targetY);
        });
        this.artworkLayer.removeAttribute('transform');
      }
    } catch (e) {
      // BBox calculation fallback
    }
  }

  /**
   * Calculate Artwork Metrics:
   * Total paths, bounding box, estimated plotting length (mm), estimated time.
   */
  getArtworkMetrics() {
    const paths = this.artworkLayer.querySelectorAll('path, line, polyline, polygon, circle, rect, ellipse');
    let totalLengthMm = 0;

    paths.forEach(p => {
      try {
        if (typeof p.getTotalLength === 'function') {
          totalLengthMm += p.getTotalLength();
        } else {
          totalLengthMm += 20; // estimate
        }
      } catch (e) {
        totalLengthMm += 15;
      }
    });

    const speed = 3000; // mm/min
    const minutes = totalLengthMm / speed;
    const mins = Math.floor(minutes);
    const secs = Math.round((minutes - mins) * 60);

    return {
      pathCount: paths.length,
      totalLengthMm: Math.round(totalLengthMm),
      estimatedTime: `${mins} min ${secs} sec`,
      isEmpty: paths.length === 0
    };
  }
}
