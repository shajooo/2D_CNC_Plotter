/**
 * Navigation and View Controller for Pen Plotter CNC
 * Handles switching between Plot, Control, Design, and Settings tabs,
 * and manages sidebar tool activations and modals.
 */

export class NavigationManager {
  constructor() {
    this.currentTab = 'plot'; // 'plot' | 'control' | 'design' | 'settings'
    this.listeners = new Set();
    this.bindEvents();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this.currentTab));
  }

  bindEvents() {
    // Top navigation buttons
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) this.switchTab(tab);
      });
    });
  }

  switchTab(tabName) {
    if (tabName === 'design') tabName = 'plot';
    if (this.currentTab === tabName) return;
    this.currentTab = tabName;

    // Update active nav button styling
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update main view panels
    const views = document.querySelectorAll('.app-main-view');
    views.forEach(view => {
      if (view.id === `view-${tabName}`) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    this.notify();
  }
}
