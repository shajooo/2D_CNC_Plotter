/**
 * Sample Data and Presets for Pen Plotter CNC
 * Includes the default Lotus Flower SVG, sample vector designs, and G-code
 */

// Beautiful Lotus flower SVG paths matching the reference image
export const LOTUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="240" height="160">
  <g id="lotus-artwork" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
    <!-- Center Bud Petal -->
    <path d="M 150 78 C 144 95, 140 115, 141 128 C 142 138, 146 142, 150 142 C 154 142, 158 138, 159 128 C 160 115, 156 95, 150 78 Z" />
    <path d="M 150 78 C 148 98, 147 120, 150 142" />
    
    <!-- Inner Petals (Left and Right) -->
    <path d="M 150 78 C 137 84, 128 102, 131 125 C 133 138, 140 145, 146 145 C 144 138, 142 126, 143 115 C 144 100, 148 87, 150 78 Z" />
    <path d="M 150 78 C 163 84, 172 102, 169 125 C 167 138, 160 145, 154 145 C 156 138, 158 126, 157 115 C 156 100, 152 87, 150 78 Z" />

    <!-- Center Upper Tip & Mid Petals -->
    <path d="M 150 58 C 142 70, 136 86, 137 106 C 138 120, 143 130, 150 135 C 157 130, 162 120, 163 106 C 164 86, 158 70, 150 58 Z" />
    
    <!-- Mid-Inner Flaring Petals (Left and Right) -->
    <path d="M 150 58 C 134 72, 122 96, 124 122 C 126 136, 133 146, 140 148 C 132 135, 130 115, 134 94 C 138 78, 145 66, 150 58 Z" />
    <path d="M 150 58 C 166 72, 178 96, 176 122 C 174 136, 167 146, 160 148 C 168 135, 170 115, 166 94 C 162 78, 155 66, 150 58 Z" />

    <!-- Mid High Petals -->
    <path d="M 136 68 C 122 80, 114 100, 118 122 C 121 133, 126 140, 132 144 C 126 132, 125 116, 127 100 C 129 86, 133 76, 136 68 Z" />
    <path d="M 164 68 C 178 80, 186 100, 182 122 C 179 133, 174 140, 168 144 C 174 132, 175 116, 173 100 C 171 86, 167 76, 164 68 Z" />

    <!-- Large Side Petals (Upper Curve Flaring Out) -->
    <path d="M 124 68 C 104 78, 92 98, 95 120 C 97 132, 106 142, 118 146 C 110 134, 108 118, 112 102 C 115 88, 120 78, 124 68 Z" />
    <path d="M 176 68 C 196 78, 208 98, 205 120 C 203 132, 194 142, 182 146 C 190 134, 192 118, 188 102 C 185 88, 180 78, 176 68 Z" />

    <!-- Outer Wide Wing Petals -->
    <path d="M 102 78 C 82 92, 70 112, 74 132 C 77 144, 88 152, 104 154 C 94 142, 92 126, 96 112 C 99 98, 101 88, 102 78 Z" />
    <path d="M 198 78 C 218 92, 230 112, 226 132 C 223 144, 212 152, 196 154 C 206 142, 208 126, 204 112 C 201 98, 199 88, 198 78 Z" />

    <!-- Low Outer Sweeping Petals -->
    <path d="M 82 102 C 64 114, 52 134, 56 150 C 59 160, 72 165, 88 164 C 76 154, 74 140, 78 128 C 81 116, 82 108, 82 102 Z" />
    <path d="M 218 102 C 236 114, 248 134, 244 150 C 241 160, 228 165, 212 164 C 224 154, 226 140, 222 128 C 219 116, 218 108, 218 102 Z" />

    <!-- Lowest Drooping Base Petals -->
    <path d="M 150 142 C 140 152, 134 165, 138 178 C 142 188, 148 190, 150 190 C 152 190, 158 188, 162 178 C 166 165, 160 152, 150 142 Z" />
    <path d="M 150 142 C 132 150, 120 162, 124 176 C 127 186, 136 190, 144 188 C 138 176, 138 164, 144 152 Z" />
    <path d="M 150 142 C 168 150, 180 162, 176 176 C 173 186, 164 190, 156 188 C 162 176, 162 164, 156 152 Z" />

    <!-- Base Pod & Stem -->
    <path d="M 120 172 C 130 182, 140 186, 150 186 C 160 186, 170 182, 180 172" />
    <path d="M 144 188 C 146 194, 148 198, 150 198 C 152 198, 154 194, 156 188" />
  </g>
</svg>`;

export const SAMPLE_FILES = {
  'lotus.svg': {
    name: 'lotus.svg',
    type: 'svg',
    size: '142 KB',
    paths: '1,487',
    estimatedTime: '4 min 32 sec',
    content: LOTUS_SVG
  },
  'assignment.svg': {
    name: 'assignment.svg',
    type: 'svg',
    size: '88 KB',
    paths: '920',
    estimatedTime: '2 min 45 sec',
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="240" height="160">
      <g fill="none" stroke="#ffffff" stroke-width="1.2">
        <rect x="30" y="20" width="240" height="160" rx="6" />
        <circle cx="150" cy="100" r="50" />
        <polygon points="150,55 190,125 110,125" />
        <line x1="30" y1="20" x2="270" y2="180" />
        <line x1="30" y1="180" x2="270" y2="20" />
      </g>
    </svg>`
  },
  'name_text.gcode': {
    name: 'name_text.gcode',
    type: 'gcode',
    size: '45 KB',
    paths: '412',
    estimatedTime: '1 min 18 sec',
    content: `; Pen Plotter CNC - Name Text
G21 ; mm mode
G90 ; absolute
M3 S90 ; Pen Up
G0 X30.0 Y100.0 F6000
M3 S60 ; Pen Down
G1 X30.0 Y130.0 F3000
G1 X45.0 Y100.0 F3000
G1 X60.0 Y130.0 F3000
G1 X60.0 Y100.0 F3000
M3 S90 ; Pen Up
G0 X75.0 Y100.0 F6000
M3 S60 ; Pen Down
G1 X85.0 Y130.0 F3000
G1 X95.0 Y100.0 F3000
M3 S90
G0 X79.0 Y115.0 F6000
M3 S60
G1 X91.0 Y115.0 F3000
M3 S90
G0 X0 Y0 F6000
M5
`
  },
  'sketch.png': {
    name: 'sketch.png',
    type: 'raster',
    size: '210 KB',
    paths: 'Raster Image',
    estimatedTime: 'Convert via Image-to-Plot',
    content: null // Handled via Image-to-plot module
  }
};
