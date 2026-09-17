const SUBJECTS = [
  { id: "kokugo", name: "国語", hasFixture: true },
  { id: "chiri-tankyu", name: "地理総合，地理探究", hasFixture: true },
  { id: "nihonshi-tankyu", name: "歴史総合，日本史探究", hasFixture: true },
  { id: "sekaishi-tankyu", name: "歴史総合，世界史探究", hasFixture: true },
  { id: "koukyo-rinri", name: "公共，倫理", hasFixture: true },
  { id: "koukyo-seiji", name: "公共，政治・経済", hasFixture: true },
  { id: "chiri-sougou", name: "地理総合", hasFixture: true },
  { id: "rekishi-sougou", name: "歴史総合", hasFixture: true },
  { id: "koukyo", name: "公共", hasFixture: true },
  { id: "butsuri-kiso", name: "物理基礎", hasFixture: true },
  { id: "kagaku-kiso", name: "化学基礎", hasFixture: true },
  { id: "seibutsu-kiso", name: "生物基礎", hasFixture: true },
  { id: "chigaku-kiso", name: "地学基礎", hasFixture: true },
  { id: "butsuri", name: "物理", hasFixture: true },
  { id: "kagaku", name: "化学", hasFixture: true },
  { id: "seibutsu", name: "生物", hasFixture: true },
  { id: "chigaku", name: "地学", hasFixture: true },
  { id: "reading", name: "英語（リーディング）", hasFixture: true },
  { id: "joho", name: "情報Ⅰ", hasFixture: true },
];

export function GET() {
  return Response.json(SUBJECTS);
}
