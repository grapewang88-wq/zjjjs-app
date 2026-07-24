#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 questions_raw/ 下各文件解析结果合并成 App 用的统一题库。
- 只收 confidence=high 的题
- 标注 subject(基础/人力)、source_type(真题/模拟题/习题)、source_file、year
- 按题干规范化去重（真题优先保留）
- 输出 data/bank.json  与  data/bank_stats.json
数据结构(schema)见下方 build 的字段。
"""
import os, json, glob, re, hashlib

RAW = "/Users/grapewang/Documents/中级经济师考试/备考app/data/questions_raw"
OUTDIR = "/Users/grapewang/Documents/中级经济师考试/备考app/data"

def subject_of(rel):
    return "基础" if rel.startswith("基础/") else ("人力" if rel.startswith("人力/") else "未知")

def source_type_of(rel):
    if "/真题/" in rel:
        return "真题"
    if "/模拟卷押题/" in rel:
        return "模拟题"
    return "习题"

def year_of(name):
    m = re.search(r'(20\d{2})', name)
    return m.group(1) if m else ""

def norm_stem(s):
    s = re.sub(r'[\s\(\)（）【】\[\]。，、；：:,.;?？!！""'"'"'…—\-_]', '', s)
    return s[:60]

# 真题优先级：真题 > 模拟题 > 习题
PRIORITY = {"真题": 0, "模拟题": 1, "习题": 2}

def main():
    seen = {}   # norm_stem -> question dict (keep highest priority)
    total_in = 0
    for jf in sorted(glob.glob(os.path.join(RAW, "*.json"))):
        obj = json.load(open(jf, encoding="utf-8"))
        rel = obj["source_file"]
        subject = subject_of(rel)
        stype = source_type_of(rel)
        name = os.path.basename(rel)
        year = year_of(name)
        for q in obj["questions"]:
            if q.get("confidence") != "high":
                continue
            total_in += 1
            stem = q["stem"].strip()
            key = (subject, norm_stem(stem))
            options = q["options"]
            item = {
                "id": hashlib.md5(f"{subject}|{stem}".encode()).hexdigest()[:12],
                "subject": subject,
                "source_type": stype,
                "source_file": name,
                "year": year,
                "type": q["type"],                 # single / multi
                "stem": stem,
                "options": options,                # {A:..,B:..,..}
                "answer": q["answer"],             # "A" / "ABD"
                "explain": q.get("explain", "").strip(),
                "chapter": None,                   # 待 AI 章节打标
                "outdated": False,                 # 待「教材变动」标记
            }
            prev = seen.get(key)
            if prev is None or PRIORITY[stype] < PRIORITY[prev["source_type"]]:
                seen[key] = item

    bank = list(seen.values())
    # 稳定排序：科目 -> 来源类型 -> 年份倒序
    bank.sort(key=lambda x: (x["subject"], PRIORITY[x["source_type"]], -(int(x["year"]) if x["year"] else 0)))

    with open(os.path.join(OUTDIR, "bank.json"), "w", encoding="utf-8") as f:
        json.dump(bank, f, ensure_ascii=False, indent=1)

    # 统计
    from collections import Counter
    by_sub = Counter(x["subject"] for x in bank)
    by_type = Counter((x["subject"], x["source_type"]) for x in bank)
    by_qtype = Counter((x["subject"], x["type"]) for x in bank)
    stats = {
        "total_in": total_in,
        "total_after_dedup": len(bank),
        "by_subject": dict(by_sub),
        "by_subject_source": {f"{k[0]}/{k[1]}": v for k, v in by_type.items()},
        "by_subject_qtype": {f"{k[0]}/{k[1]}": v for k, v in by_qtype.items()},
    }
    with open(os.path.join(OUTDIR, "bank_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)

    print(f"入库前(high) {total_in} 题 -> 去重后 {len(bank)} 题")
    print("按科目:", dict(by_sub))
    print("按科目/来源:")
    for k, v in sorted(stats["by_subject_source"].items()):
        print(f"   {k}: {v}")
    print("按科目/题型:")
    for k, v in sorted(stats["by_subject_qtype"].items()):
        print(f"   {k}: {v}")

if __name__ == "__main__":
    main()
