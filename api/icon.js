// api/icon.js - generates the app icon PNG (no image upload needed). Use /api/icon?s=192 or ?s=512
const zlib = require('zlib');
function crc(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, cr]);
}
function makePng(S) {
  const raw = Buffer.alloc((S * 3 + 1) * S);
  for (let py = 0; py < S; py++) {
    raw[py * (S * 3 + 1)] = 0;
    for (let px = 0; px < S; px++) {
      const x = (px / S - 0.5) * 3.1, y = -(py / S - 0.5) * 3.1 + 0.12;
      const f = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
      let r = 7, g = 4, b = 15;
      if (f > 0) { const k = Math.exp(-f * 7) * 0.9; r += 255 * k * 0.9; g += 46 * k; b += 147 * k; }
      else { const e = Math.exp(f * 14); const w = Math.exp(-Math.pow((f + 0.02) / 0.03, 2));
        r += 255 * (0.12 + 0.5 * e) * 0.5; g += 46 * (0.12 + 0.5 * e) * 0.5; b += 147 * (0.12 + 0.5 * e) * 0.5;
        r += 255 * w; g += 235 * w; b += 250 * w; }
      const o = py * (S * 3 + 1) + 1 + px * 3;
      raw[o] = Math.min(255, r); raw[o + 1] = Math.min(255, g); raw[o + 2] = Math.min(255, b);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
module.exports = (req, res) => {
  const s = Math.min(512, Math.max(48, parseInt((req.query && req.query.s) || new URL(req.url, 'http://x').searchParams.get('s') || '192', 10) || 192));
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).end(makePng(s));
};
