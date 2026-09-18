import json
import os
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from openjev_phase1.direct import score as openjev_score

MODEL_ID = "Qwen/Qwen3.5-4B"
REVISION = "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUESTIONS_FILE = os.path.join(BASE_DIR, "data/questions-for-logits.json")
OUT_FILE = os.path.join(BASE_DIR, "data/qwen-benchmark.json")

def score_item(item, predicted, siblings):
    if not predicted:
        return False
    gold = item["gold"]
    if not item.get("unordered", False):
        return predicted in gold
    
    # Unordered group scoring
    group_id = item.get("groupId")
    if not group_id:
        return predicted in gold
    
    group_items = [s for s in siblings if s.get("groupId") == group_id]
    preds = sorted([s.get("predicted") for s in group_items if s.get("predicted") is not None])
    golds = sorted(gold)
    return preds == golds

def main():
    print("==================================================", flush=True)
    print("OpenJev Multiple Choice Evaluation (TheoLeeCJ/openjev)", flush=True)
    print(f"Model: {MODEL_ID} (rev: {REVISION[:8]})", flush=True)
    print("==================================================\n", flush=True)

    if not os.path.exists(QUESTIONS_FILE):
        print(f"Error: {QUESTIONS_FILE} not found.", flush=True)
        sys.exit(1)

    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        subjects_data = json.load(f)

    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}", flush=True)

    print("Loading tokenizer...", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=REVISION, trust_remote_code=True)
    print("Loading model weights (bfloat16)...", flush=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        revision=REVISION,
        dtype=torch.bfloat16,
        trust_remote_code=True,
        low_cpu_mem_usage=True
    ).to(device)
    print("Model loaded successfully into OpenJev!\n", flush=True)

    metadata = {
        "model": MODEL_ID,
        "revision": REVISION,
        "framework": "openjev-phase1",
    }

    store = {
        "model": f"openjev ({MODEL_ID}, rev:{REVISION[:8]})",
        "framework": "openjev-phase1 (TheoLeeCJ/openjev)",
        "measuredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalScore": 0,
        "totalMaxScore": 0,
        "accuracy": 0,
        "totalElapsedMs": 0,
        "subjects": []
    }

    total_start = time.time()

    for sub_idx, sub in enumerate(subjects_data, 1):
        sub_name = sub["name"]
        sub_id = sub["id"]
        questions = sub["questions"]
        official_max = sub["officialMax"]

        print(f"[{sub_idx}/{len(subjects_data)}] Evaluating {sub_name} ({len(questions)} items with openjev)...", flush=True)
        sub_start = time.time()

        evaluated_items = []

        for q_idx, q in enumerate(questions, 1):
            row = {
                "id": f"{sub_id}-{q['key']}",
                "state": q["state"],
                "question": q["question"],
                "options": q["options"]
            }

            try:
                res = openjev_score(model, tokenizer, row, metadata, max_tokens=32768)
                probs = res["probabilities"]
                option_ids = res["option_ids"]
                best_idx = probs.index(max(probs))
                predicted = option_ids[best_idx]
                probability = probs[best_idx]
            except Exception as e:
                print(f"  [ERROR] {q['key']}: {e}", flush=True)
                predicted = None
                probability = 0.0

            evaluated_items.append({
                "key": q["key"],
                "slot": q["slot"],
                "daimon": q.get("daimon"),
                "points": q["points"],
                "unordered": q.get("unordered", False),
                "groupId": q.get("groupId"),
                "gold": q["gold"],
                "predicted": predicted,
                "probability": probability,
            })

            if q_idx % 5 == 0 or q_idx == len(questions):
                print(f"  -> Progress: {q_idx}/{len(questions)} items (last: {predicted}, p={probability:.3f})", flush=True)

        for it in evaluated_items:
            it["correct"] = score_item(it, it["predicted"], evaluated_items)

        sub_score = 0
        counted_groups = set()
        for it in evaluated_items:
            if not it["correct"]:
                continue
            gid = it.get("groupId")
            if it.get("unordered", False) and gid:
                if gid in counted_groups:
                    continue
                counted_groups.add(gid)
            sub_score += it["points"]

        sub_elapsed_ms = (time.time() - sub_start) * 1000
        correct_count = sum(1 for it in evaluated_items if it["correct"])
        acc = (sub_score / official_max * 100) if official_max > 0 else 0

        print(f"  ★ {sub_name}: {sub_score}/{official_max}点 ({acc:.1f}%) 正答: {correct_count}/{len(questions)} ({sub_elapsed_ms/1000:.1f}s)\n", flush=True)

        store["subjects"].append({
            "id": sub_id,
            "name": sub_name,
            "score": sub_score,
            "maxScore": official_max,
            "accuracy": round(acc, 1),
            "correct": correct_count,
            "total": len(questions),
            "elapsedMs": round(sub_elapsed_ms, 1),
            "items": [
                {
                    "key": it["key"],
                    "predicted": it["predicted"],
                    "gold": it["gold"],
                    "correct": it["correct"],
                    "points": it["points"],
                    "probability": round(it["probability"], 4) if it["probability"] else None
                }
                for it in evaluated_items
            ]
        })

        store["totalScore"] = sum(s["score"] for s in store["subjects"])
        store["totalMaxScore"] = sum(s["maxScore"] for s in store["subjects"])
        store["accuracy"] = round((store["totalScore"] / store["totalMaxScore"] * 100), 1) if store["totalMaxScore"] > 0 else 0
        store["totalElapsedMs"] = sum(s["elapsedMs"] for s in store["subjects"])
        store["measuredAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        tmp_file = OUT_FILE + ".tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(store, f, indent=2, ensure_ascii=False)
        os.replace(tmp_file, OUT_FILE)

    print("\n==================================================", flush=True)
    print("🎉 OpenJev Qwen 3.5 Logits Evaluation Complete!", flush=True)
    print(f"総合得点: {store['totalScore']}/{store['totalMaxScore']} ({store['accuracy']}%)", flush=True)
    print(f"総所要時間: {store['totalElapsedMs']/1000:.1f}s", flush=True)
    print(f"結果保存先: {OUT_FILE}", flush=True)
    print("==================================================", flush=True)

if __name__ == '__main__':
    main()
