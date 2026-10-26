import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ico, releaseName, shrink } from './build-app.js'

test('shrinking averages what each pixel covers, and keeps clear clear', () => {
  const src = new Uint8Array(4 * 4 * 4)
  for (let i = 0; i < 16; i++) src.set(i < 8 ? [200, 0, 0, 255] : [0, 0, 0, 0], i * 4)
  const out = shrink(src, 4, 2)
  assert.deepEqual([...out.subarray(0, 4)], [200, 0, 0, 255])
  assert.equal(out[(1 * 2 + 0) * 4 + 3], 0)
})

test('an .ico lists each image with its size and where it is', () => {
  const file = ico([
    { size: 16, png: Buffer.from('aa') },
    { size: 256, png: Buffer.from('bbb') },
  ])
  assert.equal(file.readUInt16LE(4), 2)
  assert.equal(file.readUInt8(6), 16)
  assert.equal(file.readUInt8(22), 0, '256 is written as 0')
  assert.equal(file.readUInt32LE(6 + 8), 2)
  assert.equal(file.subarray(file.readUInt32LE(22 + 12)).toString(), 'bbb')
})

test('the downloads keep one name per system, whatever the version', () => {
  assert.equal(releaseName('darwin', 'arm64'), 'Pixelings-mac-arm64.dmg')
  assert.equal(releaseName('win32', 'x64'), 'Pixelings-windows-x64-setup.exe')
})
