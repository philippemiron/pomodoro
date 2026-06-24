// Popup script for Pomodoro browser extension

const ALARM_NAME = 'pomodoroTimer';
const PROGRESS_RING_RADIUS = 90;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS; // ~565.48

// UI Elements
const timerDisplay = document.getElementById('timer-display');
const timerProgress = document.getElementById('timer-progress');
const statusBadge = document.getElementById('status-badge');
const startPauseBtn = document.getElementById('start-pause-btn');
const resetBtn = document.getElementById('reset-btn');
const presetButtons = document.querySelectorAll('.preset-btn');
const customMinInput = document.getElementById('custom-min');
const setCustomBtn = document.getElementById('set-custom-btn');
const timerCircleWrapper = document.querySelector('.timer-circle-wrapper');

// Cycle indicators & mode buttons
const cycleLabel = document.getElementById('cycle-label');
const stepDots = document.querySelectorAll('.step-dot');
const modeButtons = document.querySelectorAll('.mode-btn');

// Tabs
const tabCalendar = document.getElementById('tab-calendar');
const tabHourly = document.getElementById('tab-hourly');
const calendarView = document.getElementById('calendar-view');
const hourlyView = document.getElementById('hourly-view');

// Grids & Stats
const contributionGrid = document.getElementById('contribution-grid');
const hourlyGrid = document.getElementById('hourly-grid');
const selectedDayStats = document.getElementById('selected-day-stats');
const hourlyCellStats = document.getElementById('hourly-cell-stats');
const hourlyViewTitle = document.getElementById('hourly-view-title');

// Local state
let currentDuration = 1500; // in seconds (25 mins default)
let updateInterval = null;
let selectedDateStr = formatDate(new Date());

document.addEventListener('DOMContentLoaded', async () => {
  // Setup tabs
  setupTabs();

  // Setup control listeners
  setupControls();

  // Initial UI sync
  await syncUI();

  // Start periodic UI updates
  updateInterval = setInterval(syncUI, 500);

  // Initial stats render
  await renderStats();
});

// Setup Tab switching
function setupTabs() {
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

// Helper to save setting based on type
async function saveDurationSetting(type, duration) {
  const key = type === 'work' ? 'workDurationSetting' :
              type === 'shortBreak' ? 'shortBreakDurationSetting' :
              'longBreakDurationSetting';
  await chrome.storage.local.set({ [key]: duration });
}

// Setup Event Listeners
function setupControls() {
  // Preset buttons
  presetButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const mins = parseInt(btn.dataset.time, 10);
      currentDuration = mins * 60;
      customMinInput.value = mins;

      const state = await getTimerState();
      await saveDurationSetting(state.type || 'work', currentDuration);

      // Update timer display immediately if idle
      if (state.status === 'idle') {
        const newState = {
          ...state,
          duration: currentDuration
        };
        await chrome.storage.local.set({ timerState: newState });
        updateTimerDisplay(currentDuration, currentDuration);
      }
      await syncUI();
    });
  });

  // Set custom duration
  setCustomBtn.addEventListener('click', async () => {
    let mins = parseInt(customMinInput.value, 10);
    if (isNaN(mins) || mins < 1) mins = 1;
    if (mins > 180) mins = 180;
    customMinInput.value = mins;

    presetButtons.forEach(b => b.classList.remove('active'));
    currentDuration = mins * 60;

    const state = await getTimerState();
    await saveDurationSetting(state.type || 'work', currentDuration);

    if (state.status === 'idle') {
      const newState = {
        ...state,
        duration: currentDuration
      };
      await chrome.storage.local.set({ timerState: newState });
      updateTimerDisplay(currentDuration, currentDuration);
    }
  });

  // Mode switcher override buttons
  modeButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const state = await getTimerState();
      if (state.status !== 'idle') return; // Can only switch modes when idle

      const mode = btn.dataset.mode;
      const data = await chrome.storage.local.get([
        'workDurationSetting',
        'shortBreakDurationSetting',
        'longBreakDurationSetting'
      ]);

      let duration = 1500; // default 25m
      if (mode === 'work') duration = data.workDurationSetting || 1500;
      if (mode === 'shortBreak') duration = data.shortBreakDurationSetting || 300;
      if (mode === 'longBreak') duration = data.longBreakDurationSetting || 900;

      currentDuration = duration;

      // Update preset selection highlights
      presetButtons.forEach(b => {
        if (parseInt(b.dataset.time, 10) === duration / 60) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
      customMinInput.value = duration / 60;

      let nextCount = state.pomodoroCount || 0;
      if (mode === 'shortBreak') {
        if (nextCount === 0 || nextCount >= 4) nextCount = 1;
      } else if (mode === 'longBreak') {
        nextCount = 0;
      } else if (mode === 'work') {
        if (nextCount >= 4) nextCount = 0;
      }

      const newState = {
        status: 'idle',
        type: mode,
        pomodoroCount: nextCount,
        duration: duration,
        startTime: null,
        endTime: null,
        pausedTimeRemaining: null
      };

      await chrome.storage.local.set({ timerState: newState });
      await syncUI();
    });
  });

  // Start/Pause Button
  startPauseBtn.addEventListener('click', async () => {
    const state = await getTimerState();
    if (state.status === 'idle' || state.status === 'paused') {
      await startTimer(state);
    } else if (state.status === 'running') {
      await pauseTimer(state);
    }
    await syncUI();
  });

  // Reset Button
  resetBtn.addEventListener('click', async () => {
    await resetTimer();
    await syncUI();
  });

  // Listen to message updates from background (e.g. completion)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TIMER_COMPLETED') {
      playChime(message.nextState?.type || 'work');
      syncUI();
      renderStats();
    }
  });
}

// Get timer state helper
async function getTimerState() {
  const data = await chrome.storage.local.get('timerState');
  return data.timerState || { status: 'idle', type: 'work', pomodoroCount: 0, duration: 1500 };
}

// Start Timer
async function startTimer(state) {
  let timeRemaining = currentDuration;
  if (state.status === 'paused' && state.pausedTimeRemaining !== null) {
    timeRemaining = state.pausedTimeRemaining;
  } else {
    state.duration = currentDuration;
  }

  const endTime = Date.now() + timeRemaining * 1000;
  const newState = {
    status: 'running',
    type: state.type || 'work',
    pomodoroCount: state.pomodoroCount || 0,
    duration: state.duration,
    startTime: state.status === 'paused' ? state.startTime : Date.now(),
    endTime: endTime,
    pausedTimeRemaining: null
  };

  await chrome.storage.local.set({ timerState: newState });
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: timeRemaining / 60 });

  // Update Action Badge
  await chrome.action.setBadgeText({ text: 'ON' });
  if (state.type === 'work') {
    await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green
  }
}

// Pause Timer
async function pauseTimer(state) {
  await chrome.alarms.clear(ALARM_NAME);
  const timeRemaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));

  const newState = {
    status: 'paused',
    type: state.type || 'work',
    pomodoroCount: state.pomodoroCount || 0,
    duration: state.duration,
    startTime: state.startTime,
    endTime: null,
    pausedTimeRemaining: timeRemaining
  };

  await chrome.storage.local.set({ timerState: newState });
  await chrome.action.setBadgeText({ text: 'II' });
  await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' }); // Amber
}

// Reset Timer & Cycle
async function resetTimer() {
  await chrome.alarms.clear(ALARM_NAME);

  // Load saved setting to restore work duration
  const data = await chrome.storage.local.get('workDurationSetting');
  const workDuration = data.workDurationSetting || 1500;

  currentDuration = workDuration;

  const newState = {
    status: 'idle',
    type: 'work',
    pomodoroCount: 0,
    duration: workDuration,
    startTime: null,
    endTime: null,
    pausedTimeRemaining: null
  };
  await chrome.storage.local.set({ timerState: newState });
  await chrome.action.setBadgeText({ text: '' });
}

// Synchronize UI elements with actual state
async function syncUI() {
  const state = await getTimerState();

  // Handle local state override in idle
  if (state.status === 'idle') {
    currentDuration = state.duration || 1500;
  }

  // Update Body Theme Mode (Work vs Break)
  if (state.type === 'shortBreak' || state.type === 'longBreak') {
    document.body.classList.add('break-mode');
  } else {
    document.body.classList.remove('break-mode');
  }

  // Update Preset Button values dynamically based on active mode
  let presets = [15, 25, 45, 60]; // Work defaults
  if (state.type === 'shortBreak') presets = [2, 5, 7, 10];
  if (state.type === 'longBreak') presets = [10, 15, 20, 30];

  presetButtons.forEach((btn, index) => {
    const mins = presets[index];
    btn.dataset.time = mins;
    btn.textContent = `${mins}m`;

    // Highlight if active
    if (Math.round(currentDuration / 60) === mins) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update Status Badge
  statusBadge.className = `status-badge ${state.status}`;
  statusBadge.textContent = state.status;

  // Update Mode buttons active state
  modeButtons.forEach(btn => {
    if (btn.dataset.mode === state.type) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update Step Indicator Label and Dots
  const count = state.pomodoroCount || 0;
  if (state.type === 'work') {
    cycleLabel.textContent = `Session ${count + 1} of 4`;
  } else if (state.type === 'shortBreak') {
    cycleLabel.textContent = 'Short Break';
  } else if (state.type === 'longBreak') {
    cycleLabel.textContent = 'Long Break';
  }

  stepDots.forEach((dot, index) => {
    let isActive = false;
    if (state.type === 'longBreak') {
      isActive = true;
    } else if (state.type === 'work') {
      isActive = index <= 2 * count;
    } else {
      // shortBreak
      isActive = index <= 2 * count - 1;
    }

    if (isActive) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  if (state.status === 'running') {
    timerCircleWrapper.classList.add('running');
    startPauseBtn.textContent = 'Pause Session';
    startPauseBtn.className = 'primary-btn paused-theme';

    const timeRemaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
    updateTimerDisplay(timeRemaining, state.duration);

    toggleInputs(false);
  } else if (state.status === 'paused') {
    timerCircleWrapper.classList.remove('running');
    startPauseBtn.textContent = 'Resume';
    startPauseBtn.className = 'primary-btn';

    updateTimerDisplay(state.pausedTimeRemaining, state.duration);
    toggleInputs(false);
  } else {
    timerCircleWrapper.classList.remove('running');
    startPauseBtn.textContent = 'Start Session';
    startPauseBtn.className = 'primary-btn';

    updateTimerDisplay(currentDuration, currentDuration);
    toggleInputs(true);
  }
}

// Play premium chime sound using Web Audio API synthesis
function playChime(nextType) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    if (nextType === 'work') {
      // Focused beep-beep chime for Work starting
      [880, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.15);
        gain.gain.setValueAtTime(0.3, now + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.1);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.12);
      });
    } else {
      // Upward arpeggio chime for Break starting (Relaxing)
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        gain.gain.setValueAtTime(0.25, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.4);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.45);
      });
    }
  } catch (err) {
    console.error('Audio playback failed:', err);
  }
}

// Toggle disable state of inputs
function toggleInputs(enabled) {
  presetButtons.forEach(btn => btn.disabled = !enabled);
  customMinInput.disabled = !enabled;
  setCustomBtn.disabled = !enabled;
  modeButtons.forEach(btn => btn.disabled = !enabled);
}

// Update physical countdown digits and SVG progress bar
function updateTimerDisplay(remainingSeconds, totalSeconds) {
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const progressRatio = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 1;
  const offset = PROGRESS_RING_CIRCUMFERENCE - (progressRatio * PROGRESS_RING_CIRCUMFERENCE);
  timerProgress.style.strokeDashoffset = offset;
}

// RENDER ANALYTICS
async function renderStats() {
  const data = await chrome.storage.local.get('history');
  const history = data.history || [];

  renderCalendarGrid(history);
  renderHourlyGrid(history, selectedDateStr);
}

// Render the 35 contribution cells (5 weeks * 7 days)
function renderCalendarGrid(history) {
  contributionGrid.innerHTML = '';

  const dates = [];
  const today = new Date();

  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d);
  }

  const dailyTotals = {};
  history.forEach(session => {
    const dStr = formatDate(new Date(session.timestamp));
    dailyTotals[dStr] = (dailyTotals[dStr] || 0) + session.durationMinutes;
  });

  dates.forEach(date => {
    const dStr = formatDate(date);
    const totalMins = dailyTotals[dStr] || 0;

    const cell = document.createElement('div');
    cell.className = `contrib-cell ${getLevelClass(totalMins)}`;
    cell.dataset.date = dStr;
    cell.dataset.mins = totalMins;

    if (dStr === selectedDateStr) {
      cell.classList.add('selected');
    }

    cell.addEventListener('mouseenter', () => {
      selectedDayStats.textContent = `${totalMins} min on ${formatFriendlyDate(date)}`;
    });

    cell.addEventListener('mouseleave', () => {
      const selectedDate = new Date(selectedDateStr + 'T00:00:00');
      const selectedMins = dailyTotals[selectedDateStr] || 0;
      selectedDayStats.textContent = `${selectedMins} min on ${formatFriendlyDate(selectedDate)}`;
    });

    cell.addEventListener('click', () => {
      document.querySelectorAll('.contrib-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      selectedDateStr = dStr;
      renderHourlyGrid(history, dStr);
      selectedDayStats.textContent = `${totalMins} min on ${formatFriendlyDate(date)}`;
    });

    contributionGrid.appendChild(cell);
  });

  const selDate = new Date(selectedDateStr + 'T00:00:00');
  const selMins = dailyTotals[selectedDateStr] || 0;
  selectedDayStats.textContent = `${selMins} min on ${formatFriendlyDate(selDate)}`;
}

// Render 24-hour block layout for chosen day
function renderHourlyGrid(history, targetDateStr) {
  hourlyGrid.innerHTML = '';
  hourlyViewTitle.textContent = `Hourly Breakdown (${formatFriendlyDate(new Date(targetDateStr + 'T00:00:00'))})`;

  const hourlyMins = Array(24).fill(0);
  history.forEach(session => {
    const dateObj = new Date(session.timestamp);
    const dStr = formatDate(dateObj);
    if (dStr === targetDateStr) {
      const hour = dateObj.getHours();
      hourlyMins[hour] += session.durationMinutes;
    }
  });

  for (let hour = 0; hour < 24; hour++) {
    const mins = hourlyMins[hour];
    const cell = document.createElement('div');
    cell.className = `hour-cell ${getHourlyLevelClass(mins)}`;
    if (mins > 0) cell.classList.add('has-work');

    cell.textContent = `${String(hour).padStart(2, '0')}h`;

    cell.addEventListener('mouseenter', () => {
      hourlyCellStats.textContent = `${mins} min of work completed during ${hour}:00 - ${hour + 1}:00`;
    });
    cell.addEventListener('mouseleave', () => {
      hourlyCellStats.textContent = 'Hover over an hour cell';
    });

    hourlyGrid.appendChild(cell);
  }
}

// Helpers
function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatFriendlyDate(date) {
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function getLevelClass(mins) {
  if (mins === 0) return 'level-0';
  if (mins <= 25) return 'level-1';
  if (mins <= 50) return 'level-2';
  if (mins <= 75) return 'level-3';
  return 'level-4';
}

function getHourlyLevelClass(mins) {
  if (mins === 0) return 'level-0';
  if (mins <= 15) return 'level-1';
  if (mins <= 30) return 'level-2';
  if (mins <= 45) return 'level-3';
  return 'level-4';
}
