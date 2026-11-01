// The link card (preview) for a link in a WhatsApp message: the REAL title, description and picture of the page, read
// from its public page tags (Open Graph), then shown as the full-width card. Used for the WhatsApp Channel link.
// Never throws: when the page can't be read the caller sends the plain link.
const cache = new Map(); // url -> { at, value }
const ONE_HOUR = 3600 * 1000;
const UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'; // sites hand their preview tags to this

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();

function parseMeta(html) {
  const head = String(html).slice(0, 300000), meta = {};
  for (const m of head.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? '';
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content;
  }
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  return {
    title: decode(meta['og:title'] || meta['twitter:title'] || (t && t[1]) || ''),
    description: decode(meta['og:description'] || meta['twitter:description'] || meta.description || '').slice(0, 300),
    image: decode(meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || ''),
  };
}

const isJpeg = (b) => b && b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

async function get(fetchFn, url, ms, max) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetchFn(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,image/*;q=0.8' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) throw new Error('too big');
    return { buf, type: String(r.headers.get('content-type') || '').toLowerCase() };
  } finally {
    clearTimeout(timer);
  }
}

// returns { 'canonical-url', 'matched-text', title, description, jpegThumbnail?, _full? } or null
async function build(url, fetchFn) {
  const page = await get(fetchFn, url, 5000, 1.5 * 1024 * 1024);
  const meta = parseMeta(page.buf.toString('utf8'));
  if (!meta.title && !meta.description) return null;
  const card = { 'canonical-url': url, 'matched-text': url, title: meta.title || 'WhatsApp Channel', description: meta.description };
  if (meta.image) {
    try {
      const img = await get(fetchFn, new URL(meta.image, url).href, 5000, 2.5 * 1024 * 1024);
      if (isJpeg(img.buf)) {
        if (img.buf.length <= 40000) card.jpegThumbnail = img.buf;
        if (img.buf.length <= 1.5 * 1024 * 1024) card._full = img.buf; // the picture for the full-width card
      }
    } catch (err) {
      /* a card without a picture is still a card */
    }
  }
  return card;
}

// url -> the link card (with the full-width picture uploaded to WhatsApp), or null
async function getCard(url, sock, lib, fetchFn = globalThis.fetch) {
  try {
    const hit = cache.get(url);
    let card = hit && Date.now() - hit.at < ONE_HOUR ? hit.card : undefined;
    if (card === undefined) {
      card = await build(url, fetchFn);
      cache.set(url, { at: Date.now(), card });
    }
    if (!card) return null;
    const out = { ...card };
    const full = out._full;
    delete out._full;
    if (full && typeof lib.prepareWAMessageMedia === 'function' && typeof sock.waUploadToServer === 'function') {
      try {
        const { imageMessage } = await Promise.race([
          lib.prepareWAMessageMedia({ image: full }, { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('upload timed out')), 8000)),
        ]);
        if (imageMessage) out.highQualityThumbnail = imageMessage;
      } catch (err) {
        console.log('[pair] the full link picture could not be sent:', err.message);
      }
    }
    return out;
  } catch (err) {
    console.log('[pair] link card not available:', err.message);
    return null;
  }
}

module.exports = { getCard, parseMeta, cache };
