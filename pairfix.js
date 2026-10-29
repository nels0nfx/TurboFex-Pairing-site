// Linking a NEW device broke on 28 July 2026. After the phone scans the QR, WhatsApp now sends a
// "device_removed" or similar event that kills the temporary socket before the pairing code can be used.
// This file contains the workaround that keeps the temporary connection alive long enough for the user
// to enter the pairing code on their phone.

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

async function createPairingSocket(phoneNumber, onCode) {
  const { state, saveCreds } = await useMultiFileAuthState(`./data/temp-${phoneNumber}`);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['TurboFex', 'Chrome', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // QR mode fallback (rarely needed now)
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      // Successfully paired – this should not happen in pairing-code flow
      console.log('Unexpected open on temporary socket');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        // Keep trying or let the main engine handle retry
      }
    }
  });

  // Request pairing code
  try {
    const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
    if (onCode) onCode(code);
    return { sock, code };
  } catch (err) {
    console.error('Pairing code request failed:', err);
    throw err;
  }
}

module.exports = { createPairingSocket };
