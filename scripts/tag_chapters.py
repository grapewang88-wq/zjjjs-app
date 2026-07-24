#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""章节自动打标：jieba 分词 + 关键词重叠打分，为 bank.json 每题分配章节。
产出：bank 增加 chapter 字段；低置信题目单独列出供 AI 复核。
"""
import json, os, re, math
import jieba
from chapters_seed import build

DATA = "/Users/grapewang/Documents/中级经济师考试/备考app/data"
CH = build()

# 关键词加入 jieba 词典，提升切词命中
for subj in CH:
    for c in CH[subj]:
        for kw in c["keywords"]:
            jieba.add_word(kw)

# 预处理章节关键词集合
for subj in CH:
    for c in CH[subj]:
        c["kwset"] = set(c["keywords"])
        # 章名也拆词加入
        for w in jieba.lcut(c["title"]):
            if len(w) >= 2:
                c["kwset"].add(w)

STOP = set("的 了 是 在 和 与 及 或 对 为 以 其 等 一个 属于 下列 关于 根据 按照 某 某种 通过 主要 不 不属于 说法 正确 错误 选项 中 上 下".split())

# 残留 URL/域名水印，行内清除（不整段删）
WM_RE = re.compile(r'https?://\S*|www\.[^\s，。；]*|[\w.]*mulupan[\w./:]*|[\w.]*ekaoshi[\w./:]*|youlu\.com[\w./-]*|官方网站[:：]?\S*')

def clean_wm(s):
    return WM_RE.sub('', s or '').strip()

CN_MAP = {c: i + 1 for i, c in enumerate("一二三四五六七八九十")}
def cn2int(tok):
    if tok.isdigit():
        return int(tok)
    if tok == "十": return 10
    if tok.startswith("十"): return 10 + CN_MAP.get(tok[1:], 0)
    if "十" in tok:
        a, _, b = tok.partition("十")
        return CN_MAP.get(a, 1) * 10 + (CN_MAP.get(b, 0) if b else 0)
    return CN_MAP.get(tok, 0)

EXPLAIN_CH_RE = re.compile(r'来源于第([一二三四五六七八九十0-9]+)章')

def chapter_from_explain(subj, explain):
    m = EXPLAIN_CH_RE.search(explain or "")
    if not m:
        return None
    idx = cn2int(m.group(1))
    for c in CH.get(subj, []):
        if c["index"] == idx:
            return c["id"]
    return None

def tokens(text):
    ws = [w for w in jieba.lcut(text) if len(w) >= 2 and w not in STOP and not w.isdigit()]
    return ws

def classify(subj, stem, options_text):
    text = stem + " " + options_text
    toks = tokens(text)
    tokset = set(toks)
    best = None; best_score = 0; second = 0
    for c in CH[subj]:
        # 分数：题目词命中章节关键词的加权数（章名/关键词命中权重高）
        hit = 0
        for kw in c["kwset"]:
            if kw in text:            # 子串命中（关键词多为专有名词）
                hit += 2 if len(kw) >= 3 else 1
        # 分词交集补充
        hit += len(tokset & c["kwset"]) * 0.5
        if hit > best_score:
            second = best_score; best_score = hit; best = c
        elif hit > second:
            second = hit
    conf = "none"
    if best_score >= 4 and best_score - second >= 2: conf = "high"
    elif best_score >= 2: conf = "mid"
    elif best_score > 0: conf = "low"
    return (best["id"] if best and best_score > 0 else None), best_score, conf

def main():
    bank = json.load(open(os.path.join(DATA, "bank.json"), encoding="utf-8"))
    from collections import Counter
    conf_ct = Counter()
    per_subj_conf = Counter()
    low = []
    src_ct = Counter()
    for q in bank:
        subj = q["subject"]
        if subj not in CH:
            continue
        # 行内清洗残留水印
        q["stem"] = clean_wm(q["stem"])
        q["explain"] = clean_wm(q["explain"])
        # 1) 解析中显式“来源于第X章” —— 权威
        cid = chapter_from_explain(subj, q["explain"])
        if cid:
            q["chapter"] = cid
            q["chapter_conf"] = "high"
            q["chapter_src"] = "explain"
            conf_ct["high"] += 1; per_subj_conf[(subj, "high")] += 1; src_ct["explain"] += 1
            continue
        # 2) 关键词分类兜底
        opt_text = " ".join(q["options"].values())
        cid, score, conf = classify(subj, q["stem"], opt_text)
        q["chapter"] = cid
        q["chapter_conf"] = conf
        q["chapter_src"] = "keyword"
        conf_ct[conf] += 1
        per_subj_conf[(subj, conf)] += 1
        src_ct["keyword"] += 1
        if conf in ("low", "none"):
            low.append(q["id"])
    print("标签来源:", dict(src_ct))
    # 保存
    json.dump(bank, open(os.path.join(DATA, "bank.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # 章节目录也存一份（去掉内部字段）
    chapters_out = {s: [{k: c[k] for k in ("id", "index", "part", "title", "name")} for c in CH[s]] for s in CH}
    json.dump(chapters_out, open(os.path.join(DATA, "chapters.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(low, open(os.path.join(DATA, "low_conf_ids.json"), "w", encoding="utf-8"), ensure_ascii=False)

    print("置信分布:", dict(conf_ct))
    for subj in CH:
        row = {c: per_subj_conf[(subj, c)] for c in ("high", "mid", "low", "none")}
        print(f"  {subj}: {row}")
    # 章节分布抽样
    chc = Counter(q.get("chapter") for q in bank)
    print("\n各章题量(前15):")
    idname = {c["id"]: c["name"] for s in CH for c in CH[s]}
    for cid, n in chc.most_common(15):
        print(f"  {idname.get(cid, cid)}: {n}")
    print(f"\n低置信(需AI复核): {len(low)} 题")

if __name__ == "__main__":
    main()
