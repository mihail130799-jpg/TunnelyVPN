// Генерирует иконки приложения из векторного знака Tunnely (тоннель из логотипа):
//   build/icon.ico, build/icon.png      — иконка EXE, установщика, меню «Пуск»
//   resources/tray-on.png / tray-off.png — значок в трее (свет в тоннеле / без света)
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const ARCH_COLORS = ['#3FC3F5', '#3E8EF0', '#3561DD', '#2C40B8', '#24298F', '#1B1C66']

/** Знак Tunnely в квадрате 1024×1024. lit — горит ли свет в конце тоннеля. */
export function markSvg({ lit = true, background = true, arches = 6 } = {}) {
  const cx = 512, base = 760
  const radii = [400, 336, 276, 220, 168, 122].slice(0, arches)
  const grads = radii.map((_, i) => `
    <linearGradient id="a${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ARCH_COLORS[i]}"/>
      <stop offset=".7" stop-color="${ARCH_COLORS[Math.min(i + 1, 5)]}"/>
      <stop offset="1" stop-color="#8B5CF6"/>
    </linearGradient>`).join('')
  const paths = radii.map((r, i) => {
    const cy = 640 + i * 6, bottom = base - i * 10
    return `<path d="M${cx - r} ${bottom} V${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} V${bottom} Z" fill="url(#a${i})"/>`
  }).join('')
  const dim = lit ? '' : 'filter="url(#dim)"'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#121A63"/><stop offset=".55" stop-color="#1E1B8A"/><stop offset="1" stop-color="#6D28D9"/>
    </linearGradient>
    ${grads}
    <radialGradient id="glow" cx="${cx}" cy="660" r="330" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff"/><stop offset=".12" stop-color="#F5F3FF"/>
      <stop offset=".35" stop-color="#C4B5FD" stop-opacity=".7"/><stop offset="1" stop-color="#7C3AED" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fadeG" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".75" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect x="0" y="200" width="1024" height="${base - 190}" fill="url(#fadeG)"/>
    </mask>
    <filter id="dim"><feColorMatrix type="saturate" values=".35"/><feComponentTransfer><feFuncR type="linear" slope=".55"/><feFuncG type="linear" slope=".55"/><feFuncB type="linear" slope=".6"/></feComponentTransfer></filter>
  </defs>
  ${background ? '<rect width="1024" height="1024" rx="224" fill="url(#bg)"/>' : ''}
  <g mask="url(#fade)" ${dim}>${paths}</g>
  ${lit ? `<circle cx="${cx}" cy="660" r="330" fill="url(#glow)"/>` : ''}
  <path d="M470 715 V650 A42 42 0 0 1 554 650 V715 Z" fill="${lit ? '#fff' : '#05061A'}"/>
  <path d="M470 715 H554 L700 900 H324 Z" fill="${lit ? '#4B3BB0' : '#251E63'}"/>
  <path d="M512 728 V900" stroke="${lit ? '#EEF2FF' : '#6B6FA0'}" stroke-width="16" stroke-dasharray="34 30" stroke-linecap="round"/>
</svg>`
}

async function png(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(root, 'build'), { recursive: true })
  mkdirSync(join(root, 'resources'), { recursive: true })

  const full = markSvg()
  writeFileSync(join(root, 'build', 'icon.svg'), full)
  writeFileSync(join(root, 'build', 'icon.png'), await png(full, 512))
  writeFileSync(join(root, 'resources', 'icon.png'), await png(full, 256))
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  writeFileSync(join(root, 'build', 'icon.ico'), await pngToIco(await Promise.all(icoSizes.map(s => png(full, s)))))

  // Трей: упрощённый знак (4 свода), чтобы читался в 16–32 px
  for (const [name, lit] of [['tray-on', true], ['tray-off', false]]) {
    const svg = markSvg({ lit, arches: 4 })
    writeFileSync(join(root, 'resources', `${name}.png`), await png(svg, 32))
    writeFileSync(join(root, 'resources', `${name}@2x.png`), await png(svg, 64))
  }
  console.log('Готово: build/icon.ico, build/icon.png, resources/tray-*.png')
}
