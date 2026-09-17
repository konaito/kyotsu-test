import { dncUrl, type DncFile, type Subject } from "./catalog.ts";
import { parseSeikaiDetailed, type SeikaiItem } from "./seikai.ts";

const CACHE = ".cache";
const UA =
  "kousoku-kyotsu-test/0.1 (local research; +https://www.dnc.ac.jp/kyotsu/kakomondai/)";

async function pdftotext(pdfPath: string, flags: string[]): Promise<string> {
  const proc = Bun.spawn(["pdftotext", ...flags, pdfPath, "-"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`pdftotext failed (${code}) ${pdfPath}: ${err.slice(0, 400)}`);
  }
  return out;
}

export async function downloadFile(file: DncFile): Promise<string> {
  const dir = `${CACHE}/pdf`;
  await Bun.$`mkdir -p ${dir}`.quiet();
  const dest = `${dir}/${file.n}`;
  const existing = Bun.file(dest);
  if (await existing.exists()) {
    if (existing.size > 1000) return dest;
  }
  const res = await fetch(dncUrl(file), {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) {
    throw new Error(`download ${file.n}: HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) {
    throw new Error(`download ${file.n}: too small (${buf.length} bytes)`);
  }
  await Bun.write(dest, buf);
  return dest;
}

export function reconstructTategaki(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length > 0) {
      out.push(buf.join(""));
      buf = [];
    }
  };
  for (const line of lines) {
    const s = line.trim();
    if (s.length > 0 && s.length <= 2) {
      buf.push(s);
      continue;
    }
    flush();
    if (s.length > 0) out.push(s);
  }
  flush();
  return out.join("\n");
}

export function isTategaki(raw: string): boolean {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 50) return false;
  const short = lines.filter((l) => l.trim().length <= 2).length;
  return short / lines.length > 0.7;
}

export async function extractExamText(pdfPath: string): Promise<{
  text: string;
  tategaki: boolean;
}> {
  const raw = await pdftotext(pdfPath, ["-raw"]);
  if (isTategaki(raw)) {
    return { text: reconstructTategaki(raw), tategaki: true };
  }
  const layout = await pdftotext(pdfPath, ["-layout"]);
  return { text: layout, tategaki: false };
}

export type SeikaiExtract = {
  items: SeikaiItem[];
  officialMax?: number;
  electiveDaimons?: [string, string][];
};

export async function extractSeikai(
  subject: Subject,
): Promise<SeikaiExtract> {
  const path = await downloadFile(subject.seikai);
  const xml = await pdftotext(path, ["-bbox"]);
  const layout = await pdftotext(path, ["-layout"]);
  return parseSeikaiDetailed(xml, subject.seikaiRange, layout);
}

export type PreparedSubject = {
  subject: Subject;
  examText: string;
  extraTexts: Array<{ label: string; text: string }>;
  seikai: SeikaiItem[];
  tategaki: boolean;
  officialMax?: number;
  electiveDaimons?: [string, string][];
};

export async function prepareSubject(
  subject: Subject,
): Promise<PreparedSubject> {
  const examPath = await downloadFile(subject.exam);
  const exam = await extractExamText(examPath);
  const extraTexts: Array<{ label: string; text: string }> = [];
  for (const extra of subject.extras ?? []) {
    const p = await downloadFile(extra);
    const extracted = await extractExamText(p);
    extraTexts.push({ label: extra.label, text: extracted.text });
  }
  const extracted = await extractSeikai(subject);
  if (exam.text.replace(/\s+/g, "").length < 400) {
    throw new Error(`${subject.name}: 問題文の抽出が短すぎる (${exam.text.length} chars)`);
  }
  return {
    subject,
    examText: exam.text,
    extraTexts,
    seikai: extracted.items,
    tategaki: exam.tategaki,
    officialMax: extracted.officialMax,
    electiveDaimons: extracted.electiveDaimons,
  };
}
