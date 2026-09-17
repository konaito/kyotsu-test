const SUBJECTS = [
  { id: "kokugo", name: "国語", hasFixture: true },
  { id: "chiri-tankyu", name: "地理総合，地理探究", hasFixture: false },
  { id: "nihonshi-tankyu", name: "歴史総合，日本史探究", hasFixture: false },
  { id: "sekaishi-tankyu", name: "歴史総合，世界史探究", hasFixture: false },
  { id: "koukyo-rinri", name: "公共，倫理", hasFixture: false },
  { id: "koukyo-seiji", name: "公共，政治・経済", hasFixture: false },
  { id: "chiri-sougou", name: "地理総合", hasFixture: true },
  { id: "rekishi-sougou", name: "歴史総合", hasFixture: false },
  { id: "koukyo", name: "公共", hasFixture: false },
  { id: "butsuri-kiso", name: "物理基礎", hasFixture: false },
  { id: "kagaku-kiso", name: "化学基礎", hasFixture: false },
  { id: "seibutsu-kiso", name: "生物基礎", hasFixture: false },
  { id: "chigaku-kiso", name: "地学基礎", hasFixture: false },
  { id: "butsuri", name: "物理", hasFixture: false },
  { id: "kagaku", name: "化学", hasFixture: false },
  { id: "seibutsu", name: "生物", hasFixture: false },
  { id: "chigaku", name: "地学", hasFixture: false },
  { id: "reading", name: "英語（リーディング）", hasFixture: true },
  { id: "listening", name: "英語（リスニング・公式スクリプト）", hasFixture: false },
  { id: "joho", name: "情報Ⅰ", hasFixture: true },
];

export function GET() {
  return Response.json(SUBJECTS);
}
