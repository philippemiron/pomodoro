// Service worker for Pomodoro browser extension

const ALARM_NAME = 'pomodoroTimer';

// Initialize state on install
chrome.runtime.onInstalled.addListener(async () => {
  const { timerState } = await chrome.storage.local.get('timerState');
  if (!timerState) {
    await chrome.storage.local.set({
      timerState: {
        status: 'idle',
        type: 'work',
        pomodoroCount: 0,
        duration: 1500, // 25 minutes default
        startTime: null,
        endTime: null,
        pausedTimeRemaining: null,
      },
      history: [], // Array of { timestamp: number, durationMinutes: number }
    });
  }
});

// Alarm event listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await handleTimerCompletion();
  }
});

// Handle timer completion
async function handleTimerCompletion() {
  const data = await chrome.storage.local.get([
    'timerState',
    'history',
    'workDurationSetting',
    'shortBreakDurationSetting',
    'longBreakDurationSetting',
  ]);
  const state = data.timerState || {};
  const history = data.history || [];

  // Custom settings with fallback to defaults
  const workDuration = data.workDurationSetting || 1500; // 25 mins
  const shortBreakDuration = data.shortBreakDurationSetting || 300; // 5 mins
  const longBreakDuration = data.longBreakDurationSetting || 900; // 15 mins

  const completedDurationMinutes = Math.round((state.duration || 1500) / 60);

  let nextType = 'work';
  let nextPomodoroCount = state.pomodoroCount || 0;
  let nextDuration = workDuration;

  let title = '';
  let message = '';
  let newSession = null;

  if (state.type === 'work') {
    // Log work session
    newSession = {
      timestamp: Date.now(),
      durationMinutes: completedDurationMinutes,
    };
    history.push(newSession);

    nextPomodoroCount += 1;
    if (nextPomodoroCount >= 4) {
      nextType = 'longBreak';
      nextDuration = longBreakDuration;
      nextPomodoroCount = 0; // Reset counter after scheduling long break
    } else {
      nextType = 'shortBreak';
      nextDuration = shortBreakDuration;
    }

    title = 'Work Session Complete!';
    message = `Great job! Take a ${nextType === 'longBreak' ? Math.round(longBreakDuration / 60) : Math.round(shortBreakDuration / 60)}-minute break.`;
  } else {
    // Break finished, transition to work
    nextType = 'work';
    nextDuration = workDuration;

    title = 'Break Over!';
    message = 'Ready to focus? Start your next work session!';
  }

  const newState = {
    status: 'running',
    type: nextType,
    pomodoroCount: nextPomodoroCount,
    duration: nextDuration,
    startTime: Date.now(),
    endTime: Date.now() + nextDuration * 1000,
    pausedTimeRemaining: null,
  };

  await chrome.storage.local.set({
    timerState: newState,
    history: history,
  });

  // Register the next alarm in the sequence automatically
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: nextDuration / 60 });

  // Update Badge
  await chrome.action.setBadgeText({ text: 'ON' });
  if (nextType === 'work') {
    await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green
  }

  // Create Notification
  chrome.notifications.create('pomodoro-complete', {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: title,
    message: message,
    priority: 2,
  });

  // Play the audio chime
  playChime(nextType);

  // Broadcast to popup if open
  chrome.runtime
    .sendMessage({ type: 'TIMER_COMPLETED', session: newSession, nextState: newState })
    .catch(() => {
      // Ignore error if popup is closed
    });
}

// Play audio chime if context allows (Firefox background page support)
function playChime(nextType) {
  try {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
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
    // Ignore silent failure if Service Worker environment lacks Web Audio support
  }
}
