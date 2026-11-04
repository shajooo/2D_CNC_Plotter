# Pen Plotter CNC — Desktop Application UI

A modern desktop-grade web application for controlling 2D CNC pen plotters, engineered with **HTML5, CSS3, and vanilla JavaScript (ES6+)**.

Built to reproduce the industrial dark dark-charcoal and gold aesthetic of professional CNC controller software, while delivering production-ready vector plotting, font management, writing guide isolation, and GRBL hardware communication.

---

## Key Features

### 1. Faithful Industrial Aesthetic
- **Color Palette**: Dark charcoal background (`#0e1013`), lighter panel containers (`#16181d`), sub-cards (`#1c1f26`), and amber/gold accents (`#e5a93c`).
- **Layout Reproduction**:
  - **Top Navigation Bar**: Brand logo, Navigation tabs (`Plot`, `Control`, `Design`, `Settings`), simulation indicator, window controls.
  - **Left Sidebar**: `+ Import` button, feature items (`Image to Plot`, `Text to Plot`, `SVG / DXF`, `G-code`), recent files list, real-time connection status card.
  - **Central Workspace**: Document viewport with calibrated physical metric rulers (mm), zoom/pan controls, bottom transformation tools, paper preset selector.
  - **Plot Settings Panel**: Configurable Pen Up/Down angles, Drawing/Travel speeds, Line accuracy, Plot dimensions, and File Info metrics.
  - **Machine Control Panel**: 5-way directional jog keypad, step-size selector (0.1, 1, 10, 50 mm), immediate pen up/down triggers, and live X, Y, Z readout.
  - **Bottom Action Bar**: Prominent `Start Plot`, `Pause`, `Stop`, `Home`, and real-time job progress bar.

---

### 2. The 3-Layer Architecture & Critical CNC Rule
> **CRITICAL CNC RULE: GUIDES MUST NEVER BE PLOTTED.**  
> Paper margins and horizontal writing lines exist solely to assist users in aligning handwriting. They are logically and physically isolated from the CNC machine.

The application enforces a strict 3-tier layer hierarchy:

| Layer | Name | Plottable? | Purpose |
|---|---|:---:|---|
| **Layer 1** | **Paper Layer** | ❌ No | Background sheet rendering, page dimensions, physical bounds |
| **Layer 2** | **Guide Layer** | ❌ No | Horizontal writing lines, margins, alignment guides, grid lines |
| **Layer 3** | **Artwork Layer** | ✅ **YES** | Converted text strokes, imported SVG/DXF geometry |

- **Preflight Verification**: Before any G-code is generated or sent to the CNC machine, a preflight check inspects every node. Any element inside Layer 1 or Layer 2, or tagged with `data-cnc-ignore="true"`, is strictly rejected.
- **Dedicated Export Pipeline**: Geometry is extracted exclusively from `#artwork-layer`.

---

### 3. Paper Backgrounds & Writing Guides (Section 5)
Switch between three dedicated paper appearance modes without altering your artwork:
1. **Option 1: Blank Page** — Completely blank sheet without guides.
2. **Option 2: Margined Page** — Document-style sheet with adjustable left, right, top, and bottom margins.
3. **Option 3: Ruled Page with Margins** — Notebook-style page with horizontal writing lines, vertical margins, and adjustable line spacing (4–30 mm) for handwriting straightness and consistent baseline alignment.

---

### 4. Text-to-Plot & Font Management (Section 4)
- **True Single-Line Plotter Fonts (Hershey Fonts)**:
  - Bundled vector stroke fonts: *Hershey Simplex*, *Hershey Script*, *Hershey Duplex*, *Hershey Italic*.
  - Unlike ordinary outline fonts, Hershey single-stroke fonts write like real pens—one clean stroke per letter, eliminating hollow outline loops.
- **Custom TTF / OTF Font Import**:
  - Add and install custom TTF/OTF fonts directly in the browser.
  - Persisted locally using browser **IndexedDB** (`PenPlotterCNC_DB`).
  - Customizable display names inside the application without mutating font file metadata.
  - OpenType.js integration extracts exact Bézier vector path curves.
- **System Fonts**:
  - Discovers installed system fonts using the Local Font Access API when permitted, with fallback to standard web typography.

---

### 5. Hardware Communication & Virtual Simulation
- **Web Serial API**:
  - Connects directly to **Arduino UNO + CNC Shield V3** running GRBL 0.9 or 1.1 firmware via USB serial.
  - Configurable baud rates: `115200` (GRBL 1.1), `9600` (GRBL 0.9), `57600`, `250000`.
  - Full MDI Console Terminal for manual G-code commands (`$$`, `$H`, `?`, `$X`, etc.).
  - Real-time coordinate feedback parsed from GRBL status reports (`<Idle|MPos:...>`).
- **High-Fidelity Simulation Mode**:
  - Runs full plotting jobs in the browser without requiring physical hardware.
  - Visual animated pen tip glides across the paper at configured feedrates.
  - Live toolpath tracing, progress percentage, ETA countdown, and pause/resume/stop support.

---

### 6. Import & Vector Processing
- **SVG**: Imports and normalizes paths, polylines, circles, rects, and polygons.
- **DXF**: 2D CAD parser extracting `LINE`, `LWPOLYLINE`, `CIRCLE`, and `ARC` entities.
- **Image-to-Plot**: Raster vectorizer converting PNG/JPG into single-stroke hatch shading or Sobel outline edges with real-time preview sliders.
- **G-code**: Imports existing toolpaths with 2D travel (G0) vs draw (G1) visual differentiation.

---

## Project Structure

```text
2D_CNC_Plotter/
├── index.html                   # Master application document
├── README.md                    # Technical documentation
│
├── css/
│   ├── main.css                 # Color tokens, dark theme, and typography
│   ├── layout.css               # Header, sidebar, and 3-column grid layout
│   ├── components.css           # Gold buttons, inputs with units, and jog keypad
│   ├── workspace.css            # Canvas viewport, rulers, and toolbars
│   ├── design.css               # Paper style selector, writing guides, and composer
│   ├── control.css              # Machine control center, WCS zeroing, and MDI terminal
│   └── modals.css               # Import dropzone and font library dialogs
│
└── js/
    ├── app.js                   # Application bootstrap & coordinator
    ├── navigation.js            # Top tab & sidebar view switching
    ├── workspace.js             # Canvas engine, zoom/pan transforms, and mm rulers
    ├── paper.js                 # Paper size presets & Layer 1 management
    ├── guides.js                # Writing margins, ruled lines & Layer 2 management
    ├── text-editor.js           # Text-to-plot typography & path placement
    ├── font-manager.js          # Font manager (Hershey, IndexedDB TTF/OTF, System)
    ├── hershey-fonts.js         # Single-line stroke rendering engine
    ├── hershey-data.js          # Vector glyph coordinate definitions
    ├── svg-handler.js           # SVG geometry normalizer
    ├── dxf-handler.js           # 2D CAD DXF parser
    ├── image-tracer.js          # Raster-to-plot line hatching & edge tracer
    ├── gcode-generator.js       # Artwork-only toolpath exporter & TSP optimizer
    ├── gcode-parser.js          # Toolpath parser & 2D canvas visualizer
    ├── machine-controller.js    # Unifies serial hardware and virtual simulation
    ├── serial-connection.js     # Web Serial API driver for Arduino/GRBL
    ├── simulation.js            # Virtual plotter kinematics animator
    ├── storage.js               # IndexedDB and LocalStorage persistence
    └── sample-data.js           # Lotus flower SVG, sample files, and G-code
```

---

## How to Run

Because this is a vanilla JavaScript application using ES6 modules and Web Workers / IndexedDB, run it using any static HTTP server:

```bash
# Using Python
python -m http.server 8080

# Or using Node.js / npx
npx serve .
```

Open `http://localhost:8080` in Chrome, Edge, or any modern Chromium-based browser supporting the Web Serial API.
