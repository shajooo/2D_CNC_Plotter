/**
 * Web Serial Communication Layer for Pen Plotter CNC
 * Connects directly to Arduino UNO + CNC Shield running GRBL firmware.
 */

export class SerialConnection {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.isConnected = false;
    this.isSupported = typeof navigator !== 'undefined' && 'serial' in navigator;
    this.baudRate = 115200; // GRBL 1.1 default
    this.portName = 'COM3';

    this.commandQueue = [];
    this.isSending = false;
    this.listeners = new Set();
    this.pollInterval = null;

    if (this.isSupported) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (this.port && (event.port === this.port || !this.port.readable)) {
          this.disconnect();
          this.notify('disconnected', { reason: 'Hardware USB unplugged or disconnected.' });
          this.notify('error', { message: 'Hardware connection lost: Serial device unplugged.' });
        }
      });
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(fn => fn(event, data));
  }

  async connect(baud = 115200) {
    if (!this.isSupported) {
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera, or enable Simulation Mode.');
    }

    try {
      this.baudRate = Number(baud);
      this.port = await navigator.serial.requestPort();
      await this.port.open({
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 2048
      });

      this.isConnected = true;
      const portInfo = this.port.getInfo();
      this.portName = portInfo.usbVendorId ? `USB (VID:0x${portInfo.usbVendorId.toString(16)})` : 'Serial Port';

      this.startReading();
      this.startStatusPolling();
      this.notify('connected', { portName: this.portName, baudRate: this.baudRate });
      return true;
    } catch (err) {
      this.isConnected = false;
      let friendlyMsg = err.message;
      if (err.name === 'NotFoundError') {
        friendlyMsg = 'Port selection was cancelled.';
      } else if (err.name === 'InvalidStateError') {
        friendlyMsg = 'Serial port is already in use by another application.';
      } else if (err.name === 'NetworkError') {
        friendlyMsg = 'Failed to open serial port. Verify permissions and USB connection.';
      }
      this.notify('error', { message: friendlyMsg });
      throw new Error(friendlyMsg);
    }
  }

  async disconnect() {
    this.stopStatusPolling();
    this.isConnected = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
        this.reader.releaseLock();
      } catch (e) {}
      this.reader = null;
    }

    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (e) {}
      this.writer = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {}
      this.port = null;
    }

    this.notify('disconnected', null);
  }

  async startReading() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    let buffer = '';
    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop(); // keep partial

          for (const line of lines) {
            const clean = line.trim();
            if (clean) {
              this.handleIncomingLine(clean);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Serial read error:', err);
    }
  }

  handleIncomingLine(line) {
    this.notify('data', { line });

    // Parse GRBL Real-time Status: <Idle|MPos:0.000,0.000,0.000|FS:0,0>
    if (line.startsWith('<') && line.endsWith('>')) {
      this.parseGrblStatus(line);
      return;
    }

    // Acknowledge command finished
    if (line === 'ok' || line.startsWith('error:')) {
      if (this.onCommandAck) {
        this.onCommandAck(line);
      }
    }
  }

  parseGrblStatus(statusStr) {
    const content = statusStr.slice(1, -1);
    const parts = content.split('|');
    const state = parts[0];
    let pos = { x: 0, y: 0, z: 0 };

    for (let i = 1; i < parts.length; i++) {
      if (parts[i].startsWith('MPos:') || parts[i].startsWith('WPos:')) {
        const coords = parts[i].substring(5).split(',').map(Number);
        pos = { x: coords[0] || 0, y: coords[1] || 0, z: coords[2] || 0 };
        break;
      }
    }

    this.notify('status', { state, pos });
  }

  startStatusPolling() {
    this.stopStatusPolling();
    // GRBL '?' character queries status without newline
    this.pollInterval = setInterval(() => {
      if (this.isConnected && !this.isSending) {
        this.writeDirect('?');
      }
    }, 250);
  }

  stopStatusPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async writeDirect(text) {
    if (!this.isConnected || !this.port || !this.port.writable) return;
    try {
      const encoder = new TextEncoder();
      const writer = this.port.writable.getWriter();
      await writer.write(encoder.encode(text));
      writer.releaseLock();
    } catch (e) {
      console.error('Serial writeDirect error:', e);
    }
  }

  async sendCommand(cmd) {
    if (!this.isConnected) return false;
    return new Promise(async (resolve) => {
      this.onCommandAck = (res) => {
        this.onCommandAck = null;
        resolve(res);
      };
      await this.writeDirect(cmd + '\n');
      this.notify('command_sent', { cmd });
    });
  }
}
