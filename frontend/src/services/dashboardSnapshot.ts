/**
 * "Exactly what's on screen" PDF export of the dashboard.
 *
 * Renders the live dashboard DOM to a canvas with modern-screenshot, which
 * works by having the browser itself paint a clone of the page inside an
 * SVG <foreignObject> — so it supports everything the browser does,
 * including the oklab()/color-mix() colours Tailwind v4 generates (which
 * is what broke the old html2canvas-based export) and the web fonts.
 *
 * The canvas is then laid onto A4 pages, breaking only *between* cards
 * (elements marked `data-snapshot-block`) so no chart is cut in half — or
 * onto one long page, if the person prefers a single continuous image.
 *
 * Elements marked `data-snapshot-exclude` (buttons, the period picker) are
 * hidden for the capture and `data-snapshot-only` ones (a title strip) are
 * shown, via the `.snapshotting` class on the captured root.
 */
import jsPDF from 'jspdf';
import { domToCanvas } from 'modern-screenshot';

export type SnapshotLayout = 'pages' | 'single';

interface Options {
  fileName: string;
  layout: SnapshotLayout;
  footerLabel: string;
  onStage?: (stage: 'preparing' | 'rendering' | 'paginating') => void;
}

/**
 * The app's fonts come from Google Fonts — a cross-origin stylesheet that
 * modern-screenshot can't read, so by default the snapshot would fall back
 * to system fonts (different widths → text wrapping that isn't on screen).
 * Fetch that stylesheet ourselves (Google serves it with CORS), keep the
 * Latin subsets (latin-ext carries the ₹ sign), inline each font file as a
 * data URL, and hand the result to modern-screenshot. Cached per session.
 */
let fontCssPromise: Promise<string | undefined> | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function buildEmbeddedFontCss(): Promise<string | undefined> {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]'));
  if (!links.length) return undefined;
  const sheets = await Promise.all(links.map((l) => fetch(l.href).then((r) => (r.ok ? r.text() : ''))));
  const blocks: string[] = [];
  sheets.forEach((css) => {
    // Google's CSS is a series of "/* subset */ @font-face { ... }" pairs.
    const re = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*{[^}]*})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      if (m[1] === 'latin' || m[1] === 'latin-ext') blocks.push(m[2]);
    }
  });
  const urls = Array.from(new Set(blocks.flatMap((b) => Array.from(b.matchAll(/url\((https:[^)]+)\)/g), (x) => x[1]))));
  const dataUrls = new Map<string, string>();
  await Promise.all(
    urls.map(async (u) => {
      const res = await fetch(u);
      if (res.ok) dataUrls.set(u, await blobToDataUrl(await res.blob()));
    })
  );
  return blocks.map((b) => b.replace(/url\((https:[^)]+)\)/g, (all, u) => (dataUrls.has(u) ? `url(${dataUrls.get(u)})` : all))).join('\n');
}

/** Start fetching fonts early (e.g. when the export dialog opens). */
export function prepareSnapshotFonts() {
  void embeddedFontCss();
}

function embeddedFontCss() {
  if (!fontCssPromise) {
    fontCssPromise = buildEmbeddedFontCss().catch((err) => {
      console.warn('Could not embed web fonts for the snapshot:', err);
      fontCssPromise = null;
      return undefined;
    });
  }
  return fontCssPromise;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const A4_W = 210;
const A4_H = 297;
const MARGIN = 8;
const FOOTER = 7;

function parseRgb(color: string): [number, number, number] {
  const m = color.match(/(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [238, 241, 238];
}

export async function exportDashboardSnapshot(el: HTMLElement, { fileName, layout, footerLabel, onStage }: Options): Promise<void> {
  onStage?.('preparing');
  el.classList.add('snapshotting');
  try {
    await nextFrame();
    // Let any in-flight chart / count-up animations settle.
    await new Promise((resolve) => setTimeout(resolve, 350));

    const background = getComputedStyle(document.body).backgroundColor || 'rgb(238, 241, 238)';
    const widthPx = el.offsetWidth;
    const heightPx = el.scrollHeight;
    const rootTop = el.getBoundingClientRect().top;
    const cuts = Array.from(el.querySelectorAll<HTMLElement>('[data-snapshot-block]'))
      .map((b) => Math.round(b.getBoundingClientRect().top - rootTop) - 6)
      .filter((y) => y > 0 && y < heightPx)
      .sort((a, b) => a - b);

    // Keep the canvas under ~16.7M pixels (Safari's limit), at most 2x.
    const scale = Math.max(1, Math.min(2, Math.sqrt(16_000_000 / (widthPx * heightPx))));

    onStage?.('rendering');
    const fontCss = await embeddedFontCss();
    const canvas = await domToCanvas(el, {
      font: fontCss ? { cssText: fontCss } : undefined,
      scale,
      backgroundColor: background,
      width: widthPx,
      height: heightPx,
      timeout: 15000,
      // Skip the period picker etc. outright (belt and braces with the CSS).
      filter: (node) => !(node instanceof HTMLElement && node.dataset.snapshotExclude !== undefined),
    });

    onStage?.('paginating');
    const [r, g, b] = parseRgb(background);
    const imgW = A4_W - MARGIN * 2;
    const mmPerPx = imgW / widthPx;

    if (layout === 'single') {
      const pageH = heightPx * mmPerPx + MARGIN * 2 + FOOTER;
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [A4_W, pageH], compress: true });
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, A4_W, pageH, 'F');
      doc.addImage(canvas, 'PNG', MARGIN, MARGIN, imgW, heightPx * mmPerPx, undefined, 'FAST');
      footer(doc, footerLabel, 1, 1, pageH, [r, g, b]);
      doc.save(fileName);
      return;
    }

    // A4 pages, cutting only at card boundaries where possible.
    const pageContentPx = (A4_H - MARGIN * 2 - FOOTER) / mmPerPx;
    const slices: [number, number][] = [];
    let start = 0;
    while (start < heightPx - 1) {
      const limit = start + pageContentPx;
      if (limit >= heightPx) {
        slices.push([start, heightPx]);
        break;
      }
      const candidates = cuts.filter((c) => c > start + pageContentPx * 0.35 && c <= limit);
      const end = candidates.length ? candidates[candidates.length - 1] : Math.floor(limit);
      slices.push([start, end]);
      start = end;
    }

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const slice = document.createElement('canvas');
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    slices.forEach(([top, bottom], i) => {
      if (i > 0) doc.addPage();
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, A4_W, A4_H, 'F');
      const srcY = Math.round(top * scale);
      const srcH = Math.max(1, Math.round((bottom - top) * scale));
      slice.width = canvas.width;
      slice.height = srcH;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      doc.addImage(slice, 'PNG', MARGIN, MARGIN, imgW, (bottom - top) * mmPerPx, undefined, 'FAST');
      footer(doc, footerLabel, i + 1, slices.length, A4_H, [r, g, b]);
    });
    doc.save(fileName);
  } finally {
    el.classList.remove('snapshotting');
  }
}

function footer(doc: jsPDF, label: string, page: number, total: number, pageH: number, bg: [number, number, number]) {
  // Light text on dark backgrounds, slate on light ones.
  const dark = bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114 < 128;
  doc.setTextColor(...((dark ? [158, 171, 158] : [92, 107, 100]) as [number, number, number]));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(label.replace(/[^\x20-\x7E\xA0-\xFF]/g, ''), MARGIN, pageH - 5);
  doc.text(`Page ${page} of ${total}`, A4_W - MARGIN, pageH - 5, { align: 'right' });
}
