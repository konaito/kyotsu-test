import json
import os
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

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
    print(f"==================================================")
    print(f"Qwen 3.5 Logits-based Multiple Choice Evaluation")
    print(f"Model: {MODEL_ID} (rev: {REVISION[:8]})")
    print(f"Method: No reasoning, direct choice logits softmax")
    print(f"==================================================\n")

    if not os.path.exists(QUESTIONS_FILE):
        print(f"Error: {QUESTIONS_FILE} not found.")
        sys.exit(1)

    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        subjects_data = json.load(f)

    device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    print("Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=REVISION, trust_remote_code=True)
    print("Loading model weights (bfloat16)...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        revision=REVISION,
        torch_dtype=torch.bfloat16,
        trust_remote_code=True,
        low_cpu_mem_usage=True
    ).to(device)
    model.eval()
    print("Model loaded successfully!\n")

    store = {
        "model": f"{MODEL_ID} (logits-direct, rev:{REVISION[:8]})",
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

        print(f"[{sub_idx}/{len(subjects_data)}] Evaluating {sub_name} ({len(questions)} items)...")
        sub_start = time.time()

        evaluated_items = []

        for q in questions:
            prompt = q["prompt"]
            candidate_options = q["candidateOptions"]

            # Tokenize prompt
            inputs = tokenizer(prompt, return_tensors="pt").to(device)
            with torch.no_grad():
                outputs = model(**inputs)
                next_logits = outputs.logits[0, -1, :]

            # Get token ID for each candidate option
            opt_logits = []
            valid_options = []
            for opt in candidate_options:
                tok_ids = tokenizer.encode(opt, add_special_tokens=False)
                if tok_ids:
                    tid = tok_ids[-1]
                    opt_logits.append(next_logits[tid].item())
                    valid_options.append(opt)

            if opt_logits:
                logits_tensor = torch.tensor(opt_logits, dtype=torch.float32)
                probs = torch.softmax(logits_tensor, dim=-1).tolist()
                best_idx = int(torch.argmax(logits_tensor).item())
                predicted = valid_options[best_idx]
                probability = probs[best_idx]
            else:
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

        # Score the items
        for it in evaluated_items:
            it["correct"] = score_item(it, it["predicted"], evaluated_items)

        # Aggregate score (handling unordered deduplication & elective daimons)
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

        print(f"  -> {sub_name}: {sub_score}/{official_max}点 ({acc:.1f}%) 正答: {correct_count}/{len(questions)} ({sub_elapsed_ms/1000:.1f}s)")

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

        # Update totals
        store["totalScore"] = sum(s["score"] for s in store["subjects"])
        store["totalMaxScore"] = sum(s["maxScore"] for s in store["subjects"])
        store["accuracy"] = round((store["totalScore"] / store["totalMaxScore"] * 100), 1) if store["totalMaxScore"] > 0 else 0
        store["totalElapsedMs"] = sum(s["elapsedMs"] for s in store["subjects"])
        store["measuredAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # Save intermediate results
        with open(OUT_FILE, "w", encoding="utf-8") as f:
            json.dump(store, f, indent=2, ensure_ascii=False)

    print("\n==================================================")
    print(f"🎉 Qwen 3.5 Logits Evaluation Complete!")
    print(f"総合得点: {store['totalScore']}/{store['totalMaxScore']} ({store['accuracy']}%)")
    print(f"総所要時間: {store['totalElapsedMs']/1000:.1f}s")
    print(f"結果保存先: {OUT_FILE}")
    print("==================================================")

if __name__ == "__main__":
    main()
