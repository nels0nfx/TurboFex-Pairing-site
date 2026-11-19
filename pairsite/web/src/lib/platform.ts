// Everything the landing page says about the TurboFex platform lives in this ONE file.
// To add a product, a hosting option or a bot feature, add one entry to a list below. The page layout does not change.
//
// BOT facts were checked against the bot project (v1.7.1): 322 commands members can use (402 with owner-only ones), 13 menu categories.
// Update BOT after each bot release, together with the bot README line "<!-- counts: ... -->".
import { BookOpen, Boxes, Cloud, Code2, Container, FlaskConical, Gamepad2, Image as ImageIcon, LayoutDashboard, Link2, Monitor, Server, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Store, Terminal, Users, Wrench, type LucideIcon } from 'lucide-react';
import { LEGACY } from './links';

const REPO = 'https://github.com/nels0nfx/TurboFex';
export const BOT = {
  version: '1.7.1',
  commands: 322,
  categories: 13,
  repo: REPO,
  releases: `${REPO}/releases`,
  hostingGuide: `${REPO}#hosting-guides`,
  usingGuide: `${REPO}#using-the-bot`,
} as const;

export interface Item { icon: LucideIcon; title: string; text: string }

// what the bot can do (from the bot README)
export const BOT_AREAS: Item[] = [
  { icon: Users, title: 'Group management', text: 'Welcome messages, rules, warnings, kick and promote, polls, giveaways, scheduled messages and chat levels.' },
  { icon: ShieldCheck, title: 'Protection', text: 'Anti-link, banned words, anti-spam, anti-raid and slow mode. Each one stays off until an admin turns it on.' },
  { icon: Gamepad2, title: 'Games and fun', text: 'Wordle, hangman, trivia, tic-tac-toe, slots, riddles, jokes and more.' },
  { icon: Wrench, title: 'Tools and lookups', text: 'Weather, dictionary, translation, currency, QR codes, reminders, notes and more.' },
  { icon: ImageIcon, title: 'Media and downloads', text: 'Stickers, picture, audio and video effects, and downloads.' },
  { icon: Sparkles, title: 'AI and auto-replies', text: 'Ask the AI a question, and set automatic replies for your group.' },
];

// where the bot can run (from the bot README and the files shipped with the bot)
export const HOSTS: Item[] = [
  { icon: Smartphone, title: 'Termux', text: 'An Android phone.' },
  { icon: Server, title: 'VPS or Linux server', text: 'With systemd or pm2.' },
  { icon: Container, title: 'Docker', text: 'Dockerfile and compose file included.' },
  { icon: LayoutDashboard, title: 'Hosting panels', text: 'Pterodactyl and similar.' },
  { icon: Cloud, title: 'Web-service hosts', text: 'Heroku-style hosts (Procfile and app.json included).' },
  { icon: Monitor, title: 'Windows or Mac', text: 'Anywhere Node.js 20 or newer runs.' },
];

export const START_STEPS = [
  { title: 'Get the bot', text: 'Download the hosting ZIP from the Releases page and put it on your host.' },
  { title: 'Link your WhatsApp', text: 'Use the pairing page. You get a session ID.' },
  { title: 'Start it', text: 'Paste the session ID in session_id.txt and start the bot.' },
] as const;

export type Status = 'available' | 'planned';
export interface PlatformItem extends Item { id: string; status: Status; to?: string; href?: string }

// The platform map. New products and services are added here; "planned" items show as "Coming later".
export const PLATFORM: PlatformItem[] = [
  { id: 'bot', icon: Boxes, title: 'The bot', text: `${BOT.commands} commands for groups, fun and tools.`, status: 'available', to: '/#bot' },
  { id: 'pairing', icon: Link2, title: 'Pairing', text: 'Link your WhatsApp with a code or a QR code.', status: 'available', to: '/pair' },
  { id: 'store', icon: Store, title: 'Plugin marketplace', text: 'Signed, reviewed plugins to add to your bot.', status: 'available', href: LEGACY.marketplace },
  { id: 'devcentre', icon: Code2, title: 'Developer Centre', text: 'Send and manage your own plugins.', status: 'available', href: LEGACY.developers },
  { id: 'docs', icon: BookOpen, title: 'Documentation', text: 'The plugin guide, with examples.', status: 'available', href: LEGACY.guide },
  { id: 'playground', icon: FlaskConical, title: 'Playground', text: 'Try plugin code in your browser.', status: 'available', href: LEGACY.playground },
  { id: 'manage', icon: SlidersHorizontal, title: 'Management', text: 'Owner and admin controls: public or private mode, and who can use what.', status: 'available', href: BOT.usingGuide },
  { id: 'panel', icon: Terminal, title: 'Hosting panel', text: 'Coming later: deploy and manage your bots from one panel.', status: 'planned' },
];
