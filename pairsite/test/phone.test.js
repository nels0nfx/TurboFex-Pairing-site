const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const P = require('../public/countries.js');
const phone = require('../phone');
const { createApp } = require('../server');

const an = (raw, iso) => P.analyze(raw, iso);

test('numbers: Nigeria (+234) needs 10 digits, with every common way of typing it', () => {
  for (const raw of ['801 234 5678', '0801 234 5678', '+234 801 234 5678', '2348012345678', '00234 801 234 5678', '234 801 234 5678', '2342348012345678']) {
    const a = an(raw, 'NG'); assert.strictEqual(a.state, 'valid', raw); assert.strictEqual(a.e164, '2348012345678', raw);
  }
  assert.deepStrictEqual([an('80123', 'NG').state, an('80123', 'NG').remaining], ['incomplete', 5]);
  assert.strictEqual(an('80123456789', 'NG').state, 'toolong');
  assert.strictEqual(an('601 234 5678', 'NG').state, 'invalid', 'wrong first digit');
  assert.strictEqual(an('', 'NG').state, 'empty');
  assert.strictEqual(an('abc', 'NG').state, 'empty');
});

test('numbers: other countries have their own lengths', () => {
  const ok = (raw, iso, e164) => { const a = an(raw, iso); assert.strictEqual(a.state, 'valid', iso + ' ' + raw); assert.strictEqual(a.e164, e164, iso + ' ' + raw); };
  ok('7911 123456', 'GB', '447911123456'); ok('07911123456', 'GB', '447911123456');
  ok('202 555 0143', 'US', '12025550143'); ok('+1 202 555 0143', 'US', '12025550143'); ok('876 555 1234', 'JM', '18765551234');
  ok('98765 43210', 'IN', '919876543210'); ok('+91 98765 43210', 'IN', '919876543210');
  ok('24 123 4567', 'GH', '233241234567'); ok('82 123 4567', 'ZA', '27821234567'); ok('712 345 678', 'KE', '254712345678');
  ok('151 23456789', 'DE', '4915123456789'); ok('912 345 6789', 'RU', '79123456789'); ok('11 91234 5678', 'BR', '5511912345678'); ok('412 345 678', 'AU', '61412345678');
  assert.strictEqual(an('123 456 7890', 'US').state, 'invalid', 'a US number cannot start with 1');
  assert.strictEqual(an('5552345', 'US').state, 'incomplete');
  assert.strictEqual(an('9876543', 'IN').remaining, 3);
  assert.notStrictEqual(P.byIso('NG').min, P.byIso('DE').max, 'lengths differ by country');
});

test('numbers: a pasted international number switches to its own country', () => {
  const a = an('+44 7911 123456', 'NG'); assert.strictEqual(a.state, 'valid'); assert.strictEqual(a.iso, 'GB'); assert.strictEqual(a.countryChanged, 'GB');
  assert.strictEqual(an('+999 123 456', 'NG').state, 'invalid');
});

test('server check: normal, wrong and abusive input', () => {
  assert.deepStrictEqual(phone.check('0801 234 5678', 'NG').e164, '2348012345678');
  assert.strictEqual(phone.check('2348012345678').ok, true, 'country read from the code when none is given');
  for (const [raw, iso] of [['123', 'NG'], ['801', 'NG'], ['80123456789', 'NG'], ['601 234 5678', 'NG'], ['', 'NG'], ['08012345678', undefined], ['<script>', 'NG'], ['1'.repeat(60), 'NG'], ['+999 1', 'NG']]) {
    const r = phone.check(raw, iso); assert.strictEqual(r.ok, false, String(raw)); assert.ok(r.error && r.error.length > 5);
  }
  assert.match(phone.check('80123', 'NG').error, /5 more digits/);
  assert.strictEqual(phone.mask('2348012345678'), '23…78');
  assert.ok(!phone.hashOf('2348012345678', 's').includes('2348012345678'));
});

test('server check: libphonenumber (when installed) can reject what the table accepts; a broken library never blocks', () => {
  phone.setLib({ parsePhoneNumberFromString: () => ({ isValid: () => false }) });
  assert.strictEqual(phone.check('801 234 5678', 'NG').ok, false);
  phone.setLib({ parsePhoneNumberFromString: () => ({ isValid: () => true }) });
  assert.deepStrictEqual(phone.check('801 234 5678', 'NG').checkedBy, 'libphonenumber');
  phone.setLib({ parsePhoneNumberFromString: () => { throw new Error('boom'); } });
  assert.strictEqual(phone.check('801 234 5678', 'NG').ok, true);
  phone.setLib(null);
});

async function boot(env = {}) {
  const started = [];
  const engine = { start(number, hooks, opts) { started.push({ number, opts }); setTimeout(() => hooks.onCode('ABCD-EFGH'), 10); return { cancel() {} }; } };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-'));
  const app = createApp({ engine, dataDir, env: { PAIR_LIMIT: '200', ...env } });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  return { app, started, base: `http://127.0.0.1:${app.server.address().port}`, close: () => { app.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}
const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

test('API: only a valid number for the country reaches WhatsApp, always in international form', async () => {
  const t = await boot();
  try {
    const good = await post(t.base + '/api/pair', { method: 'code', number: '0801 234 5678', country: 'NG' });
    assert.strictEqual(good.status, 200); assert.strictEqual(t.started.length, 1); assert.strictEqual(t.started[0].number, '2348012345678');
    const uk = await post(t.base + '/api/pair', { method: 'code', number: '+44 7911 123456', country: 'NG' });
    assert.strictEqual(uk.status, 200); assert.strictEqual(t.started[1].number, '447911123456');
    for (const body of [{ number: '80123', country: 'NG' }, { number: '801234567890', country: 'NG' }, { number: '601 234 5678', country: 'NG' }, { number: 'abc', country: 'NG' }, { number: '', country: 'NG' }, { number: '12345', country: 'US' }]) {
      const r = await post(t.base + '/api/pair', { method: 'code', ...body });
      assert.strictEqual(r.status, 400, JSON.stringify(body)); const j = await r.json(); assert.ok(j.error && j.state);
    }
    assert.strictEqual(t.started.length, 2, 'rejected numbers never start a WhatsApp connection');
    const qr = await post(t.base + '/api/pair', { method: 'qr' });
    assert.strictEqual(qr.status, 200, 'QR needs no number');
  } finally { t.close(); }
});

test('API: repeated attempts for one number are limited (by a hash, not the number); other numbers are not affected', async () => {
  const t = await boot({ NUMBER_LIMIT: '3' });
  try {
    for (let i = 0; i < 3; i++) assert.strictEqual((await post(t.base + '/api/pair', { method: 'code', number: '801 234 5678', country: 'NG' })).status, 200);
    const blocked = await post(t.base + '/api/pair', { method: 'code', number: '+234 801 234 5678', country: 'NG' });
    assert.strictEqual(blocked.status, 429); assert.match((await blocked.json()).error, /this number/);
    assert.strictEqual((await post(t.base + '/api/pair', { method: 'code', number: '802 234 5678', country: 'NG' })).status, 200);
    assert.strictEqual(t.started.length, 4, 'the blocked attempt never reached WhatsApp');
  } finally { t.close(); }
});

test('API: the visitor limit still applies', async () => {
  const t = await boot({ PAIR_LIMIT: '2', NUMBER_LIMIT: '50' });
  try {
    assert.strictEqual((await post(t.base + '/api/pair', { method: 'code', number: '801 234 5671', country: 'NG' })).status, 200);
    assert.strictEqual((await post(t.base + '/api/pair', { method: 'code', number: '801 234 5672', country: 'NG' })).status, 200);
    assert.strictEqual((await post(t.base + '/api/pair', { method: 'code', number: '801 234 5673', country: 'NG' })).status, 429);
  } finally { t.close(); }
});

test('API: WhatsApp rejecting the number shows an error and never a code', async () => {
  const engine = { start(number, hooks) { setTimeout(() => hooks.onFail('WhatsApp did not accept this number for pairing. Check the number and try again.'), 10); return { cancel() {} }; } };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph2-'));
  const app = createApp({ engine, dataDir, env: { PAIR_LIMIT: '50' } });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const { job } = await (await post(base + '/api/pair', { method: 'code', number: '801 234 5678', country: 'NG' })).json();
    await new Promise((r) => setTimeout(r, 100));
    const j = await (await fetch(base + '/api/job/' + job)).json();
    assert.strictEqual(j.state, 'failed'); assert.strictEqual(j.code, null); assert.match(j.error, /did not accept/);
  } finally { app.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
