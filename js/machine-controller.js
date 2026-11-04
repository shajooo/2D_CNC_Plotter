/**
 * Machine Controller for Pen Plotter CNC
 * Unifies Physical Serial Hardware Control and Virtual Simulation.
 * Provides Jogging, Step-Size configuration, Pen Control, and State Tracking.
 */

import { SerialConnection } from './serial-connection.js';
import { SimulationEngine } from './simulation.js';

export class MachineController {
  constructor(workspace) {
    this.workspace = workspace;
    this.serial = new SerialConnection();
    this.sim = new SimulationEngine(workspace);

    this.isSimulationMode = true; // Enabled by default for immediate safe testing
    this.state = 'Idle'; // 'Idle' | 'Plotting' | 'Paused' | 'Homing'
    this.isConnected = false;
    this.portName = 'COM3 · 115200';

    this.x = 0.00;
    this.y = 0.00;
    this.z = 90.00; // Pen up default
    this.stepSize = 1; // 0.1, 1, 10, 50 mm

    this.penUpAngle = 90;
    this.penDownAngle = 60;
    this.drawingSpeed = 3000;
    this.travelSpeed = 6000;

    this.jobProgress = 0;
    this.estimatedTimeLeft = '--';

    this.listeners = new Set();
    this.bindEvents();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(fn => fn(event, data));
  }

  bindEvents() {
    // Simulation event forwarding
    this.sim.subscribe((event, data) => {
      if (event === 'update') {
        this.x = data.x;
        this.y = data.y;
        this.z = data.z;
        this.jobProgress = data.progress;
        this.estimatedTimeLeft = data.timeLeft;
        this.notify('position_change', { x: this.x, y: this.y, z: this.z });
        this.notify('progress', { progress: this.jobProgress, timeLeft: this.estimatedTimeLeft });
      } else if (event === 'completed') {
        this.state = 'Idle';
        this.notify('job_completed', null);
      } else if (event === 'stopped') {
        this.state = 'Idle';
        this.notify('job_stopped', null);
      }
    });

    // Serial event forwarding
    this.serial.subscribe((event, data) => {
      if (event === 'connected') {
        this.isConnected = true;
        this.portName = `${data.portName} · ${data.baudRate}`;
        this.isSimulationMode = false;
        this.notify('connection_change', { connected: true, port: this.portName });
      } else if (event === 'disconnected') {
        this.isConnected = false;
        this.notify('connection_change', { connected: false });
      } else if (event === 'status') {
        this.x = data.pos.x;
        this.y = data.pos.y;
        this.z = data.pos.z;
        this.notify('position_change', { x: this.x, y: this.y, z: this.z });
      }
    });
  }

  setStepSize(size) {
    this.stepSize = Number(size);
    this.notify('step_size_change', { stepSize: this.stepSize });
  }

  async jog(axis, direction) {
    const delta = this.stepSize * direction;
    if (axis === 'X') {
      this.x = Math.max(0, this.x + delta);
    } else if (axis === 'Y') {
      this.y = Math.max(0, this.y + delta);
    }

    if (this.isSimulationMode || !this.isConnected) {
      // Simulate jog update
      this.notify('position_change', { x: this.x, y: this.y, z: this.z });
    } else {
      // Send GRBL jog command: $J=G91 G21 X... F2000
      const jogFeed = Math.min(3000, this.travelSpeed);
      const cmd = `$J=G91 G21 ${axis}${delta.toFixed(2)} F${jogFeed}`;
      await this.serial.sendCommand(cmd);
    }
  }

  async penUp() {
    this.z = this.penUpAngle;
    if (this.isSimulationMode || !this.isConnected) {
      this.notify('position_change', { x: this.x, y: this.y, z: this.z });
    } else {
      await this.serial.sendCommand(`M3 S${this.penUpAngle}`);
    }
  }

  async penDown() {
    this.z = this.penDownAngle;
    if (this.isSimulationMode || !this.isConnected) {
      this.notify('position_change', { x: this.x, y: this.y, z: this.z });
    } else {
      await this.serial.sendCommand(`M3 S${this.penDownAngle}`);
    }
  }

  async home() {
    this.x = 0.00;
    this.y = 0.00;
    this.z = this.penUpAngle;

    if (this.isSimulationMode || !this.isConnected) {
      this.notify('position_change', { x: 0, y: 0, z: this.z });
    } else {
      await this.serial.sendCommand('$H');
      await this.serial.sendCommand('G92 X0 Y0');
    }
  }

  startPlot(segments, gcodeText) {
    if (this.state === 'Plotting') return;
    this.state = 'Plotting';

    if (this.isSimulationMode || !this.isConnected) {
      this.sim.start(segments);
      this.notify('job_started', { mode: 'simulation' });
    } else {
      // Send G-code through Web Serial line by line
      this.streamGCodeToSerial(gcodeText);
      this.notify('job_started', { mode: 'hardware' });
    }
  }

  pausePlot() {
    if (this.state !== 'Plotting') return;
    this.state = 'Paused';

    if (this.isSimulationMode || !this.isConnected) {
      this.sim.pause();
    } else {
      this.serial.writeDirect('!'); // GRBL Feed Hold immediate character
    }
    this.notify('job_paused', null);
  }

  resumePlot() {
    if (this.state !== 'Paused') return;
    this.state = 'Plotting';

    if (this.isSimulationMode || !this.isConnected) {
      this.sim.resume();
    } else {
      this.serial.writeDirect('~'); // GRBL Cycle Start / Resume immediate character
    }
    this.notify('job_resumed', null);
  }

  stopPlot() {
    this.state = 'Idle';
    if (this.isSimulationMode || !this.isConnected) {
      this.sim.stop();
    } else {
      this.serial.writeDirect('\x18'); // GRBL Soft Reset (Ctrl+X)
      this.penUp();
    }
    this.notify('job_stopped', null);
  }

  async streamGCodeToSerial(gcode) {
    const lines = gcode.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (this.state !== 'Plotting') break;
      const l = lines[i].trim();
      if (!l || l.startsWith(';')) continue;
      await this.serial.sendCommand(l);
      this.jobProgress = Math.round(((i + 1) / lines.length) * 100);
      this.notify('progress', { progress: this.jobProgress });
    }
    this.state = 'Idle';
    this.notify('job_completed', null);
  }
}
