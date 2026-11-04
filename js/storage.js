/**
 * Storage Module for Pen Plotter CNC
 * Handles IndexedDB for persistent custom font files (TTF/OTF)
 * and LocalStorage for application settings and recent file history.
 */

const DB_NAME = 'PenPlotterCNC_DB';
const DB_VERSION = 1;
const FONT_STORE = 'custom_fonts';

let dbInstance = null;

export async function initStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      console.error('IndexedDB open error:', e);
      resolve(null); // Non-blocking fallback
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(FONT_STORE)) {
        const store = db.createObjectStore(FONT_STORE, { keyPath: 'id' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * Save a custom imported font into IndexedDB
 * @param {Object} fontRecord - { id, name, originalName, format, dataBuffer or dataUrl, createdAt }
 */
export async function saveFont(fontRecord) {
  if (!dbInstance) await initStorage();
  if (!dbInstance) return false;

  return new Promise((resolve, reject) => {
    try {
      const tx = dbInstance.transaction(FONT_STORE, 'readwrite');
      const store = tx.objectStore(FONT_STORE);
      const req = store.put(fontRecord);
      req.onsuccess = () => resolve(true);
      req.onerror = (err) => {
        console.error('Failed to save font:', err);
        resolve(false);
      };
    } catch (err) {
      console.error('Error in saveFont:', err);
      resolve(false);
    }
  });
}

/**
 * Get all custom imported fonts from IndexedDB
 */
export async function getAllFonts() {
  if (!dbInstance) await initStorage();
  if (!dbInstance) return [];

  return new Promise((resolve) => {
    try {
      const tx = dbInstance.transaction(FONT_STORE, 'readonly');
      const store = tx.objectStore(FONT_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (err) {
      console.error('Error in getAllFonts:', err);
      resolve([]);
    }
  });
}

/**
 * Rename an imported font's display name without altering the file
 * @param {string} id 
 * @param {string} newDisplayName 
 */
export async function renameFont(id, newDisplayName) {
  if (!dbInstance) await initStorage();
  if (!dbInstance) return false;

  return new Promise((resolve) => {
    try {
      const tx = dbInstance.transaction(FONT_STORE, 'readwrite');
      const store = tx.objectStore(FONT_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (!item) return resolve(false);
        item.name = newDisplayName;
        store.put(item);
        resolve(true);
      };
      req.onerror = () => resolve(false);
    } catch (err) {
      console.error('Error in renameFont:', err);
      resolve(false);
    }
  });
}

/**
 * Delete an imported font by ID
 * @param {string} id 
 */
export async function deleteFont(id) {
  if (!dbInstance) await initStorage();
  if (!dbInstance) return false;

  return new Promise((resolve) => {
    try {
      const tx = dbInstance.transaction(FONT_STORE, 'readwrite');
      const store = tx.objectStore(FONT_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (err) {
      console.error('Error in deleteFont:', err);
      resolve(false);
    }
  });
}

// LocalStorage helpers for application settings
export function getSettings(key, defaultVal) {
  try {
    const val = localStorage.getItem(`cnc_${key}`);
    return val ? JSON.parse(val) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

export function saveSettings(key, value) {
  try {
    localStorage.setItem(`cnc_${key}`, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export function getRecentFiles() {
  const files = getSettings('recent_files', []);
  // Filter out any legacy hardcoded demo files so only user-added files appear
  const demoNames = ['lotus.svg', 'assignment.svg', 'name_text.gcode', 'sketch.png'];
  return files.filter(f => f && f.name && !demoNames.includes(f.name));
}

export function addRecentFile(file) {
  const current = getRecentFiles().filter(f => f.name !== file.name);
  current.unshift({
    name: file.name,
    type: file.type || 'svg',
    date: 'Just now',
    size: file.size || '10 KB'
  });
  if (current.length > 8) current.pop();
  saveSettings('recent_files', current);
}
