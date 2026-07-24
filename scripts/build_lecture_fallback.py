#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补齐缺失章节的讲解：
三色笔记只覆盖部分基础章节（1-4、28-37 的一部分），第 5-27、30 章缺失。
本脚本以「要点笔记」为兜底源，仅填充 lecture.json 中缺失的章节，
清洗表格提取产生的空行/页码噪音，并按考点标题(红)/小节(蓝)分级。
已有三色笔记的章节保持不变。
"""
import json, os, re

BASE = "/Users/grapewang/Documents/中级经济师考试"
OUT_DATA = os.path.join(BASE, "备考app/data/lecture.json")
OUT_DOCS = os.path.join(BASE, "备考app/docs/lecture.json")
SRC = os.path.join(BASE, "资料库_文本提取/基础/笔记/2025-中级基础-要点笔记.txt")

CN = "一二三四五六七八九十"
def cn2int(tok):
    m = {c: i + 1 for i, c in enumerate(CN)}
    if tok.isdigit(): return int(tok)
    if tok == "十": return 10
    if tok.startswith("十"): return 10 + m.get(tok[1:], 0)
    if "十" in tok:
        a, _, b = tok.partition("十"); return m.get(a, 1) * 10 + (m.get(b, 0) if b else 0)
    return m.get(tok, 0)

def clean_lines(seg):
    """清洗：去页码行、折叠连续空行、去行尾空白。"""
    out = []
    blank = 0
    for raw in seg.split("\n"):
        line = raw.rstrip()
        if re.fullmatch(r"\s*\d{1,3}\s*", line):   # 纯页码行
            continue
        if not line.strip():
            blank += 1
            if blank > 1: continue
            out.append("")
            continue
        blank = 0
        out.append(line.strip())
    # 去首尾空行
    while out and not out[0]: out.pop(0)
    while out and not out[-1]: out.pop()
    return out

def tier_of(line):
    if re.match(r"^\d{2}\s", line) or "★" in line:   # 考点标题
        return "重点"
    if re.match(r"^[（(][一二三四五六七八九十]+[)）]", line):  # 小节
        return "次重点"
    return "常规"

def build_runs(lines):
    """把清洗后的行按 tier 合并成 run 序列（同 tier 相邻合并，\n 连接）。"""
    runs = []
    for line in lines:
        t = "常规" if not line else tier_of(line)
        text = line + "\n"
        if runs and runs[-1]["tier"] == t:
            runs[-1]["t"] += text
        else:
            runs.append({"t": text, "tier": t})
    return runs

def main():
    lec = json.load(open(OUT_DATA, encoding="utf-8"))
    txt = open(SRC, encoding="utf-8", errors="ignore").read()
    marks = []
    for m in re.finditer(r"第\s*([0-9一二三四五六七八九十]+)\s*章", txt):
        idx = cn2int(m.group(1))
        if 1 <= idx <= 37:
            marks.append((m.start(), idx))
    filled = []
    for i, (start, idx) in enumerate(marks):
        cid = f"基础-{idx}"
        if cid in lec and lec[cid]:      # 已有（三色笔记）则跳过
            continue
        end = marks[i + 1][0] if i + 1 < len(marks) else len(txt)
        lines = clean_lines(txt[start:end])
        # 去掉与章标题重复的首行（App 已单独显示章名）
        if lines and re.match(r"^第\s*[0-9一二三四五六七八九十]+\s*章", lines[0]):
            lines = lines[1:]
            while lines and not lines[0]: lines.pop(0)
        runs = build_runs(lines)
        chars = sum(len(r["t"]) for r in runs)
        if chars < 60:                   # 太短视为无效
            continue
        lec[cid] = runs
        filled.append((cid, chars))
    json.dump(lec, open(OUT_DATA, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(lec, open(OUT_DOCS, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"补齐 {len(filled)} 章：")
    for cid, n in sorted(filled, key=lambda x: int(x[0].split('-')[1])):
        print(f"  {cid}: {n} 字符")
    # 覆盖检查
    miss = [i for i in range(1, 38) if f"基础-{i}" not in lec or not lec[f"基础-{i}"]]
    print("仍缺基础章节:", miss or "无")

if __name__ == "__main__":
    main()
