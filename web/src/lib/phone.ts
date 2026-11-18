// The country table and the number rules live in ONE file shared with the server (public/countries.js).
// The page loads it as a plain script (window.TFX_PHONE), so the page and the server can never disagree.
import { TIME_ZONES } from './timezones';

export interface Country { iso: string; name: string; dial: string; min: number; max: number; start: string }
export type NumberState = 'empty' | 'incomplete' | 'invalid' | 'toolong' | 'valid';
export interface Analysis {
  state: NumberState; iso: string; dial: string; national: string; e164: string;
  min: number; max: number; remaining: number; message: string; countryChanged: string;
}
interface PhoneApi {
  COUNTRIES: Country[];
  byIso(iso: string): Country | null;
  flag(iso: string): string;
  analyze(raw: string, iso: string): Analysis;
}

declare global { interface Window { TFX_PHONE?: PhoneApi } }

function api(): PhoneApi {
  if (!window.TFX_PHONE) throw new Error('The country list did not load. Refresh the page.');
  return window.TFX_PHONE;
}
export const phoneReady = () => !!window.TFX_PHONE;
export const countries = (): Country[] => [...api().COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
export const byIso = (iso: string) => api().byIso(iso);
export const flagOf = (iso: string) => api().flag(iso);
export const analyze = (raw: string, iso: string) => api().analyze(raw, iso);

// the likely country: the phone's time zone first, then the language region
export function detectCountry(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (z && TIME_ZONES[z] && byIso(TIME_ZONES[z])) return TIME_ZONES[z];
  } catch { /* no Intl */ }
  try {
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (const l of langs) {
      const m = /[-_]([A-Za-z]{2})$/.exec(l || '');
      if (m && byIso(m[1])) return m[1].toUpperCase();
    }
  } catch { /* no language */ }
  return '';
}

const lengthText = (c: Country) => (c.min === c.max ? `${c.min} digits` : `${c.min}–${c.max} digits`);

export interface Hint { text: string; tone: 'idle' | 'ok' | 'bad'; analysis: Analysis }

// the live line under the number field (same words as the current pairing page)
export function describeNumber(text: string, iso: string): Hint {
  const a = analyze(text, iso);
  const c = byIso(a.countryChanged && a.countryChanged !== iso ? a.countryChanged : iso);
  if (!c) return { text: 'Choose your country, then type your number without the country code.', tone: 'idle', analysis: a };
  if (a.state === 'empty') return { text: `${c.name} numbers have ${lengthText(c)} (without +${c.dial}).`, tone: 'idle', analysis: a };
  if (a.state === 'incomplete') return { text: `${a.national.length} digit${a.national.length === 1 ? '' : 's'} · ${a.remaining} more needed for ${c.name}.`, tone: 'idle', analysis: a };
  if (a.state === 'toolong' || a.state === 'invalid') return { text: a.message, tone: 'bad', analysis: a };
  return { text: `✓ Valid ${c.name} number: +${a.e164}`, tone: 'ok', analysis: a };
}

// what the field shows after typing: odd characters removed, never longer than the country allows,
// and a full international number (+234 801...) shortened to the part that is left to type
export function cleanInput(value: string, iso: string): { value: string; iso: string } {
  let v = value.replace(/[^\d\s()+.-]/g, '');
  let guard = 0;
  while (guard++ < 40 && v && analyze(v, iso).state === 'toolong') v = v.slice(0, -1).replace(/[\s().-]+$/, '');
  const a = analyze(v, iso);
  let nextIso = iso;
  if (a.countryChanged && a.countryChanged !== iso) nextIso = a.countryChanged;
  if (/^\s*(\+|00)/.test(v) && a.national && byIso(nextIso) && (a.state === 'valid' || a.state === 'incomplete')) {
    v = a.national.replace(/(\d{3})(?=\d)/g, '$1 ').replace(/ (\d{1,2})$/, '$1');
  }
  return { value: v, iso: nextIso };
}

// the number the server gets (the server checks everything again)
export function validateNumber(text: string, iso: string): { ok: true; e164: string; iso: string } | { ok: false; message: string } {
  const a = analyze(text, iso);
  let msg = '';
  if (!iso && a.state !== 'valid') msg = 'Choose your country first.';
  else if (a.state === 'empty') msg = 'Enter your WhatsApp number.';
  else if (a.state === 'incomplete') msg = `That number is too short for ${byIso(a.iso)?.name || 'this country'}: ${a.remaining} more digit${a.remaining === 1 ? '' : 's'} needed.`;
  else if (a.state !== 'valid') msg = a.message || 'That number is not valid for the selected country.';
  if (msg) return { ok: false, message: msg };
  return { ok: true, e164: a.e164, iso: a.iso };
}
