/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        raise: 'rgb(var(--raise) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        body: 'rgb(var(--body) / <alpha-value>)',
        mute: 'rgb(var(--mute) / <alpha-value>)',
        gold: 'rgb(var(--gold) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        bad: 'rgb(var(--bad) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: { glow: '0 0 0 1px rgb(var(--gold) / 0.35), 0 0 32px -8px rgb(var(--gold) / 0.35)' },
    },
  },
  plugins: [],
};
