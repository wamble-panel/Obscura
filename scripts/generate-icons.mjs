/**
 * Builds every brand + PWA / iOS home-screen asset from the Obscura logo.
 *
 *   npm run icons
 *
 * Source : design/obscura-logo.png  (mark + wordmark on the sand background)
 * Output : public/icons/*   app icons, apple touch icon, splash
 *          public/brand/*   transparent mark and lockup used inside the UI
 */
import sharp from 'sharp'
import { mkdir, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(root, 'design/obscura-logo.png')
const ICONS = resolve(root, 'public/icons')
const BRAND = resolve(root, 'public/brand')

const SAND = { r: 0xe0, g: 0xdc, b: 0xd0, alpha: 1 }
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

/** Region of the source art holding just the circular mark. */
const MARK_CROP = { left: 78, top: 352, width: 280, height: 366 }

/**
 * Knocks the flat sand backdrop out of the artwork so the logo can sit on any
 * surface. Anything within `tolerance` of the sand colour becomes transparent.
 */
async function toTransparent(buffer, tolerance = 26) {
  const img = sharp(buffer).ensureAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const out = Buffer.from(data)

  for (let i = 0; i < out.length; i += info.channels) {
    const dr = Math.abs(out[i] - SAND.r)
    const dg = Math.abs(out[i + 1] - SAND.g)
    const db = Math.abs(out[i + 2] - SAND.b)
    if (dr < tolerance && dg < tolerance && db < tolerance) {
      out[i + 3] = 0
    }
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer()
}

/** Places artwork centred on a square canvas. */
async function square(logoBuffer, size, scale, background) {
  const inner = Math.round(size * scale)
  const logo = await sharp(logoBuffer)
    .resize(inner, inner, { fit: 'inside', background: TRANSPARENT })
    .png()
    .toBuffer()

  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer()
}

async function main() {
  await access(SOURCE)
  await mkdir(ICONS, { recursive: true })
  await mkdir(BRAND, { recursive: true })

  const source = await sharp(SOURCE).png().toBuffer()

  // --- brand assets (transparent) -----------------------------------------
  const lockup = await sharp(await toTransparent(source)).trim({ threshold: 1 }).png().toBuffer()
  await sharp(lockup).toFile(resolve(BRAND, 'lockup.png'))

  const markRaw = await sharp(source).extract(MARK_CROP).png().toBuffer()
  const mark = await sharp(await toTransparent(markRaw)).trim({ threshold: 1 }).png().toBuffer()
  await sharp(mark).toFile(resolve(BRAND, 'mark.png'))

  // --- app icons -----------------------------------------------------------
  for (const size of [192, 512]) {
    await sharp(await square(mark, size, 0.56, SAND)).toFile(resolve(ICONS, `icon-${size}.png`))
  }

  // Android maskable icons get cropped up to 20% per edge — keep the mark small.
  await sharp(await square(mark, 512, 0.42, SAND)).toFile(resolve(ICONS, 'maskable-512.png'))

  // iOS applies its own rounded mask and dislikes transparency.
  await sharp(await square(mark, 180, 0.54, SAND)).toFile(resolve(ICONS, 'apple-touch-icon.png'))
  await sharp(await square(mark, 32, 0.72, SAND)).toFile(resolve(ICONS, 'favicon-32.png'))

  // --- iOS launch screen ---------------------------------------------------
  const splashLogo = await sharp(lockup)
    .resize(760, 760, { fit: 'inside', background: TRANSPARENT })
    .png()
    .toBuffer()
  await sharp({ create: { width: 1170, height: 2532, channels: 4, background: SAND } })
    .composite([{ input: splashLogo, gravity: 'centre' }])
    .png()
    .toFile(resolve(ICONS, 'splash.png'))

  console.log('✓ brand assets  -> public/brand/{mark,lockup}.png')
  console.log('✓ app icons     -> public/icons/*')
}

main().catch((err) => {
  console.error('Icon generation failed:', err.message)
  process.exit(1)
})
