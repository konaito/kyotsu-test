import { findSubjects } from "../catalog.ts";
import { prepareFromFixture } from "../fixtures.ts";
import { chunksFor, questionFor } from "../solve.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const allSubjects = findSubjects([]);
const exportData: any[] = [];

for (const sub of allSubjects) {
  const prep = prepareFromFixture(sub);
  const chunks = chunksFor(prep);

  const subjectData = {
    id: sub.id,
    name: sub.name,
    officialMax: prep.officialMax,
    electiveDaimons: prep.electiveDaimons,
    seikai: prep.seikai,
    questions: [] as any[],
  };

  for (const chunk of chunks) {
    for (const item of chunk.items) {
      const q = questionFor(prep, item, chunk.parsed);
      const choices = Object.entries(q.criteria)
        .map(([k, v]) => `  [${k}] ${v}`)
        .join("\n");

      // Multiple-choice prompt ending with the target choice prompt
      const prompt = [
        `【${prep.subject.name} - ${chunk.label}】`,
        "本文中の [1] [2] [3] … はマークシートの解答番号または選択肢番号です。",
        "",
        "--- 本文 ---",
        chunk.text,
        "",
        `■ 設問 ${item.key} (${chunk.label} 解答番号 [${item.slot}]):`,
        q.instructions,
        "",
        "選択肢:",
        choices,
        "",
        `解答 [${item.slot}]:`,
      ].join("\n");

      const candidateOptions = Object.keys(q.criteria);

      subjectData.questions.push({
        key: item.key,
        slot: item.slot,
        daimon: item.daimon,
        points: item.points,
        unordered: item.unordered,
        groupId: item.groupId,
        gold: item.answers,
        candidateOptions: candidateOptions.length > 0 ? candidateOptions : sub.options,
        prompt,
      });
    }
  }

  exportData.push(subjectData);
}

const outPath = join(import.meta.dir, "../../data/questions-for-logits.json");
writeFileSync(outPath, JSON.stringify(exportData, null, 2), "utf-8");
console.log(`Exported ${exportData.length} subjects to ${outPath}`);
