# kousoku-kyotsu-test

2025年度大学入学共通テスト（本試験・新課程・数学以外）を [jev](https://vercel.com/ai-gateway/models/jev) で解く。

採点は正解PDFの **配点** に基づく（正答数ではなく得点）。順不同のハイフングループは `groupId` ごとに配点を1回だけ加算する。

## セットアップ

```bash
bun install
# .env に AI_GATEWAY_API_KEY（本番・非デモ用）
cp .env.example .env
```

## コマンド

```bash
bun run web                 # http://localhost:8787 （JSON fixture 経路）
bun run src/cli.ts --subject reading
bun run src/cli.ts --dry-run
bun test                    # オフライン（fixture + demoSolve）
bun run build               # web → public/（Vercel 用）
```

## Web / Vercel

- フロントは `bun run build` で `public/` に静的出力
- API は `api/subjects.ts` / `api/run.ts`（Bun runtime）
- **Web 経路は committed JSON**（`data/subjects/*.json`）を読む。`pdftotext` も DNC PDF ダウンロードも使わない
- デモ: `?demo=1` または UI のデモチェック
- 非デモ: Vercel プロジェクトに `AI_GATEWAY_API_KEY` を設定

収録済み fixture: `reading`, `kokugo`, `joho`, `chiri-sougou`

## ローカル CLI

CLI は従来どおり PDF + `pdftotext` で抽出できる（`.cache/pdf`）。Web とは独立。

## 対象外

数学、旧課程、独仏中韓。リスニングは公式スクリプトを state に入れる。
