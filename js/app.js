/**
 * Main Application Orchestrator for Pen Plotter CNC
 * Wires together Workspace, Font Management, Paper/Guide layers,
 * G-code generation, Machine Control, and UI interactions.
 */

import { LOTUS_SVG, SAMPLE_FILES } from './sample-data.js';
import { initStorage, getSettings, saveSettings, getRecentFiles, addRecentFile } from './storage.js';
import { PaperManager, PAPER_PRESETS } from './paper.js';
import { GuideManager } from './guides.js';
import { FontManager } from './font-manager.js';
import { Workspace } from './workspace.js';
import { GCodeGenerator } from './gcode-generator.js';
import { GCodeParser } from './gcode-parser.js';
import { MachineController } from './machine-controller.js';
import { TextEditor } from './text-editor.js';
import { NavigationManager } from './navigation.js';
import { ImageTracer } from './image-tracer.js';
import { DXFHandler } from './dxf-handler.js';
import { BorderManager, BORDER_STYLES } from './borders.js';

class App {
  constructor() {
    this.currentFileName = 'lotus.svg';
    this.currentFileSize = '142 KB';
    this.isAspectRatioLocked = true;
    this.selectedDocImage = null;
    this.editingDocImage = null;
    this.docImageClipboard = null;
    this.docPages = [
      {
        id: 1,
        text: `Pen Plotter CNC — Document Editor\n\nDear Maker,\n\nWelcome to the full document writing layout for 2D CNC pen plotters!\n\nYou can write, edit, and select text directly on this page just like in Microsoft Word or LibreOffice Writer. Select any words to change fonts, bold, italic, line spacing, or handwriting imperfections.\n\nWhen ready, click "Start Plot" to draw your handwritten document with precision!`,
        fontId: 'hand_casual',
        fontSize: 16,
        bold: false,
        italic: false,
        align: 'left',
        lineSpacing: 1.3,
        imperfection: 0.38,
        borderStyle: 'single'
      }
    ];
    this.currentPageIndex = 0;
  }

  async init() {
    // 0. Initialize Visual Theme (Dark/Light)
    this.initTheme();

    // 1. Initialize Storage (IndexedDB & LocalStorage)
    await initStorage();

    // 2. Initialize Models
    this.paper = new PaperManager({ preset: 'A4-L', width: 297, height: 210, style: 'blank' });
    this.guides = new GuideManager({ marginLeft: 25, marginRight: 20, marginTop: 25, marginBottom: 20, lineSpacing: 10 });
    this.fontManager = new FontManager();
    await this.fontManager.init();

    // 3. Initialize Workspace
    const workspaceContainer = document.querySelector('#workspace-container');
    this.workspace = new Workspace(workspaceContainer, this.paper, this.guides);

    // 4. Initialize G-code Engines
    this.gcodeGen = new GCodeGenerator({
      penUpAngle: 90,
      penDownAngle: 60,
      drawingSpeed: 3000,
      travelSpeed: 6000,
      lineAccuracy: 0.10
    });
    this.gcodeParser = new GCodeParser();

    // 5. Initialize Machine Controller
    this.machine = new MachineController(this.workspace);

    // 6. Initialize Text Editor & Navigation
    this.textEditor = new TextEditor(this.workspace, this.fontManager);
    this.nav = new NavigationManager();

    // 7. Bind all UI Listeners and Controls FIRST!
    this.bindUI();

    // 8. Initialize Document Paper Size & Page Sidebar
    this.updateDocumentPaperSize();
    this.renderPagesSidebar();

    // 9. Sync Initial Document Content & Metrics
    this.syncDocToArtworkLayer();
    this.updateFileMetricsDisplay();
    this.renderSettingsFontTable();
    this.populateComposerFontDropdown();
    this.renderRecentFiles();

    // 10. Activate Document Editor Mode by default on startup
    const tabDoc = document.querySelector('#ws-tab-doc');
    if (tabDoc) {
      tabDoc.click();
    }

    // 11. Initial Fit to Screen
    setTimeout(() => {
      this.workspace.fitToScreen();
    }, 100);

    this.showToast('Pen Plotter CNC ready (Simulation Mode Active)', 'info');
  }

  // -------------------------------------------------------------
  // MULTI-PAGE DOCUMENT MANAGEMENT (I Love PDF Style)
  // -------------------------------------------------------------
  updateDocumentPaperSize() {
    const sheet = document.querySelector('#doc-paper-sheet');
    const borderSvg = document.querySelector('#doc-page-border-svg');
    if (!sheet) return;

    const w_mm = this.paper.width;
    const h_mm = this.paper.height;
    const ratio = w_mm / h_mm;
    const isLandscape = w_mm >= h_mm;

    // Responsive, high-precision display sizing in px
    let displayW, displayH;
    if (isLandscape) {
      displayW = Math.min(840, Math.max(500, w_mm * 2.8));
      displayH = displayW / ratio;
    } else {
      displayH = Math.min(840, Math.max(500, h_mm * 2.8));
      displayW = displayH * ratio;
    }

    sheet.style.width = `${Math.round(displayW)}px`;
    sheet.style.height = `${Math.round(displayH)}px`;
    sheet.style.minHeight = `${Math.round(displayH)}px`;

    // Keep preset selector and inputs in sync
    const paperSelect = document.querySelector('#paper-preset-select');
    if (paperSelect && this.paper.currentPresetKey) {
      paperSelect.value = this.paper.currentPresetKey;
    }
    const areaW = document.querySelector('#input-area-width');
    const areaH = document.querySelector('#input-area-height');
    if (areaW && areaW.value != w_mm) areaW.value = w_mm;
    if (areaH && areaH.value != h_mm) areaH.value = h_mm;

    // Render the border overlay
    const curPage = this.docPages[this.currentPageIndex];
    const currentBorder = curPage?.borderStyle || this.paper.borderStyle || 'single';
    if (borderSvg) {
      borderSvg.setAttribute('viewBox', `0 0 ${w_mm} ${h_mm}`);
      BorderManager.renderToSVG(borderSvg, w_mm, h_mm, currentBorder, this.paper.borderInset || 12);
    }

    // Automatically adjust writing area padding to nest within the active border
    const contentEl = document.querySelector('#doc-page-content');
    if (contentEl) {
      const scale = displayW / w_mm;
      const margins = BorderManager.getBorderSafeMargins(currentBorder, this.paper.borderInset || 12);
      contentEl.style.paddingTop = `${Math.round(margins.top * scale)}px`;
      contentEl.style.paddingRight = `${Math.round(margins.right * scale)}px`;
      contentEl.style.paddingBottom = `${Math.round(margins.bottom * scale)}px`;
      contentEl.style.paddingLeft = `${Math.round(margins.left * scale)}px`;
    }

    this.renderDocImages();
  }

  renderPagesSidebar() {
    const list = document.querySelector('#doc-pages-list');
    if (!list) return;
    list.innerHTML = '';

    const isPortrait = this.paper.width < this.paper.height;

    this.docPages.forEach((page, idx) => {
      const card = document.createElement('div');
      card.className = `doc-page-card ${idx === this.currentPageIndex ? 'active' : ''}`;
      card.dataset.pageIndex = idx;

      // Miniature page thumbnail preview
      const thumb = document.createElement('div');
      thumb.className = `page-thumb-preview ${isPortrait ? 'is-portrait' : ''}`;

      if (page.borderStyle && page.borderStyle !== 'none') {
        const borderInd = document.createElement('div');
        borderInd.className = 'thumb-border-indicator';
        thumb.appendChild(borderInd);
      }

      if (page.images && page.images.length > 0) {
        const imgInd = document.createElement('div');
        imgInd.style.cssText = 'position: absolute; right: 5px; top: 5px; width: 14px; height: 11px; border: 1px dashed rgba(229,169,60,0.8); border-radius: 1px; pointer-events: none; background: rgba(229,169,60,0.15);';
        thumb.appendChild(imgInd);
      }

      const snippet = (page.text || '').trim();
      const lineCount = Math.min(6, Math.max(2, Math.floor(snippet.length / 40) + 1));
      for (let l = 0; l < lineCount; l++) {
        const line = document.createElement('div');
        line.className = `thumb-text-line ${l === lineCount - 1 ? 'short' : ''}`;
        thumb.appendChild(line);
      }

      // Footer
      const footer = document.createElement('div');
      footer.className = 'page-card-footer';

      const numTag = document.createElement('span');
      numTag.className = 'page-num-tag';
      numTag.textContent = `Page ${idx + 1}`;

      const actions = document.createElement('div');
      actions.className = 'page-card-actions';

      // Duplicate button
      const btnDup = document.createElement('button');
      btnDup.className = 'btn-page-action';
      btnDup.title = 'Duplicate this page';
      btnDup.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      btnDup.addEventListener('click', (e) => {
        e.stopPropagation();
        this.duplicateDocPage(idx);
      });
      actions.appendChild(btnDup);

      // Delete button (if > 1 page)
      if (this.docPages.length > 1) {
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-page-action delete-page';
        btnDel.title = 'Delete this page';
        btnDel.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
        btnDel.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteDocPage(idx);
        });
        actions.appendChild(btnDel);
      }

      footer.appendChild(numTag);
      footer.appendChild(actions);

      card.appendChild(thumb);
      card.appendChild(footer);

      card.addEventListener('click', () => {
        this.switchDocPage(idx);
      });

      list.appendChild(card);
    });

    const counter = document.querySelector('#doc-page-counter-badge');
    if (counter) {
      counter.textContent = `Page ${this.currentPageIndex + 1} of ${this.docPages.length}`;
    }
  }

  switchDocPage(index, skipSave = false) {
    if (index < 0 || index >= this.docPages.length) return;

    // Save active page text unless explicitly skipped
    const contentEl = document.querySelector('#doc-page-content');
    if (!skipSave && contentEl && this.docPages[this.currentPageIndex]) {
      this.docPages[this.currentPageIndex].text = contentEl.innerText;
    }

    this.currentPageIndex = index;
    const targetPage = this.docPages[index];

    if (contentEl && targetPage) {
      contentEl.innerText = targetPage.text || '';
    }

    // Sync border
    if (targetPage.borderStyle) {
      this.paper.borderStyle = targetPage.borderStyle;
      const borderSelect = document.querySelector('#libre-border-style');
      if (borderSelect) borderSelect.value = targetPage.borderStyle;
      const borderRadio = document.querySelector(`input[name="border-choice"][value="${targetPage.borderStyle}"]`);
      if (borderRadio) borderRadio.checked = true;
    }

    // Sync font and formatting toolbar controls to active page
    const fontSelect = document.querySelector('#libre-font-select');
    if (fontSelect && targetPage.fontId) fontSelect.value = targetPage.fontId;
    const sizeInput = document.querySelector('#libre-font-size');
    if (sizeInput && targetPage.fontSize) sizeInput.value = targetPage.fontSize;
    const touchSelect = document.querySelector('#libre-imperfection');
    if (touchSelect && targetPage.imperfection !== undefined) touchSelect.value = targetPage.imperfection;

    this.updateDocumentPaperSize();
    this.renderPagesSidebar();
    this.renderDocImages();
  }

  checkAndHandlePageOverflow() {
    const contentEl = document.querySelector('#doc-page-content');
    const sheet = document.querySelector('#doc-paper-sheet');
    if (!contentEl || !sheet) return;

    // Check if the current page content exceeds physical sheet boundary
    if (contentEl.scrollHeight <= contentEl.clientHeight + 4) return;

    // Prevent re-entrant overflow checks while paginating
    if (this._isPaginating) return;
    this._isPaginating = true;

    // Create an invisible, isolated measurement sandbox replicating contentEl
    const measureEl = document.createElement('div');
    measureEl.className = 'doc-page-content';
    measureEl.style.position = 'absolute';
    measureEl.style.top = '0';
    measureEl.style.left = '0';
    measureEl.style.width = '100%';
    measureEl.style.height = '100%';
    measureEl.style.visibility = 'hidden';
    measureEl.style.pointerEvents = 'none';
    measureEl.style.zIndex = '-9999';
    measureEl.style.boxSizing = 'border-box';
    measureEl.style.whiteSpace = 'pre-wrap';
    measureEl.style.wordBreak = 'break-word';
    measureEl.style.overflow = 'hidden';

    // Copy exact typography and padding from live editor
    const comp = window.getComputedStyle ? window.getComputedStyle(contentEl) : contentEl.style;
    measureEl.style.fontFamily = contentEl.style.fontFamily || comp.fontFamily;
    measureEl.style.fontSize = contentEl.style.fontSize || comp.fontSize;
    measureEl.style.fontWeight = contentEl.style.fontWeight || comp.fontWeight;
    measureEl.style.fontStyle = contentEl.style.fontStyle || comp.fontStyle;
    measureEl.style.lineHeight = contentEl.style.lineHeight || comp.lineHeight;
    measureEl.style.letterSpacing = contentEl.style.letterSpacing || comp.letterSpacing;
    measureEl.style.wordSpacing = contentEl.style.wordSpacing || comp.wordSpacing;
    measureEl.style.textAlign = contentEl.style.textAlign || comp.textAlign;
    measureEl.style.paddingTop = contentEl.style.paddingTop || comp.paddingTop;
    measureEl.style.paddingRight = contentEl.style.paddingRight || comp.paddingRight;
    measureEl.style.paddingBottom = contentEl.style.paddingBottom || comp.paddingBottom;
    measureEl.style.paddingLeft = contentEl.style.paddingLeft || comp.paddingLeft;

    sheet.appendChild(measureEl);

    // Fast Binary-Search Line & Word Fitting Sandbox Function
    const fitLinesToSandbox = (linesList, maxH) => {
      if (!linesList || linesList.length === 0) {
        return { fitted: [], remaining: [] };
      }

      // Quick test: do all lines fit?
      measureEl.innerText = linesList.join('\n');
      if (measureEl.scrollHeight <= maxH) {
        return { fitted: [...linesList], remaining: [] };
      }

      // Binary search for maximum fitting lines
      let low = 1;
      let high = linesList.length - 1;
      let bestFit = 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        measureEl.innerText = linesList.slice(0, mid).join('\n');
        if (measureEl.scrollHeight <= maxH) {
          bestFit = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      let fitted = linesList.slice(0, bestFit);
      let remaining = linesList.slice(bestFit);

      // Edge case: Even 1 line overflows (e.g. single massive paragraph without newlines)
      if (bestFit === 1) {
        measureEl.innerText = linesList[0];
        if (measureEl.scrollHeight > maxH) {
          const words = linesList[0].split(' ');
          if (words.length > 1) {
            let wLow = 1;
            let wHigh = words.length - 1;
            let bestWords = 1;

            while (wLow <= wHigh) {
              const wMid = Math.floor((wLow + wHigh) / 2);
              measureEl.innerText = words.slice(0, wMid).join(' ');
              if (measureEl.scrollHeight <= maxH) {
                bestWords = wMid;
                wLow = wMid + 1;
              } else {
                wHigh = wMid - 1;
              }
            }

            fitted = [words.slice(0, bestWords).join(' ')];
            const leftoverWords = words.slice(bestWords).join(' ');
            remaining = [leftoverWords, ...linesList.slice(1)];
          }
        }
      }

      return { fitted, remaining };
    };

    try {
      const origPageIndex = this.currentPageIndex;
      const initialPagesCount = this.docPages.length;
      const maxH = measureEl.clientHeight + 2;

      // Extract full text from current page
      const fullText = contentEl.innerText;
      const allLines = fullText.split('\n');

      // 1. Fit current page text
      const pageOneFit = fitLinesToSandbox(allLines, maxH);
      this.docPages[origPageIndex].text = pageOneFit.fitted.join('\n');
      contentEl.innerText = this.docPages[origPageIndex].text;

      let remainingLines = pageOneFit.remaining;
      if (!remainingLines || remainingLines.length === 0 || (remainingLines.length === 1 && !remainingLines[0].trim())) {
        return;
      }

      // 2. Cascade remaining lines across subsequent pages until ALL content fits
      let targetIdx = origPageIndex + 1;
      const maxPagesLimit = 100;

      while (remainingLines.length > 0 && targetIdx < maxPagesLimit) {
        // Create new page if target page index doesn't exist yet
        if (targetIdx >= this.docPages.length) {
          const cur = this.docPages[origPageIndex];
          this.docPages.push({
            id: Date.now() + targetIdx,
            text: '',
            fontId: cur?.fontId || 'hand_casual',
            fontSize: cur?.fontSize || 16,
            bold: cur?.bold || false,
            italic: cur?.italic || false,
            align: cur?.align || 'left',
            lineSpacing: cur?.lineSpacing || 1.3,
            imperfection: cur?.imperfection !== undefined ? cur.imperfection : 0.38,
            borderStyle: cur?.borderStyle || this.paper.borderStyle || 'single',
            images: []
          });
        }

        const targetPage = this.docPages[targetIdx];
        const existingText = targetPage.text ? targetPage.text.trim() : '';
        const linesToFit = existingText
          ? [...remainingLines, ...existingText.split('\n')]
          : remainingLines;

        const nextFit = fitLinesToSandbox(linesToFit, maxH);
        targetPage.text = nextFit.fitted.join('\n');
        remainingLines = nextFit.remaining;

        // Stop if remaining lines are empty or just whitespace
        if (remainingLines.length === 1 && !remainingLines[0].trim()) {
          remainingLines = [];
        }

        targetIdx++;
      }

      // 3. Switch to the final page where the text concluded
      const finalPageIdx = targetIdx - 1;
      this.switchDocPage(finalPageIdx, true);
      this.renderPagesSidebar();
      this.syncDocToArtworkLayer();
      this.updateFileMetricsDisplay();

      const newPagesCount = this.docPages.length - initialPagesCount;
      if (newPagesCount > 0) {
        this.showToast(`Content paginated across ${this.docPages.length} pages (+${newPagesCount} new page${newPagesCount > 1 ? 's' : ''})`, 'info');
      } else {
        this.showToast(`Text moved to Page ${finalPageIdx + 1}`, 'info');
      }

      setTimeout(() => {
        const el = document.querySelector('#doc-page-content');
        if (el) {
          el.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }, 50);

    } finally {
      if (measureEl.parentNode) {
        measureEl.parentNode.removeChild(measureEl);
      }
      this._isPaginating = false;
    }
  }

  openEditImageTraceModal(img) {
    this.editingDocImage = img;
    const traceAlgo = document.querySelector('#trace-algorithm-select');
    const traceDetails = document.querySelector('#trace-details-select');
    const traceThresh = document.querySelector('#trace-threshold');
    const traceThreshVal = document.querySelector('#trace-thresh-val');
    const traceStep = document.querySelector('#trace-line-step');
    const traceStepVal = document.querySelector('#trace-step-val');
    const traceInvert = document.querySelector('#trace-invert');
    const btnApply = document.querySelector('#btn-apply-image-trace');
    const origImg = document.querySelector('#trace-orig-preview-img');
    const origHint = document.querySelector('#trace-orig-empty-hint');

    if (img.traceOptions) {
      if (traceAlgo) traceAlgo.value = img.traceOptions.mode || 'combo_spider';
      if (traceDetails) traceDetails.value = img.traceOptions.details || 'strong';
      if (traceThresh) {
        traceThresh.value = img.traceOptions.threshold || 128;
        if (traceThreshVal) traceThreshVal.textContent = traceThresh.value;
      }
      if (traceStep) {
        traceStep.value = img.traceOptions.step || 4;
        if (traceStepVal) traceStepVal.textContent = `${traceStep.value}px`;
      }
      if (traceInvert) traceInvert.checked = !!img.traceOptions.invert;
    }

    if (btnApply) btnApply.textContent = 'Update in Document Editor';
    this.openModal('modal-image-trace');

    if (img.sourceDataUrl) {
      if (origImg) {
        origImg.src = img.sourceDataUrl;
        origImg.style.display = 'block';
      }
      if (origHint) origHint.style.display = 'none';

      const im = new Image();
      im.onload = () => {
        this.loadedTraceImage = im;
        if (typeof this.runImageTrace === 'function') {
          this.runImageTrace();
        }
      };
      im.src = img.sourceDataUrl;
    } else {
      const pathEl = document.querySelector('#image-trace-path');
      if (pathEl) pathEl.setAttribute('d', img.pathData);
    }
  }

  renderRecentFiles() {
    const list = document.querySelector('#recent-files-list');
    if (!list) return;
    const files = getRecentFiles();
    list.innerHTML = '';

    if (!files || files.length === 0) {
      list.innerHTML = `<li class="recent-empty-hint" style="padding: 12px 14px; font-size: 11.5px; color: var(--text-muted); text-align: center; font-style: italic;">No added files yet</li>`;
      return;
    }

    files.forEach((file, idx) => {
      const li = document.createElement('li');
      li.className = `recent-item ${idx === 0 ? 'active' : ''}`;
      li.dataset.filename = file.name;
      li.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
        <span class="file-name" title="${file.name}">${file.name}</span>
      `;
      li.addEventListener('click', () => {
        document.querySelectorAll('.recent-item').forEach(i => i.classList.remove('active'));
        li.classList.add('active');
        this.showToast(`Selected file: ${file.name}`, 'info');
      });
      list.appendChild(li);
    });
  }

  renderDocImages() {
    const container = document.querySelector('#doc-page-images-container');
    const sheet = document.querySelector('#doc-paper-sheet');
    if (!container || !sheet) return;
    container.innerHTML = '';

    const curPage = this.docPages[this.currentPageIndex];
    if (!curPage || !curPage.images || curPage.images.length === 0) return;

    const w_mm = this.paper.width;
    const h_mm = this.paper.height;
    const scale = parseFloat(sheet.style.width) / w_mm || 2.8;

    curPage.images.forEach((img, imgIdx) => {
      const box = document.createElement('div');
      box.className = 'doc-vector-image-box';
      box.dataset.imgId = img.id;
      box.dataset.imageIndex = imgIdx;
      if (this.selectedDocImage === img) {
        box.classList.add('selected');
      }

      const pxX = Math.round(img.x * scale);
      const pxY = Math.round(img.y * scale);
      const pxW = Math.round(img.width * scale);
      const pxH = Math.round(img.height * scale);

      box.style.left = `${pxX}px`;
      box.style.top = `${pxY}px`;
      box.style.width = `${pxW}px`;
      box.style.height = `${pxH}px`;

      const cTop = img.cropTop || 0;
      const cRight = img.cropRight || 0;
      const cBottom = img.cropBottom || 0;
      const cLeft = img.cropLeft || 0;
      box.style.clipPath = `inset(${cTop}% ${cRight}% ${cBottom}% ${cLeft}%)`;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'doc-vector-image-svg');
      svg.setAttribute('viewBox', `0 0 ${img.naturalWidth || 160} ${img.naturalHeight || 110}`);
      svg.setAttribute('preserveAspectRatio', 'none');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', img.pathData);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#0f172a');
      path.setAttribute('stroke-width', '0.9');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      box.appendChild(svg);

      // 4 Corner Resize Handles
      ['tl', 'tr', 'br', 'bl'].forEach(corner => {
        const h = document.createElement('div');
        h.className = `doc-img-handle handle-${corner}`;
        h.dataset.corner = corner;
        box.appendChild(h);
      });

      // Quick Action Floating Toolbar
      const tb = document.createElement('div');
      tb.className = 'doc-img-floating-toolbar';
      tb.innerHTML = `
        <span class="img-metric-tag">${Math.round(img.width)}×${Math.round(img.height)}mm</span>
        <button class="btn-edit-img" title="Tweak Vectorizer Settings">⚙ Edit</button>
        <button class="btn-crop-img" title="Crop Vector Drawing">✂ Crop</button>
        <button class="btn-delete-img" title="Remove Vector Drawing">🗑 Delete</button>
      `;

      tb.querySelector('.btn-edit-img').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openEditImageTraceModal(img);
      });

      tb.querySelector('.btn-delete-img').addEventListener('click', (e) => {
        e.stopPropagation();
        curPage.images.splice(imgIdx, 1);
        this.selectedDocImage = null;
        this.renderDocImages();
        this.renderPagesSidebar();
        this.syncDocToArtworkLayer();
        this.updateFileMetricsDisplay();
        const docPageContent = document.querySelector('#doc-page-content');
        if (docPageContent) docPageContent.dispatchEvent(new Event('input'));
        this.showToast('Vectorized image removed', 'info');
      });

      tb.querySelector('.btn-crop-img').addEventListener('click', (e) => {
        e.stopPropagation();
        img.cropBottom = (img.cropBottom >= 30) ? 0 : (img.cropBottom + 15);
        img.cropTop = (img.cropTop >= 30) ? 0 : (img.cropTop + 10);
        box.style.clipPath = `inset(${img.cropTop}% ${img.cropRight || 0}% ${img.cropBottom}% ${img.cropLeft || 0}%)`;
        this.showToast(`Crop: Top ${img.cropTop}%, Bottom ${img.cropBottom}%`, 'info');
        const docPageContent = document.querySelector('#doc-page-content');
        if (docPageContent) docPageContent.dispatchEvent(new Event('input'));
      });

      box.appendChild(tb);

      box.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.openEditImageTraceModal(img);
      });

      this.attachImageInteractions(box, img, scale, w_mm, h_mm);

      container.appendChild(box);
    });
  }

  attachImageInteractions(box, img, scale, maxW_mm, maxH_mm) {
    let isDragging = false;
    let isResizing = false;
    let resizeCorner = null;
    let startX = 0, startY = 0;
    let initBoxX = 0, initBoxY = 0;
    let initW = 0, initH = 0;
    let initRatio = 1;

    box.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.doc-img-handle');
      if (handle) {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        resizeCorner = handle.dataset.corner;
        startX = e.clientX;
        startY = e.clientY;
        initW = parseFloat(box.style.width) || (img.width * scale);
        initH = parseFloat(box.style.height) || (img.height * scale);
        initRatio = initW / Math.max(1, initH);
        initBoxX = parseFloat(box.style.left) || (img.x * scale);
        initBoxY = parseFloat(box.style.top) || (img.y * scale);
        document.querySelectorAll('.doc-vector-image-box').forEach(b => b.classList.remove('selected'));
        box.classList.add('selected');
        this.selectedDocImage = img;
        return;
      }

      if (e.target.closest('.doc-img-floating-toolbar')) return;

      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initBoxX = parseFloat(box.style.left) || (img.x * scale);
      initBoxY = parseFloat(box.style.top) || (img.y * scale);

      document.querySelectorAll('.doc-vector-image-box').forEach(b => b.classList.remove('selected'));
      box.classList.add('selected');
      this.selectedDocImage = img;
    });

    const onMouseMove = (e) => {
      if (isDragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newPxX = Math.max(0, initBoxX + dx);
        const newPxY = Math.max(0, initBoxY + dy);
        box.style.left = `${newPxX}px`;
        box.style.top = `${newPxY}px`;
        img.x = Math.max(0, Math.min(maxW_mm - img.width, newPxX / scale));
        img.y = Math.max(0, Math.min(maxH_mm - img.height, newPxY / scale));
      } else if (isResizing) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newW = initW;
        let newH = initH;

        if (resizeCorner === 'br') {
          if (e.shiftKey) {
            // Lock length & breadth aspect ratio (Figma style)
            const delta = Math.abs(dx) > Math.abs(dy * initRatio) ? dx : (dy * initRatio);
            newW = Math.max(25, initW + delta);
            newH = newW / initRatio;
          } else {
            // Freeform resize
            newW = Math.max(25, initW + dx);
            newH = Math.max(20, initH + dy);
          }
        } else if (resizeCorner === 'bl') {
          if (e.shiftKey) {
            const delta = Math.abs(-dx) > Math.abs(dy * initRatio) ? -dx : (dy * initRatio);
            newW = Math.max(25, initW + delta);
            newH = newW / initRatio;
          } else {
            newW = Math.max(25, initW - dx);
            newH = Math.max(20, initH + dy);
          }
          box.style.left = `${initBoxX + (initW - newW)}px`;
          img.x = (initBoxX + (initW - newW)) / scale;
        } else if (resizeCorner === 'tr') {
          if (e.shiftKey) {
            const delta = Math.abs(dx) > Math.abs(-dy * initRatio) ? dx : (-dy * initRatio);
            newW = Math.max(25, initW + delta);
            newH = newW / initRatio;
          } else {
            newW = Math.max(25, initW + dx);
            newH = Math.max(20, initH - dy);
          }
          box.style.top = `${initBoxY + (initH - newH)}px`;
          img.y = (initBoxY + (initH - newH)) / scale;
        } else if (resizeCorner === 'tl') {
          if (e.shiftKey) {
            const delta = Math.abs(-dx) > Math.abs(-dy * initRatio) ? -dx : (-dy * initRatio);
            newW = Math.max(25, initW + delta);
            newH = newW / initRatio;
          } else {
            newW = Math.max(25, initW - dx);
            newH = Math.max(20, initH - dy);
          }
          box.style.left = `${initBoxX + (initW - newW)}px`;
          box.style.top = `${initBoxY + (initH - newH)}px`;
          img.x = (initBoxX + (initW - newW)) / scale;
          img.y = (initBoxY + (initH - newH)) / scale;
        }

        box.style.width = `${newW}px`;
        box.style.height = `${newH}px`;
        img.width = newW / scale;
        img.height = newH / scale;

        const tag = box.querySelector('.img-metric-tag');
        if (tag) tag.textContent = `${Math.round(img.width)}×${Math.round(img.height)}mm`;
      }
    };

    const onMouseUp = () => {
      if (isDragging || isResizing) {
        isDragging = false;
        isResizing = false;
        resizeCorner = null;
        this.renderPagesSidebar();
        const docPageContent = document.querySelector('#doc-page-content');
        if (docPageContent) docPageContent.dispatchEvent(new Event('input'));
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    document.addEventListener('mousedown', (e) => {
      if (!box.contains(e.target)) {
        box.classList.remove('selected');
      }
    });
  }

  addNewDocPage(initialText = '') {
    const cur = this.docPages[this.currentPageIndex];
    const newPage = {
      id: Date.now(),
      text: initialText !== '' ? initialText : 'New handwritten page...\n\n',
      fontId: cur?.fontId || 'hand_casual',
      fontSize: cur?.fontSize || 16,
      bold: false,
      italic: false,
      align: 'left',
      lineSpacing: 1.3,
      imperfection: cur?.imperfection !== undefined ? cur.imperfection : 0.38,
      borderStyle: cur?.borderStyle || this.paper.borderStyle || 'single',
      images: []
    };
    this.docPages.push(newPage);
    this.switchDocPage(this.docPages.length - 1);
    this.showToast(`Page ${this.docPages.length} added to document`, 'info');
  }

  duplicateDocPage(index) {
    const src = this.docPages[index];
    if (!src) return;
    const clone = {
      ...src,
      id: Date.now(),
      text: src.text,
      images: (src.images || []).map(img => ({ ...img, id: 'vec_img_' + Date.now() }))
    };
    this.docPages.splice(index + 1, 0, clone);
    this.switchDocPage(index + 1);
    this.showToast(`Page ${index + 1} duplicated`, 'info');
  }

  deleteDocPage(index) {
    if (this.docPages.length <= 1) {
      this.showToast('Cannot delete: Document must have at least one page.', 'warning');
      return;
    }
    this.docPages.splice(index, 1);
    const newIdx = Math.max(0, Math.min(this.currentPageIndex, this.docPages.length - 1));
    this.switchDocPage(newIdx);
    this.showToast('Page removed', 'info');
  }

  initTheme() {
    try {
      const savedTheme = localStorage.getItem('pen_plotter_theme') || 'dark';
      this.setTheme(savedTheme, false);
    } catch (e) {
      this.setTheme('dark', false);
    }
  }

  setTheme(theme, notify = true) {
    const isLight = theme === 'light';
    document.body.classList.remove('dark-theme', 'light-theme');
    document.body.classList.add(isLight ? 'light-theme' : 'dark-theme');
    try {
      localStorage.setItem('pen_plotter_theme', isLight ? 'light' : 'dark');
    } catch (e) {}

    if (this.workspace) {
      this.workspace.render();
    }
    if (notify) {
      this.showToast(`Switched to ${isLight ? 'Light' : 'Dark'} theme`, 'info');
    }
  }

  toggleTheme() {
    const isLight = document.body.classList.contains('light-theme');
    this.setTheme(isLight ? 'dark' : 'light', true);
  }

  loadSampleArtwork(fileName) {
    const sample = SAMPLE_FILES[fileName];
    if (!sample) return;

    this.currentFileName = sample.name;
    this.currentFileSize = sample.size;

    const nameEl = document.querySelector('#plot-filename');
    if (nameEl) nameEl.textContent = sample.name;

    const sizeEl = document.querySelector('#plot-file-size');
    if (sizeEl) sizeEl.textContent = `Size: ${sample.size}`;

    if (sample.type === 'svg') {
      const tabDoc = document.querySelector('#ws-tab-doc');
      if (tabDoc) tabDoc.click();

      const parser = new DOMParser();
      const doc = parser.parseFromString(sample.content, 'image/svg+xml');
      const paths = Array.from(doc.querySelectorAll('path')).map(p => p.getAttribute('d')).filter(Boolean);
      const combinedD = paths.join(' ');

      if (combinedD) {
        if (!this.docPages[this.currentPageIndex]) {
          this.addNewDocPage();
        }
        const curPage = this.docPages[this.currentPageIndex];
        if (!curPage.images) curPage.images = [];

        const imgWidth = Math.min(140, this.paper.width * 0.55);
        const imgHeight = Math.round(imgWidth * (160 / 240));
        const curBorder = curPage.borderStyle || this.paper.borderStyle || 'single';
        const margins = BorderManager.getBorderSafeMargins(curBorder, this.paper.borderInset || 12);
        const posX = Math.max(margins.left, (this.paper.width - imgWidth) / 2);
        const posY = Math.max(margins.top, (this.paper.height - imgHeight) / 2);

        curPage.images.push({
          id: 'sample_' + Date.now(),
          pathData: combinedD,
          naturalWidth: 300,
          naturalHeight: 200,
          x: Math.round(posX),
          y: Math.round(posY),
          width: Math.round(imgWidth),
          height: Math.round(imgHeight),
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
          cropLeft: 0
        });

        this.renderDocImages();
        this.renderPagesSidebar();
        this.syncDocToArtworkLayer();
        this.showToast(`Loaded ${sample.name} onto Document Sheet`, 'success');
      }
    } else if (sample.type === 'gcode') {
      const tabGcode = document.querySelector('#ws-tab-gcode');
      if (tabGcode) tabGcode.click();
      const parsed = this.gcodeParser.parse(sample.content);
      this.renderGCodeTab(sample.content, parsed);
      this.showToast(`Loaded G-code file: ${sample.name}`, 'info');
    }

    this.updateFileMetricsDisplay();
  }

  // Compiles on-page document text, borders, and placed images into CNC vector paths
  syncDocToArtworkLayer() {
    const docPageContent = document.querySelector('#doc-page-content');
    if (!docPageContent) return;
    const text = docPageContent.innerText.trim();

    // Persist active page text
    if (this.docPages[this.currentPageIndex]) {
      this.docPages[this.currentPageIndex].text = docPageContent.innerText;
    }

    this.workspace.artworkLayer.innerHTML = '';
    this.workspace.clearSelection();

    // 1. Plot chosen border if enabled and not 'none'
    const curBorder = this.docPages[this.currentPageIndex]?.borderStyle || this.paper.borderStyle || 'single';
    if (this.paper.plotBorder && curBorder && curBorder !== 'none') {
      const borderPaths = BorderManager.getBorderPaths(this.paper.width, this.paper.height, curBorder, this.paper.borderInset || 12);
      if (borderPaths && borderPaths.length > 0) {
        const borderGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        borderGroup.setAttribute('class', 'cnc-border-artwork');
        borderGroup.setAttribute('id', 'doc-compiled-border');
        borderPaths.forEach(d => {
          const bp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          bp.setAttribute('d', d);
          bp.setAttribute('fill', 'none');
          bp.setAttribute('stroke', '#ffffff');
          bp.setAttribute('stroke-width', '1.0');
          bp.setAttribute('stroke-linecap', 'round');
          bp.setAttribute('stroke-linejoin', 'round');
          borderGroup.appendChild(bp);
        });
        this.workspace.artworkLayer.appendChild(borderGroup);
      }
    }

    // 2. Plot text vector paths
    if (text) {
      const libreFontSelect = document.querySelector('#libre-font-select');
      const libreFontSize = document.querySelector('#libre-font-size');
      const libreLineSpacing = document.querySelector('#libre-line-spacing');
      const libreImperfection = document.querySelector('#libre-imperfection');
      const fontId = libreFontSelect ? libreFontSelect.value : (this.docPages[this.currentPageIndex]?.fontId || 'hand_casual');
      const fontSize = libreFontSize ? Number(libreFontSize.value) || 16 : 16;
      const activeAlignBtn = document.querySelector('.libre-tgl-btn[data-align].active');
      const align = activeAlignBtn ? activeAlignBtn.getAttribute('data-align') : 'left';
      const lineSpacing = libreLineSpacing ? Number(libreLineSpacing.value) || 1.35 : 1.35;
      const imperfection = libreImperfection ? parseFloat(libreImperfection.value) || 0.38 : 0.38;

      const vectorRes = this.fontManager.convertTextToVectors(text, fontId, {
        fontSize,
        lineSpacing,
        align,
        imperfection
      });

      if (vectorRes && vectorRes.pathData) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'cnc-text-artwork');
        group.setAttribute('id', 'doc-compiled-artwork');
        group.setAttribute('data-text-content', text.substring(0, 40));
        const margins = BorderManager.getBorderSafeMargins(curBorder, this.paper.borderInset || 12);
        group.setAttribute('transform', `translate(${margins.left.toFixed(2)}, ${margins.top.toFixed(2)})`);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', vectorRes.pathData);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#ffffff');
        path.setAttribute('stroke-width', vectorRes.isSingleLine ? '1.0' : '0.8');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');

        group.appendChild(path);
        this.workspace.artworkLayer.appendChild(group);
      }
    }

    // 3. Plot vectorized images placed on this document page
    const curPage = this.docPages[this.currentPageIndex];
    if (curPage && curPage.images && curPage.images.length > 0) {
      curPage.images.forEach(img => {
        if (!img.pathData) return;
        const imgGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        imgGroup.setAttribute('class', 'cnc-image-artwork');
        imgGroup.setAttribute('id', `doc-img-${img.id}`);

        const natW = img.naturalWidth || 160;
        const natH = img.naturalHeight || 110;
        const sx = (img.width / natW).toFixed(4);
        const sy = (img.height / natH).toFixed(4);
        imgGroup.setAttribute('transform', `translate(${img.x.toFixed(2)}, ${img.y.toFixed(2)}) scale(${sx}, ${sy})`);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', img.pathData);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#ffffff');
        path.setAttribute('stroke-width', '0.8');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');

        imgGroup.appendChild(path);
        this.workspace.artworkLayer.appendChild(imgGroup);
      });
    }

    this.updateFileMetricsDisplay();
  }

  bindUI() {
    // -------------------------------------------------------------
    // TOP NAVIGATION & WINDOW CONTROLS
    // -------------------------------------------------------------
    this.nav.subscribe((tab) => {
      if (tab === 'design') {
        this.paper.isDesignMode = true;
        this.populateComposerFontDropdown();
        this.workspace.render();
        this.updateComposerPreview();
      } else {
        this.paper.isDesignMode = false;
        this.workspace.render();
      }
    });

    document.querySelector('#sim-badge').addEventListener('click', () => {
      this.machine.isSimulationMode = !this.machine.isSimulationMode;
      const badge = document.querySelector('#sim-badge');
      if (this.machine.isSimulationMode) {
        badge.classList.remove('hardware-mode');
        badge.querySelector('.badge-label').textContent = 'Simulation Mode';
        this.showToast('Switched to Virtual Simulation Mode', 'info');
      } else {
        badge.classList.add('hardware-mode');
        badge.querySelector('.badge-label').textContent = 'Hardware Mode';
        this.showToast('Switched to Hardware Mode (Web Serial)', 'info');
      }
    });

    // Theme Toggle
    const btnThemeToggle = document.querySelector('#btn-theme-toggle');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', () => {
        this.toggleTheme();
      });
    }

    // Window mock buttons
    document.querySelectorAll('.win-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('win-min')) this.showToast('Window minimized', 'info');
        if (btn.classList.contains('win-max')) this.showToast('Window maximized', 'info');
        if (btn.classList.contains('win-close')) this.showToast('Application closed', 'info');
      });
    });

    // -------------------------------------------------------------
    // WORKSPACE TABS (Document Editor / G-code)
    // -------------------------------------------------------------
    const tabDoc = document.querySelector('#ws-tab-doc');
    const tabGcode = document.querySelector('#ws-tab-gcode');
    const studioDoc = document.querySelector('#doc-editor-studio');
    const viewportPreview = document.querySelector('#preview-viewport');
    const viewportGcode = document.querySelector('#gcode-viewport');
    const topRuler = document.querySelector('#top-ruler');
    const leftRuler = document.querySelector('#left-ruler');
    const rulerCorner = document.querySelector('.ruler-corner');
    const docPageSheet = document.querySelector('#doc-paper-sheet');
    const docPageContent = document.querySelector('#doc-page-content');

    if (tabDoc) {
      tabDoc.addEventListener('click', () => {
        tabDoc.classList.add('active');
        if (tabGcode) tabGcode.classList.remove('active');
        if (studioDoc) studioDoc.style.display = 'flex';
        if (viewportPreview) viewportPreview.style.display = 'none';
        if (viewportGcode) viewportGcode.style.display = 'none';
        if (topRuler) topRuler.style.display = 'none';
        if (leftRuler) leftRuler.style.display = 'none';
        if (rulerCorner) rulerCorner.style.display = 'none';
        this.updateDocumentPaperSize();
        this.renderPagesSidebar();
      });
    }

    if (tabGcode) {
      tabGcode.addEventListener('click', () => {
        tabGcode.classList.add('active');
        if (tabDoc) tabDoc.classList.remove('active');
        if (studioDoc) studioDoc.style.display = 'none';
        if (viewportPreview) viewportPreview.style.display = 'none';
        if (viewportGcode) viewportGcode.style.display = 'block';
        if (topRuler) topRuler.style.display = 'none';
        if (leftRuler) leftRuler.style.display = 'none';
        if (rulerCorner) rulerCorner.style.display = 'none';
        this.syncDocToArtworkLayer();
        this.generateAndDisplayGCode();
      });
    }

    document.querySelector('#btn-fit-screen').addEventListener('click', () => this.workspace.fitToScreen());
    document.querySelector('#btn-zoom-in').addEventListener('click', () => this.workspace.zoomIn());
    document.querySelector('#btn-zoom-out').addEventListener('click', () => this.workspace.zoomOut());
    
    // Pan tool toggle
    const panBtn = document.querySelector('#btn-pan-tool');
    if (panBtn) {
      panBtn.addEventListener('click', () => {
        const toolSel = document.querySelector('#tool-select');
        if (this.workspace.activeTool === 'pan') {
          this.workspace.activeTool = 'select';
          panBtn.classList.remove('active');
          if (toolSel) toolSel.classList.add('active');
        } else {
          this.workspace.activeTool = 'pan';
          panBtn.classList.add('active');
          if (toolSel) toolSel.classList.remove('active');
        }
      });
    }

    // Zoom dropdown presets
    const zoomDispBtn = document.querySelector('#zoom-display-btn');
    if (zoomDispBtn) {
      zoomDispBtn.addEventListener('click', () => {
        const presets = [0.5, 0.75, 1.0, 1.5, 2.0];
        const curIdx = presets.findIndex(p => Math.abs(p - this.workspace.scale) < 0.15);
        const nextScale = presets[(curIdx + 1) % presets.length];
        this.workspace.setZoom(nextScale);
      });
    }

    // Bottom action tools (guarded for uncluttered footer)
    const toolSelect = document.querySelector('#tool-select');
    if (toolSelect) {
      toolSelect.addEventListener('click', () => {
        this.workspace.activeTool = 'select';
        this.updateActiveWorkspaceTool('#tool-select');
      });
    }
    const toolMove = document.querySelector('#tool-move');
    if (toolMove) {
      toolMove.addEventListener('click', () => {
        this.workspace.activeTool = 'move';
        this.updateActiveWorkspaceTool('#tool-move');
      });
    }

    // =============================================================
    // LIBREOFFICE / WORD DOCUMENT EDITOR ENGINE
    // =============================================================
    const libreToolbar = document.querySelector('#libre-formatting-toolbar');
    const libreFontSelect = document.querySelector('#libre-font-select');
    const libreFontSize = document.querySelector('#libre-font-size');
    const libreBtnBold = document.querySelector('#libre-btn-bold');
    const libreBtnItalic = document.querySelector('#libre-btn-italic');
    const libreAlignLeft = document.querySelector('#libre-align-left');
    const libreAlignCenter = document.querySelector('#libre-align-center');
    const libreAlignRight = document.querySelector('#libre-align-right');
    const libreLineSpacing = document.querySelector('#libre-line-spacing');
    const libreImperfection = document.querySelector('#libre-imperfection');
    const libreBorderStyle = document.querySelector('#libre-border-style');
    const btnAddDocPage = document.querySelector('#btn-add-doc-page');
    const libreBtnSample = document.querySelector('#libre-btn-sample');
    const libreBtnClear = document.querySelector('#libre-btn-clear');

    const FONT_CSS_MAP = {
      'hand_casual': "'Caveat', 'Segoe Script', cursive, sans-serif",
      'hand_architect': "'Architects Daughter', 'Segoe Print', monospace",
      'hand_quicknote': "'Shadows Into Light', 'Patrick Hand', cursive",
      'hand_fountain': "'Caveat', 'Brush Script MT', cursive",
      'hand_organic': "'Kalam', 'Segoe Print', cursive",
      'hand_school': "'Patrick Hand', 'Comic Sans MS', cursive",
      'hershey_simplex': "'Courier New', monospace"
    };

    let docSyncTimeout = null;

    const scheduleDocSync = () => {
      clearTimeout(docSyncTimeout);
      docSyncTimeout = setTimeout(() => {
        this.syncDocToArtworkLayer();
        this.renderPagesSidebar();
      }, 150);
    };

    // Live typing and paste in on-page document editor with multi-page auto-overflow pagination
    if (docPageContent) {
      docPageContent.addEventListener('input', () => {
        this.checkAndHandlePageOverflow();
        scheduleDocSync();
      });
      docPageContent.addEventListener('paste', () => {
        setTimeout(() => {
          this.checkAndHandlePageOverflow();
          scheduleDocSync();
        }, 20);
      });
      docPageContent.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && this.currentPageIndex > 0 && docPageContent.innerText.trim().length === 0) {
          e.preventDefault();
          this.deleteDocPage(this.currentPageIndex);
        }
      });
    }

    // Add Page Button in Pages Sidebar
    if (btnAddDocPage) {
      btnAddDocPage.addEventListener('click', () => {
        this.addNewDocPage();
      });
    }

    // Formatting Toolbar changes apply directly to the on-page document editor!
    const applyDocumentFormatting = () => {
      if (!docPageContent) return;
      const fontId = libreFontSelect ? libreFontSelect.value : 'hand_casual';
      const fontSize = libreFontSize ? Number(libreFontSize.value) || 15 : 15;
      const isBold = libreBtnBold && libreBtnBold.classList.contains('active');
      const isItalic = libreBtnItalic && libreBtnItalic.classList.contains('active');
      const activeAlignBtn = document.querySelector('.libre-tgl-btn[data-align].active');
      const align = activeAlignBtn ? activeAlignBtn.getAttribute('data-align') : 'left';
      const lineSpacing = libreLineSpacing ? Number(libreLineSpacing.value) || 1.4 : 1.4;
      const imperfection = libreImperfection ? parseFloat(libreImperfection.value) : 0.38;

      docPageContent.style.fontFamily = FONT_CSS_MAP[fontId] || "'Caveat', cursive, sans-serif";
      docPageContent.style.fontSize = `${fontSize}px`;
      docPageContent.style.fontWeight = isBold ? '600' : 'normal';
      docPageContent.style.fontStyle = isItalic ? 'italic' : 'normal';
      docPageContent.style.textAlign = align;
      docPageContent.style.lineHeight = `${lineSpacing}`;

      // Live Human Touch / Organic Imperfection engine for DOM handwriting text
      const dispEl = document.querySelector('#touch-fe-displacement');
      if (imperfection === 0) {
        docPageContent.style.filter = 'none';
        docPageContent.style.letterSpacing = '0px';
        docPageContent.style.wordSpacing = '0px';
        docPageContent.style.transform = 'none';
      } else {
        docPageContent.style.filter = 'url(#handwriting-jitter-filter)';
        if (dispEl) {
          dispEl.setAttribute('scale', (imperfection * 4.0).toFixed(1));
        }
        docPageContent.style.letterSpacing = `${(imperfection * 1.6).toFixed(1)}px`;
        docPageContent.style.wordSpacing = `${(imperfection * 2.8).toFixed(1)}px`;
        docPageContent.style.transform = `skewX(${(-imperfection * 0.45).toFixed(2)}deg)`;
      }

      // Update current page model
      if (this.docPages[this.currentPageIndex]) {
        this.docPages[this.currentPageIndex].fontId = fontId;
        this.docPages[this.currentPageIndex].fontSize = fontSize;
        this.docPages[this.currentPageIndex].bold = isBold;
        this.docPages[this.currentPageIndex].italic = isItalic;
        this.docPages[this.currentPageIndex].align = align;
        this.docPages[this.currentPageIndex].lineSpacing = lineSpacing;
        this.docPages[this.currentPageIndex].imperfection = imperfection;
      }

      scheduleDocSync();
    };

    if (libreFontSelect) libreFontSelect.addEventListener('change', applyDocumentFormatting);
    if (libreFontSize) libreFontSize.addEventListener('input', applyDocumentFormatting);

    if (libreBtnBold) {
      libreBtnBold.addEventListener('click', () => {
        libreBtnBold.classList.toggle('active');
        applyDocumentFormatting();
      });
    }

    if (libreBtnItalic) {
      libreBtnItalic.addEventListener('click', () => {
        libreBtnItalic.classList.toggle('active');
        applyDocumentFormatting();
      });
    }

    [libreAlignLeft, libreAlignCenter, libreAlignRight].filter(Boolean).forEach(btn => {
      btn.addEventListener('click', () => {
        [libreAlignLeft, libreAlignCenter, libreAlignRight].filter(Boolean).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyDocumentFormatting();
      });
    });

    if (libreLineSpacing) libreLineSpacing.addEventListener('change', applyDocumentFormatting);
    if (libreImperfection) {
      libreImperfection.addEventListener('change', applyDocumentFormatting);
      libreImperfection.addEventListener('input', applyDocumentFormatting);
    }

    // Border Style Selector (Replaced old Ruled Lines / Margins / Blank)
    if (libreBorderStyle) {
      libreBorderStyle.addEventListener('change', (e) => {
        const style = e.target.value;
        this.paper.borderStyle = style;
        if (this.docPages[this.currentPageIndex]) {
          this.docPages[this.currentPageIndex].borderStyle = style;
        }
        const sideRadio = document.querySelector(`input[name="border-choice"][value="${style}"]`);
        if (sideRadio) sideRadio.checked = true;
        this.updateDocumentPaperSize();
        this.renderPagesSidebar();
        scheduleDocSync();
        this.showToast(`Page border: ${style.toUpperCase()}`, 'info');
      });
    }

    // Design View Border Choice Radios
    document.querySelectorAll('input[name="border-choice"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const style = e.target.value;
        this.paper.borderStyle = style;
        if (this.docPages[this.currentPageIndex]) {
          this.docPages[this.currentPageIndex].borderStyle = style;
        }
        if (libreBorderStyle) libreBorderStyle.value = style;
        this.updateDocumentPaperSize();
        this.renderPagesSidebar();
        scheduleDocSync();
      });
    });

    const borderInsetInput = document.querySelector('#input-border-inset');
    if (borderInsetInput) {
      borderInsetInput.addEventListener('input', (e) => {
        this.paper.borderInset = Number(e.target.value) || 12;
        this.updateDocumentPaperSize();
        scheduleDocSync();
      });
    }

    const borderStrokeInput = document.querySelector('#input-border-stroke');
    if (borderStrokeInput) {
      borderStrokeInput.addEventListener('input', (e) => {
        this.paper.borderStrokeWidth = Number(e.target.value) || 0.8;
        this.updateDocumentPaperSize();
      });
    }

    const plotBorderTgl = document.querySelector('#toggle-plot-border');
    if (plotBorderTgl) {
      plotBorderTgl.addEventListener('change', (e) => {
        this.paper.plotBorder = e.target.checked;
        this.showToast(`Draw border with plotter: ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
      });
    }

    // Sample Document Button
    if (libreBtnSample) {
      libreBtnSample.addEventListener('click', () => {
        if (!docPageContent) return;
        docPageContent.innerText = `Pen Plotter CNC — Handwriting Document

Dear Friend,

This document is written directly in the on-page Word / LibreOffice text editor layout.
You can click anywhere on this page, type new sentences, or select words with your mouse to change fonts, bold, and styles!

Features:
• Organic baseline variance and micro-curves
• 6 authentic single-line handwriting fonts
• LibreOffice / Word document editing layout
• Direct G-code export for CNC pen plotters

Sincerely,
Antigravity CNC Studio`;
        applyDocumentFormatting();
        this.showToast('Sample document loaded into editor', 'info');
      });
    }

    // Clear Document Button (Clears text AND vector images)
    if (libreBtnClear) {
      libreBtnClear.addEventListener('click', () => {
        if (docPageContent) docPageContent.innerText = '';
        if (this.docPages[this.currentPageIndex]) {
          this.docPages[this.currentPageIndex].text = '';
          this.docPages[this.currentPageIndex].images = [];
        }
        this.selectedDocImage = null;
        this.renderDocImages();
        this.renderPagesSidebar();
        this.syncDocToArtworkLayer();
        this.updateFileMetricsDisplay();
        if (docPageContent) docPageContent.focus();
        this.showToast('Document text and vector drawings cleared', 'info');
      });
    }

    const libreBtnInsert = document.querySelector('#libre-btn-insert');
    if (libreBtnInsert) {
      libreBtnInsert.addEventListener('click', () => {
        if (tabDoc) tabDoc.click();
        if (docPageContent) {
          docPageContent.focus();
          if (docPageContent.innerText.trim().length > 0) {
            docPageContent.innerText += '\n\nNew handwritten paragraph...';
          } else {
            docPageContent.innerText = 'Start typing your document here...';
          }
          applyDocumentFormatting();
        }
      });
    }

    const libreBtnAddImage = document.querySelector('#libre-btn-add-image');
    if (libreBtnAddImage) {
      libreBtnAddImage.addEventListener('click', () => {
        this.editingDocImage = null;
        const btnApply = document.querySelector('#btn-apply-image-trace');
        if (btnApply) btnApply.textContent = 'Add to Document Editor';
        this.openModal('modal-image-trace');
      });
    }

    const toolText = document.querySelector('#tool-text');
    if (toolText) {
      toolText.addEventListener('click', () => {
        if (tabDoc) tabDoc.click();
        if (docPageContent) docPageContent.focus();
      });
    }

    const toolTransform = document.querySelector('#tool-transform');
    if (toolTransform) {
      toolTransform.addEventListener('click', () => {
        this.workspace.activeTool = 'transform';
        this.updateActiveWorkspaceTool('#tool-transform');
        this.workspace.renderSelectionBox();
      });
    }

    const toolRotate = document.querySelector('#tool-rotate');
    if (toolRotate) {
      toolRotate.addEventListener('click', () => {
        this.workspace.rotateSelected(90);
      });
    }

    const toolFlip = document.querySelector('#tool-flip');
    if (toolFlip) {
      toolFlip.addEventListener('click', () => {
        this.workspace.flipHorizontalSelected();
      });
    }

    const toolDelete = document.querySelector('#tool-delete');
    if (toolDelete) {
      toolDelete.addEventListener('click', () => {
        const selectedBox = document.querySelector('.doc-vector-image-box.selected');
        if (selectedBox) {
          const idx = parseInt(selectedBox.dataset.imageIndex, 10);
          const curPage = this.docPages[this.currentPageIndex];
          if (curPage && curPage.images && !isNaN(idx) && curPage.images[idx]) {
            curPage.images.splice(idx, 1);
            this.selectedDocImage = null;
            this.renderDocImages();
            this.renderPagesSidebar();
            this.syncDocToArtworkLayer();
            this.updateFileMetricsDisplay();
            this.showToast('Vector drawing deleted', 'info');
            return;
          }
        }
        this.workspace.deleteSelected();
        this.updateFileMetricsDisplay();
      });
    }

    // Paper Preset Select (A4, A3, A5, Letter, Custom)
    const paperSelect = document.querySelector('#paper-preset-select');
    if (paperSelect) {
      paperSelect.addEventListener('change', (e) => {
        this.paper.setPreset(e.target.value);
        this.workspace.updateSVGDimensions();
        this.workspace.render();
        this.workspace.fitToScreen();
        const areaW = document.querySelector('#input-area-width');
        const areaH = document.querySelector('#input-area-height');
        if (areaW) areaW.value = this.paper.width;
        if (areaH) areaH.value = this.paper.height;
        this.updateDocumentPaperSize();
        this.renderPagesSidebar();
        this.syncDocToArtworkLayer();
        this.showToast(`Paper preset: ${this.paper.currentPresetKey} (${this.paper.width}×${this.paper.height}mm)`, 'info');
      });
    }

    // -------------------------------------------------------------
    // PLOT SETTINGS PANEL INPUTS
    // -------------------------------------------------------------
    const penUpInput = document.querySelector('#input-pen-up');
    const penDownInput = document.querySelector('#input-pen-down');
    const drawSpeedInput = document.querySelector('#input-draw-speed');
    const travelSpeedInput = document.querySelector('#input-travel-speed');
    const lineAccuracyInput = document.querySelector('#input-line-accuracy');
    const areaWidthInput = document.querySelector('#input-area-width');
    const areaHeightInput = document.querySelector('#input-area-height');

    const updateGCodeSettings = () => {
      this.gcodeGen.setSettings({
        penUpAngle: penUpInput.value,
        penDownAngle: penDownInput.value,
        drawingSpeed: drawSpeedInput.value,
        travelSpeed: travelSpeedInput.value,
        lineAccuracy: lineAccuracyInput.value
      });
      this.machine.penUpAngle = Number(penUpInput.value);
      this.machine.penDownAngle = Number(penDownInput.value);
      this.machine.drawingSpeed = Number(drawSpeedInput.value);
      this.machine.travelSpeed = Number(travelSpeedInput.value);
      this.updateFileMetricsDisplay();
    };

    [penUpInput, penDownInput, drawSpeedInput, travelSpeedInput, lineAccuracyInput].forEach(inp => {
      inp.addEventListener('input', updateGCodeSettings);
    });

    if (areaWidthInput) {
      areaWidthInput.addEventListener('change', () => {
        const w = Number(areaWidthInput.value);
        if (this.isAspectRatioLocked && areaHeightInput) {
          const ratio = this.paper.height / this.paper.width;
          areaHeightInput.value = Math.round(w * ratio);
        }
        this.paper.setCustomSize(w, areaHeightInput ? areaHeightInput.value : this.paper.height);
        this.workspace.updateSVGDimensions();
        this.workspace.render();
        this.updateDocumentPaperSize();
        this.renderPagesSidebar();
        this.syncDocToArtworkLayer();
      });
    }

    if (areaHeightInput) {
      areaHeightInput.addEventListener('change', () => {
        const h = Number(areaHeightInput.value);
        if (this.isAspectRatioLocked && areaWidthInput) {
          const ratio = this.paper.width / this.paper.height;
          areaWidthInput.value = Math.round(h * ratio);
        }
        this.paper.setCustomSize(areaWidthInput ? areaWidthInput.value : this.paper.width, h);
        this.workspace.updateSVGDimensions();
        this.workspace.render();
        this.updateDocumentPaperSize();
        this.renderPagesSidebar();
        this.syncDocToArtworkLayer();
      });
    }

    document.querySelector('#btn-lock-aspect').addEventListener('click', (e) => {
      this.isAspectRatioLocked = !this.isAspectRatioLocked;
      e.currentTarget.classList.toggle('active', this.isAspectRatioLocked);
    });

    // -------------------------------------------------------------
    // MACHINE CONTROL PANEL (Jog, Step, Status)
    // -------------------------------------------------------------
    document.querySelector('#jog-y-plus').addEventListener('click', () => this.machine.jog('Y', 1));
    document.querySelector('#jog-y-minus').addEventListener('click', () => this.machine.jog('Y', -1));
    document.querySelector('#jog-x-plus').addEventListener('click', () => this.machine.jog('X', 1));
    document.querySelector('#jog-x-minus').addEventListener('click', () => this.machine.jog('X', -1));
    document.querySelector('#jog-center-home').addEventListener('click', () => this.machine.home());

    // Step size buttons
    document.querySelectorAll('.step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.step-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.machine.setStepSize(btn.getAttribute('data-step'));
      });
    });

    document.querySelector('#btn-manual-pen-up').addEventListener('click', () => {
      this.machine.penUp();
      this.showToast('Pen lifted (Up)', 'info');
    });

    document.querySelector('#btn-manual-pen-down').addEventListener('click', () => {
      this.machine.penDown();
      this.showToast('Pen lowered (Down)', 'info');
    });

    // Machine coordinate & state subscription
    this.machine.subscribe((event, data) => {
      if (event === 'position_change') {
        const xStr = `${data.x.toFixed(2)} mm`;
        const yStr = `${data.y.toFixed(2)} mm`;
        const zStr = `${data.z.toFixed(2)} °`;

        document.querySelector('#status-coord-x').textContent = xStr;
        document.querySelector('#status-coord-y').textContent = yStr;
        document.querySelector('#status-coord-z').textContent = zStr;

        const ctrlX = document.querySelector('#ctrl-coord-x');
        if (ctrlX) {
          ctrlX.textContent = xStr;
          document.querySelector('#ctrl-coord-y').textContent = yStr;
          document.querySelector('#ctrl-coord-z').textContent = zStr;
        }
      } else if (event === 'progress') {
        const progContainer = document.querySelector('#plot-progress-container');
        progContainer.style.display = 'flex';
        document.querySelector('#progress-bar-fill').style.width = `${data.progress}%`;
        document.querySelector('#progress-percent-text').textContent = `${Math.round(data.progress)}%`;
        if (data.timeLeft) {
          document.querySelector('#progress-eta-text').textContent = `ETA: ${data.timeLeft}`;
        }
      } else if (event === 'job_completed') {
        document.querySelector('#progress-state-text').textContent = 'Completed!';
        this.showToast('Plotting job completed successfully!', 'success');
        setTimeout(() => {
          document.querySelector('#plot-progress-container').style.display = 'none';
        }, 4000);
      } else if (event === 'job_stopped') {
        document.querySelector('#progress-state-text').textContent = 'Stopped';
        document.querySelector('#plot-progress-container').style.display = 'none';
        this.showToast('Plotting stopped by user', 'error');
      }
    });

    // -------------------------------------------------------------
    // BOTTOM ACTION BAR (Start, Pause, Stop, Home)
    // -------------------------------------------------------------
    document.querySelector('#btn-start-plot').addEventListener('click', () => {
      this.startPlotWorkflow();
    });

    document.querySelector('#btn-pause-plot').addEventListener('click', () => {
      if (this.machine.state === 'Plotting') {
        this.machine.pausePlot();
        document.querySelector('#progress-state-text').textContent = 'Paused';
        this.showToast('Plotting paused', 'info');
      } else if (this.machine.state === 'Paused') {
        this.machine.resumePlot();
        document.querySelector('#progress-state-text').textContent = 'Plotting...';
        this.showToast('Plotting resumed', 'info');
      }
    });

    document.querySelector('#btn-stop-plot').addEventListener('click', () => {
      this.machine.stopPlot();
    });

    document.querySelector('#btn-home-plot').addEventListener('click', () => {
      this.machine.home();
      this.showToast('Homed to origin (0,0)', 'info');
    });

    // -------------------------------------------------------------
    // SIDEBAR ACTIONS & RECENT FILES
    // -------------------------------------------------------------
    // Render user-added recent files list
    this.renderRecentFiles();

    // Sidebar features
    document.querySelector('#btn-open-import').addEventListener('click', () => this.openModal('modal-import'));
    document.querySelector('#btn-menu-image-to-plot').addEventListener('click', () => {
      this.editingDocImage = null;
      const btnApply = document.querySelector('#btn-apply-image-trace');
      if (btnApply) btnApply.textContent = 'Add to Document Editor';
      this.openModal('modal-image-trace');
    });
    const btnMenuText = document.querySelector('#btn-menu-text-to-plot');
    if (btnMenuText) {
      btnMenuText.addEventListener('click', () => {
        this.nav.switchTab('plot');
        if (tabDoc) tabDoc.click();
        if (docPageContent) docPageContent.focus();
      });
    }
    document.querySelector('#btn-menu-svg-dxf').addEventListener('click', () => this.openModal('modal-import'));
    document.querySelector('#btn-menu-gcode').addEventListener('click', () => {
      tabGcode.click();
    });

    // Connection card in sidebar click -> opens control tab
    document.querySelector('#sidebar-connection-card').addEventListener('click', () => {
      this.nav.switchTab('control');
    });

    // -------------------------------------------------------------
    // DESIGN TAB: TEXT-TO-PLOT COMPOSER (Safely guarded)
    // -------------------------------------------------------------
    const composerText = document.querySelector('#composer-text-input');
    const composerFont = document.querySelector('#composer-font-select');
    const typoFontSize = document.querySelector('#typo-font-size');
    const typoLetterSpacing = document.querySelector('#typo-letter-spacing');
    const typoLineSpacing = document.querySelector('#typo-line-spacing');

    if (composerText && composerFont) {
      const onComposerChange = () => {
        this.textEditor.setText(composerText.value);
        this.textEditor.setFont(composerFont.value);
        this.textEditor.setProperties({
          fontSize: typoFontSize ? typoFontSize.value : 16,
          letterSpacing: typoLetterSpacing ? typoLetterSpacing.value : 1,
          lineSpacing: typoLineSpacing ? typoLineSpacing.value : 1.3
        });
        this.updateComposerPreview();
      };

      [composerText, composerFont, typoFontSize, typoLetterSpacing, typoLineSpacing].filter(Boolean).forEach(el => {
        el.addEventListener('input', onComposerChange);
      });

      document.querySelectorAll('.align-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.textEditor.setProperties({ align: btn.getAttribute('data-align') });
          this.updateComposerPreview();
        });
      });

      const btnComposerAddFont = document.querySelector('#btn-composer-add-font');
      if (btnComposerAddFont) {
        btnComposerAddFont.addEventListener('click', () => {
          this.openModal('modal-add-font');
        });
      }

      const btnConvertText = document.querySelector('#btn-convert-text-to-paths');
      if (btnConvertText) {
        btnConvertText.addEventListener('click', () => {
          const text = document.querySelector('#composer-text-input')?.value.trim();
          if (!text) {
            this.showToast('Please type some text in the composer before converting.', 'warning');
            return;
          }
          try {
            const el = this.textEditor.convertToPaths();
            if (el) {
              this.nav.switchTab('plot');
              this.updateFileMetricsDisplay();
              this.showToast('Text converted to vector paths on Artwork Layer!', 'success');
            } else {
              this.showToast('Could not convert text to vector paths. Check font selection.', 'error');
            }
          } catch (err) {
            console.error('Text to path conversion error:', err);
            this.showToast(`Text conversion failed: ${err.message}`, 'error');
          }
        });
      }
    }

    // -------------------------------------------------------------
    // HARDWARE CONTROL TAB & MDI TERMINAL
    // -------------------------------------------------------------
    document.querySelector('#btn-ctrl-connect').addEventListener('click', async () => {
      const baud = document.querySelector('#ctrl-baud-select').value;
      try {
        await this.machine.serial.connect(baud);
        this.logTerminal(`Connected to serial port at ${baud} baud.`, 'received');
        document.querySelector('#ctrl-port-badge').textContent = `Port: Connected (${baud})`;
        document.querySelector('#connection-status-label').textContent = 'Connected';
        document.querySelector('#connection-port-label').textContent = `USB · ${baud}`;
        this.showToast('Connected to CNC Shield successfully!', 'success');
      } catch (err) {
        this.logTerminal(`Connection failed: ${err.message}`, 'error');
        this.showToast(err.message, 'error');
      }
    });

    document.querySelector('#btn-ctrl-disconnect').addEventListener('click', async () => {
      await this.machine.serial.disconnect();
      this.logTerminal('Serial port disconnected.', 'info');
      document.querySelector('#ctrl-port-badge').textContent = 'Port: Disconnected';
      document.querySelector('#connection-status-label').textContent = 'Disconnected';
      this.showToast('Serial port disconnected', 'info');
    });

    document.querySelector('#btn-ctrl-estop').addEventListener('click', () => {
      this.machine.stopPlot();
      this.logTerminal('EMERGENCY STOP (Feed Hold) triggered!', 'error');
      this.showToast('EMERGENCY STOP TRIGGERED', 'error');
    });

    document.querySelector('#btn-ctrl-reset').addEventListener('click', () => {
      this.machine.serial.writeDirect('\x18');
      this.logTerminal('Sent Soft Reset (Ctrl+X)', 'sent');
    });

    document.querySelector('#btn-ctrl-unlock').addEventListener('click', () => {
      this.machine.serial.sendCommand('$X');
      this.logTerminal('Sent Unlock Alarm ($X)', 'sent');
    });

    document.querySelector('#btn-ctrl-home-cycle').addEventListener('click', () => {
      this.machine.home();
      this.logTerminal('Sent Homing Cycle ($H)', 'sent');
    });

    // Zeroing buttons
    document.querySelector('#btn-zero-all').addEventListener('click', () => {
      this.machine.home();
      this.logTerminal('Zeroed work coordinates (G92 X0 Y0 Z0)', 'sent');
      this.showToast('WCS Zeroed (X0 Y0)', 'info');
    });

    document.querySelector('#btn-zero-x').addEventListener('click', () => {
      this.machine.x = 0;
      this.machine.notify('position_change', { x: 0, y: this.machine.y, z: this.machine.z });
      this.machine.serial.sendCommand('G92 X0');
      this.logTerminal('Zeroed X axis (G92 X0)', 'sent');
    });

    document.querySelector('#btn-zero-y').addEventListener('click', () => {
      this.machine.y = 0;
      this.machine.notify('position_change', { x: this.machine.x, y: 0, z: this.machine.z });
      this.machine.serial.sendCommand('G92 Y0');
      this.logTerminal('Zeroed Y axis (G92 Y0)', 'sent');
    });

    document.querySelector('#btn-zero-z').addEventListener('click', () => {
      this.machine.z = 90;
      this.machine.notify('position_change', { x: this.machine.x, y: this.machine.y, z: 90 });
      this.machine.serial.sendCommand('G92 Z0');
      this.logTerminal('Zeroed Z axis', 'sent');
    });

    document.querySelector('#btn-goto-zero').addEventListener('click', () => {
      this.machine.jog('X', -this.machine.x);
      this.machine.jog('Y', -this.machine.y);
      this.machine.serial.sendCommand('G0 X0 Y0');
      this.logTerminal('Rapid move to WCS Origin (G0 X0 Y0)', 'sent');
    });

    document.querySelector('#btn-test-pen-up').addEventListener('click', () => this.machine.penUp());
    document.querySelector('#btn-test-pen-down').addEventListener('click', () => this.machine.penDown());

    // Terminal Input
    const termInput = document.querySelector('#terminal-input');
    const sendTerminalCmd = () => {
      const cmd = termInput.value.trim();
      if (!cmd) return;
      this.logTerminal(cmd, 'sent');
      this.machine.serial.sendCommand(cmd);
      termInput.value = '';
    };

    document.querySelector('#btn-terminal-send').addEventListener('click', sendTerminalCmd);
    termInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendTerminalCmd();
    });

    document.querySelectorAll('.macro-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const cmd = chip.getAttribute('data-cmd');
        this.logTerminal(cmd, 'sent');
        this.machine.serial.sendCommand(cmd);
      });
    });

    // -------------------------------------------------------------
    // MODALS & FILE IMPORTERS
    // -------------------------------------------------------------
    document.querySelectorAll('.modal-close-btn, [data-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-close') || btn.closest('.modal-backdrop')?.id;
        if (id) {
          this.closeModal(id);
        }
      });
    });

    // Close when clicking directly on modal background
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
      bd.addEventListener('click', (e) => {
        if (e.target === bd) {
          this.closeModal(bd.id);
        }
      });
    });

    // Global Keydown shortcuts: ESC (modals), Delete/Backspace (vector image), Ctrl+C/Ctrl+V (copy/paste)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop').forEach(bd => {
          if (bd.style.display !== 'none') {
            this.closeModal(bd.id);
          }
        });
      }

      const activeEl = document.activeElement;
      const tagName = activeEl ? activeEl.tagName.toUpperCase() : '';
      const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || (activeEl && activeEl.isContentEditable && window.getSelection().toString().length > 0);

      // Keyboard Delete / Backspace for selected vector drawing
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        const selectedBox = document.querySelector('.doc-vector-image-box.selected');
        if (selectedBox) {
          e.preventDefault();
          const idx = parseInt(selectedBox.dataset.imageIndex, 10);
          const curPage = this.docPages[this.currentPageIndex];
          if (curPage && curPage.images && !isNaN(idx) && curPage.images[idx]) {
            curPage.images.splice(idx, 1);
            this.selectedDocImage = null;
            this.renderDocImages();
            this.renderPagesSidebar();
            this.syncDocToArtworkLayer();
            this.updateFileMetricsDisplay();
            this.showToast('Vector drawing deleted', 'info');
            return;
          }
        }
      }

      // Ctrl+C (Copy selected vector drawing)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && !isInput) {
        const selectedBox = document.querySelector('.doc-vector-image-box.selected');
        if (selectedBox) {
          const idx = parseInt(selectedBox.dataset.imageIndex, 10);
          const curPage = this.docPages[this.currentPageIndex];
          if (curPage && curPage.images && curPage.images[idx]) {
            this.docImageClipboard = JSON.parse(JSON.stringify(curPage.images[idx]));
            this.showToast('Vector drawing copied to clipboard (Ctrl+C)', 'info');
          }
        }
      }

      // Ctrl+V (Paste vector drawing)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V') && !isInput) {
        if (this.docImageClipboard) {
          e.preventDefault();
          const curPage = this.docPages[this.currentPageIndex];
          if (curPage) {
            if (!curPage.images) curPage.images = [];
            const pasted = JSON.parse(JSON.stringify(this.docImageClipboard));
            pasted.id = 'vimg_' + Date.now();
            pasted.x = Math.max(5, Math.min((this.paper.width || 297) - pasted.width, (pasted.x || 10) + 10));
            pasted.y = Math.max(5, Math.min((this.paper.height || 210) - pasted.height, (pasted.y || 10) + 10));
            curPage.images.push(pasted);
            this.selectedDocImage = pasted;
            this.renderDocImages();
            this.renderPagesSidebar();
            this.syncDocToArtworkLayer();
            this.updateFileMetricsDisplay();

            // Select newly pasted image
            const boxes = document.querySelectorAll('.doc-vector-image-box');
            if (boxes.length > 0) {
              boxes.forEach(b => b.classList.remove('selected'));
              boxes[boxes.length - 1].classList.add('selected');
            }
            this.showToast('Vector drawing pasted (Ctrl+V)', 'info');
          }
        }
      }
    });

    // Universal Dropzone & File Input
    const dropzone = document.querySelector('#import-dropzone');
    const fileInput = document.querySelector('#universal-file-input');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.handleUploadedFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleUploadedFile(e.target.files[0]);
      }
    });

    // Image-to-Plot Tracing Studio Controls (27 Algorithms & Combos matching reference tool)
    const traceFileInput = document.querySelector('#image-trace-file-input');
    const traceDetails = document.querySelector('#trace-details-select');
    const traceThresh = document.querySelector('#trace-threshold');
    const traceStep = document.querySelector('#trace-line-step');
    const traceAlgo = document.querySelector('#trace-algorithm-select');
    const traceInvert = document.querySelector('#trace-invert');
    const origImg = document.querySelector('#trace-orig-preview-img');
    const origHint = document.querySelector('#trace-orig-empty-hint');
    const pathMetrics = document.querySelector('#trace-path-metrics');
    this.loadedTraceImage = null;
    let currentTraceResult = null;

    const runImageTrace = () => {
      const activeImage = this.loadedTraceImage;
      if (!activeImage) return;

      if (origImg) {
        origImg.src = activeImage.src;
        origImg.style.display = 'block';
      }
      if (origHint) origHint.style.display = 'none';

      document.querySelector('#trace-thresh-val').textContent = traceThresh.value;
      document.querySelector('#trace-step-val').textContent = `${traceStep.value}px`;

      currentTraceResult = ImageTracer.trace(activeImage, {
        mode: traceAlgo.value,
        details: traceDetails ? traceDetails.value : 'strong',
        threshold: Number(traceThresh.value),
        step: Number(traceStep.value),
        invert: traceInvert.checked,
        targetWidth: 160,
        targetHeight: 160,
        preserveAspectRatio: true
      });

      const traceSvg = document.querySelector('#image-trace-svg');
      if (traceSvg && currentTraceResult) {
        traceSvg.setAttribute('viewBox', `0 0 ${currentTraceResult.width} ${currentTraceResult.height}`);
        traceSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      }

      const pathEl = document.querySelector('#image-trace-path');
      if (pathEl) pathEl.setAttribute('d', currentTraceResult.pathData);
      if (pathMetrics) {
        pathMetrics.textContent = `${currentTraceResult.strokeCount || 0} strokes`;
      }
    };
    this.runImageTrace = runImageTrace;

    traceFileInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

        if (isSvg) {
          try {
            const text = await file.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'image/svg+xml');
            const svgEl = doc.querySelector('svg');
            if (!svgEl) {
              this.showToast('Invalid SVG file: <svg> root element missing.', 'error');
              return;
            }

            // Determine dimensions from viewBox or width/height attributes
            let w = 300, h = 300;
            const viewBox = svgEl.getAttribute('viewBox');
            if (viewBox) {
              const parts = viewBox.trim().split(/[\s,]+/).map(Number);
              if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
                w = parts[2];
                h = parts[3];
              }
            } else {
              const wAttr = parseFloat(svgEl.getAttribute('width'));
              const hAttr = parseFloat(svgEl.getAttribute('height'));
              if (wAttr && hAttr) {
                w = wAttr;
                h = hAttr;
              }
            }

            // Ensure width, height, viewBox, and xmlns for accurate rasterization & canvas drawing
            svgEl.setAttribute('width', `${Math.round(w)}px`);
            svgEl.setAttribute('height', `${Math.round(h)}px`);
            if (!svgEl.getAttribute('viewBox')) {
              svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
            }
            if (!svgEl.getAttribute('xmlns')) {
              svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            }

            // Extract vector geometry paths for 1:1 direct vector extraction mode
            const rawSvgPaths = [];
            svgEl.querySelectorAll('path').forEach(p => {
              const d = p.getAttribute('d');
              if (d && d.trim()) rawSvgPaths.push(d.trim());
            });
            svgEl.querySelectorAll('line').forEach(l => {
              const x1 = l.getAttribute('x1') || 0, y1 = l.getAttribute('y1') || 0;
              const x2 = l.getAttribute('x2') || 0, y2 = l.getAttribute('y2') || 0;
              rawSvgPaths.push(`M ${x1} ${y1} L ${x2} ${y2}`);
            });
            svgEl.querySelectorAll('polyline, polygon').forEach(poly => {
              const pts = (poly.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
              if (pts.length >= 4) {
                let d = `M ${pts[0]} ${pts[1]}`;
                for (let i = 2; i < pts.length; i += 2) {
                  if (!isNaN(pts[i]) && !isNaN(pts[i + 1])) d += ` L ${pts[i]} ${pts[i + 1]}`;
                }
                if (poly.tagName.toLowerCase() === 'polygon') d += ' Z';
                rawSvgPaths.push(d);
              }
            });
            svgEl.querySelectorAll('rect').forEach(r => {
              const rx = parseFloat(r.getAttribute('x') || 0);
              const ry = parseFloat(r.getAttribute('y') || 0);
              const rw = parseFloat(r.getAttribute('width') || 0);
              const rh = parseFloat(r.getAttribute('height') || 0);
              if (rw && rh) rawSvgPaths.push(`M ${rx} ${ry} H ${rx + rw} V ${ry + rh} H ${rx} Z`);
            });
            svgEl.querySelectorAll('circle').forEach(c => {
              const cx = parseFloat(c.getAttribute('cx') || 0);
              const cy = parseFloat(c.getAttribute('cy') || 0);
              const cr = parseFloat(c.getAttribute('r') || 0);
              if (cr) rawSvgPaths.push(`M ${cx - cr} ${cy} A ${cr} ${cr} 0 1 0 ${cx + cr} ${cy} A ${cr} ${cr} 0 1 0 ${cx - cr} ${cy} Z`);
            });

            const serialized = new XMLSerializer().serializeToString(svgEl);
            const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);

            const img = new Image();
            img.onload = () => {
              img.rawSvgPaths = rawSvgPaths;
              img.svgWidth = w;
              img.svgHeight = h;
              this.loadedTraceImage = img;
              runImageTrace();
            };
            img.onerror = () => {
              this.showToast('Failed to load SVG for vectorization.', 'error');
            };
            img.src = blobUrl;
          } catch (err) {
            this.showToast(`Error processing SVG: ${err.message}`, 'error');
          }
        } else {
          // Standard raster image (PNG, JPG, WEBP)
          const reader = new FileReader();
          reader.onload = (re) => {
            const img = new Image();
            img.onload = () => {
              this.loadedTraceImage = img;
              runImageTrace();
            };
            img.src = re.target.result;
          };
          reader.readAsDataURL(file);
        }
      }
    });

    [traceThresh, traceStep, traceAlgo, traceInvert, traceDetails].filter(Boolean).forEach(el => {
      el.addEventListener('input', runImageTrace);
      el.addEventListener('change', runImageTrace);
    });

    // Standalone SVG Download Button matching reference tool
    const btnDownloadTraceSvg = document.querySelector('#btn-download-trace-svg');
    if (btnDownloadTraceSvg) {
      btnDownloadTraceSvg.addEventListener('click', () => {
        if (!currentTraceResult || !currentTraceResult.pathData) {
          this.showToast('No vectorized paths available. Upload an image first.', 'warning');
          return;
        }
        const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${currentTraceResult.width || 160} ${currentTraceResult.height || 160}" width="${currentTraceResult.width || 160}mm" height="${currentTraceResult.height || 160}mm">
  <path d="${currentTraceResult.pathData}" fill="none" stroke="#000000" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plot_vector_${traceAlgo.value}.svg`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Downloaded SVG vector file!', 'success');
      });
    }

    document.querySelector('#btn-apply-image-trace').addEventListener('click', () => {
      if (currentTraceResult && currentTraceResult.pathData) {
        if (!this.docPages[this.currentPageIndex]) {
          this.addNewDocPage();
        }
        const curPage = this.docPages[this.currentPageIndex];
        if (!curPage.images) curPage.images = [];

        // If editing an existing vectorized image: update its settings in place
        if (this.editingDocImage) {
          this.editingDocImage.pathData = currentTraceResult.pathData;
          this.editingDocImage.naturalWidth = currentTraceResult.width || 160;
          this.editingDocImage.naturalHeight = currentTraceResult.height || 160;
          this.editingDocImage.height = Math.round(this.editingDocImage.width * (currentTraceResult.height / currentTraceResult.width));
          this.editingDocImage.traceOptions = {
            mode: traceAlgo.value,
            details: traceDetails ? traceDetails.value : 'strong',
            threshold: Number(traceThresh.value),
            step: Number(traceStep.value),
            invert: traceInvert.checked
          };
          if (this.loadedTraceImage) {
            this.editingDocImage.sourceDataUrl = this.loadedTraceImage.src;
          }
          this.editingDocImage = null;
          const btnApply = document.querySelector('#btn-apply-image-trace');
          if (btnApply) btnApply.textContent = 'Add to Document Editor';

          this.renderDocImages();
          this.renderPagesSidebar();
          this.syncDocToArtworkLayer();
          this.updateFileMetricsDisplay();
          this.closeModal('modal-image-trace');
          this.showToast('Vectorized image updated with new settings!', 'success');
          return;
        }

        // Otherwise: Add new vectorized image to document preserving true aspect ratio
        const aspect = (currentTraceResult.width || 1) / (currentTraceResult.height || 1);
        let imgWidth, imgHeight;

        if (aspect >= 1) {
          // Landscape
          imgWidth = Math.min(85, this.paper.width * 0.45);
          imgHeight = Math.max(15, Math.round(imgWidth / aspect));
        } else {
          // Portrait (matches user portrait drawings exactly)
          imgHeight = Math.min(100, this.paper.height * 0.45);
          imgWidth = Math.max(15, Math.round(imgHeight * aspect));
        }

        const curBorder = curPage.borderStyle || this.paper.borderStyle || 'single';
        const margins = BorderManager.getBorderSafeMargins(curBorder, this.paper.borderInset || 12);
        const fileName = (traceFileInput.files && traceFileInput.files[0]) ? traceFileInput.files[0].name : 'vector_drawing.png';

        const newImg = {
          id: 'vimg_' + Date.now(),
          fileName: fileName,
          sourceDataUrl: this.loadedTraceImage ? this.loadedTraceImage.src : null,
          traceOptions: {
            mode: traceAlgo.value,
            details: traceDetails ? traceDetails.value : 'strong',
            threshold: Number(traceThresh.value),
            step: Number(traceStep.value),
            invert: traceInvert.checked
          },
          pathData: currentTraceResult.pathData,
          naturalWidth: currentTraceResult.width || 160,
          naturalHeight: currentTraceResult.height || 160,
          x: Math.round(margins.left + 5),
          y: Math.round(margins.top + 5),
          width: imgWidth,
          height: imgHeight,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
          cropLeft: 0
        };

        curPage.images.push(newImg);
        this.selectedDocImage = newImg;
        this.renderDocImages();
        this.renderPagesSidebar();
        this.syncDocToArtworkLayer();
        this.updateFileMetricsDisplay();

        addRecentFile({
          name: fileName,
          type: 'png',
          date: 'Just now',
          size: `${Math.round(imgWidth)}×${Math.round(imgHeight)}mm`
        });
        this.renderRecentFiles();

        this.closeModal('modal-image-trace');
        this.nav.switchTab('plot');
        const docTab = document.querySelector('#ws-tab-doc');
        if (docTab) docTab.click();
        this.showToast('Vectorized image added to Document Editor! You can resize, drag, or crop it.', 'success');
      }
    });

    // Custom Font Import Modal
    document.querySelector('#btn-settings-upload-font').addEventListener('click', () => {
      this.openModal('modal-add-font');
    });

    const fontFileInput = document.querySelector('#custom-font-file-input');
    const fontNameInput = document.querySelector('#custom-font-name-input');
    let stagedFontFile = null;

    fontFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        stagedFontFile = e.target.files[0];
        fontNameInput.value = stagedFontFile.name.replace(/\.[^/.]+$/, '');
      }
    });

    document.querySelector('#btn-save-custom-font').addEventListener('click', async () => {
      if (!stagedFontFile) {
        this.showToast('Please select a TTF or OTF font file', 'error');
        return;
      }
      try {
        await this.fontManager.importFontFile(stagedFontFile, fontNameInput.value);
        this.populateComposerFontDropdown();
        this.renderSettingsFontTable();
        this.closeModal('modal-add-font');
        this.showToast(`Font "${fontNameInput.value}" saved to IndexedDB & installed!`, 'success');
      } catch (err) {
        this.showToast(`Font installation error: ${err.message}`, 'error');
      }
    });

    // Rename Font Modal Confirm
    document.querySelector('#btn-confirm-rename-font').addEventListener('click', async () => {
      const id = document.querySelector('#rename-font-id').value;
      const newName = document.querySelector('#rename-font-new-name').value;
      if (id && newName) {
        await this.fontManager.renameFont(id, newName);
        this.populateComposerFontDropdown();
        this.renderSettingsFontTable();
        this.closeModal('modal-rename-font');
        this.showToast(`Font renamed to "${newName}"`, 'success');
      }
    });

    // Download G-code
    document.querySelector('#btn-download-gcode').addEventListener('click', () => {
      const text = document.querySelector('#gcode-text-display').value;
      if (!text) return;
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${this.currentFileName.replace(/\.[^/.]+$/, '')}.gcode`;
      a.click();
      this.showToast('G-code file downloaded', 'info');
    });
  }

  // File upload handler with comprehensive validation & error handling
  async handleUploadedFile(file) {
    this.closeModal('modal-import');
    if (!file) return;
    const name = file.name;
    const ext = name.split('.').pop().toLowerCase();

    try {
      if (ext === 'svg') {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
          throw new Error('Invalid SVG file format or syntax error.');
        }
        const hasGeometry = doc.querySelector('path, line, polyline, polygon, rect, circle, ellipse');
        if (!hasGeometry) {
          throw new Error('SVG does not contain any drawable vector shapes or paths.');
        }
        this.currentFileName = name;
        this.currentFileSize = `${Math.round(file.size / 1024)} KB`;
        const pFn = document.querySelector('#plot-filename');
        if (pFn) pFn.textContent = name;
        const pFs = document.querySelector('#plot-file-size');
        if (pFs) pFs.textContent = `Size: ${this.currentFileSize}`;

        const paths = Array.from(doc.querySelectorAll('path')).map(p => p.getAttribute('d')).filter(Boolean);
        const combinedD = paths.join(' ');
        if (combinedD) {
          if (!this.docPages[this.currentPageIndex]) this.addNewDocPage();
          const curPage = this.docPages[this.currentPageIndex];
          if (!curPage.images) curPage.images = [];

          const imgWidth = Math.min(100, this.paper.width * 0.5);
          const imgHeight = Math.round(imgWidth * 0.7);
          const curBorder = curPage.borderStyle || this.paper.borderStyle || 'single';
          const margins = BorderManager.getBorderSafeMargins(curBorder, this.paper.borderInset || 12);

          curPage.images.push({
            id: 'svg_' + Date.now(),
            pathData: combinedD,
            naturalWidth: 200,
            naturalHeight: 140,
            x: Math.round(margins.left + 5),
            y: Math.round(margins.top + 5),
            width: imgWidth,
            height: imgHeight,
            cropTop: 0,
            cropRight: 0,
            cropBottom: 0,
            cropLeft: 0
          });
          this.renderDocImages();
          this.renderPagesSidebar();
          this.syncDocToArtworkLayer();
          const tabDoc = document.querySelector('#ws-tab-doc');
          if (tabDoc) tabDoc.click();
          this.showToast(`Imported SVG onto Document Sheet: ${name}`, 'success');
        }
      } else if (ext === 'dxf') {
        const text = await file.text();
        const pathData = DXFHandler.parse(text);
        if (!pathData) {
          throw new Error('No supported 2D vector entities (LINE, POLYLINE, ARC, CIRCLE) found in DXF.');
        }
        if (!this.docPages[this.currentPageIndex]) this.addNewDocPage();
        const curPage = this.docPages[this.currentPageIndex];
        if (!curPage.images) curPage.images = [];

        const imgWidth = Math.min(100, this.paper.width * 0.5);
        const imgHeight = Math.round(imgWidth * 0.7);
        const curBorder = curPage.borderStyle || this.paper.borderStyle || 'single';
        const margins = BorderManager.getBorderSafeMargins(curBorder, this.paper.borderInset || 12);

        curPage.images.push({
          id: 'dxf_' + Date.now(),
          pathData: pathData,
          naturalWidth: 200,
          naturalHeight: 140,
          x: Math.round(margins.left + 5),
          y: Math.round(margins.top + 5),
          width: imgWidth,
          height: imgHeight,
          cropTop: 0,
          cropRight: 0,
          cropBottom: 0,
          cropLeft: 0
        });
        this.renderDocImages();
        this.renderPagesSidebar();
        this.syncDocToArtworkLayer();
        const tabDoc = document.querySelector('#ws-tab-doc');
        if (tabDoc) tabDoc.click();
        this.currentFileName = name;
        this.showToast(`Imported DXF CAD artwork onto Document Sheet: ${name}`, 'success');
      } else if (ext === 'gcode' || ext === 'nc') {
        const text = await file.text();
        const parsed = this.gcodeParser.parse(text);
        if (!parsed.segments || parsed.segments.length === 0) {
          throw new Error('G-code file contains no valid toolpath motion commands (G0/G1/G2/G3).');
        }
        this.currentFileName = name;
        document.querySelector('#plot-filename').textContent = name;
        this.renderGCodeTab(text, parsed);
        document.querySelector('#ws-tab-gcode').click();
        this.showToast(`Loaded G-code file: ${name}`, 'success');
      } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        this.openModal('modal-image-trace');
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        const traceInp = document.querySelector('#image-trace-file-input');
        traceInp.files = dataTransfer.files;
        traceInp.dispatchEvent(new Event('change'));
      } else if (['ttf', 'otf', 'woff'].includes(ext)) {
        await this.fontManager.importFontFile(file);
        this.populateComposerFontDropdown();
        this.renderSettingsFontTable();
        this.showToast(`Imported Font: ${name}`, 'success');
      } else {
        this.showToast(`Unsupported file format (.${ext}). Supported: SVG, DXF, G-code, PNG/JPG, TTF/OTF.`, 'warning');
      }
    } catch (err) {
      console.error('File import error:', err);
      this.showToast(`Import failed: ${err.message}`, 'error');
    }
  }

  /**
   * CRITICAL CNC RULE ENFORCEMENT & PREFLIGHT
   */
  startPlotWorkflow() {
    if (this.syncDocToArtworkLayer) {
      this.syncDocToArtworkLayer();
    }

    const preflight = this.gcodeGen.runPreflightCheck(this.workspace.artworkLayer, this.paper);
    if (!preflight.passed && preflight.artworkPathCount === 0) {
      this.showToast('Cannot plot: Artwork layer is empty. Add text, borders, or images.', 'error');
      return;
    }

    // Preflight bounds check: Warn user if any artwork element extends beyond paper dimensions
    let outOfBounds = false;
    const elements = Array.from(this.workspace.artworkLayer.children);
    for (const el of elements) {
      try {
        const bbox = el.getBBox();
        const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(el.getAttribute('transform') || '');
        const tx = match ? parseFloat(match[1]) : 0;
        const ty = match ? parseFloat(match[2]) : 0;
        if (tx + bbox.x < 0 || ty + bbox.y < 0 ||
            tx + bbox.x + bbox.width > this.paper.width ||
            ty + bbox.y + bbox.height > this.paper.height) {
          outOfBounds = true;
          break;
        }
      } catch (e) {}
    }

    if (outOfBounds) {
      this.showToast('Notice: Some artwork paths extend outside the physical paper boundary.', 'warning');
    }

    try {
      const { gcode, stats } = this.gcodeGen.generate(this.workspace.artworkLayer, this.paper);
      const parsed = this.gcodeParser.parse(gcode);

      if (!parsed.segments || parsed.segments.length === 0) {
        this.showToast('Plot failed: No motion segments generated from artwork.', 'error');
        return;
      }

      this.showToast(`Preflight passed! Starting plot job (${stats.strokesCount} strokes, ${stats.estimatedTime})`, 'success');
      this.machine.startPlot(parsed.segments, gcode);
    } catch (err) {
      console.error('Plot error:', err);
      this.showToast(`Plot failed: ${err.message}`, 'error');
    }
  }

  generateAndDisplayGCode() {
    if (this.syncDocToArtworkLayer) {
      this.syncDocToArtworkLayer();
    }

    const { gcode, stats, preflight } = this.gcodeGen.generate(this.workspace.artworkLayer, this.paper);
    const parsed = this.gcodeParser.parse(gcode);
    this.renderGCodeTab(gcode, parsed);
  }

  renderGCodeTab(gcodeText, parsed) {
    document.querySelector('#gcode-text-display').value = gcodeText;
    const canvas = document.querySelector('#gcode-preview-canvas');
    this.gcodeParser.renderToCanvas(canvas, this.paper);
  }

  updateFileMetricsDisplay() {
    const metrics = this.workspace.getArtworkMetrics();
    const countEl = document.querySelector('#plot-path-count');
    const timeEl = document.querySelector('#plot-estimated-time');

    if (countEl) countEl.textContent = `Paths: ${metrics.pathCount.toLocaleString()}`;
    if (timeEl) timeEl.textContent = `~ ${metrics.estimatedTime}`;
  }

  updateComposerPreview() {
    const preview = this.textEditor.getVectorPreview();
    const pathEl = document.querySelector('#composer-preview-path');
    if (pathEl && preview) {
      pathEl.setAttribute('d', preview.pathData);
    }
    const badge = document.querySelector('#composer-font-type-badge');
    if (badge && preview) {
      badge.textContent = preview.isSingleLine 
        ? 'Single-Line Stroke Font (Optimal for Plotters - No Hollow Outlines)' 
        : 'Outline Vector Font (Double-Stroked Perimeter Paths)';
    }
  }

  populateComposerFontDropdown() {
    const selects = [
      document.querySelector('#composer-font-select'),
      document.querySelector('#libre-font-select')
    ].filter(Boolean);

    if (selects.length === 0) return;

    const fonts = this.fontManager.getAllFontsList();
    const groups = {};

    fonts.forEach(f => {
      const cat = f.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    });

    selects.forEach(select => {
      select.innerHTML = '';
      for (const cat in groups) {
        const optGroup = document.createElement('optgroup');
        optGroup.label = cat;
        groups[cat].forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.id;
          opt.textContent = f.name;
          optGroup.appendChild(opt);
        });
        select.appendChild(optGroup);
      }
      if (select.id === 'libre-font-select') {
        const curFont = this.docPages[this.currentPageIndex]?.fontId || 'hand_casual';
        select.value = curFont;
      } else {
        select.value = this.textEditor.currentFontId || 'hershey_simplex';
      }
    });
  }

  renderSettingsFontTable() {
    const tbody = document.querySelector('#settings-fonts-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const allFonts = this.fontManager.getAllFontsList();
    allFonts.forEach(f => {
      const tr = document.createElement('tr');
      const isCustom = f.type === 'custom';

      tr.innerHTML = `
        <td><strong>${f.name}</strong></td>
        <td><span class="status-pill ${f.type === 'single-line' ? 'status-ready' : 'status-serial'}">${f.category}</span></td>
        <td>${f.originalName || 'Built-in Asset'}</td>
        <td class="font-actions-cell">
          ${isCustom ? `
            <button class="btn-subtle btn-rename-font" data-id="${f.id}" data-name="${f.name}">Rename</button>
            <button class="btn-subtle btn-delete-font" data-id="${f.id}" style="color: #ef4444;">Delete</button>
          ` : `<span style="color: var(--text-muted); font-size: 11px;">System Default</span>`}
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Bind rename and delete handlers
    tbody.querySelectorAll('.btn-rename-font').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        document.querySelector('#rename-font-id').value = id;
        document.querySelector('#rename-font-new-name').value = name;
        this.openModal('modal-rename-font');
      });
    });

    tbody.querySelectorAll('.btn-delete-font').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this custom font from IndexedDB?')) {
          await this.fontManager.deleteCustomFont(id);
          this.populateComposerFontDropdown();
          this.renderSettingsFontTable();
          this.showToast('Font removed from storage', 'info');
        }
      });
    });
  }

  updateActiveWorkspaceTool(selector) {
    document.querySelectorAll('.ws-action-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(selector).classList.add('active');
  }

  openModal(modalId) {
    const m = document.querySelector(`#${modalId}`);
    if (m) m.style.display = 'flex';
  }

  closeModal(modalId) {
    const m = document.querySelector(`#${modalId}`);
    if (m) m.style.display = 'none';
  }

  logTerminal(text, type = 'info') {
    const log = document.querySelector('#terminal-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${text}`;
    log.appendChild(entry);
    log.scrollTop = log.scrollHeight;
  }

  showToast(message, type = 'info') {
    const container = document.querySelector('#toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  window.plotterApp = app; // Accessible for debugging & testing
});
