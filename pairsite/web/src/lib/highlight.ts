// A tiny syntax highlighter for the code examples on the landing page (no library).
// It works one line at a time, which is enough for the short examples we show.
export type TokKind = 'str' | 'kw' | 'fn' | 'cm' | 'num' | 'key' | 'plain';
export interface Tok { k: TokKind; v: string }
export type Lang = 'js' | 'json' | 'text';

const KEYWORDS = new Set(['async', 'await', 'const', 'let', 'var', 'return', 'function', 'new', 'if', 'else', 'true', 'false', 'null']);
const RE = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/g;

export function highlightLine(line: string, lang: Lang): Tok[] {
  if (lang === 'text') return [{ k: 'plain', v: line }];
  const out: Tok[] = [];
  const push = (k: TokKind, v: string) => {
    const last = out[out.length - 1];
    if (last && last.k === k) last.v += v; else out.push({ k, v });
  };
  for (const m of line.matchAll(RE)) {
    const [text, comment, str, num, word] = m;
    const after = line.slice((m.index ?? 0) + text.length);
    if (comment && lang === 'js') push('cm', text);
    else if (str) push(lang === 'json' && /^\s*:/.test(after) ? 'key' : 'str', text);
    else if (num) push('num', text);
    else if (word) push(KEYWORDS.has(word) ? 'kw' : after.startsWith('(') ? 'fn' : 'plain', text);
    else push('plain', text);
  }
  return out;
}

export const highlight = (code: string, lang: Lang): Tok[][] => code.split('\n').map((l) => highlightLine(l, lang));
