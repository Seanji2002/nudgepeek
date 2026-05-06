#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

function crc32(buf) {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeB = Buffer.from(type)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeB, data])))
  return Buffer.concat([len, typeB, data, crcBuf])
}

function makePNG(w, h, r, g, b, a = 255) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA

  const rowLen = w * 4 + 1
  const raw = Buffer.alloc(rowLen * h)
  for (let y = 0; y < h; y++) {
    raw[y * rowLen] = 0 // filter type: None
    for (let x = 0; x < w; x++) {
      const i = y * rowLen + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const dir = path.resolve(__dirname, '..', 'resources')
fs.mkdirSync(dir, { recursive: true })

// 16x16 white tray icon (used as macOS template image)
fs.writeFileSync(path.join(dir, 'trayTemplate.png'), makePNG(16, 16, 255, 255, 255, 220))
fs.writeFileSync(path.join(dir, 'trayTemplate@2x.png'), makePNG(32, 32, 255, 255, 255, 220))

// 1024x1024 indigo app icon (electron-builder requires >=512x512)
fs.writeFileSync(path.join(dir, 'icon.png'), makePNG(1024, 1024, 124, 106, 247))

console.log(
  'Placeholder icons written to resources/. Replace with production-quality icons before distributing.',
)
