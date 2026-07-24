#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从三色笔记标注版切分章节，抽取每章 标题 + 考点短语 + 正文，
产出 data/chapters.json：每科的章节目录（供 App 使用 & 章节打标）。
"""
import re, json, os

SRC = "/Users/grapewang/Documents/中级经济师考试/资料库_文本提取/_三色笔记_带颜色"
OUT = "/Users/grapewang/Documents/中级经济师考试/备考app/data"

CN_NUM = "一二三四五六七八九十"
ROMAN = "ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ"

def strip_marks(s):
    return re.sub(r"【/?[^】]*】", "", s)

def chap_index(token):
    """把 章号 token 转成排序用的数字。"""
    token = token.strip()
    romans = {c: i + 1 for i, c in enumerate(ROMAN)}
    if token in romans:
        return romans[token]
    # 中文数字
    if re.fullmatch(f"[{CN_NUM}]+", token):
        val = 0
        cur = 0
        mp = {c: i + 1 for i, c in enumerate(CN_NUM)}  # 一=1..十=10
        # 处理 "十一"~"十九","二十"等
        if token == "十":
            return 10
        if token.startswith("十"):
            return 10 + mp.get(token[1:], 0)
        nums = [mp[c] for c in token]
        if len(nums) == 1:
            return nums[0]
        # X十Y
        if "十" in token:
            parts = token.split("十")
            tens = mp.get(parts[0], 1) if parts[0] else 1
            ones = mp.get(parts[1], 0) if len(parts) > 1 and parts[1] else 0
            return tens * 10 + ones
        return nums[0]
    if token.isdigit():
        return int(token)
    return 999

def parse_subject(label):
    txt = strip_marks(open(os.path.join(SRC, f"{label}_三色笔记_标注版.md"), encoding="utf-8").read())
    # 去页码注释
    txt = re.sub(r"<!--.*?-->", "\n", txt)
    # 章节切分：第X章
    chap_re = re.compile(rf"第\s*([{CN_NUM}{ROMAN}0-9]+)\s*章")
    matches = list(chap_re.finditer(txt))
    # 部分切分：第X部分
    part_re = re.compile(rf"第\s*([{CN_NUM}]+)\s*部分\s*([^\n第考]{{0,20}})")
    parts = [(m.start(), m.group(2).strip()) for m in part_re.finditer(txt)]
    def part_at(pos):
        name = ""
        for s, nm in parts:
            if s <= pos:
                name = nm
            else:
                break
        return name

    chapters = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(txt)
        body = txt[start:end]
        num_token = m.group(1)
        # 标题：章号后到第一个"考点"或换行/一、之前
        after = txt[m.end():m.end() + 40]
        title_m = re.match(r"\s*([^\n考]{2,20}?)(?:考点|一、|$|\d)", after)
        title = title_m.group(1).strip() if title_m else ""
        # 考点短语
        kaodian = re.findall(r"考点[一二三四五六七八九十0-9]+[：: ]?\s*([^\n➤，。；]{2,24})", body)
        chapters.append({
            "num_token": num_token,
            "index": chap_index(num_token),
            "part": part_at(start),
            "title": title,
            "kaodian": [k.strip() for k in kaodian][:40],
            "body_len": len(body),
        })
    # 去重（同章号取正文更长者）
    best = {}
    for c in chapters:
        k = c["index"]
        if k not in best or c["body_len"] > best[k]["body_len"]:
            best[k] = c
    chapters = sorted(best.values(), key=lambda x: x["index"])
    # 章节展示名
    for c in chapters:
        c["id"] = f"{label}-{c['index']}"
        c["name"] = f"第{c['num_token']}章 {c['title']}".strip()
    return chapters

def main():
    out = {}
    for label in ["基础", "人力"]:
        chs = parse_subject(label)
        out[label] = chs
        print(f"=== {label}: {len(chs)} 章 ===")
        for c in chs:
            print(f"  {c['id']:<8} {c['name'][:24]:<24} 考点{len(c['kaodian'])}个  [{c['part']}]")
    with open(os.path.join(OUT, "chapters.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("\n写入 chapters.json")

if __name__ == "__main__":
    main()
