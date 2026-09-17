export type DncFile = {
  d: number;
  f: string;
  n: string;
};

export type Subject = {
  id: string;
  name: string;
  exam: DncFile;
  seikai: DncFile;
  extras?: Array<DncFile & { label: string }>;
  /** 共通冊子の正解PDFから、この出題範囲のページだけ使う */
  seikaiRange?: string;
  /** マークする値の候補。正解の数字を見て絞らない（漏洩になる） */
  options: string[];
};

const DIGITS_1_9 = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGITS_0_9 = ["0", ...DIGITS_1_9];

const E771 = 771;
const E740 = 740;

function exam(f: string, n: string): DncFile {
  return { d: E771, f, n };
}
function seikai(f: string, n: string): DncFile {
  return { d: E740, f, n };
}

export const SUBJECTS: Subject[] = [
  {
    id: "kokugo",
    name: "国語",
    exam: exam("abm00005949.pdf", "2025_op_01_kokugo.pdf"),
    seikai: seikai("abm00005149.pdf", "r7_kokugo_seikai.pdf"),
    options: DIGITS_1_9,
  },
  {
    id: "chiri-tankyu",
    name: "地理総合，地理探究",
    exam: exam("abm00005974.pdf", "2025_op_02_chirisougouchiritankyuu.pdf"),
    seikai: seikai("abm00005132.pdf", "r7_chiri_tankyu_seikai.pdf"),
    options: DIGITS_1_9,
  },
  {
    id: "nihonshi-tankyu",
    name: "歴史総合，日本史探究",
    exam: exam("abm00017607.pdf", "2025_op_03_rekisisougounihonshitankyuu.pdf"),
    seikai: seikai("abm00005136.pdf", "r7_nihonshi_tankyu_seikai.pdf"),
    options: DIGITS_1_9,
  },
  {
    id: "sekaishi-tankyu",
    name: "歴史総合，世界史探究",
    exam: exam("abm00005700.pdf", "2025_op_04_rekisisougousekaishitankyuu.pdf"),
    seikai: seikai("abm00005134.pdf", "r7_sekaishi_tankyu_seikai.pdf"),
    options: DIGITS_1_9,
  },
  {
    id: "koukyo-rinri",
    name: "公共，倫理",
    exam: exam("abm00005695.pdf", "2025_op_05_koukyorinri.pdf"),
    seikai: seikai("abm00005131.pdf", "r7_koukyo_rinri_seikai.pdf"),
    extras: [
      {
        ...seikai("abm00005137.pdf", "r7_koukyo_rinri_teisei.pdf"),
        label: "問題訂正",
      },
    ],
    options: DIGITS_1_9,
  },
  {
    id: "koukyo-seiji",
    name: "公共，政治・経済",
    exam: exam("abm00005948.pdf", "2025_op_06_koukyoseijikeizai.pdf"),
    seikai: seikai("abm00005130.pdf", "r7_koukyo_seiji_seikai.pdf"),
    extras: [
      {
        ...seikai("abm00005135.pdf", "r7_koukyo_seiji_teisei.pdf"),
        label: "問題訂正",
      },
    ],
    options: DIGITS_1_9,
  },
  {
    id: "chiri-sougou",
    name: "地理総合",
    exam: exam("abm00005975.pdf", "2025_op_07_chirisougou.pdf"),
    seikai: seikai("abm00005133.pdf", "r7_chiri_rekishi_koukyo_seikai.pdf"),
    seikaiRange: "地理総合",
    extras: [
      {
        ...seikai("abm00005129.pdf", "r7_chiri_sougou_teisei.pdf"),
        label: "問題訂正",
      },
    ],
    options: DIGITS_1_9,
  },
  {
    id: "rekishi-sougou",
    name: "歴史総合",
    exam: exam("abm00005690.pdf", "2025_op_08_rekishisougou.pdf"),
    seikai: seikai("abm00005133.pdf", "r7_chiri_rekishi_koukyo_seikai.pdf"),
    seikaiRange: "歴史総合",
    options: DIGITS_1_9,
  },
  {
    id: "koukyo",
    name: "公共",
    exam: exam("abm00005943.pdf", "2025_op_09_koukyo.pdf"),
    seikai: seikai("abm00005133.pdf", "r7_chiri_rekishi_koukyo_seikai.pdf"),
    seikaiRange: "公共",
    options: DIGITS_1_9,
  },
  {
    id: "butsuri-kiso",
    name: "物理基礎",
    exam: exam("abm00005946.pdf", "2025_op_35_butsurikiso.pdf"),
    seikai: seikai("abm00005164.pdf", "r7_rika_kiso_seikai.pdf"),
    seikaiRange: "物理基礎",
    extras: [
      {
        ...seikai("abm00005166.pdf", "r7_butsuri_kiso_teisei.pdf"),
        label: "問題訂正",
      },
    ],
    options: DIGITS_0_9,
  },
  {
    id: "kagaku-kiso",
    name: "化学基礎",
    exam: exam("abm00005962.pdf", "2025_op_36_kagakukiso.pdf"),
    seikai: seikai("abm00005164.pdf", "r7_rika_kiso_seikai.pdf"),
    seikaiRange: "化学基礎",
    extras: [
      {
        ...seikai("abm00005163.pdf", "r7_kagaku_kiso_teisei.pdf"),
        label: "問題訂正",
      },
    ],
    options: DIGITS_0_9,
  },
  {
    id: "seibutsu-kiso",
    name: "生物基礎",
    exam: exam("abm00005960.pdf", "2025_op_37_seibutsukiso.pdf"),
    seikai: seikai("abm00005164.pdf", "r7_rika_kiso_seikai.pdf"),
    seikaiRange: "生物基礎",
    options: DIGITS_0_9,
  },
  {
    id: "chigaku-kiso",
    name: "地学基礎",
    exam: exam("abm00005971.pdf", "2025_op_38_chigakukiso.pdf"),
    seikai: seikai("abm00005164.pdf", "r7_rika_kiso_seikai.pdf"),
    seikaiRange: "地学基礎",
    options: DIGITS_0_9,
  },
  {
    id: "butsuri",
    name: "物理",
    exam: exam("abm00005964.pdf", "2025_op_39_butsuri.pdf"),
    seikai: seikai("abm00005162.pdf", "r7_butsuri_seikai.pdf"),
    options: DIGITS_0_9,
  },
  {
    id: "kagaku",
    name: "化学",
    exam: exam("abm00005967.pdf", "2025_op_40_kagaku.pdf"),
    seikai: seikai("abm00005160.pdf", "r7_kagaku_seikai.pdf"),
    options: DIGITS_0_9,
  },
  {
    id: "seibutsu",
    name: "生物",
    exam: exam("abm00005966.pdf", "2025_op_41_seibutsu.pdf"),
    seikai: seikai("abm00005159.pdf", "r7_seibutsu_seikai.pdf"),
    options: DIGITS_0_9,
  },
  {
    id: "chigaku",
    name: "地学",
    exam: exam("abm00005972.pdf", "2025_op_42_chigaku.pdf"),
    seikai: seikai("abm00005161.pdf", "r7_chigaku_seikai.pdf"),
    options: DIGITS_0_9,
  },
  {
    id: "reading",
    name: "英語（リーディング）",
    exam: exam("abm00005957.pdf", "2025_op_20_reading.pdf"),
    seikai: seikai("abm00005150.pdf", "r7_reading_seikai.pdf"),
    options: DIGITS_1_9,
  },
  {
    id: "joho",
    name: "情報Ⅰ",
    exam: exam("abm00005965.pdf", "2025_op_43_joho1.pdf"),
    seikai: seikai("abm00005172.pdf", "r7_joho1_seikai.pdf"),
    options: DIGITS_0_9,
  },
];

export function dncUrl(file: DncFile): string {
  return `https://www.dnc.ac.jp/albums/abm.php?d=${file.d}&f=${file.f}&n=${encodeURIComponent(file.n)}`;
}

export function findSubjects(ids: string[] | undefined): Subject[] {
  if (!ids || ids.length === 0) return SUBJECTS;
  const wanted = new Set(ids);
  const found = SUBJECTS.filter((s) => wanted.has(s.id));
  const missing = ids.filter((id) => !SUBJECTS.some((s) => s.id === id));
  if (missing.length > 0) {
    throw new Error(
      `未知の科目id: ${missing.join(", ")}  使えるid: ${SUBJECTS.map((s) => s.id).join(", ")}`,
    );
  }
  return found;
}
