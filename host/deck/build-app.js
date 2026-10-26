// Builds Pixelings for this system into dist/: Pixelings.app on macOS,
// Pixelings.exe (in a folder) on Windows. Plain Node, so it runs the same on
// both. It draws the icons first: build/icon.ico always, build/icon.icns on
// macOS (with macOS's iconutil). With --release it also wraps the app as the
// download for GitHub Releases, in dist/release: a .dmg on macOS (with
// macOS's hdiutil), an installer .exe on Windows (with Inno Setup's ISCC and
// pixelings.iss).
//
//   node build-app.js            icons, then the app
//   node build-app.js --icons    icons only
//   node build-app.js --release  icons, the app, then its download
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { appIconPng, appIconRgba } from './icons.js'
import { encodePng } from './png.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const build = path.join(here, 'build')
const { version } = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'))

// The download's file name, the same for every version, so the README can
// link to the latest release's.
export function releaseName(platform, arch) {
  return platform === 'darwin' ? `Pixelings-mac-${arch}.dmg` : `Pixelings-windows-${arch}-setup.exe`
}

// `src` (RGBA, `n` square) shrunk to `size` square, each pixel the average
// of the ones it covers, weighted by how opaque they are.
export function shrink(src, n, size) {
  const out = new Uint8Array(size * size * 4)
  const f = n / size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0
      for (let sy = Math.floor(y * f); sy < Math.floor((y + 1) * f); sy++) {
        for (let sx = Math.floor(x * f); sx < Math.floor((x + 1) * f); sx++) {
          const i = (sy * n + sx) * 4
          const w = src[i + 3]
          r += src[i] * w
          g += src[i + 1] * w
          b += src[i + 2] * w
          a += w
          count++
        }
      }
      const o = (y * size + x) * 4
      if (a > 0) out.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / count)], o)
    }
  }
  return out
}

// A Windows .ico holding PNG images, one per size.
export function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, e)
    header.writeUInt8(size >= 256 ? 0 : size, e + 1)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map(i => i.png)])
}

export function icons() {
  fs.mkdirSync(build, { recursive: true })
  const big = appIconRgba(1024)
  const at = size => (size === 1024 ? appIconPng(1024) : encodePng(shrink(big, 1024, size), size, size, 4))

  fs.writeFileSync(path.join(build, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256].map(size => ({ size, png: at(size) }))))

  if (process.platform === 'darwin') {
    const set = path.join(build, 'icon.iconset')
    fs.rmSync(set, { recursive: true, force: true })
    fs.mkdirSync(set)
    for (const size of [16, 32, 128, 256, 512]) {
      fs.writeFileSync(path.join(set, `icon_${size}x${size}.png`), at(size))
      fs.writeFileSync(path.join(set, `icon_${size}x${size}@2x.png`), at(size * 2))
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(build, 'icon.icns')])
  }
}

async function app() {
  const { packager } = await import('@electron/packager')
  const mac = process.platform === 'darwin'
  const paths = await packager({
    dir: here,
    name: 'Pixelings',
    platform: process.platform,
    arch: process.arch,
    out: path.join(here, 'dist'),
    overwrite: true,
    prune: true,
    icon: path.join(build, mac ? 'icon.icns' : 'icon.ico'),
    appBundleId: 'com.invisionnaire.pixelings',
    appCategoryType: 'public.app-category.developer-tools',
    win32metadata: { CompanyName: 'Invisionnaire', ProductName: 'Pixelings', FileDescription: 'Pixelings' },
    // The app needs its code, its page and its modules; not its tests,
    // tools, builds or scripts.
    ignore: file => {
      const f = file.replace(/\\/g, '/')
      return /\.test\.js$|^\/dist|^\/build|\/(preview|build-app|make-media|export-agents)\.js$|\.(sh|ps1|iss)$/.test(f)
    },
  })
  console.log(paths.join('\n'))
  return paths[0]
}

// The app in `dir` as its download, in dist/release.
function release(dir) {
  const out = path.join(here, 'dist', 'release')
  fs.mkdirSync(out, { recursive: true })
  const file = path.join(out, releaseName(process.platform, process.arch))
  if (process.platform === 'darwin') {
    // Signed ad hoc (no Apple account), so macOS sees it as whole: the
    // packager's edits break Electron's own signature.
    const bundle = path.join(dir, 'Pixelings.app')
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle])
    // The window that opens: the app, and Applications to drag it onto.
    const stage = path.join(here, 'dist', 'dmg')
    fs.rmSync(stage, { recursive: true, force: true })
    fs.mkdirSync(stage)
    execFileSync('ditto', [bundle, path.join(stage, 'Pixelings.app')])
    fs.symlinkSync('/Applications', path.join(stage, 'Applications'))
    execFileSync('hdiutil', ['create', '-volname', 'Pixelings', '-srcfolder', stage, '-ov', '-format', 'UDZO', file])
    fs.rmSync(stage, { recursive: true, force: true })
  } else {
    const iscc = process.env.ISCC ?? path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Inno Setup 6', 'ISCC.exe')
    execFileSync(iscc, [
      `/DAppVersion=${version}`,
      `/DSourceDir=${dir}`,
      `/DOutputDir=${out}`,
      `/DOutputName=${path.basename(file, '.exe')}`,
      path.join(here, 'pixelings.iss'),
    ], { stdio: 'inherit' })
  }
  console.log(file)
}

if (fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  icons()
  if (!process.argv.includes('--icons')) {
    const dir = await app()
    if (process.argv.includes('--release')) release(dir)
  }
}
