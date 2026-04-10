import { describe, it, expect, vi } from 'vitest';

function setLocalStorage(value) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value
  });
}

function restoreLocalStorage(hadOwnProperty, originalValue) {
  if (hadOwnProperty) {
    setLocalStorage(originalValue);
    return;
  }

  Reflect.deleteProperty(globalThis, 'localStorage');
}

describe('chat passion storage guards', () => {
  it('loads safely when localStorage is unavailable', async () => {
    const hadOwnProperty = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
    const originalValue = globalThis.localStorage;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      Reflect.deleteProperty(globalThis, 'localStorage');
      vi.resetModules();
      const module = await import('../../src/lib/chat/passion/index.js');

      expect(module.passionManager.getPassionLevel('session-1')).toBe(0);
      expect(module.passionManager.getHistory('session-1')).toEqual([]);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      restoreLocalStorage(hadOwnProperty, originalValue);
      vi.restoreAllMocks();
    }
  });

  it('persists passion data when localStorage is available', async () => {
    const hadOwnProperty = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
    const originalValue = globalThis.localStorage;
    const store = new Map();
    const localStorageMock = {
      getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
      setItem: vi.fn((key, value) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key) => {
        store.delete(key);
      })
    };

    try {
      setLocalStorage(localStorageMock);
      vi.resetModules();
      const module = await import('../../src/lib/chat/passion/index.js');

      module.passionManager.setPassion('session-1', 42);

      expect(module.passionManager.getPassionLevel('session-1')).toBe(42);
      expect(localStorageMock.setItem).toHaveBeenCalled();
      expect(JSON.parse(store.get('aria_passion_data'))['session-1']).toBe(42);
    } finally {
      restoreLocalStorage(hadOwnProperty, originalValue);
      vi.restoreAllMocks();
    }
  });
});
