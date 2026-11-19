import { highlightLine } from '@/lib/highlight';

const kinds = (l: string, lang: 'js' | 'json' = 'js') => highlightLine(l, lang).map((t) => `${t.k}:${t.v}`);

describe('highlighter', () => {
  it('marks keywords, functions, strings and numbers', () => {
    expect(kinds("const n = Number('7') + 1;")).toEqual(['kw:const', 'plain: n = ', 'fn:Number', 'plain:(', "str:'7'", 'plain:) + ', 'num:1', 'plain:;']);
  });
  it('marks comments', () => {
    expect(highlightLine('// hello', 'js')).toEqual([{ k: 'cm', v: '// hello' }]);
  });
  it('marks JSON keys differently from values', () => {
    const t = highlightLine('  "id": "hello-plugin",', 'json');
    expect(t.find((x) => x.k === 'key')?.v).toBe('"id"');
    expect(t.find((x) => x.k === 'str')?.v).toBe('"hello-plugin"');
  });
  it('never loses or changes any text', () => {
    const line = "  await c.reply('👋 *Hello ' + name + '!*\\n▸ ' + count);";
    expect(highlightLine(line, 'js').map((t) => t.v).join('')).toBe(line);
  });
});
