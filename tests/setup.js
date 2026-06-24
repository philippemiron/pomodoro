import { vi } from 'vitest';

// Storage Mock implementation
let mockStorage = {};

const chromeMock = {
  runtime: {
    onInstalled: {
      addListener: vi.fn(),
    },
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn().mockImplementation(() => Promise.resolve()),
  },
  storage: {
    local: {
      get: vi.fn().mockImplementation((keys) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: mockStorage[keys] });
        }
        if (Array.isArray(keys)) {
          const res = {};
          keys.forEach(k => {
            res[k] = mockStorage[k];
          });
          return Promise.resolve(res);
        }
        return Promise.resolve(mockStorage);
      }),
      set: vi.fn().mockImplementation((data) => {
        Object.assign(mockStorage, data);
        return Promise.resolve();
      }),
      clear: vi.fn().mockImplementation(() => {
        mockStorage = {};
        return Promise.resolve();
      })
    }
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn().mockImplementation(() => Promise.resolve(true)),
    onAlarm: {
      addListener: vi.fn(),
    }
  },
  notifications: {
    create: vi.fn(),
  },
  action: {
    setBadgeText: vi.fn().mockImplementation(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn().mockImplementation(() => Promise.resolve()),
  }
};

// Define globally
global.chrome = chromeMock;

// Helper to reset mocks between tests
export function resetChromeMocks() {
  mockStorage = {};
  vi.clearAllMocks();
}
