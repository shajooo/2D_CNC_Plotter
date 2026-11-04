/**
 * G-code Parser and Visualizer for Pen Plotter CNC
 * Parses GRBL-compatible G-code into toolpath segments (G0 rapid vs G1 drawing)
 * and renders high-precision 2D toolpath visualization.
 */

export class GCodeParser {
  constructor() {
    this.segments = [];
    this.bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    this.stats = { totalLines: 0, travelMoves: 0, drawMoves: 0, drawDistance: 0, travelDistance: 0 };
  }

  parse(gcodeString) {
    this.segments = [];
    const lines = gcodeString.split('\n');

    let currentX = 0, currentY = 0, currentZ = 90;
    let isPenDown = false;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let drawDist = 0, travelDist = 0;
    let travelCount = 0, drawCount = 0;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      const commentIdx = line.indexOf(';');
      if (commentIdx !== -1) line = line.substring(0, commentIdx).trim();
      if (!line) continue;

      const words = line.match(/([A-Z])([-+]?[0-9]*\.?[0-9]+)/gi) || [];
      let cmd = null;
      let targetX = currentX;
      let targetY = currentY;
      let targetZ = currentZ;
      let hasMove = false;

      for (const w of words) {
        const letter = w[0].toUpperCase();
        const val = parseFloat(w.substring(1));

        if (letter === 'G') {
          if (val === 0 || val === 1 || val === 2 || val === 3) {
            cmd = `G${val}`;
          }
        } else if (letter === 'M') {
          if (val === 3 || val === 5) {
            cmd = `M${val}`;
          }
        } else if (letter === 'S') {
          // Spindle/servo speed: typically S60 = pen down, S90 = pen up
          if (val <= 75) isPenDown = true;
          else isPenDown = false;
        } else if (letter === 'X') {
          targetX = val;
          hasMove = true;
        } else if (letter === 'Y') {
          targetY = val;
          hasMove = true;
        } else if (letter === 'Z') {
          targetZ = val;
          if (val <= 2) isPenDown = true;
          else isPenDown = false;
          hasMove = true;
        }
      }

      if (hasMove) {
        const segDist = Math.hypot(targetX - currentX, targetY - currentY);
        const isDrawing = cmd === 'G1' || isPenDown;

        if (isDrawing) {
          drawDist += segDist;
          drawCount++;
        } else {
          travelDist += segDist;
          travelCount++;
        }

        minX = Math.min(minX, currentX, targetX);
        minY = Math.min(minY, currentY, targetY);
        maxX = Math.max(maxX, currentX, targetX);
        maxY = Math.max(maxY, currentY, targetY);

        this.segments.push({
          type: isDrawing ? 'draw' : 'travel',
          from: { x: currentX, y: currentY, z: currentZ },
          to: { x: targetX, y: targetY, z: targetZ },
          distance: segDist
        });

        currentX = targetX;
        currentY = targetY;
        currentZ = targetZ;
      }
    }

    this.bounds = {
      minX: minX === Infinity ? 0 : minX,
      minY: minY === Infinity ? 0 : minY,
      maxX: maxX === -Infinity ? 100 : maxX,
      maxY: maxY === -Infinity ? 100 : maxY
    };

    this.stats = {
      totalLines: lines.length,
      travelMoves: travelCount,
      drawMoves: drawCount,
      drawDistance: Math.round(drawDist),
      travelDistance: Math.round(travelDist)
    };

    return {
      segments: this.segments,
      bounds: this.bounds,
      stats: this.stats
    };
  }

  /**
   * Render the toolpaths to a Canvas
   * @param {HTMLCanvasElement} canvas 
   * @param {Object} paperDimensions 
   */
  renderToCanvas(canvas, paperDimensions) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Dark plotter bed background
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, width, height);

    const pad = 24;
    const availW = width - pad * 2;
    const availH = height - pad * 2;

    const paperW = paperDimensions?.width || 297;
    const paperH = paperDimensions?.height || 210;
    const scale = Math.min(availW / paperW, availH / paperH);

    const offsetX = pad + (availW - paperW * scale) / 2;
    const offsetY = pad + (availH - paperH * scale) / 2;

    // Draw paper boundary
    ctx.fillStyle = '#181a1f';
    ctx.strokeStyle = '#323642';
    ctx.lineWidth = 1;
    ctx.fillRect(offsetX, offsetY, paperW * scale, paperH * scale);
    ctx.strokeRect(offsetX, offsetY, paperW * scale, paperH * scale);

    // Draw Segments
    for (const seg of this.segments) {
      const x1 = offsetX + seg.from.x * scale;
      const y1 = offsetY + seg.from.y * scale;
      const x2 = offsetX + seg.to.x * scale;
      const y2 = offsetY + seg.to.y * scale;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);

      if (seg.type === 'travel') {
        // Rapid travel: dotted red/amber line
        ctx.strokeStyle = 'rgba(229, 100, 60, 0.45)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
      } else {
        // Drawing stroke: bright solid white/cyan line
        ctx.strokeStyle = '#e5a93c';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.stroke();
      }
    }
  }
}
