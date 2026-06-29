import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetChromeMocks } from './setup.js';
import fs from 'fs';
import path from 'path';

let popupModule;

describe('popup.js UI Integration', () => {
  let htmlContent;

  beforeEach(async () => {
    resetChromeMocks();

    // Load popup HTML template
    if (!htmlContent) {
      const htmlPath = path.resolve(__dirname, '../popup/popup.html');
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
    }

    // Strip stylesheet and script links to prevent happy-dom from trying to fetch them
    const cleanHtml = htmlContent
      .replace(/<link rel="stylesheet" href="popup.css"\s*\/>/, '')
      .replace(/<script type="module" src="popup.js"><\/script>/, '');

    // Set happy-dom body content
    document.body.innerHTML = cleanHtml;

    if (!popupModule) {
      popupModule = await import('../popup/popup.js');
    }
  });

  afterEach(() => {
    if (popupModule && popupModule.cleanup) {
      popupModule.cleanup();
    }
  });

  async function executePopupScript() {
    await popupModule.init();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  it('should initialize UI with default idle timer and cycle labels', async () => {
    await chrome.storage.local.set({
      timerState: { status: 'idle', type: 'work', pomodoroCount: 0, duration: 1500 },
    });

    await executePopupScript();

    const timerDisplay = document.getElementById('timer-display');
    expect(timerDisplay.textContent).toBe('25:00');

    const statusBadge = document.getElementById('status-badge');
    expect(statusBadge.textContent).toBe('idle');

    // Cycle Session 1 of 4 step label
    const cycleLabel = document.getElementById('cycle-label');
    expect(cycleLabel.textContent).toBe('Session 1 of 4');

    // Verify dots count
    const dots = document.querySelectorAll('.step-dot');
    expect(dots.length).toBe(8);
    expect(dots[0].className).toContain('active'); // Current session dot is active
    expect(dots[1].className).not.toContain('active');
  });

  it('should change default duration on preset button click', async () => {
    await chrome.storage.local.set({
      timerState: { status: 'idle', type: 'work', pomodoroCount: 0, duration: 1500 },
    });

    await executePopupScript();

    const preset15 = document.querySelector('.preset-btn[data-time="15"]');
    preset15.click();

    await new Promise((resolve) => setTimeout(resolve, 20));

    const timerDisplay = document.getElementById('timer-display');
    expect(timerDisplay.textContent).toBe('15:00');
  });

  it('should transition to running state and create alarm on Start click', async () => {
    await chrome.storage.local.set({
      timerState: { status: 'idle', type: 'work', pomodoroCount: 0, duration: 1500 },
    });

    await executePopupScript();

    const startBtn = document.getElementById('start-pause-btn');
    startBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 20));

    const state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.status).toBe('running');
    expect(state.duration).toBe(1500);
    expect(state.endTime).toBeGreaterThan(Date.now());

    expect(chrome.alarms.create).toHaveBeenCalledWith('pomodoroTimer', { delayInMinutes: 25 });
  });

  it('should pause a running timer on Pause click', async () => {
    await chrome.storage.local.set({
      timerState: {
        status: 'running',
        type: 'work',
        pomodoroCount: 0,
        duration: 1500,
        startTime: Date.now(),
        endTime: Date.now() + 1000 * 1000,
      },
    });

    await executePopupScript();

    const startBtn = document.getElementById('start-pause-btn');
    expect(startBtn.textContent).toBe('Pause Session');
    startBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 20));

    const state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.status).toBe('paused');
    expect(state.pausedTimeRemaining).toBeCloseTo(1000, -1);
    expect(chrome.alarms.clear).toHaveBeenCalledWith('pomodoroTimer');
  });

  it('should render contribution grid containing 35 cells and highlight completed days', async () => {
    await chrome.storage.local.set({
      history: [
        { timestamp: Date.now(), durationMinutes: 25 },
        { timestamp: Date.now() - 24 * 60 * 60 * 1000, durationMinutes: 60 },
      ],
    });

    await executePopupScript();

    const cells = document.querySelectorAll('.contrib-cell');
    expect(cells.length).toBe(35);

    const todayCell = cells[34];
    expect(todayCell.className).toContain('level-1');

    const yesterdayCell = cells[33];
    expect(yesterdayCell.className).toContain('level-3');
  });

  it('should apply break-mode class and set green theme on break status', async () => {
    await chrome.storage.local.set({
      timerState: { status: 'idle', type: 'shortBreak', pomodoroCount: 2, duration: 300 },
    });

    await executePopupScript();

    // Body should have break-mode class
    expect(document.body.className).toContain('break-mode');

    // Label should read Short Break
    const cycleLabel = document.getElementById('cycle-label');
    expect(cycleLabel.textContent).toBe('Short Break');

    // Active dots should highlight up to completed work + break sessions (index 3: Work 1, Break 1, Work 2, Break 2)
    const dots = document.querySelectorAll('.step-dot');
    expect(dots[0].className).toContain('active');
    expect(dots[1].className).toContain('active');
    expect(dots[2].className).toContain('active');
    expect(dots[3].className).toContain('active');
    expect(dots[4].className).not.toContain('active');
  });

  it('should switch mode manually on mode button click', async () => {
    await chrome.storage.local.set({
      timerState: { status: 'idle', type: 'work', pomodoroCount: 1, duration: 1500 },
    });

    await executePopupScript();

    // Click short break mode selector
    const shortBreakModeBtn = document.getElementById('mode-short');
    shortBreakModeBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 20));

    // Storage state type should change to shortBreak, duration 300 (5m), body should have break-mode
    const state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.type).toBe('shortBreak');
    expect(state.duration).toBe(300);
    expect(document.body.className).toContain('break-mode');

    const timerDisplay = document.getElementById('timer-display');
    expect(timerDisplay.textContent).toBe('05:00');
  });
});
