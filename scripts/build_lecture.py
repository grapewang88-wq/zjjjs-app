#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从三色笔记(带颜色 JSON)按章节切分，产出 data/lecture.json：
chapter_id -> [{t:文本, tier:重点/次重点/补充/常规}]（保留颜色分级，供 App 高亮）。
基础笔记仅部分章节有显式“第X章”标记；无标记章节留空，App 优雅降级。
"""
import json, os, re
from chapters_seed import build

SRC = "/Users/grapewang/Documents/中级经济师考试/资料库_文本提取/_三色笔记_带颜色"
OUT = "/Users/grapewang/Documents/中级经济师考试/备考app/data"
CH = build()
CN = "一二三四五六七八九十"
ROMAN = "ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ"

def cn2int(tok):
    romans = {c: i + 1 for i, c in enumerate(ROMAN)}
    if tok in romans: return romans[tok]
    m = {c: i + 1 for i, c in enumerate(CN)}
    if tok == "十": return 10
    if tok.startswith("十"): return 10 + m.get(tok[1:], 0)
    if "十" in tok:
        a, _, b = tok.partition("十"); return m.get(a, 1) * 10 + (m.get(b, 0) if b else 0)
    if tok.isdigit(): return int(tok)
    return m.get(tok, 0)

def build_subject(label):
    pages = json.load(open(os.path.join(SRC, f"{label}_三色笔记_带颜色.json"), encoding="utf-8"))
    # 拼成带 tier 的 run 序列（跨页），同时记录纯文本用于定位章节
    runs = []
    for p in pages:
        for r in p["runs"]:
            runs.append({"t": r["text"], "tier": r["tier"]})
    full = "".join(r["t"] for r in runs)
    # 找章节标记位置（在纯文本中的字符偏移）
    chap_re = re.compile(rf"第\s*([{CN}{ROMAN}0-9]+)\s*章")
    marks = []
    for m in chap_re.finditer(full):
        idx = cn2int(m.group(1))
        if 1 <= idx <= 40:
            marks.append((m.start(), idx))
    # run 的字符偏移映射
    offsets = []
    pos = 0
    for r in runs:
        offsets.append(pos); pos += len(r["t"])
    def runs_between(a, b):
        out = []
        for i, r in enumerate(runs):
            s = offsets[i]; e = s + len(r["t"])
            if e <= a or s >= b: continue
            out.append(r)
        return out
    result = {}
    for i, (start, idx) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(full)
        seg = runs_between(start, end)
        # 合并相邻同 tier
        merged = []
        for r in seg:
            t = r["t"]
            if not t.strip() and merged:
                merged[-1]["t"] += t; continue
            if merged and merged[-1]["tier"] == r["tier"]:
                merged[-1]["t"] += t
            else:
                merged.append({"t": t, "tier": r["tier"]})
        cid = f"{label}-{idx}"
        # 若同章多段，取更长的
        if cid not in result or sum(len(x["t"]) for x in merged) > sum(len(x["t"]) for x in result[cid]):
            result[cid] = merged
    return result

def main():
    out = {}
    for label in ["基础", "人力"]:
        sub = build_subject(label)
        out.update(sub)
    # 统计
    covered = {s: 0 for s in CH}
    for cid in out:
        s = cid.split("-")[0]; covered[s] = covered.get(s, 0) + 1
    json.dump(out, open(os.path.join(OUT, "lecture.json"), "w", encoding="utf-8"), ensure_ascii=False)
    for s in CH:
        print(f"{s}: 有讲解章节 {covered.get(s,0)}/{len(CH[s])}")
    # 抽样
    any_cid = next(iter(out))
    txt = "".join(x["t"] for x in out[any_cid])
    print(f"\n样例 {any_cid} 讲解长度 {len(txt)} 字，前100:", txt[:100].replace('\n',' '))

if __name__ == "__main__":
    main()
