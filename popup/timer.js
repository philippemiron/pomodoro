export const ALARM_NAME = 'pomodoroTimer';
export let currentDuration = 1500;

export function setCurrentDuration(duration) {
  currentDuration = duration;
}

export async function saveDurationSetting(type, duration) {
  const key =
    type === 'work'
      ? 'workDurationSetting'
      : type === 'shortBreak'
        ? 'shortBreakDurationSetting'
        : 'longBreakDurationSetting';
  await chrome.storage.local.set({ [key]: duration });
}

export async function getTimerState() {
  const data = await chrome.storage.local.get('timerState');
  return data.timerState || { status: 'idle', type: 'work', pomodoroCount: 0, duration: 1500 };
}

export async function startTimer(state) {
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
    pausedTimeRemaining: null,
  };

  await chrome.storage.local.set({ timerState: newState });
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: timeRemaining / 60 });

  await chrome.action.setBadgeText({ text: 'ON' });
  if (state.type === 'work') {
    await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: '#10B981' });
  }
}

export async function pauseTimer(state) {
  await chrome.alarms.clear(ALARM_NAME);
  const timeRemaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));

  const newState = {
    status: 'paused',
    type: state.type || 'work',
    pomodoroCount: state.pomodoroCount || 0,
    duration: state.duration,
    startTime: state.startTime,
    endTime: null,
    pausedTimeRemaining: timeRemaining,
  };

  await chrome.storage.local.set({ timerState: newState });
  await chrome.action.setBadgeText({ text: 'II' });
  await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
}

export async function resetTimer() {
  await chrome.alarms.clear(ALARM_NAME);

  const data = await chrome.storage.local.get('workDurationSetting');
  const workDuration = data.workDurationSetting || 1500;

  setCurrentDuration(workDuration);

  const newState = {
    status: 'idle',
    type: 'work',
    pomodoroCount: 0,
    duration: workDuration,
    startTime: null,
    endTime: null,
    pausedTimeRemaining: null,
  };
  await chrome.storage.local.set({ timerState: newState });
  await chrome.action.setBadgeText({ text: '' });
}
