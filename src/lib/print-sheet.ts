/**
 * Fits an invoice onto a single A4 page.
 *
 * Two things make this awkward.
 *
 * The page break is decided by the browser from the layout height, so the only
 * way to guarantee one page is to make the content genuinely shorter — hence
 * `zoom` rather than `transform: scale()`, which shrinks the picture and leaves
 * the layout the same height, so the page still breaks where the untransformed
 * content ran over.
 *
 * But `zoom` shrinks the width too. Zooming an A4-wide sheet to 0.73 leaves a
 * quarter of the paper blank down the right-hand side, which looks like a
 * mistake rather than a design. So the sheet is made *wider* than A4 by the
 * same factor it is about to be zoomed by: the two cancel out, the sheet lands
 * exactly A4 wide, and the invoice gets denser rather than smaller-and-adrift.
 *
 * Widening reflows the text and changes the height, so the width and the scale
 * have to be solved together — a few rounds of measuring, which converge fast
 * because a wider sheet is always a shorter one.
 *
 * All of it happens against a forced print layout rather than the screen one:
 * a phone renders the sheet at 380px wide, where it is three times as tall as
 * it will be on paper.
 */

/** A4 at the 96dpi CSS reference, and the padding the print sheet gives itself. */
const A4_WIDTH_PX = 794
const A4_HEIGHT_PX = 1122 // 297mm
const PADDING_X_PX = 49 // 13mm
const PADDING_Y_PX = 45 // 12mm

/**
 * Aim a few pixels short of the page.
 *
 * scrollHeight is a rounded-up integer and the zoomed height is rounded again,
 * so a scale that fits the page exactly lands two or three pixels over it —
 * and three pixels over is a second sheet of paper with nothing on it.
 */
const SAFETY_PX = 8

/**
 * Never shrink past this. Below it the invoice is unreadable, and a second page
 * is the better outcome — the alternative is a document nobody can read.
 */
const MIN_SCALE = 0.55

const ROUNDS = 8

export type PrintFit = {
  /** What to pass to `zoom`. */
  scale: number
  /** The width to lay the sheet out at, before zoom, in CSS pixels. */
  width: number
}

export function fitToOnePage(sheet: HTMLElement): PrintFit {
  const style = sheet.style
  const saved = {
    width: style.width,
    maxWidth: style.maxWidth,
    padding: style.padding,
    zoom: style.zoom,
  }

  style.zoom = '1'
  style.maxWidth = 'none'

  const target = A4_HEIGHT_PX - SAFETY_PX
  const maxWidth = A4_WIDTH_PX / MIN_SCALE
  let width = A4_WIDTH_PX
  let scale = 1

  for (let round = 0; round < ROUNDS; round++) {
    style.width = `${width}px`
    // Padding is part of the sheet, so it has to scale with it — otherwise a
    // widened sheet keeps A4 margins and they shrink to nothing under zoom.
    const pad = width / A4_WIDTH_PX
    style.padding = `${PADDING_Y_PX * pad}px ${PADDING_X_PX * pad}px`

    // Reading a layout property is what forces the browser to apply the above.
    const height = sheet.scrollHeight
    if (!height) break

    // At this width the sheet must be zoomed by A4/width to come out A4 wide.
    scale = A4_WIDTH_PX / width
    const printed = height * scale
    if (printed <= target) break

    // Already as small as is worth going, and it was measured there — this is
    // an invoice long enough to deserve a second page.
    if (width >= maxWidth) break

    // A wider sheet is a shorter one; step by however much it overran, but
    // never past the floor, and always measure at whatever width we land on.
    width = Math.min(maxWidth, width * (printed / target))
  }

  style.width = saved.width
  style.maxWidth = saved.maxWidth
  style.padding = saved.padding
  style.zoom = saved.zoom

  scale = Math.max(MIN_SCALE, Math.min(1, Math.floor(scale * 1000) / 1000))
  return { scale, width: A4_WIDTH_PX / scale }
}

/** Measures, applies the fit, and opens the browser's print / save sheet. */
export function printOnePage(selector = '.ob-sheet') {
  const sheet = document.querySelector<HTMLElement>(selector)
  if (sheet) {
    const fit = fitToOnePage(sheet)
    const root = document.documentElement.style
    root.setProperty('--print-scale', String(fit.scale))
    root.setProperty('--print-width', `${fit.width}px`)
    root.setProperty('--print-pad-x', `${(PADDING_X_PX / fit.scale).toFixed(2)}px`)
    root.setProperty('--print-pad-y', `${(PADDING_Y_PX / fit.scale).toFixed(2)}px`)
  }
  window.print()
}
