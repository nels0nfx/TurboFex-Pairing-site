import { BOT, BOT_AREAS, HOSTS, PLATFORM } from '@/lib/platform';

describe('platform facts (one file, checked against the bot project)', () => {
  it('has the checked bot numbers', () => {
    expect(BOT.version).toBe('1.7.1');
    expect(BOT.commands).toBe(322);
    expect(BOT.categories).toBe(13);
    expect(BOT.repo).toBe('https://github.com/nels0nfx/TurboFex');
  });
  it('every platform entry has a unique id and text; planned ones are never links', () => {
    const ids = PLATFORM.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PLATFORM) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.text.length).toBeGreaterThan(0);
      if (p.status === 'planned') expect(p.to ?? p.href).toBeUndefined();
      else expect(p.to ?? p.href).toBeTruthy();
    }
  });
  it('lists are not empty and have no duplicate titles', () => {
    for (const list of [BOT_AREAS, HOSTS, PLATFORM]) {
      expect(list.length).toBeGreaterThan(0);
      const titles = list.map((i) => i.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });
});
