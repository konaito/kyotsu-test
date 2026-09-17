export type SeikaiItem = {
  key: string;
  daimon: string | null;
  slot: string;
  answers: string[];
  /** Official 配点 for this row. Hyphen siblings share the same value; aggregate once per groupId. */
  points: number;
  unordered: boolean;
  groupId: string;
};

type Word = {
  x: number;
  y: number;
  xMax: number;
  yMax: number;
  text: string;
};

type Page = {
  width: number;
  height: number;
  words: Word[];
};

const WORD_RE =
  /<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]*)<\/word>/g;
const PAGE_RE = /<page width="([^"]+)" height="([^"]+)">([\s\S]*?)<\/page>/g;

export function parseBboxPages(xml: string): Page[] {
  const pages: Page[] = [];
  for (const match of xml.matchAll(PAGE_RE)) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    const body = match[3] ?? "";
    const words: Word[] = [];
    for (const w of body.matchAll(WORD_RE)) {
      words.push({
        x: Number(w[1]),
        y: Number(w[2]),
        xMax: Number(w[3]),
        yMax: Number(w[4]),
        text: decodeXml(w[5] ?? ""),
      });
    }
    pages.push({ width, height, words });
  }
  if (pages.length === 0) {
    throw new Error("正解PDFからページを読めなかった");
  }
  return pages;
}

function decodeXml(s: string): string {
  return s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function collapse(s: string): string {
  return s.replace(/\s+/g, "");
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

function near(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

const SLOT_TOKEN =
  /^(?:[0-9０-９]{1,3}(?:[－−―\-][0-9０-９]{1,3})?|[アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン](?:[，,、・][アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン])*)$/;

const ANSWER_TOKEN =
  /^(?:[0-9０-９]{1,2}(?:[，,、・．\.][0-9０-９]{1,2})*(?:[－−―\-][0-9０-９]{1,2}(?:[，,、・．\.][0-9０-９]{1,2})*)?)$/;

/** Per-item 配点 digits (ignore "(配点)", "(Ｎ)", section totals, "＊"). */
const POINTS_TOKEN = /^[0-9０-９]{1,2}$/;

function splitList(raw: string): string[] {
  const half = toHalfWidth(raw);
  return half
    .split(/[，,、・．.]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitHyphen(raw: string): { parts: string[]; hyphen: boolean } {
  const half = toHalfWidth(raw);
  if (/[－−―\-]/.test(half)) {
    const parts = half
      .split(/[－−―\-]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return { parts, hyphen: parts.length > 1 };
  }
  return { parts: [half], hyphen: false };
}

function parseAnswerCell(raw: string): { answers: string[]; unordered: boolean } {
  const { parts, hyphen } = splitHyphen(raw);
  const answers = parts.flatMap(splitList).flatMap((p) => splitList(p));
  return { answers, unordered: hyphen || answers.length > 1 };
}

function parseSlotCell(raw: string): string[] {
  const { parts, hyphen } = splitHyphen(raw);
  if (hyphen) return parts.map((p) => toHalfWidth(p));
  return splitList(raw).map((p) => toHalfWidth(p));
}

function pagePlain(page: Page): string {
  return collapse(page.words.map((w) => w.text).join(""));
}

function findHeaders(
  page: Page,
): Array<{ idX: number; seiX: number; haiX: number; y: number }> {
  const idHeaders = page.words.filter(
    (w) => w.text === "解答番号" || w.text === "解答記号",
  );
  const seiMarks = page.words.filter((w) => w.text === "正");
  const haiMarks = page.words.filter((w) => w.text === "配");
  const out: Array<{ idX: number; seiX: number; haiX: number; y: number }> = [];
  for (const h of idHeaders) {
    const sei = seiMarks
      .filter((s) => s.x > h.x && near(s.y, h.y, 10))
      .sort((a, b) => a.x - b.x)[0];
    if (!sei) continue;
    const hai = haiMarks
      .filter((s) => s.x > sei.x && near(s.y, h.y, 10))
      .sort((a, b) => a.x - b.x)[0];
    if (!hai) continue;
    out.push({ idX: h.x, seiX: sei.x, haiX: hai.x, y: h.y });
  }
  return out;
}

function parsePointsCell(raw: string): number {
  const n = Number(toHalfWidth(raw));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`配点を数値にできない: ${raw}`);
  }
  return n;
}

/**
 * Assign each 配点 cell to at most one answer-number row (nearest by y).
 * Rows with no exclusive cell get 0 — typical for ＊ shared awards where the
 * points sit on one row of a multi-slot set. Hyphen groups still copy points
 * onto every sibling; scoring aggregates once per groupId.
 */
function assignPoints(
  rows: Word[],
  pointWords: Word[],
  haiX: number,
  tol = 10,
): Map<Word, number> {
  type Pair = { d: number; dx: number; pt: Word; row: Word; value: number };
  const pairs: Pair[] = [];
  for (const pt of pointWords) {
    const value = parsePointsCell(pt.text);
    for (const row of rows) {
      const d = Math.abs(row.y - pt.y);
      if (d > tol) continue;
      pairs.push({ d, dx: Math.abs(pt.x - haiX), pt, row, value });
    }
  }
  pairs.sort((a, b) => a.d - b.d || a.dx - b.dx);
  const usedPt = new Set<Word>();
  const usedRow = new Set<Word>();
  const out = new Map<Word, number>();
  for (const p of pairs) {
    if (usedPt.has(p.pt) || usedRow.has(p.row)) continue;
    usedPt.add(p.pt);
    usedRow.add(p.row);
    out.set(p.row, p.value);
  }
  return out;
}

function daimonLabels(page: Page): Word[] {
  return page.words.filter((w) => /^第[0-9０-９一二三四五六七八九十]+問/.test(w.text));
}

function normalizeDaimon(text: string): string {
  const m = text.match(/^第([0-9０-９一二三四五六七八九十]+)問/);
  if (!m) return text;
  const n = toHalfWidth(m[1] ?? "").replace(/[一二三四五六七八九十]/g, (c) => {
    const map: Record<string, string> = {
      一: "1",
      二: "2",
      三: "3",
      四: "4",
      五: "5",
      六: "6",
      七: "7",
      八: "8",
      九: "9",
      十: "10",
    };
    return map[c] ?? c;
  });
  return `第${n}問`;
}

const KANA_ORDER = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";

function kanaOrder(slot: string): number {
  return KANA_ORDER.indexOf(slot);
}

type Draft = SeikaiItem & { x: number; y: number };

function assignDaimons(page: Page, drafts: Draft[]): void {
  const labels = daimonLabels(page);
  if (labels.length === 0) return;
  const mid = page.width / 2;
  for (const left of [true, false]) {
    const pool = labels
      .filter((w) => (w.x < mid) === left)
      .sort((a, b) => a.y - b.y);
    const group = drafts
      .filter((d) => (d.x < mid) === left)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    if (pool.length === 0 || group.length === 0) continue;
    const kana = group.some((d) => kanaOrder(d.slot) >= 0);
    let li = 0;
    let prevOrder = -1;
    for (const d of group) {
      if (kana) {
        const order = kanaOrder(d.slot);
        if (order >= 0 && prevOrder >= 0 && order < prevOrder && li < pool.length - 1) {
          li += 1;
        }
        if (order >= 0) prevOrder = order;
      } else {
        while (li < pool.length - 1) {
          const cur = pool[li]!;
          const next = pool[li + 1]!;
          if (d.y >= (cur.y + next.y) / 2) li += 1;
          else break;
        }
      }
      d.daimon = normalizeDaimon(pool[li]!.text);
      d.key = `${d.daimon}:${d.slot}`;
    }
  }
}

function parsePage(page: Page): SeikaiItem[] {
  const headers = findHeaders(page);
  if (headers.length === 0) return [];
  const drafts: Draft[] = [];

  for (const header of headers) {
    const idMin = header.idX - 15;
    const idMax = header.seiX - 12;
    const seiMin = header.seiX - 8;
    const seiMax = header.seiX + 45;
    const haiMin = header.haiX - 8;
    const haiMax = header.haiX + 40;
    const idWords = page.words.filter(
      (w) =>
        w.y > header.y + 14 &&
        w.x >= idMin &&
        w.x <= idMax &&
        SLOT_TOKEN.test(w.text),
    );
    const answerWords = page.words.filter(
      (w) =>
        w.y > header.y + 14 &&
        w.x >= seiMin &&
        w.x <= seiMax &&
        ANSWER_TOKEN.test(w.text),
    );
    const pointWords = page.words.filter(
      (w) =>
        w.y > header.y + 14 &&
        w.x >= haiMin &&
        w.x <= haiMax &&
        POINTS_TOKEN.test(w.text),
    );

    const matchedRows: Word[] = [];
    const rowMeta = new Map<
      Word,
      { slots: string[]; answers: string[]; unordered: boolean }
    >();
    for (const idWord of idWords) {
      const ansWord = answerWords
        .filter((a) => near(a.y, idWord.y, 8))
        .sort(
          (a, b) =>
            Math.abs(a.y - idWord.y) - Math.abs(b.y - idWord.y) ||
            Math.abs(a.x - header.seiX) - Math.abs(b.x - header.seiX),
        )[0];
      if (!ansWord) continue;
      const slots = parseSlotCell(idWord.text);
      const parsed = parseAnswerCell(ansWord.text);
      if (slots.length === 0 || parsed.answers.length === 0) continue;
      matchedRows.push(idWord);
      rowMeta.set(idWord, {
        slots,
        answers: parsed.answers,
        unordered: parsed.unordered || slots.length > 1,
      });
    }

    const pointsByRow = assignPoints(matchedRows, pointWords, header.haiX);

    for (const idWord of matchedRows) {
      const meta = rowMeta.get(idWord)!;
      const points = pointsByRow.get(idWord) ?? 0;
      const groupId = `g:${idWord.text}:${idWord.x.toFixed(1)}:${idWord.y.toFixed(1)}`;
      for (let i = 0; i < meta.slots.length; i++) {
        const slot = meta.slots[i]!;
        const answers =
          meta.slots.length === meta.answers.length && !meta.unordered
            ? [meta.answers[i]!]
            : meta.answers;
        drafts.push({
          key: slot,
          daimon: null,
          slot,
          answers,
          points,
          unordered: meta.unordered,
          groupId,
          x: idWord.x,
          y: idWord.y,
        });
      }
    }
  }
  assignDaimons(page, drafts);
  const used = new Set<string>();
  const items: SeikaiItem[] = [];
  for (const d of drafts) {
    if (used.has(d.key)) continue;
    used.add(d.key);
    items.push({
      key: d.key,
      daimon: d.daimon,
      slot: d.slot,
      answers: d.answers,
      points: d.points,
      unordered: d.unordered,
      groupId: d.groupId,
    });
  }
  return items;
}

export function parseSeikaiBbox(
  xml: string,
  rangeLabel?: string,
  layoutText?: string,
): SeikaiItem[] {
  const pages = parseBboxPages(xml);
  let selected = pages;
  if (rangeLabel) {
    const needle = `出題範囲：${collapse(rangeLabel)}`;
    const layoutPages = (layoutText ?? "").split("\f").map((p) => collapse(p));
    selected = pages.filter((_, i) => {
      const layout = layoutPages[i] ?? "";
      return layout.includes(needle) || pagePlain(pages[i]!).includes(needle);
    });
  }
  if (selected.length === 0) {
    throw new Error(
      `正解PDFに出題範囲「${rangeLabel}」のページが無い`,
    );
  }
  const items = selected.flatMap(parsePage);
  if (items.length === 0) {
    throw new Error(
      rangeLabel
        ? `出題範囲「${rangeLabel}」から解答番号を抽出できなかった`
        : "正解PDFから解答番号を抽出できなかった",
    );
  }
  return items;
}

export function scoreItem(
  item: SeikaiItem,
  predicted: string | undefined,
  siblings: Array<{ item: SeikaiItem; predicted: string | undefined }>,
): boolean {
  if (item.unordered) {
    const group = siblings.filter((s) => s.item.groupId === item.groupId);
    const pred = group
      .map((g) => g.predicted)
      .filter((v): v is string => v != null)
      .sort();
    const gold = [...item.answers].sort();
    if (pred.length !== gold.length) return false;
    return pred.every((v, i) => v === gold[i]);
  }
  return predicted != null && item.answers.includes(predicted);
}
