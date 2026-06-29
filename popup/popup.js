import { setupTabs, setupControls, syncUI } from './ui.js';
import { renderStats } from './analytics.js';

let updateInterval = null;

export async function init() {
  setupTabs();
  setupControls();
  await syncUI();
  updateInterval = setInterval(syncUI, 500);
  await renderStats();
}

export function cleanup() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

document.addEventListener('DOMContentLoaded', init);
