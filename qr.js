// Turns the text of a WhatsApp QR into a picture (SVG) the page can show. Uses the same QR maker the bot's console uses.
const QRCode = require('qrcode-terminal/vendor/QRCode');
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

function toSvg(text) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.L); // -1 = pick the smallest size that fits
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const size = n + quiet * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) {
        c++;
        continue;
      }
      let end = c;
      while (end < n && qr.isDark(r, end)) end++;
      path += `M${c + quiet} ${r + quiet}h${end - c}v1h-${end - c}z`;
      c = end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

const toDataUrl = (text) => 'data:image/svg+xml;base64,' + Buffer.from(toSvg(text)).toString('base64');

module.exports = { toSvg, toDataUrl };
