/** PDFの①②③④が Zapf 経由で ! " # $ になる。行頭と範囲表記だけ直す。 */
const DINGBAT_TO_NUM: Record<string, string> = {
  "!": "1",
  '"': "2",
  "#": "3",
  "$": "4",
  "%": "5",
  "&": "6",
};

export function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

function kanjiNum(s: string): string {
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
  if (/^[0-9]+$/.test(s)) return s;
  if (s === "十") return "10";
  if (s.startsWith("十")) return `1${map[s.slice(1)] ?? ""}`;
  if (s.endsWith("十")) return `${map[s[0] ?? ""] ?? ""}0`;
  return s.replace(/[一二三四五六七八九十]/g, (c) => map[c] ?? c);
}

export function normalizeDaimonLabel(raw: string): string {
  const m = toHalfWidthDigits(raw).match(/^第([0-9一二三四五六七八九十]+)問/);
  if (!m) return raw;
  return `第${kanjiNum(m[1] ?? "")}問`;
}

export function normalizeExamText(text: string): string {
  let t = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  t = toHalfWidthDigits(t);
  t = t.replace(/第([0-9一二三四五六七八九十]+)問/g, (_, n) => `第${kanjiNum(n)}問`);
  t = t.replace(/([!"#$%&])〜([!"#$%&])/g, (m, a: string, b: string) => {
    const x = DINGBAT_TO_NUM[a];
    const y = DINGBAT_TO_NUM[b];
    return x && y ? `[${x}]〜[${y}]` : m;
  });
  t = t.replace(
    /^([ \t]{0,16})([!"#$%&])([ \t]{1,})/gm,
    (m, sp: string, d: string, ws: string) => {
      const n = DINGBAT_TO_NUM[d];
      return n ? `${sp}[${n}]${ws}` : m;
    },
  );
  return t;
}

export type Passage = {
  label: string;
  text: string;
};

export function splitPassages(examText: string): Passage[] {
  const text = normalizeExamText(examText);
  const re = /第[0-9]+問/g;
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) return [{ label: "全体", text }];
  const preamble = text.slice(0, matches[0]!.index ?? 0).trim();
  return matches.map((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    const body = text.slice(start, end).trim();
    return {
      label: m[0]!,
      text: preamble ? `${preamble}\n\n${body}` : body,
    };
  });
}

export type ParsedChoice = {
  slot: string;
  stem: string;
  options: Record<string, string>;
};

function extractAnswerSlot(before: string): string | null {
  const head = before.split("\n").slice(0, 10).join("\n");
  const m =
    head.match(
      /(?:選べ|マークせよ|あてはまる|入れよ|Choose|choose|Which|What|When|Who)[^\n]*\s([0-9]{1,3})\s*[.．]?\s*$/m,
    ) ?? head.match(/\s{3,}([0-9]{1,3})\s*[.．]?\s*$/m);
  return m?.[1] ?? null;
}

function collectOptions(block: string): Record<string, string> {
  const options: Record<string, string> = {};
  const re = /^[ \t]*\[([1-9])\][ \t]+(\S.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const key = m[1]!;
    const line = m[2]!.trim();
    options[key] = options[key] ? `${options[key]} ${line}` : line;
  }
  return options;
}

/** 大問テキストから、解答番号/記号ごとの選択肢本文を拾う。失敗したら空。 */
export function parseChoices(section: string): ParsedChoice[] {
  const out: ParsedChoice[] = [];
  const blocks = section.split(/(?=問\s*[0-9]+)/);
  for (const block of blocks) {
    if (!/^問\s*[0-9]+/.test(block.trimStart())) continue;
    const options = collectOptions(block);
    if (Object.keys(options).length < 2) continue;
    const before = block.split(/^[ \t]*\[[1-9]\][ \t]+/m)[0] ?? block;
    const slot = extractAnswerSlot(before);
    if (!slot) continue;
    const stem = before.replace(/^問\s*[0-9]+\s*/, "").replace(/\s+/g, " ").trim();
    out.push({ slot, stem: stem.slice(0, 280), options });
  }

  const kanaBlocks = section.split(/(?=[アイウエオカキクケコサシスセソタチツテト](?:\s|、|，))/);
  for (const block of kanaBlocks) {
    const km = block.match(/^([アイウエオカキクケコサシスセソタチツテト])/);
    if (!km) continue;
    const options = collectOptions(block.slice(0, 1200));
    if (Object.keys(options).length < 2) continue;
    if (out.some((q) => q.slot === km[1])) continue;
    out.push({
      slot: km[1]!,
      stem: block.slice(0, 200).replace(/\s+/g, " ").trim(),
      options,
    });
  }
  return out;
}
