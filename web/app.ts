type SubjectInfo = { id: string; name: string };
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
  probability: number | undefined;
};
type FilledDTO = {
  id: string;
  elapsedMs: number;
  inputTokens: number | undefined;
  items: MarkDTO[];
  demo: boolean;
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

async function loadSubjects() {
  const res = await fetch("/api/subjects");
  const list = (await res.json()) as SubjectInfo[];
  subjectGrid.replaceChildren();
  for (const s of list) {
    const lab = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = s.id;
    input.checked = s.id === "reading";
    lab.append(input, document.createTextNode(s.name));
    subjectGrid.append(lab);
  }
}

function selectedIds(): string[] {
  return [...subjectGrid.querySelectorAll("input:checked")].map(
    (el) => (el as HTMLInputElement).value,
  );
}

function setAllChecked(on: boolean) {
  for (const el of subjectGrid.querySelectorAll("input[type=checkbox]")) {
    (el as HTMLInputElement).checked = on;
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
  const ok = filled.items.filter((i) => i.correct).length;
  tr.innerHTML = `<td>${name}</td><td>${ok}/${filled.items.length}</td><td>${(filled.elapsedMs / 1000).toFixed(2)}s</td>`;
  boardBody.append(tr);
  let c = 0;
  let t = 0;
  let ms = 0;
  for (const row of boardBody.querySelectorAll("tr")) {
    const [num, den] = (row.children[1]?.textContent ?? "0/0").split("/").map(Number);
    c += num ?? 0;
    t += den ?? 0;
    ms += parseFloat(row.children[2]?.textContent ?? "0") * 1000;
  }
  $("board-total").textContent = `${c}/${t}`;
  $("board-time").textContent = `${(ms / 1000).toFixed(2)}s`;
  board.hidden = false;
}

function run() {
  const ids = selectedIds();
  if (ids.length === 0) {
    ticketError.hidden = false;
    ticketError.textContent = "科目を一つは選べ。";
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
  const es = new EventSource(
    `/api/run?subjects=${encodeURIComponent(ids.join(","))}${demo ? "&demo=1" : ""}`,
  );

  const papersById = new Map<string, { el: HTMLElement; paper: PaperDTO }>();
  const pendingFill = new Map<string, Promise<void>>();

  es.addEventListener("status", (ev) => {
    const d = JSON.parse((ev as MessageEvent).data) as {
      phase: string;
      name: string;
    };
    phaseEl.textContent =
      d.phase === "extract" ? `${d.name}　問題冊子を開く。` : `${d.name}　解答中。`;
  });

  es.addEventListener("paper", (ev) => {
    const paper = JSON.parse((ev as MessageEvent).data) as PaperDTO;
    const el = renderPaper(paper);
    papersById.set(paper.id, { el, paper });
  });

  es.addEventListener("filled", (ev) => {
    const filled = JSON.parse((ev as MessageEvent).data) as FilledDTO;
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
  });

  es.addEventListener("error", (ev) => {
    const d = JSON.parse((ev as MessageEvent).data) as {
      id: string;
      name: string;
      error: string;
    };
    const rec = papersById.get(d.id);
    if (rec) {
      const banner = rec.el.querySelector("[data-err]") as HTMLElement | null;
      if (banner) {
        banner.hidden = false;
        banner.textContent = d.error;
      }
    } else {
      ticketError.hidden = false;
      ticketError.textContent = `${d.name}: ${d.error}`;
    }
    phaseEl.textContent = "中断。";
  });

  es.addEventListener("fatal", (ev) => {
    const d = JSON.parse((ev as MessageEvent).data) as { error: string };
    phaseEl.textContent = "中断。";
    ticket.hidden = false;
    ticketError.hidden = false;
    ticketError.textContent = d.error;
  });

  es.addEventListener("done", async () => {
    es.close();
    await Promise.all(pendingFill.values());
    stopClock();
    phaseEl.textContent = "やめ。";
    btnStart.disabled = false;
    $("btn-all").disabled = false;
    $("btn-again").hidden = false;
  });

  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) return;
    phaseEl.textContent = "接続が切れた。";
    es.close();
    stopClock();
    btnStart.disabled = false;
    $("btn-all").disabled = false;
  };
}

$("btn-again").addEventListener("click", () => {
  location.href = location.pathname + (demoBox.checked ? "?demo=1" : "");
});

$("btn-check-all").addEventListener("click", () => setAllChecked(true));
$("btn-all").addEventListener("click", () => {
  setAllChecked(true);
  run();
});
btnStart.addEventListener("click", run);
if (new URLSearchParams(location.search).has("demo")) demoBox.checked = true;
loadSubjects().catch((e) => {
  ticketError.hidden = false;
  ticketError.textContent = String(e);
});
