/**
 * Simulation Engine for Pen Plotter CNC
 * High-fidelity virtual plotter execution with visual pen head,
 * real-time toolpath tracing, position readouts, and progress monitoring.
 */

export class SimulationEngine {
  constructor(workspace) {
    this.workspace = workspace;
    this.isRunning = false;
    this.isPaused = false;
    this.segments = [];
    this.currentSegIdx = 0;
    this.segProgress = 0; // 0 to 1 along current segment

    this.currentX = 0;
    this.currentY = 0;
    this.currentZ = 90; // degrees or mm
    this.isPenDown = false;

    this.simSpeedMultiplier = 3.5; // Smooth realistic visual playback
    this.animFrameId = null;
    this.lastTime = 0;

    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(fn => fn(event, data));
  }

  /**
   * Start or restart simulation with parsed G-code segments
   * @param {Array} segments 
   */
  start(segments) {
    this.stop();
    if (!segments || segments.length === 0) return;

    this.segments = segments;
    this.currentSegIdx = 0;
    this.segProgress = 0;
    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();

    // Clear and prepare simulation layer
    this.initSimLayer();
    this.notify('started', { totalSegments: segments.length });

    this.loop = (time) => {
      if (!this.isRunning) return;
      const dt = (time - this.lastTime) / 1000;
      this.lastTime = time;

      if (!this.isPaused) {
        this.update(dt);
      }

      this.animFrameId = requestAnimationFrame(this.loop);
    };

    this.animFrameId = requestAnimationFrame(this.loop);
  }

  pause() {
    this.isPaused = true;
    this.notify('paused', { x: this.currentX, y: this.currentY, z: this.currentZ });
  }

  resume() {
    this.isPaused = false;
    this.lastTime = performance.now();
    this.notify('resumed', { x: this.currentX, y: this.currentY, z: this.currentZ });
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.clearSimPen();
    this.notify('stopped', { x: this.currentX, y: this.currentY, z: this.currentZ });
  }

  initSimLayer() {
    if (!this.workspace.simLayer) return;
    this.workspace.simLayer.innerHTML = `
      <g id="sim-trace-path" fill="none" stroke="#e5a93c" stroke-width="1.2" stroke-linecap="round"></g>
      <g id="sim-pen-head"></g>
    `;
    this.traceGroup = this.workspace.simLayer.querySelector('#sim-trace-path');
    this.penHead = this.workspace.simLayer.querySelector('#sim-pen-head');
  }

  clearSimPen() {
    if (this.workspace.simLayer) {
      this.workspace.simLayer.innerHTML = '';
    }
  }

  update(dt) {
    if (this.currentSegIdx >= this.segments.length) {
      // Completed!
      this.isRunning = false;
      this.notify('completed', { x: this.currentX, y: this.currentY, z: 90 });
      return;
    }

    const seg = this.segments[this.currentSegIdx];
    const dist = Math.max(0.01, seg.distance);
    // Speed in mm/sec
    const speed = (seg.type === 'travel' ? 6000 : 3000) / 60 * this.simSpeedMultiplier;
    const stepDelta = (speed * dt) / dist;

    this.segProgress += stepDelta;

    if (this.segProgress >= 1) {
      // Finished this segment, draw final piece
      if (seg.type === 'draw' && this.traceGroup) {
        this.addTraceSegment(seg.from.x, seg.from.y, seg.to.x, seg.to.y);
      }

      this.currentX = seg.to.x;
      this.currentY = seg.to.y;
      this.currentZ = seg.to.z;
      this.isPenDown = seg.type === 'draw';

      this.currentSegIdx++;
      this.segProgress = 0;
    } else {
      // Intermediate position
      const interpX = seg.from.x + (seg.to.x - seg.from.x) * this.segProgress;
      const interpY = seg.from.y + (seg.to.y - seg.from.y) * this.segProgress;
      
      if (seg.type === 'draw' && this.traceGroup) {
        const prevInterpX = seg.from.x + (seg.to.x - seg.from.x) * Math.max(0, this.segProgress - stepDelta);
        const prevInterpY = seg.from.y + (seg.to.y - seg.from.y) * Math.max(0, this.segProgress - stepDelta);
        this.addTraceSegment(prevInterpX, prevInterpY, interpX, interpY);
      }

      this.currentX = interpX;
      this.currentY = interpY;
      this.currentZ = seg.to.z;
      this.isPenDown = seg.type === 'draw';
    }

    this.renderPenHead();

    const progressPct = Math.min(100, (this.currentSegIdx / this.segments.length) * 100);
    const remSegs = this.segments.length - this.currentSegIdx;
    const estSec = Math.round(remSegs * 0.15);
    const mins = Math.floor(estSec / 60);
    const secs = estSec % 60;

    this.notify('update', {
      x: this.currentX,
      y: this.currentY,
      z: this.isPenDown ? 60 : 90,
      progress: progressPct,
      timeLeft: `${mins}m ${secs}s`,
      isPenDown: this.isPenDown
    });
  }

  addTraceSegment(x1, y1, x2, y2) {
    if (!this.traceGroup) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1.toFixed(2));
    line.setAttribute('y1', y1.toFixed(2));
    line.setAttribute('x2', x2.toFixed(2));
    line.setAttribute('y2', y2.toFixed(2));
    this.traceGroup.appendChild(line);
  }

  renderPenHead() {
    if (!this.penHead) return;
    const x = this.currentX;
    const y = this.currentY;
    const ringColor = this.isPenDown ? '#22c55e' : '#e5a93c';
    const coreColor = this.isPenDown ? '#ffffff' : '#888888';

    this.penHead.innerHTML = `
      <circle cx="${x}" cy="${y}" r="3.5" fill="none" stroke="${ringColor}" stroke-width="0.8" opacity="0.8"/>
      <circle cx="${x}" cy="${y}" r="1.2" fill="${coreColor}"/>
      <line x1="${x - 5}" y1="${y}" x2="${x + 5}" y2="${y}" stroke="${ringColor}" stroke-width="0.4" opacity="0.6"/>
      <line x1="${x}" y1="${y - 5}" x2="${x}" y2="${y + 5}" stroke="${ringColor}" stroke-width="0.4" opacity="0.6"/>
    `;
  }
}
