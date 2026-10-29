// Turns the text of a WhatsApp QR into a picture (SVG) the page can show. Uses the same QR maker that
// the terminal library uses under the hood, but outputs SVG instead of ASCII.

const QRCode = require('qrcode');

async function qrToSvg(text) {
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 1,
      width: 256,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    return svg;
  } catch (err) {
    console.error('QR SVG generation failed:', err);
    return null;
  }
}

module.exports = { qrToSvg };
