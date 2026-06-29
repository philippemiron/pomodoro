import {
  currentDuration,
  setCurrentDuration,
  getTimerState,
  startTimer,
  pauseTimer,
  resetTimer,
  saveDurationSetting,
} from './timer.js';
import { renderStats } from './analytics.js';
import { playChime } from './audio.js';

const PROGRESS_RING_RADIUS = 80;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS; // ~502.65

export function setupTabs() {
  const tabCalendar = document.getElementById('tab-calendar');
  const tabHourly = document.getElementById('tab-hourly');
  const calendarView = document.getElementById('calendar-view');
  const hourlyView = document.getElementById('hourly-view');
  if (!tabCalendar || !tabHourly) return;

  tabCalendar.addEventListener('click', () => {
    tabCalendar.classList.add('active');
    tabHourly.classList.remove('active');
    calendarView.classList.remove('hidden');
    hourlyView.classList.add('hidden');
  });

  tabHourly.addEventListener('click', () => {
    tabHourly.classList.add('active');
    tabCalendar.classList.remove('active');
    hourlyView.classList.remove('hidden');
    calendarView.classList.add('hidden');
  });
}

export function setupControls() {
  const presetButtons = document.querySelectorAll('.preset-btn');
  const customMinInput = document.getElementById('custom-min');
  const setCustomBtn = document.getElementById('set-custom-btn');
  const modeButtons = document.querySelectorAll('.mode-btn');
  const startPauseBtn = document.getElementById('start-pause-btn');
  const resetBtn = document.getElementById('reset-btn');
  const sessionsPerCycleSelect = document.getElementById('sessions-per-cycle');

  if (sessionsPerCycleSelect) {
    chrome.storage.local.get('sessionsPerCycleSetting', (data) => {
      sessionsPerCycleSelect.value = data.sessionsPerCycleSetting || '4';
    });

    sessionsPerCycleSelect.addEventListener('change', async (e) => {
      const val = parseInt(e.target.value, 10);
      await chrome.storage.local.set({ sessionsPerCycleSetting: val });

      const state = await getTimerState();
      if (state.pomodoroCount >= val) {
        state.pomodoroCount = 0;
        await chrome.storage.local.set({ timerState: state });
      }
      await syncUI();
    });
  }

  // Preset buttons
  presetButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mins = parseInt(btn.dataset.time, 10);
      setCurrentDuration(mins * 60);
      if (customMinInput) customMinInput.value = mins;

      const state = await getTimerState();
      await saveDurationSetting(state.type || 'work', currentDuration);

      if (state.status === 'idle') {
        const newState = { ...state, duration: currentDuration };
        await chrome.storage.local.set({ timerState: newState });
        updateTimerDisplay(currentDuration, currentDuration);
      }
      await syncUI();
    });
  });

  // Set custom duration
  if (setCustomBtn) {
    setCustomBtn.addEventListener('click', async () => {
      let mins = parseInt(customMinInput.value, 10);
      if (isNaN(mins) || mins < 1) mins = 1;
      if (mins > 180) mins = 180;
      customMinInput.value = mins;

      presetButtons.forEach((b) => b.classList.remove('active'));
      setCurrentDuration(mins * 60);

      const state = await getTimerState();
      await saveDurationSetting(state.type || 'work', currentDuration);

      if (state.status === 'idle') {
        const newState = { ...state, duration: currentDuration };
        await chrome.storage.local.set({ timerState: newState });
        updateTimerDisplay(currentDuration, currentDuration);
      }
    });
  }

  // Mode switcher override buttons
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const state = await getTimerState();
      if (state.status !== 'idle') return;

      const mode = btn.dataset.mode;
      const data = await chrome.storage.local.get([
        'workDurationSetting',
        'shortBreakDurationSetting',
        'longBreakDurationSetting',
      ]);

      let duration = 1500;
      if (mode === 'work') duration = data.workDurationSetting || 1500;
      if (mode === 'shortBreak') duration = data.shortBreakDurationSetting || 300;
      if (mode === 'longBreak') duration = data.longBreakDurationSetting || 900;

      setCurrentDuration(duration);

      presetButtons.forEach((b) => {
        if (parseInt(b.dataset.time, 10) === Math.round(duration / 60)) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      if (customMinInput) customMinInput.value = Math.round(duration / 60);

      let nextCount = state.pomodoroCount || 0;

      const settingsData = await chrome.storage.local.get('sessionsPerCycleSetting');
      const sessionsPerCycle = settingsData.sessionsPerCycleSetting || 4;

      if (mode === 'shortBreak') {
        if (nextCount === 0 || nextCount >= sessionsPerCycle) nextCount = 1;
      } else if (mode === 'longBreak') {
        nextCount = 0;
      } else if (mode === 'work') {
        nextCount = 0;
      }

      const newState = {
        status: 'idle',
        type: mode,
        pomodoroCount: nextCount,
        duration: duration,
        startTime: null,
        endTime: null,
        pausedTimeRemaining: null,
      };

      await chrome.storage.local.set({ timerState: newState });
      await syncUI();
    });
  });

  // Start/Pause Button
  if (startPauseBtn) {
    startPauseBtn.addEventListener('click', async () => {
      const state = await getTimerState();
      if (state.status === 'idle' || state.status === 'paused') {
        await startTimer(state);
      } else if (state.status === 'running') {
        await pauseTimer(state);
      }
      await syncUI();
    });
  }

  // Reset Button
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      await resetTimer();
      await syncUI();
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TIMER_COMPLETED') {
      playChime(message.nextState?.type || 'work');
      syncUI();
      renderStats();
    }
  });
}

export async function syncUI() {
  const state = await getTimerState();

  if (state.status === 'idle') {
    setCurrentDuration(state.duration || 1500);
  }

  if (state.type === 'shortBreak' || state.type === 'longBreak') {
    document.body.classList.add('break-mode');
  } else {
    document.body.classList.remove('break-mode');
  }

  const presetButtons = document.querySelectorAll('.preset-btn');
  let presets = [15, 25, 45, 60];
  if (state.type === 'shortBreak') presets = [2, 5, 7, 10];
  if (state.type === 'longBreak') presets = [10, 15, 20, 30];

  presetButtons.forEach((btn, index) => {
    const mins = presets[index];
    btn.dataset.time = mins;
    btn.textContent = `${mins}m`;

    if (Math.round(currentDuration / 60) === mins) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const statusBadge = document.getElementById('status-badge');
  if (statusBadge) {
    statusBadge.className = `status-badge ${state.status}`;
    statusBadge.textContent = state.status;
  }

  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach((btn) => {
    if (btn.dataset.mode === state.type) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const cycleLabel = document.getElementById('cycle-label');
  const cycleSteps = document.getElementById('cycle-steps');
  const settingsData = await chrome.storage.local.get('sessionsPerCycleSetting');
  const sessionsPerCycle = settingsData.sessionsPerCycleSetting || 4;

  const count = state.pomodoroCount || 0;
  if (cycleLabel) {
    if (state.type === 'work') {
      cycleLabel.textContent = `Session ${count + 1} of ${sessionsPerCycle}`;
    } else if (state.type === 'shortBreak') {
      cycleLabel.textContent = 'Short Break';
    } else if (state.type === 'longBreak') {
      cycleLabel.textContent = 'Long Break';
    }
  }

  if (cycleSteps) {
    cycleSteps.innerHTML = '';
    const totalDots = sessionsPerCycle * 2;
    for (let i = 0; i < totalDots; i++) {
      const dot = document.createElement('span');
      dot.className = `step-dot ${i % 2 === 0 ? 'work-dot' : 'break-dot'}`;

      let isActive = false;
      if (state.type === 'longBreak') {
        isActive = true;
      } else if (state.type === 'work') {
        isActive = i <= 2 * count;
      } else {
        isActive = i <= 2 * count - 1;
      }

      if (isActive) dot.classList.add('active');
      cycleSteps.appendChild(dot);
    }
  }

  const timerCircleWrapper = document.querySelector('.timer-circle-wrapper');
  const startPauseBtn = document.getElementById('start-pause-btn');

  if (state.status === 'running') {
    if (timerCircleWrapper) timerCircleWrapper.classList.add('running');
    if (startPauseBtn) {
      startPauseBtn.textContent = 'Pause Session';
      startPauseBtn.className = 'primary-btn paused-theme';
    }

    const timeRemaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
    updateTimerDisplay(timeRemaining, state.duration);
    toggleInputs(false);
  } else if (state.status === 'paused') {
    if (timerCircleWrapper) timerCircleWrapper.classList.remove('running');
    if (startPauseBtn) {
      startPauseBtn.textContent = 'Resume';
      startPauseBtn.className = 'primary-btn';
    }

    updateTimerDisplay(state.pausedTimeRemaining, state.duration);
    toggleInputs(false);
  } else {
    if (timerCircleWrapper) timerCircleWrapper.classList.remove('running');
    if (startPauseBtn) {
      startPauseBtn.textContent = 'Start Session';
      startPauseBtn.className = 'primary-btn';
    }

    updateTimerDisplay(currentDuration, currentDuration);
    toggleInputs(true);
  }
}

export function toggleInputs(enabled) {
  const presetButtons = document.querySelectorAll('.preset-btn');
  const customMinInput = document.getElementById('custom-min');
  const setCustomBtn = document.getElementById('set-custom-btn');
  const modeButtons = document.querySelectorAll('.mode-btn');
  const sessionsPerCycleSelect = document.getElementById('sessions-per-cycle');

  presetButtons.forEach((btn) => (btn.disabled = !enabled));
  if (customMinInput) customMinInput.disabled = !enabled;
  if (setCustomBtn) setCustomBtn.disabled = !enabled;
  if (sessionsPerCycleSelect) sessionsPerCycleSelect.disabled = !enabled;
  modeButtons.forEach((btn) => (btn.disabled = !enabled));
}

export function updateTimerDisplay(remainingSeconds, totalSeconds) {
  const timerDisplay = document.getElementById('timer-display');
  const timerProgress = document.getElementById('timer-progress');
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  if (timerDisplay) {
    timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  if (timerProgress) {
    const progressRatio = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 1;
    const offset = PROGRESS_RING_CIRCUMFERENCE - progressRatio * PROGRESS_RING_CIRCUMFERENCE;
    timerProgress.style.strokeDashoffset = offset;
  }
}
