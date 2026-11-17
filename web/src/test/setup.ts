import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom has no matchMedia
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
}

// Newer Node versions ship their own half-working localStorage that hides the browser-like one in the tests.
// A small in-memory copy makes the tests behave the same on every phone and computer.
const memory = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
  key: (i: number) => [...memory.keys()][i] ?? null,
  get length() { return memory.size; },
};
Object.defineProperty(window, 'localStorage', { value: fakeStorage, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true });
