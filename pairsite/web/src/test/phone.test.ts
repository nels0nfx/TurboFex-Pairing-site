import { cleanInput, describeNumber, detectCountry, validateNumber } from '@/lib/phone';

describe('number rules (the real country table)', () => {
  it('reads a valid Nigerian number with or without the leading 0', () => {
    for (const t of ['8012345678', '08012345678']) {
      const v = validateNumber(t, 'NG');
      expect(v).toEqual({ ok: true, e164: '2348012345678', iso: 'NG' });
    }
  });
  it('says what is wrong in the same words as the current page', () => {
    expect(validateNumber('', 'NG')).toEqual({ ok: false, message: 'Enter your WhatsApp number.' });
    expect(validateNumber('801234', 'NG')).toEqual({ ok: false, message: 'That number is too short for Nigeria: 4 more digits needed.' });
  });
  it('asks for a country when none is chosen and the number is not international', () => {
    expect(validateNumber('801234', '')).toEqual({ ok: false, message: 'Choose your country first.' });
  });
  it('the live line counts digits and confirms a valid number', () => {
    expect(describeNumber('', 'NG').text).toMatch(/^Nigeria numbers have .* digits \(without \+234\)\.$/);
    expect(describeNumber('801234', 'NG').text).toBe('6 digits · 4 more needed for Nigeria.');
    expect(describeNumber('8012345678', 'NG')).toMatchObject({ tone: 'ok', text: '✓ Valid Nigeria number: +2348012345678' });
    expect(describeNumber('x', '').text).toMatch(/^Choose your country/);
  });
  it('typing is cleaned: odd characters out, never longer than the country allows', () => {
    expect(cleanInput('80a12b', 'NG').value).toBe('8012');
    const long = cleanInput('80123456789012345', 'NG').value;
    expect(describeNumber(long, 'NG').analysis.state).not.toBe('toolong');
  });
  it('a full international number switches the country and keeps only the national part', () => {
    const r = cleanInput('+234 801 234 5678', '');
    expect(r.iso).toBe('NG');
    expect(r.value.replace(/\s/g, '')).toBe('8012345678');
  });
  it('the country is guessed from the phone time zone', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({ resolvedOptions: () => ({ timeZone: 'Africa/Lagos' }) } as Intl.DateTimeFormat);
    expect(detectCountry()).toBe('NG');
    vi.restoreAllMocks();
  });
});
