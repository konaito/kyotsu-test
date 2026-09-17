type SubjectInfo = { id: string; name: string; hasFixture?: boolean };
type SlotDTO = { key: string; slot: string; daimon: string | null };
type PaperDTO = {
  id: string;
  name: string;
  options: string[];
  slots: SlotDTO[];
  tategaki: boolean;
  extraLabels: string[];
};
type MarkDTO = {
  key: string;
  predicted: string | undefined;
  gold: string[];
  unordered: boolean;
  correct: boolean;
  points: number;
  probability: number | undefined;
};
type FilledDTO = {
  id: string;
  elapsedMs: number;
  inputTokens: number | undefined;
  items: MarkDTO[];
  demo: boolean;
  score: number;
  maxScore: number;
};

const $ = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が無い`);
  return el as T;
};

const subjectGrid = $("subject-grid");
const ticket = $("ticket");
const stage = $("stage");
const papers = $("papers");
const phaseEl = $("phase");
const clockEl = $("clock");
const board = $("board");
const boardBody = $("board-body") as HTMLTableSectionElement;
const btnStart = $("btn-start") as HTMLButtonElement;
const demoBox = $("demo") as HTMLInputElement;
const ticketError = $("ticket-error");

let clockRaf = 0;
let clockOrigin = 0;
let runAbort: AbortController | null = null;

function formatClock(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function startClock() {
  clockOrigin = performance.now();
  const tick = () => {
    clockEl.textContent = formatClock(performance.now() - clockOrigin);
    clockRaf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(clockRaf);
  tick();
}

function stopClock() {
  cancelAnimationFrame(clockRaf);
}

function unlockControls() {
  btnStart.disabled = false;
  $("btn-all").disabled = false;
}

function showFatal(message: string) {
  stopClock();
  unlockControls();
  phaseEl.textContent = "中断。";
  ticket.hidden = false;
  stage.hidden = false;
  ticketError.hidden = false;
  ticketError.textContent = message;
  $("btn-again").hidden = false;
}

function humanizeApiError(raw: string): string {
  if (/AI_GATEWAY_API_KEY/.test(raw)) {
    return "ライブ解答には AI_GATEWAY_API_KEY が必要です。デモにチェックするか、Vercel に AI_GATEWAY_API_KEY を設定してください。";
  }
  return raw;
}

async function loadSubjects() {
  const res = await fetch("/api/subjects");
  if (!res.ok) {
    throw new Error(`科目一覧の取得に失敗: HTTP ${res.status}`);
  }
  const list = (await res.json()) as SubjectInfo[];
  subjectGrid.replaceChildren();
  for (const s of list) {
    const lab = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = s.id;
    const ok = s.hasFixture !== false;
    input.disabled = !ok;
    // Default: reading only (fixture). Other fixture subjects stay unchecked.
    input.checked = ok && s.id === "reading";
    if (!ok) {
      lab.classList.add("no-fixture");
      lab.title = "JSON fixture 未収録（Web 経路では選べません）";
      lab.append(input, document.createTextNode(`${s.name}（未収録）`));
    } else {
      lab.append(input, document.createTextNode(s.name));
    }
    subjectGrid.append(lab);
  }
}

function selectedIds(): string[] {
  return [...subjectGrid.querySelectorAll("input:checked:not(:disabled)")].map(
    (el) => (el as HTMLInputElement).value,
  );
}

function setAllChecked(on: boolean) {
  for (const el of subjectGrid.querySelectorAll("input[type=checkbox]")) {
    const input = el as HTMLInputElement;
    if (input.disabled) continue;
    input.checked = on;
  }
}

function split<T>(arr: T[]): [T[], T[]] {
  const mid = Math.ceil(arr.length / 2);
  return [arr.slice(0, mid), arr.slice(mid)];
}

function renderPaper(paper: PaperDTO): HTMLElement {
  const el = document.createElement("article");
  el.className = "paper";
  el.dataset.id = paper.id;
  const extras = paper.extraLabels.length ? `　${paper.extraLabels.join("・")}` : "";
  el.innerHTML = `
    <div class="paper-head">
      <h2>${paper.name}</h2>
      <div class="paper-meta">${paper.slots.length}問${paper.tategaki ? "　縦書き復元" : ""}${extras}</div>
    </div>
    <div class="sheet"></div>
    <div class="stamp" data-stamp>済</div>
    <p class="err-banner" data-err hidden></p>
  `;
  const sheet = el.querySelector(".sheet")!;
  const [left, right] = split(paper.slots);
  for (const colSlots of [left, right]) {
    const col = document.createElement("div");
    for (const slot of colSlots) {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.key = slot.key;
      const qno = document.createElement("div");
      qno.className = "qno";
      qno.textContent = slot.daimon ? `${slot.daimon} ${slot.slot}` : slot.slot;
      const ovals = document.createElement("div");
      ovals.className = "ovals";
      for (const opt of paper.options) {
        const oval = document.createElement("span");
        oval.className = "oval";
        oval.dataset.v = opt;
        oval.textContent = opt;
        ovals.append(oval);
      }
      const gold = document.createElement("span");
      gold.className = "gold";
      ovals.append(gold);
      row.append(qno, ovals);
      col.append(row);
    }
    sheet.append(col);
  }
  papers.append(el);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return el;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function playFill(paperEl: HTMLElement, filled: FilledDTO) {
  const playMs = Math.min(2400, Math.max(900, filled.elapsedMs * 7));
  const dt = playMs / Math.max(filled.items.length, 1);
  for (const item of filled.items) {
    const row = paperEl.querySelector(`[data-key="${CSS.escape(item.key)}"]`);
    if (!row || !item.predicted) continue;
    const oval = row.querySelector(`.oval[data-v="${CSS.escape(item.predicted)}"]`);
    oval?.classList.add("on");
    await sleep(dt);
  }
}

async function grade(paperEl: HTMLElement, filled: FilledDTO) {
  phaseEl.textContent = "自己採点。";
  for (const item of filled.items) {
    const row = paperEl.querySelector(`[data-key="${CSS.escape(item.key)}"]`);
    if (!row) continue;
    row.classList.add(item.correct ? "grade-ok" : "grade-ng");
    const gold = row.querySelector(".gold");
    if (gold && !item.correct) {
      gold.textContent = `正 ${item.gold.join("・")}`;
    }
    await sleep(18);
  }
  const stamp = paperEl.querySelector("[data-stamp]");
  if (stamp) {
    stamp.textContent = filled.demo ? "デモ" : "済";
    stamp.classList.add("show");
    if (filled.demo) stamp.classList.add("demo");
  }
}

function addBoardRow(name: string, filled: FilledDTO) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${name}</td><td>${filled.score}/${filled.maxScore}</td><td>${(filled.elapsedMs / 1000).toFixed(2)}s</td>`;
  boardBody.append(tr);
  let score = 0;
  let maxScore = 0;
  let ms = 0;
  for (const row of boardBody.querySelectorAll("tr")) {
    const [num, den] = (row.children[1]?.textContent ?? "0/0").split("/").map(Number);
    score += num ?? 0;
    maxScore += den ?? 0;
    ms += parseFloat(row.children[2]?.textContent ?? "0") * 1000;
  }
  $("board-total").textContent = `${score}/${maxScore}`;
  $("board-time").textContent = `${(ms / 1000).toFixed(2)}s`;
  board.hidden = false;
}

/** Parse one SSE block: event + data lines. */
function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: string) => void | Promise<void>,
) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const parsed = parseSseBlock(block);
      if (parsed) await onEvent(parsed.event, parsed.data);
    }
  }
  if (buf.trim()) {
    const parsed = parseSseBlock(buf);
    if (parsed) await onEvent(parsed.event, parsed.data);
  }
}

async function run() {
  const ids = selectedIds();
  if (ids.length === 0) {
    ticketError.hidden = false;
    ticketError.textContent = "科目を一つは選べ（fixture 収録科目のみ）。";
    return;
  }
  ticketError.hidden = true;
  ticket.hidden = true;
  stage.hidden = false;
  papers.replaceChildren();
  boardBody.replaceChildren();
  board.hidden = true;
  $("btn-again").hidden = true;
  btnStart.disabled = true;
  $("btn-all").disabled = true;
  startClock();
  phaseEl.textContent = "問題冊子を開く。";

  const demo = demoBox.checked || new URLSearchParams(location.search).has("demo");
  const url = `/api/run?subjects=${encodeURIComponent(ids.join(","))}${demo ? "&demo=1" : ""}`;

  runAbort?.abort();
  runAbort = new AbortController();
  const papersById = new Map<string, { el: HTMLElement; paper: PaperDTO }>();
  const pendingFill = new Map<string, Promise<void>>();
  let finished = false;

  const onEvent = async (event: string, raw: string) => {
    if (event === "status") {
      const d = JSON.parse(raw) as { phase: string; name: string };
      phaseEl.textContent =
        d.phase === "extract" ? `${d.name}　問題冊子を開く。` : `${d.name}　解答中。`;
      return;
    }
    if (event === "paper") {
      const paper = JSON.parse(raw) as PaperDTO;
      const el = renderPaper(paper);
      papersById.set(paper.id, { el, paper });
      return;
    }
    if (event === "filled") {
      const filled = JSON.parse(raw) as FilledDTO;
      const rec = papersById.get(filled.id);
      if (!rec) return;
      const p = (async () => {
        phaseEl.textContent = `${rec.paper.name}　実測 ${(filled.elapsedMs / 1000).toFixed(2)} 秒。`;
        await playFill(rec.el, filled);
        await sleep(500);
        await grade(rec.el, filled);
        addBoardRow(rec.paper.name, filled);
      })();
      pendingFill.set(filled.id, p);
      return;
    }
    if (event === "error") {
      const d = JSON.parse(raw) as { id?: string; name?: string; error: string };
      const msg = humanizeApiError(d.error);
      const rec = d.id ? papersById.get(d.id) : undefined;
      if (rec) {
        const banner = rec.el.querySelector("[data-err]") as HTMLElement | null;
        if (banner) {
          banner.hidden = false;
          banner.textContent = msg;
        }
      } else {
        ticketError.hidden = false;
        ticketError.textContent = d.name ? `${d.name}: ${msg}` : msg;
      }
      phaseEl.textContent = "中断。";
      return;
    }
    if (event === "fatal") {
      const d = JSON.parse(raw) as { error: string };
      showFatal(humanizeApiError(d.error));
      finished = true;
      return;
    }
    if (event === "done") {
      finished = true;
      await Promise.all(pendingFill.values());
      stopClock();
      phaseEl.textContent = "やめ。";
      unlockControls();
      $("btn-again").hidden = false;
    }
  };

  try {
    const res = await fetch(url, {
      signal: runAbort.signal,
      headers: { Accept: "text/event-stream" },
    });
    const ctype = res.headers.get("content-type") ?? "";
    if (!res.ok || !ctype.includes("text/event-stream")) {
      let msg = `HTTP ${res.status}`;
      const t = await res.text();
      try {
        const j = JSON.parse(t) as { error?: string };
        if (j.error) msg = humanizeApiError(j.error);
        else if (t) msg = humanizeApiError(t.slice(0, 400));
      } catch {
        if (t) msg = humanizeApiError(t.slice(0, 400));
      }
      showFatal(msg);
      return;
    }
    if (!res.body) {
      showFatal("応答ボディが空です。");
      return;
    }
    await consumeSse(res.body, onEvent);
    if (!finished) {
      showFatal("ストリームが途中で切れました。");
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    showFatal(e instanceof Error ? e.message : String(e));
  }
}

$("btn-again").addEventListener("click", () => {
  location.href = location.pathname + (demoBox.checked ? "?demo=1" : "");
});

$("btn-check-all").addEventListener("click", () => setAllChecked(true));
$("btn-all").addEventListener("click", () => {
  setAllChecked(true);
  void run();
});
btnStart.addEventListener("click", () => void run());
if (new URLSearchParams(location.search).has("demo")) demoBox.checked = true;
loadSubjects().catch((e) => {
  ticketError.hidden = false;
  ticketError.textContent = String(e);
});
