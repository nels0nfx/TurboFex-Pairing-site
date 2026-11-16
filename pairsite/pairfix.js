// Linking a NEW device broke on 28 July 2026. After the phone scans the QR, WhatsApp now sends a
// "companion_reg_refresh" notice and retires the secret that the QR carried. The WhatsApp library ignores that notice,
// so the link never finishes and the phone says "Couldn't link device". (Pairing CODES are refused by WhatsApp
// altogether at the moment, which is why a code never worked.)
//
// The fix, the same as the library's open fix (Baileys pull request 2765): when the notice arrives, make a new secret,
// save it, and show the SAME QR again with the new secret. The next scan then completes the link.
// Only used while the bot is not linked yet. Remove it when a library release handles this itself.
const crypto = require('crypto');

function install(sock) {
  const ws = sock.ws;
  let rotated = false;
  let lastQr = null;
  let onRefresh = null;
  const creds = () => sock.authState && sock.authState.creds;

  // the QR is "reference,noise key,identity key,secret": the 4th part is replaced by the current secret
  const fixQr = (qr) => {
    lastQr = qr;
    if (!rotated) return qr;
    const parts = String(qr).split(',');
    const adv = creds() && creds().advSecretKey;
    if (parts.length >= 4 && adv) parts[3] = adv;
    return parts.join(',');
  };

  if (ws && typeof ws.on === 'function') {
    ws.on('CB:notification,type:companion_reg_refresh', (node) => {
      const c = creds();
      if (!c || c.registered) return;
      const kids = Array.isArray(node && node.content) ? node.content.map((k) => k && k.tag) : [];
      if (!kids.some((t) => t === 'companion_reg_refresh' || t === 'pair-device-rotate-qr')) return;
      const adv = crypto.randomBytes(32).toString('base64');
      c.advSecretKey = adv;
      try {
        sock.ev.emit('creds.update', { advSecretKey: adv });
      } catch (err) {
        // the secret is already set on the login itself
      }
      rotated = true;
      console.log('🔄 WhatsApp asked for a refreshed QR (this is normal). Scan the NEW QR that appears now.');
      if (lastQr && onRefresh) onRefresh(fixQr(lastQr));
    });
  }

  return { fixQr, onRefresh: (fn) => (onRefresh = fn) };
}

module.exports = { install };
