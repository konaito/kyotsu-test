# kousoku-kyotsu-test

2025年度大学入学共通テスト（本試験・新課程・数学以外）を [jev](https://vercel.com/ai-gateway/models/jev) で解く。

原理: 問題冊子を `state`、各解答番号を `choice` にして、1科目1リクエストで並列評価する。jevはテキストしか見ないので、図表はPDFから文字が取れた範囲だけ。

```bash
bun install
# .env に AI_GATEWAY_API_KEY
bun run web                 # http://localhost:8787
bun run src/cli.ts --subject reading
bun run src/cli.ts --dry-run
bun test
```

`bun test` はネットワークと AI Gateway を使わない（正解PDFの bbox fixture + `demoSolve`）。

Webは解答用紙にマークが埋まって、最後に朱で自己採点する。jevが使えないときは `?demo=1`。

対象外: 数学、旧課程、独仏中韓。リスニングは公式スクリプトを state に入れる。
