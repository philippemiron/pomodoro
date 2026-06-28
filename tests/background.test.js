import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetChromeMocks } from './setup.js';

describe('background.js', () => {
  beforeEach(async () => {
    resetChromeMocks();
    vi.resetModules();
  });

  it('should initialize state onInstalled', async () => {
    await import('../background.js');

    const onInstalledCall = chrome.runtime.onInstalled.addListener.mock.calls[0];
    expect(onInstalledCall).toBeDefined();

    const listenerCallback = onInstalledCall[0];
    await listenerCallback();

    const state = await chrome.storage.local.get(['timerState', 'history']);
    expect(state.timerState.status).toBe('idle');
    expect(state.timerState.type).toBe('work');
    expect(state.timerState.pomodoroCount).toBe(0);
    expect(state.timerState.duration).toBe(1500);
    expect(state.history).toEqual([]);
  });

  it('should log work session, progress pomodoro count, and switch to shortBreak', async () => {
    await import('../background.js');

    await chrome.storage.local.set({
      timerState: {
        status: 'running',
        type: 'work',
        pomodoroCount: 0,
        duration: 1500,
        startTime: Date.now() - 1500 * 1000,
        endTime: Date.now(),
      },
      history: [],
    });

    const onAlarmCall = chrome.alarms.onAlarm.addListener.mock.calls[0];
    expect(onAlarmCall).toBeDefined();
    const alarmCallback = onAlarmCall[0];

    await alarmCallback({ name: 'pomodoroTimer' });

    const data = await chrome.storage.local.get(['timerState', 'history']);
    expect(data.history.length).toBe(1);
    expect(data.history[0].durationMinutes).toBe(25);

    // Timer state should be set to running, with next session type = shortBreak, count = 1, duration = 5 mins
    expect(data.timerState.status).toBe('running');
    expect(data.timerState.type).toBe('shortBreak');
    expect(data.timerState.pomodoroCount).toBe(1);
    expect(data.timerState.duration).toBe(300);

    // Assert notification
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      'pomodoro-complete',
      expect.objectContaining({
        title: 'Work Session Complete!',
        message: expect.stringContaining('5-minute break'),
      }),
    );

    // Assert action badge set to ON
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'ON' });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#10B981' });

    // Assert next alarm was scheduled
    expect(chrome.alarms.create).toHaveBeenCalledWith('pomodoroTimer', { delayInMinutes: 5 });
  });

  it('should transition to longBreak after 4 completed work sessions', async () => {
    await import('../background.js');

    await chrome.storage.local.set({
      timerState: {
        status: 'running',
        type: 'work',
        pomodoroCount: 3, // 3 sessions completed, completing this makes 4
        duration: 1500,
        startTime: Date.now() - 1500 * 1000,
        endTime: Date.now(),
      },
      history: [],
    });

    const alarmCallback = chrome.alarms.onAlarm.addListener.mock.calls[0][0];
    await alarmCallback({ name: 'pomodoroTimer' });

    const data = await chrome.storage.local.get(['timerState', 'history']);

    // Type should be longBreak, duration 15 mins (900s), count reset to 0
    expect(data.timerState.status).toBe('running');
    expect(data.timerState.type).toBe('longBreak');
    expect(data.timerState.pomodoroCount).toBe(0);
    expect(data.timerState.duration).toBe(900);

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      'pomodoro-complete',
      expect.objectContaining({
        title: 'Work Session Complete!',
        message: expect.stringContaining('15-minute break'),
      }),
    );

    expect(chrome.alarms.create).toHaveBeenCalledWith('pomodoroTimer', { delayInMinutes: 15 });
  });

  it('should transition from break to work mode on alarm completion', async () => {
    await import('../background.js');

    await chrome.storage.local.set({
      timerState: {
        status: 'running',
        type: 'shortBreak',
        pomodoroCount: 1,
        duration: 300,
        startTime: Date.now() - 300 * 1000,
        endTime: Date.now(),
      },
      history: [],
    });

    const alarmCallback = chrome.alarms.onAlarm.addListener.mock.calls[0][0];
    await alarmCallback({ name: 'pomodoroTimer' });

    const data = await chrome.storage.local.get(['timerState', 'history']);

    // Next type should be work, count retained (1), duration 25 mins (1500s)
    expect(data.timerState.status).toBe('running');
    expect(data.timerState.type).toBe('work');
    expect(data.timerState.pomodoroCount).toBe(1);
    expect(data.timerState.duration).toBe(1500);
    expect(data.history.length).toBe(0); // break completion shouldn't log to history

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      'pomodoro-complete',
      expect.objectContaining({
        title: 'Break Over!',
        message: expect.stringContaining('Start your next work session'),
      }),
    );

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: 'ON' });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#EF4444' });
    expect(chrome.alarms.create).toHaveBeenCalledWith('pomodoroTimer', { delayInMinutes: 25 });
  });

  it('should sequence a full Pomodoro cycle (4 work sessions, 3 short breaks, 1 long break)', async () => {
    await import('../background.js');

    // Helper to simulate alarm trigger
    const alarmCallback = chrome.alarms.onAlarm.addListener.mock.calls[0][0];
    const triggerCompletion = async () => {
      // Set state to running right before alarm fires so it completes
      const current = (await chrome.storage.local.get('timerState')).timerState;
      current.status = 'running';
      current.endTime = Date.now();
      await chrome.storage.local.set({ timerState: current });

      await alarmCallback({ name: 'pomodoroTimer' });
    };

    // 1. Install defaults
    const onInstalledCallback = chrome.runtime.onInstalled.addListener.mock.calls[0][0];
    await onInstalledCallback();

    // 2. Complete Work 1 -> transitions to Short Break (pomodoroCount: 1)
    await triggerCompletion();
    let state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.type).toBe('shortBreak');
    expect(state.pomodoroCount).toBe(1);

    // 3. Complete Short Break 1 -> transitions to Work 2
    await triggerCompletion();
    state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.type).toBe('work');
    expect(state.pomodoroCount).toBe(1);

    // 4. Complete Work 2 -> transitions to Short Break (pomodoroCount: 2)
    await triggerCompletion();
    state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.type).toBe('shortBreak');
    expect(state.pomodoroCount).toBe(2);

    // 5. Complete Short Break 2 -> transitions to Work 3
    await triggerCompletion();
    state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.type).toBe('work');
    expect(state.pomodoroCount).toBe(2);

    // 6. Complete Work 3 -> transitions to Short Break (pomodoroCount: 3)
    await triggerCompletion();
    state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.type).toBe('shortBreak');
    expect(state.pomodoroCount).toBe(3);

    // 7. Complete Short Break 3 -> transitions to Work 4
    await triggerCompletion();
    state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.type).toBe('work');
    expect(state.pomodoroCount).toBe(3);

    // 8. Complete Work 4 -> transitions to Long Break (pomodoroCount resets to 0)
    await triggerCompletion();
    state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.type).toBe('longBreak');
    expect(state.pomodoroCount).toBe(0);

    // 9. Complete Long Break -> transitions back to Work 1 (pomodoroCount: 0)
    await triggerCompletion();
    state = (await chrome.storage.local.get('timerState')).timerState;
    expect(state.type).toBe('work');
    expect(state.pomodoroCount).toBe(0);

    // Assert 4 work sessions logged to history
    const history = (await chrome.storage.local.get('history')).history;
    expect(history.length).toBe(4);
  });
});
