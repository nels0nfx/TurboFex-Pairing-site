import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { createRequire } from 'node:module';

afterEach(() => { cleanup(); sessionStorage.clear(); });

// jsdom has no matchMedia
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
}

// Newer Node versions ship their own half-working localStorage that hides the browser-like one in the tests.
// A small in-memory copy makes the tests behave the same on every phone and computer.
function makeStorage() {
  const memory = new Map<string, string>();
  return {
    getItem: (k: string) => (memory.has(k) ? memory.get(k)! : null),
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() { return memory.size; },
  };
}
for (const name of ['localStorage', 'sessionStorage']) {
  const store = makeStorage();
  Object.defineProperty(window, name, { value: store, configurable: true });
  Object.defineProperty(globalThis, name, { value: store, configurable: true });
}

// the real country table, the same file the page loads from the server (it sets window.TFX_PHONE)
const load = createRequire(import.meta.url);
(window as unknown as { TFX_PHONE: unknown }).TFX_PHONE = load('../../../public/countries.js');

// jsdom cannot scroll
window.scrollTo = () => {};

// jsdom has no IntersectionObserver (phone browsers do); the fade-in animation needs one
class FakeObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;
