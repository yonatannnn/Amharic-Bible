/** Renders a shareable square verse card onto a canvas (Amharic-aware). */

function amharicFamily(): string {
  const el = document.createElement("span");
  el.className = "amharic";
  el.style.cssText = "position:absolute;visibility:hidden;";
  document.body.appendChild(el);
  const fam = getComputedStyle(el).fontFamily || "sans-serif";
  document.body.removeChild(el);
  return fam;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderVerseCard(
  canvas: HTMLCanvasElement,
  { text, reference }: { text: string; reference: string },
) {
  if (document.fonts?.ready) await document.fonts.ready;
  const fam = amharicFamily();
  const W = 1080;
  const H = 1080;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // background gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#6d4aff");
  g.addColorStop(1, "#9b7bff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // decorative quote mark
  ctx.fillStyle = "rgba(255,255,255,0.13)";
  ctx.textAlign = "left";
  ctx.font = "bold 280px Georgia, serif";
  ctx.fillText("“", 60, 300);

  // verse text — shrink to fit
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  const maxW = W - 200;
  let size = 62;
  let lines: string[] = [];
  let lineH = 0;
  for (; size >= 28; size -= 2) {
    ctx.font = `600 ${size}px ${fam}`;
    lines = wrap(ctx, text, maxW);
    lineH = size * 1.5;
    if (lines.length * lineH <= H - 380) break;
  }
  const totalH = lines.length * lineH;
  let y = (H - totalH) / 2 + size;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineH;
  }

  // reference
  ctx.font = `500 36px ${fam}`;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(reference, W / 2, H - 150);

  // watermark
  ctx.font = `600 28px ${fam}`;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText("✝  መጽሐፍ ቅዱስ", W / 2, H - 90);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    ),
  );
}
