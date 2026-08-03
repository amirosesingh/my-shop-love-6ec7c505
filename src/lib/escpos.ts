/**
 * ESC/POS text renderer.
 *
 * Thermal printers print fastest and most reliably when they receive plain
 * text plus escape codes instead of a driver-rendered bitmap. This module
 * converts the receipt HTML the app already builds into a column-based text
 * slip and encodes it as ESC/POS bytes for the Windows RAW spooler path.
 */

const ESC = 0x1b;
const GS = 0x1d;

export type SlipLine = {
  text: string;
  align?: "left" | "center";
  bold?: boolean;
  big?: boolean;
};

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** Fold a long string onto `cols` characters. */
function wrap(text: string, cols: number): string[] {
  const words = text.split(" ").filter(Boolean);
  if (!words.length) return [""];
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line.length) line = w;
    else if (line.length + 1 + w.length <= cols) line += ` ${w}`;
    else {
      out.push(line);
      line = w;
    }
    while (line.length > cols) {
      out.push(line.slice(0, cols));
      line = line.slice(cols);
    }
  }
  if (line.length) out.push(line);
  return out;
}

/** "Item name .......  12.00" two-column row. */
function columns(left: string, right: string, cols: number): string[] {
  if (!right) return wrap(left, cols);
  const room = Math.max(1, cols - right.length - 1);
  const wrapped = wrap(left, room);
  const first = wrapped[0] ?? "";
  const head = first.padEnd(room, " ") + " " + right.padStart(right.length, " ");
  return [head.slice(0, cols), ...wrapped.slice(1)];
}

/** Convert one receipt HTML document into printable slip lines. */
export function htmlToSlip(html: string, cols: number): SlipLine[] {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: SlipLine[] = [];
  const push = (line: SlipLine) => {
    if (line.text.trim() === "" && lines[lines.length - 1]?.text.trim() === "") return;
    lines.push(line);
  };

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      const cls = child.className?.toString?.() ?? "";
      const centered = /\bc\b|\btag\b|\bbc-text\b/.test(cls) || tag === "h1";
      const bold = /\bb\b/.test(cls) || tag === "h1";

      if (tag === "hr") {
        push({ text: "-".repeat(cols) });
        continue;
      }
      if (tag === "script" || tag === "style" || tag === "svg") continue;
      if (tag === "table") {
        for (const row of Array.from(child.querySelectorAll("tr"))) {
          const cells = Array.from(row.children) as HTMLElement[];
          const rowBold = /\bb\b/.test(row.className?.toString?.() ?? "");
          const rowBig = /\bbig\b/.test(row.className?.toString?.() ?? "");
          const leftCell = cells[0];
          const rightCell = cells[1];
          const notes = leftCell
            ? Array.from(leftCell.querySelectorAll("div")).map((d) => collapse(d.textContent ?? ""))
            : [];
          const leftMain = leftCell
            ? collapse(
                Array.from(leftCell.childNodes)
                  .filter((n) => !(n instanceof HTMLElement && n.tagName === "DIV"))
                  .map((n) => n.textContent ?? "")
                  .join(" "),
              )
            : "";
          const right = rightCell ? collapse(rightCell.textContent ?? "") : "";
          for (const l of columns(leftMain, right, cols))
            push({ text: l, bold: rowBold || rowBig });
          for (const n of notes.filter(Boolean))
            for (const l of wrap(`  ${n}`, cols)) push({ text: l });
        }
        continue;
      }
      if (child.children.length && !["h1", "td", "span"].includes(tag)) {
        // Block wrapper: keep descending unless it only holds plain text.
        const onlyText = Array.from(child.children).every((c) =>
          ["span", "b", "i", "em", "strong"].includes(c.tagName.toLowerCase()),
        );
        if (!onlyText) {
          walk(child);
          continue;
        }
      }
      const text = collapse(child.textContent ?? "");
      if (!text) continue;
      for (const l of wrap(text, cols))
        push({ text: l, ...(centered ? { align: "center" as const } : {}), bold, big: tag === "h1" });
    }
  };

  walk(doc.body);
  while (lines.length && !lines[lines.length - 1].text.trim()) lines.pop();
  return lines;
}

/** Encode slip lines as ESC/POS bytes (init, styling, feed, cut). */
export function slipToBytes(lines: SlipLine[], opts: { cut?: boolean } = {}): number[] {
  const bytes: number[] = [ESC, 0x40]; // initialise
  const text = (s: string) => {
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      bytes.push(code < 0x80 ? code : 0x3f); // '?' for anything outside ASCII
    }
  };

  for (const line of lines) {
    bytes.push(ESC, 0x61, line.align === "center" ? 1 : 0);
    bytes.push(ESC, 0x45, line.bold ? 1 : 0);
    bytes.push(GS, 0x21, line.big ? 0x11 : 0x00);
    text(line.text);
    bytes.push(0x0a);
  }

  bytes.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0x00);
  bytes.push(0x0a, 0x0a, 0x0a, 0x0a);
  if (opts.cut !== false) bytes.push(GS, 0x56, 66, 0x00); // partial cut with feed
  return bytes;
}

/** Column count for a slip width. */
export function columnsForPaper(paper: string): number {
  return paper === "58mm" ? 32 : 42;
}

export function htmlToEscPos(html: string, paper: string): number[] {
  return slipToBytes(htmlToSlip(html, columnsForPaper(paper)));
}
