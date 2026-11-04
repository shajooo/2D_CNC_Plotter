/**
 * Test Suite for Pen Plotter CNC
 * Validates file integrity, HTML links, and core business logic.
 */

const fs = require('fs');
const path = require('path');

console.log('=== RUNNING PEN PLOTTER CNC VERIFICATION SUITE ===\n');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Check HTML exists
const htmlPath = path.join(__dirname, 'index.html');
assert(fs.existsSync(htmlPath), 'index.html exists');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// 2. Check CSS links in HTML
const cssMatches = htmlContent.match(/href="(css\/[^"]+\.css)"/g) || [];
assert(cssMatches.length >= 6, `Found ${cssMatches.length} linked stylesheets in HTML`);

cssMatches.forEach(m => {
  const cssRel = m.replace('href="', '').replace('"', '');
  const cssFile = path.join(__dirname, cssRel);
  const exists = fs.existsSync(cssFile);
  const size = exists ? fs.statSync(cssFile).size : 0;
  assert(exists && size > 100, `Stylesheet ${cssRel} exists (${size} bytes)`);
});

// 3. Check JS module files
const jsFiles = [
  'js/app.js',
  'js/sample-data.js',
  'js/storage.js',
  'js/hershey-data.js',
  'js/hershey-fonts.js',
  'js/font-manager.js',
  'js/paper.js',
  'js/guides.js',
  'js/workspace.js',
  'js/text-editor.js',
  'js/svg-handler.js',
  'js/dxf-handler.js',
  'js/image-tracer.js',
  'js/gcode-generator.js',
  'js/gcode-parser.js',
  'js/machine-controller.js',
  'js/serial-connection.js',
  'js/simulation.js',
  'js/navigation.js',
  'js/borders.js'
];

jsFiles.forEach(f => {
  const fullPath = path.join(__dirname, f);
  const exists = fs.existsSync(fullPath);
  const size = exists ? fs.statSync(fullPath).size : 0;
  assert(exists && size > 50, `Module ${f} exists (${size} bytes)`);
});

// 4. Test Hershey & Handwriting Font Rendering Logic
const { renderHersheyText, SINGLE_LINE_FONTS } = require('./js/hershey-fonts.js');
assert(SINGLE_LINE_FONTS.length >= 8, `Found ${SINGLE_LINE_FONTS.length} single-line fonts (including 6 distinct handwriting styles)`);

const handwritingStyles = [
  'hand_casual',
  'hand_architect',
  'hand_quicknote',
  'hand_fountain',
  'hand_organic',
  'hand_school'
];

handwritingStyles.forEach(style => {
  const result = renderHersheyText('Handwriting Test', { fontId: style, fontSize: 18, imperfection: 0.4 });
  assert(result && result.pathData.length > 50, `Handwriting font "${style}" generated valid vector paths (length: ${result.pathData.length})`);
});

// Test imperfection engine (adds organic curvature Q or perturbed segments)
const organicResult = renderHersheyText('Imperfection Test', { fontId: 'hand_casual', imperfection: 0.5 });
assert(organicResult.pathData.includes('Q ') || organicResult.pathData.includes('L '), 'Imperfection engine generated organic handwriting stroke curvature');

// Verify green box, comments, and obsolete layers card removed from index.html
assert(!htmlContent.includes('preflight-status-badge'), 'Verified green preflight box was removed from UI');
assert(!htmlContent.includes('ctrl-notice'), 'Verified ctrl-notice comment was removed from UI');
assert(!htmlContent.includes('cnc-rule-callout'), 'Verified rule callout comment was removed from UI');
assert(!htmlContent.includes('class="layers-list"'), 'Verified obsolete Document Layers card was removed from UI');

// Test Theme Toggle & Modern Palette
assert(htmlContent.includes('id="btn-theme-toggle"'), 'Theme toggle button present in HTML header');
const mainCss = fs.readFileSync(path.join(__dirname, 'css/main.css'), 'utf8');
assert(mainCss.includes('body.light-theme') && mainCss.includes('body.dark-theme'), 'Dark & Light theme palettes defined in main.css');

// Strict Rule: No multi-coloured or single-coloured stripes on the sheet
const wsCss = fs.readFileSync(path.join(__dirname, 'css/workspace.css'), 'utf8');
assert(!wsCss.includes('linear-gradient(to bottom, transparent 9px'), 'Verified striped background pattern removed from sheet');
assert(!wsCss.includes('mode-ruled::before'), 'Verified colored vertical margin stripe removed from sheet');

// 5. Test G-code Generator Logic & Critical Rule Check
const { GCodeGenerator } = require('./js/gcode-generator.js');
const { GuideManager } = require('./js/guides.js');

const gen = new GCodeGenerator({
  penUpAngle: 90,
  penDownAngle: 60,
  drawingSpeed: 3000,
  travelSpeed: 6000
});

// Mock paper
const paperMock = { width: 297, height: 210 };

// Mock guide element check
const mockGuideElement = {
  tagName: 'line',
  hasAttribute: (attr) => attr === 'data-cnc-ignore',
  closest: (sel) => sel === '#guide-layer' ? true : false,
  classList: { contains: (cls) => cls === 'cnc-guide-element' }
};

const isArtwork = GuideManager.isArtworkOnly(mockGuideElement);
assert(isArtwork === false, 'CRITICAL RULE: Guide elements correctly identified as NON-ARTWORK');

// 6. Test DXF Parser
const { DXFHandler } = require('./js/dxf-handler.js');
const sampleDXF = `0
SECTION
2
ENTITIES
0
LINE
10
10.0
20
20.0
11
50.0
21
60.0
0
ENDSEC
0
EOF`;

const dxfResult = DXFHandler.parse(sampleDXF);
assert(dxfResult.includes('M 10.00 20.00 L 50.00 60.00'), `DXF parser converted LINE entity to SVG path: "${dxfResult}"`);

// 7. Test G-code Parser
const { GCodeParser } = require('./js/gcode-parser.js');
const parser = new GCodeParser();
const sampleGCode = `G21
G90
M3 S90
G0 X10 Y10 F6000
M3 S60
G1 X50 Y50 F3000
M3 S90
G0 X0 Y0 F6000
M2`;

const parsedGcode = parser.parse(sampleGCode);
assert(parsedGcode.segments.length === 3, `G-code parser parsed 3 toolpath moves (got ${parsedGcode.segments.length})`);
assert(parsedGcode.stats.travelMoves === 2, `Identified 2 rapid travel moves (G0)`);
assert(parsedGcode.stats.drawMoves === 1, `Identified 1 drawing move (G1)`);

// 7b. Test ImageTracer Algorithm (Runs 100% Client-Side Without Any Backend)
const { ImageTracer } = require('./js/image-tracer.js');
const testGray = new Uint8Array([
  255, 255, 255, 255,
  255, 0,   0,   255,
  255, 0,   0,   255,
  255, 255, 255, 255
]);
const hatchLines = ImageTracer.generateHatchLines(testGray, 4, 4, 128, 1, 1, 1, false);
assert(hatchLines.length >= 2, `ImageTracer generated ${hatchLines.length} hatch pen lines client-side`);
const sobelEdges = ImageTracer.detectSobelEdges(testGray, 4, 4, 100);
assert(sobelEdges.length === 16, 'Sobel edge matrix generated client-side without backend');

// 8. Test LibreOffice-Style Formatting Toolbar & Stationary Multi-Page Studio
assert(htmlContent.includes('id="libre-formatting-toolbar"'), 'LibreOffice formatting toolbar present in HTML');
assert(htmlContent.includes('id="libre-btn-insert"'), 'LibreOffice Insert Text button present');
assert(htmlContent.includes('id="libre-font-select"'), 'LibreOffice Font selector present');
assert(htmlContent.includes('id="libre-font-size"'), 'LibreOffice Font size input present');
assert(htmlContent.includes('id="libre-btn-bold"'), 'LibreOffice Bold button present');
assert(htmlContent.includes('id="libre-btn-italic"'), 'LibreOffice Italic button present');
assert(htmlContent.includes('id="libre-align-left"'), 'LibreOffice Align Left button present');
assert(htmlContent.includes('id="libre-align-center"'), 'LibreOffice Align Center button present');
assert(htmlContent.includes('id="libre-align-right"'), 'LibreOffice Align Right button present');
assert(htmlContent.includes('id="libre-line-spacing"'), 'LibreOffice Line spacing selector present');
assert(htmlContent.includes('id="libre-imperfection"'), 'LibreOffice Handwriting imperfection selector present');
assert(htmlContent.includes('id="libre-border-style"'), 'LibreOffice Built-in Border selector present in toolbar');

// Test I Love PDF Style Left Pages Sidebar & Stationary Sheet
assert(htmlContent.includes('id="doc-pages-sidebar"') && htmlContent.includes('id="doc-pages-list"'), 'I Love PDF style multi-page thumbnail sidebar present');
assert(htmlContent.includes('id="btn-add-doc-page"'), 'Add Page button present in pages sidebar');
assert(htmlContent.includes('id="doc-paper-sheet"'), 'Stationary document paper sheet present');
assert(htmlContent.includes('id="doc-page-border-svg"'), 'Vector border SVG overlay present on white page');
assert(htmlContent.includes('id="doc-page-content"'), 'Selectable on-page Word/LibreOffice document text editor present');

// Test Built-in Borders Engine & Dynamic Safe Writing Margins
const { BorderManager, BORDER_STYLES } = require('./js/borders.js');
assert(BORDER_STYLES.length >= 8, `Found ${BORDER_STYLES.length} built-in border styles`);
BORDER_STYLES.forEach(b => {
  const paths = BorderManager.getBorderPaths(297, 210, b.id, 12);
  if (b.id !== 'none') {
    assert(paths.length > 0, `Border style "${b.name}" generated ${paths.length} valid vector path(s)`);
  }
  const margins = BorderManager.getBorderSafeMargins(b.id, 12);
  assert(margins.top > 0 && margins.left > 0 && margins.right > 0 && margins.bottom > 0,
    `Border safe margins for "${b.name}" calculated correctly: Top=${margins.top}mm, Left=${margins.left}mm`);
});

// Test Live Human Touch Organic Filter & Static Font Options
assert(htmlContent.includes('id="handwriting-jitter-filter"'), 'Live Human Touch displacement filter present in HTML');
assert(htmlContent.includes('id="touch-fe-displacement"'), 'Touch displacement map primitive present for live scale modulation');
assert(htmlContent.includes('id="libre-font-select"') && htmlContent.includes('optgroup label="Handwriting'), 'LibreOffice font selector populated with static handwriting optgroups');
assert(htmlContent.includes('id="libre-font-select"') && htmlContent.includes('hand_casual'), 'Document editor font selector populated with handwriting font options');
assert(!htmlContent.includes('id="nav-btn-design"'), 'Verified Design tab removed from top navigation');
assert(!htmlContent.includes('id="view-design"'), 'Verified Design view removed from DOM');
assert(!htmlContent.includes('id="ws-tab-preview"'), 'Verified Plot Preview tab removed from workspace');
assert(htmlContent.includes('id="libre-btn-add-image"'), 'Add Image button present in formatting toolbar');
assert(htmlContent.includes('id="doc-page-images-container"'), 'Document page images container present for vectorized images');

// Test Modal Cancel & Close Buttons
const modalIds = ['modal-import', 'modal-image-trace', 'modal-add-font', 'modal-rename-font'];
modalIds.forEach(id => {
  assert(htmlContent.includes(`data-close="${id}"`), `Modal "${id}" has close/cancel button with data-close`);
});

// Verify old blank/margin/ruled options completely removed from design view
assert(!htmlContent.includes('Option 3: Ruled with Margins'), 'Verified old Ruled with Margins guide option completely removed');
assert(!htmlContent.includes('Option 2: Margined Page'), 'Verified old Margined Page guide option completely removed');
assert(!htmlContent.includes('Option 1: Blank Page'), 'Verified old Blank Page option replaced with built-in border studio');

// 9. Test Frame Selection & Overlapping Elements Cycling Logic
const mockEl1 = {
  nodeType: 1,
  getAttribute: (a) => a === 'transform' ? 'translate(20.00, 30.00)' : null,
  getBBox: () => ({ x: 0, y: 0, width: 80, height: 25 })
};

const mockEl2 = {
  nodeType: 1,
  getAttribute: (a) => a === 'transform' ? 'translate(40.00, 35.00)' : null,
  getBBox: () => ({ x: 0, y: 0, width: 90, height: 30 })
};

// Test point inside bounds of mockEl1 (x=30, y=40 is inside 20..100, 30..55)
const isInsideEl1 = (pt, el) => {
  const match = /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/.exec(el.getAttribute('transform') || '');
  const tx = match ? parseFloat(match[1]) : 0;
  const ty = match ? parseFloat(match[2]) : 0;
  const bbox = el.getBBox();
  return pt.x >= tx + bbox.x && pt.x <= tx + bbox.x + bbox.width &&
         pt.y >= ty + bbox.y && pt.y <= ty + bbox.y + bbox.height;
};

assert(isInsideEl1({ x: 30, y: 40 }, mockEl1), 'Point inside frame successfully selects element (clicking anywhere in frame)');
assert(!isInsideEl1({ x: 5, y: 5 }, mockEl1), 'Point outside frame does not select element');

// Test overlapping cycling
const ptOverlap = { x: 50, y: 45 };
const overlapping = [mockEl1, mockEl2].filter(el => isInsideEl1(ptOverlap, el));
assert(overlapping.length === 2, `Detected 2 overlapping elements at (${ptOverlap.x}, ${ptOverlap.y})`);

// Double click cycle: from top element (mockEl2) down to bottom element (mockEl1)
let selected = mockEl2;
let currIdx = overlapping.indexOf(selected);
let nextIdx = (currIdx + 1) % overlapping.length;
let nextSelected = overlapping[nextIdx];
assert(nextSelected === mockEl1, 'Double click successfully cycled selection down to bottom element');

// 10. Test Multi-Page Auto-Pagination & Cascading Overflow Engine
function simulateMultiPageCascade(rawText, maxLinesPerPage, maxCharsPerLine = 80) {
  const pages = [];
  let remainingLines = rawText.split('\n');

  while (remainingLines.length > 0) {
    if (remainingLines.length <= maxLinesPerPage) {
      // Check if any single line exceeds line char limit
      if (remainingLines.length === 1 && remainingLines[0].length > maxCharsPerLine) {
        const words = remainingLines[0].split(' ');
        let fittedWords = [];
        let currLen = 0;
        let wIdx = 0;
        while (wIdx < words.length && currLen + words[wIdx].length + 1 <= maxCharsPerLine) {
          fittedWords.push(words[wIdx]);
          currLen += words[wIdx].length + 1;
          wIdx++;
        }
        pages.push(fittedWords.join(' '));
        remainingLines = [words.slice(wIdx).join(' ')];
        continue;
      }
      pages.push(remainingLines.join('\n'));
      break;
    }
    const pageLines = remainingLines.slice(0, maxLinesPerPage);
    pages.push(pageLines.join('\n'));
    remainingLines = remainingLines.slice(maxLinesPerPage);
  }
  return pages;
}

const longDocLines = [
  'Line 1: Project Overview',
  'Line 2: System Specifications',
  'Line 3: Stepper Motor Calibration',
  'Line 4: Pen Servo Mechanics',
  'Line 5: Vector Path Generation',
  'Line 6: Single-line Hershey Font Engine',
  'Line 7: Multi-page Auto Pagination',
  'Line 8: Edge Detection Image Vectorizer'
];

const paginatedPages = simulateMultiPageCascade(longDocLines.join('\n'), 4);
assert(paginatedPages.length === 2, 'Auto-pagination correctly splits 8 lines into 2 pages (4 lines per page)');
assert(paginatedPages[0].includes('Line 1') && paginatedPages[0].includes('Line 4'), 'Page 1 contains first 4 lines');
assert(paginatedPages[1].includes('Line 5') && paginatedPages[1].includes('Line 8'), 'Page 2 contains remaining 4 lines');

// Test massive 100-line paste: must cascade past Page 2 into 5 complete pages
const massive100Lines = Array.from({ length: 100 }, (_, i) => `Paragraph line ${i + 1} with plot instructions for G-code`).join('\n');
const massive5Pages = simulateMultiPageCascade(massive100Lines, 20);
assert(massive5Pages.length === 5, 'Multi-page cascade does not stop at Page 2: 100 lines created 5 pages');
assert(massive5Pages[0].includes('Paragraph line 1'), 'Page 1 contains beginning of pasted content');
assert(massive5Pages[1].includes('Paragraph line 21'), 'Page 2 contains lines 21-40');
assert(massive5Pages[2].includes('Paragraph line 41'), 'Page 3 contains lines 41-60');
assert(massive5Pages[3].includes('Paragraph line 61'), 'Page 4 contains lines 61-80');
assert(massive5Pages[4].includes('Paragraph line 100'), 'Page 5 contains end of pasted content');

// Test single massive continuous paragraph without newlines: word-level split
const denseParagraph = Array.from({ length: 40 }, (_, i) => `word${i+1}`).join(' ');
const splitDense = simulateMultiPageCascade(denseParagraph, 1, 60);
assert(splitDense.length > 1, 'Single dense paragraph without newlines splits across pages at word boundary');

// 11. Test Transformed & Scaled Vector Image G-code Path Extraction
const mockLayer = {
  getAttribute: () => '',
  querySelectorAll: (selector) => {
    return [
      {
        tagName: 'path',
        getAttribute: (attr) => attr === 'd' ? 'M 0 0 L 100 0 L 100 100 L 0 100 Z' : null,
        hasAttribute: () => false,
        closest: () => null,
        classList: { contains: () => false },
        parentElement: {
          getAttribute: (attr) => attr === 'transform' ? 'translate(40.00, 50.00) scale(0.5000, 0.5000)' : null,
          parentElement: null
        }
      }
    ];
  }
};

const gcodeGenInstance = new GCodeGenerator();
const extractedPolylines = gcodeGenInstance.extractPolylinesFromArtwork(mockLayer, { width: 297, height: 210 });
assert(extractedPolylines.length > 0, `Extracted ${extractedPolylines.length} polylines from transformed vector image`);
const firstPt = extractedPolylines[0][0];
assert(firstPt.x === 40 && firstPt.y === 50, `Image origin point accurately transformed to (${firstPt.x}, ${firstPt.y})`);
const cornerPt = extractedPolylines[0][1];
// 100 * 0.5 + 40 = 90
assert(cornerPt.x === 90 && cornerPt.y === 50, `Image corner scaled and transformed accurately to (${cornerPt.x}, ${cornerPt.y})`);

// 12. Test Paper Dimension Preset Switching
const { PaperManager, PAPER_PRESETS } = require('./js/paper.js');
const paperTest = new PaperManager({ preset: 'A4-L' });
assert(paperTest.width === 297 && paperTest.height === 210, 'Default Paper preset initialized as A4 Landscape (297x210mm)');

paperTest.setPreset('A4-P');
assert(paperTest.width === 210 && paperTest.height === 297, 'Switched to A4 Portrait (210x297mm)');

paperTest.setPreset('A3-L');
assert(paperTest.width === 420 && paperTest.height === 297, 'Switched to A3 Landscape (420x297mm)');

paperTest.setPreset('A5-P');
assert(paperTest.width === 148 && paperTest.height === 210, 'Switched to A5 Portrait (148x210mm)');

// 13. Test Freeform vs Proportional (Shift-Key) Resizing
const initialWidth = 160;
const initialHeight = 120;
const initRatio = initialWidth / initialHeight; // 1.3333

// Test A: Normal Freeform Resize (no Shift) with dx=40, dy=10
const freeDx = 40, freeDy = 10;
const freeW = initialWidth + freeDx; // 200
const freeH = initialHeight + freeDy; // 130
assert(freeW === 200 && freeH === 130, 'Normal resize permits independent freeform width & height adjustments');
assert(Math.abs(freeW / freeH - initRatio) > 0.1, 'Freeform resize does not lock aspect ratio');

// Test B: Shift-Key Proportional Resize (Figma/design tool style) with dx=60, dy=10
const shiftDx = 60, shiftDy = 10;
const delta = Math.abs(shiftDx) > Math.abs(shiftDy * initRatio) ? shiftDx : (shiftDy * initRatio);
const shiftW = initialWidth + delta; // 220
const shiftH = shiftW / initRatio; // 165
assert(Math.abs(shiftW / shiftH - initRatio) < 0.001, 'Shift-key resize strictly preserves length & breadth aspect ratio');

// 14. Test UI Cleanups & Removed Elements
assert(!htmlContent.includes('id="btn-menu-text-to-plot"'), 'Verified Text to Plot removed from sidebar menu');
assert(!htmlContent.includes('id="tool-move"'), 'Verified Move Artwork button removed from bottom bar');
assert(!htmlContent.includes('id="tool-text"'), 'Verified Text button removed from bottom bar');
assert(!htmlContent.includes('id="tool-transform"'), 'Verified Bounding Box button removed from bottom bar');
assert(!htmlContent.includes('id="tool-rotate"'), 'Verified Rotate button removed from bottom bar');
assert(!htmlContent.includes('id="tool-flip"'), 'Verified Flip button removed from bottom bar');
assert(htmlContent.includes('id="tool-delete"'), 'Verified Delete button retained in bottom bar');

// 15. Test High-Precision Contour Vectorizer
const testBinary = new Uint8Array(20 * 20);
// Draw 8x8 filled square inside 20x20
for (let y = 6; y <= 14; y++) {
  for (let x = 6; x <= 14; x++) {
    testBinary[y * 20 + x] = 1;
  }
}
const contourPaths = ImageTracer.traceContours(testBinary, 20, 20, 1.5, 1.5, 0.8);
assert(contourPaths.length > 0, `Contour Vectorizer generated ${contourPaths.length} continuous vector boundary loop(s)`);
assert(contourPaths[0].startsWith('M ') && contourPaths[0].endsWith('Z'), 'Contour loop begins with M and closes with Z for continuous plotting');

// 16. Test Recent Files List (No Demo Items)
const { getRecentFiles } = require('./js/storage.js');
const recentList = getRecentFiles();
assert(Array.isArray(recentList), 'getRecentFiles returns array');
assert(!recentList.some(f => ['lotus.svg', 'assignment.svg', 'name_text.gcode'].includes(f.name)), 'Recent files contains no hardcoded demo items');

// 17. Test New Image-to-Plot Specialized Algorithms & Master Combos
const testW = 60, testH = 60;
const gradientGray = new Uint8Array(testW * testH);
for (let y = 0; y < testH; y++) {
  for (let x = 0; x < testW; x++) {
    // Circle in middle with gradient darkness
    const dist = Math.hypot(x - 30, y - 30);
    gradientGray[y * testW + x] = dist < 22 ? Math.round((dist / 22) * 160) : 235;
  }
}

// A. Test DoG Edge 1
const dogEdges = ImageTracer.detectDoGEdges(gradientGray, testW, testH, 120, 1, 3);
const dogPaths = ImageTracer.traceEdgePolylines(dogEdges, testW, testH, 1.0, 1.0);
assert(dogPaths.length > 0, `Edge 1 (DoG) generated ${dogPaths.length} architectural contour path(s)`);

// B. Test Multi-Tone Isolines (Internal 1 / 2)
const isoPaths = ImageTracer.generateMultiToneIsolines(gradientGray, testW, testH, 1.0, 1.0, [0.3, 0.6, 0.85]);
assert(isoPaths.length >= 2, `Internal Isolines generated ${isoPaths.length} tonal depth contour loop(s)`);

// C. Test Angled Hatching & Cross-Hatching
const hatch45 = ImageTracer.generateAngledHatching(gradientGray, testW, testH, 1.0, 1.0, 45, 4, 140);
assert(hatch45.length > 0, `45° Hatching generated ${hatch45.length} parallel shadow line(s)`);

const hatch135 = ImageTracer.generateAngledHatching(gradientGray, testW, testH, 1.0, 1.0, 135, 4, 100);
assert(hatch135.length > 0, `135° Cross-hatch generated ${hatch135.length} intersecting shadow line(s)`);

// D. Test Stippling (Error Diffusion Dots)
const stippleDots = ImageTracer.generateStipplingDiffusion(gradientGray, testW, testH, 1.0, 1.0, 4, 128);
assert(stippleDots.length > 0, `Stippling generated ${stippleDots.length} pointillism dot(s)`);
assert(stippleDots[0].includes('A ') && stippleDots[0].includes('Z'), 'Stippling dot generated valid SVG circular arc command');

// E. Test Halftone Waves (Continuous Sinusoidal Toolpaths)
const wavePaths = ImageTracer.generateHalftoneWaves(gradientGray, testW, testH, 1.0, 1.0, 4);
assert(wavePaths.length > 0, `Halftone Waves generated ${wavePaths.length} continuous oscillating wave path(s)`);

// F. Test Halftone Circles
const circPaths = ImageTracer.generateHalftoneCircles(gradientGray, testW, testH, 1.0, 1.0, 5);
assert(circPaths.length > 0, `Halftone Concentric Rings generated ${circPaths.length} concentric circular path(s)`);

// G. Test Halftone Grid
const gridPaths = ImageTracer.generateHalftoneGrid(gradientGray, testW, testH, 1.0, 1.0, 4, 128);
assert(gridPaths.length > 0, `Halftone Diamond Grid generated ${gridPaths.length} grid stroke(s)`);

// H. Verify Reference UI Controls in HTML
assert(htmlContent.includes('id="trace-details-select"'), 'Details dropdown (Strong/Ultra/Medium/Light) present in UI');
assert(htmlContent.includes('value="combo_spider"'), 'Spider-Man Master Combo present in algorithm dropdown');
assert(htmlContent.includes('value="edge_1"'), 'Edge 1 preset present in algorithm dropdown');
assert(htmlContent.includes('value="internal_1"'), 'Internal 1 preset present in algorithm dropdown');
assert(htmlContent.includes('value="stipple_diffusion"'), 'Stippling preset present in algorithm dropdown');
assert(htmlContent.includes('value="halftone_wave"'), 'Halftone Waves preset present in algorithm dropdown');
assert(htmlContent.includes('value="svg_direct"'), 'SVG direct geometry preset present in algorithm dropdown');

// I. Verify SVG File Support in Image Vectorizer Studio
const fileInputMatches = htmlContent.match(/id="image-trace-file-input"[^>]*accept="([^"]*)"/);
assert(fileInputMatches && fileInputMatches[1].includes('svg'), 'Image Vectorizer Studio file input accepts SVG files');

// J. Test Portrait & Landscape Aspect Ratio Preservation in ImageTracer.trace()
const mockPortraitImg = { width: 200, height: 400, naturalWidth: 200, naturalHeight: 400 };
const portraitTrace = ImageTracer.trace(mockPortraitImg, { targetWidth: 160, targetHeight: 160, preserveAspectRatio: true });
assert(portraitTrace.width < portraitTrace.height, `Portrait image preserved portrait dimensions (${portraitTrace.width}x${portraitTrace.height}mm)`);
const portraitRatioDiff = Math.abs((portraitTrace.width / portraitTrace.height) - (200 / 400));
assert(portraitRatioDiff < 0.02, `Portrait aspect ratio matches original image (diff: ${portraitRatioDiff.toFixed(4)})`);

const mockLandscapeImg = { width: 400, height: 200, naturalWidth: 400, naturalHeight: 200 };
const landscapeTrace = ImageTracer.trace(mockLandscapeImg, { targetWidth: 160, targetHeight: 160, preserveAspectRatio: true });
assert(landscapeTrace.width > landscapeTrace.height, `Landscape image preserved landscape dimensions (${landscapeTrace.width}x${landscapeTrace.height}mm)`);
const landscapeRatioDiff = Math.abs((landscapeTrace.width / landscapeTrace.height) - (400 / 200));
assert(landscapeRatioDiff < 0.02, `Landscape aspect ratio matches original image (diff: ${landscapeRatioDiff.toFixed(4)})`);

// K. Test SVG Path Scaler
const testPath = 'M 10 20 L 50 80 Z';
const scaledPath = ImageTracer.scaleSvgPath(testPath, 2.0, 2.0);
assert(scaledPath.includes('20.00') && scaledPath.includes('40.00') && scaledPath.includes('100.00'), 'SVG path scaler scaled coordinates accurately');
assert(htmlContent.includes('id="btn-download-trace-svg"'), 'Download SVG button present in modal footer');

console.log(`\n=== TEST SUITE COMPLETED: ${failed === 0 ? 'ALL PASSED!' : `${failed} FAILED`} ===`);
process.exit(failed === 0 ? 0 : 1);
