#!/usr/bin/env node
'use strict';
// Makes public/commands.json from the REAL bot source: the command names, categories and descriptions the bot itself loads.
// It checks the new data first and only replaces the old file when every check passes. If a check fails, the old file stays.
//
// Run it in Termux from the site folder:   node tools/refresh-commands.js ~/TurboFex
// (the bot folder must have its packages installed, because the command files are loaded the same way the bot loads them)
// Add --force only if you really removed many commands on purpose.
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const force = args.includes('--force');
const botDir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(process.env.HOME || '.', 'TurboFex'));
const OUT = path.join(__dirname, '..', 'public', 'commands.json');

const stop = (msg) => { console.error('\nNOT UPDATED. ' + msg + '\nThe old commands.json was kept.'); process.exit(1); };

// load the command files the same way the bot does (whatsapp/handler.js: a file exports one command or a list)
function loadFromBot(dir) {
  const cmdDir = path.join(dir, 'commands');
  if (!fs.existsSync(cmdDir)) stop(`There is no "commands" folder in ${dir}. Give the path of the bot folder.`);
  const { groupByCategory } = require(path.join(dir, 'whatsapp', 'categories.js'));
  const list = []; const errors = [];
  for (const file of fs.readdirSync(cmdDir).sort()) {
    if (!file.endsWith('.js')) continue;
    try { for (const c of [].concat(require(path.join(cmdDir, file)))) list.push(c); } catch (e) { errors.push(`${file}: ${e.message}`); }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  return { list, errors, groupByCategory, version: pkg.version };
}

const clean = (s) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);

// GROUP -> Group, but AI stays AI
const nice = (t) => (t.length <= 2 ? t : t.charAt(0) + t.slice(1).toLowerCase());

function build({ list, groupByCategory, version }) {
  const groups = groupByCategory(list, false); // member commands only, the same list the bot's .menu shows to a normal user
  const categories = groups.map((g) => ({
    key: g.key,
    title: nice(g.meta.title),
    count: g.cmds.length,
    commands: g.cmds.map((c) => ({ name: String(c.name), description: clean(c.description) })),
  }));
  const total = categories.reduce((n, c) => n + c.count, 0);
  const member = new Set(categories.flatMap((c) => c.commands.map((x) => x.name)));
  // owner-only commands (names only, for checks such as ".mode" and ".plugin" really existing)
  const owner = [...new Set(list.filter((c) => c && c.name && !member.has(String(c.name)) && (c.ownerOnly || c.realOwnerOnly)).map((c) => String(c.name)))].sort();
  return { generated: new Date().toISOString().slice(0, 10), bot: { version, commands: total, categories: categories.length }, categories, ownerCommands: owner };
}

// every check the new data must pass before it may replace the old file
function validate(snap, loadErrors, previous) {
  const bad = [];
  if (loadErrors.length) bad.push('Some command files could not be loaded, so the numbers would be wrong:\n  - ' + loadErrors.join('\n  - '));
  if (!/^\d+\.\d+\.\d+$/.test(snap.bot.version)) bad.push(`The bot version "${snap.bot.version}" is not like 1.2.3.`);
  if (snap.bot.categories < 5) bad.push(`Only ${snap.bot.categories} categories were found (expected 5 or more).`);
  if (snap.bot.commands < 50) bad.push(`Only ${snap.bot.commands} commands were found (expected 50 or more).`);
  const seen = new Set();
  for (const c of snap.categories) {
    if (!/^[a-z]+$/.test(c.key) || !c.title) bad.push(`A category has a wrong name: "${c.key}".`);
    if (c.count !== c.commands.length || c.count < 1) bad.push(`Category ${c.key}: the count does not match its commands.`);
    for (const x of c.commands) {
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(x.name)) bad.push(`Odd command name: "${x.name}" in ${c.key}.`);
      const id = x.name.toLowerCase();
      if (seen.has(id)) bad.push(`Command "${x.name}" is listed twice.`);
      seen.add(id);
    }
  }
  if (seen.size !== snap.bot.commands) bad.push('The total does not equal the number of different commands.');
  if (!Array.isArray(snap.ownerCommands) || snap.ownerCommands.some((n) => !/^[a-z0-9][a-z0-9_-]*$/i.test(n) || seen.has(n.toLowerCase()))) bad.push('The owner command list is wrong (odd name, or a name that is also a member command).');
  if (previous && previous.bot && !force && snap.bot.commands < previous.bot.commands * 0.8) {
    bad.push(`The count fell from ${previous.bot.commands} to ${snap.bot.commands} (more than 20% less). If that is on purpose, run it again with --force.`);
  }
  return bad;
}

function main() {
  console.log('Reading the bot in ' + botDir);
  const src = loadFromBot(botDir);
  const snap = build(src);
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first time */ }
  const bad = validate(snap, src.errors, previous);
  if (bad.length) stop(bad.join('\n'));
  const tmp = OUT + '.new';
  fs.writeFileSync(tmp, JSON.stringify(snap, null, 1) + '\n');
  JSON.parse(fs.readFileSync(tmp, 'utf8')); // the file we just wrote must read back
  fs.renameSync(tmp, OUT);
  console.log(`Done: bot v${snap.bot.version}, ${snap.bot.commands} commands in ${snap.bot.categories} categories.`);
  if (previous && previous.bot) console.log(`Before: ${previous.bot.commands} commands in ${previous.bot.categories} categories (bot v${previous.bot.version}).`);
  console.log(snap.categories.map((c) => `${c.title} ${c.count}`).join(', '));
}

if (require.main === module) main();
module.exports = { build, validate, clean };
