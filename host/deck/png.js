// A plain PNG (signature, IHDR, one IDAT, IEND) from RGB pixels (or RGBA,
// with `channels` 4), and a nearest-neighbour upscale for pixel art.
import zlib from 'node:zlib'

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(body))
  return Buffer.concat([len, body, crc])
}

// A Node Buffer over the same bytes (render.js draws into a Uint8Array).
export const asBuffer = px => Buffer.from(px.buffer, px.byteOffset, px.byteLength)

export function encodePng(px, w, h, channels = 3) {
  const rgb = asBuffer(px)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(channels === 4 ? 6 : 2, 9)
  const row = w * channels
  const raw = Buffer.alloc((row + 1) * h)
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (row + 1) + 1, y * row, (y + 1) * row)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function upscale(px, w, h, k) {
  const rgb = asBuffer(px)
  const out = Buffer.alloc(w * k * h * k * 3)
  for (let y = 0; y < h * k; y++) {
    for (let x = 0; x < w * k; x++) {
      const s = (Math.floor(y / k) * w + Math.floor(x / k)) * 3
      rgb.copy(out, (y * w * k + x) * 3, s, s + 3)
    }
  }
  return out
}
