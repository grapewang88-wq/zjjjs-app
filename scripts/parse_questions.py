#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
真题/习题结构化解析器（第一阶段：正则分割）。
把提取出的纯文本切分为结构化题目：题号/题干/选项/答案/解析。
输出每份文件一个 JSON，并汇总覆盖率统计。
后续 AI 阶段只处理本脚本标记为 low-confidence / 未识别 的部分。
"""
import re, os, json, sys, glob

BASE = "/Users/grapewang/Documents/中级经济师考试/资料库_文本提取"
OUT = "/Users/grapewang/Documents/中级经济师考试/备考app/data/questions_raw"
os.makedirs(OUT, exist_ok=True)

# 答案锚点：参考答案：X / 答案：X,Y / 正确答案：A、C、E / 【答案】X
# 关键修复：支持逗号/顿号分隔的多选答案（旧正则 [A-Ea-e]{1,5} 会把 "B,C" 截成 "B" → 多选被误判单选）
ANSWER_RE = re.compile(r'(?:参考答案|正确答案|答案)\s*[】\]]?\s*[:：]?\s*([A-Ea-e](?:[、,，和及/]\s*[A-Ea-e]|[A-Ea-e]){0,4})')
def _norm_answer(raw):
    return ''.join(sorted(set(re.findall(r'[A-E]', raw.upper()))))
# 解析锚点：参考解析/答案解析/解析/【解析】
EXPLAIN_RE = re.compile(r'^\s*[【\[]?\s*(?:参考解析|答案解析|解析)\s*[】\]]?\s*[:：]?\s*(.*)$')
# 选项行：A xxx / A. xxx / A、xxx / A．xxx  （允许前导空格）
OPTION_RE = re.compile(r'^\s*([A-E])\s*[.、．)]?\s*(.+?)\s*$')
# 题干起始行：数字 + 分隔 + 内容   （分隔可省略，如 "9高档品"）
QSTART_RE = re.compile(r'^\s*(\d{1,3})\s*[.、．]?\s*(\S.*)$')

# 附加水印/噪音行（环球网校等来源）
NOISE_LINE_RE = re.compile(
    r'学员专用|请勿外泄|环球网校|^\s*\d{1,3}\s*$|^一、|^二、|^三、|^单选题|^多选题|^案例分析'
    r'|真题汇总|考试真题$|下午\d|上午\d'
)


def clean_lines(text):
    lines = []
    for ln in text.split("\n"):
        s = ln.strip()
        if not s:
            continue
        if s == "[--- page break ---]":
            continue
        # 含答案/解析关键词的行永远保留（水印词可能夹在答案行里，如"【环球网校参考答案】A"）
        has_qa_marker = ANSWER_RE.search(s) or EXPLAIN_RE.match(s)
        # 过滤纯页码/分节/水印行（但保留可能是题干或选项的行）
        if not has_qa_marker and NOISE_LINE_RE.search(s):
            # 不误删真正的选项行
            if not re.match(r'^\s*[A-E]\s*[.、．)]', s):
                continue
        lines.append(s)
    return lines


def looks_like_option(line):
    m = OPTION_RE.match(line)
    if not m:
        return None
    # 排除把 "A股" 之类当选项：选项内容不为空即可，这里简单接受
    return m.group(1), m.group(2)


def parse_file(path):
    text = open(path, encoding="utf-8", errors="ignore").read()
    lines = clean_lines(text)
    questions = []
    i = 0
    n = len(lines)
    cur = None  # 当前题 {num, stem, options{}, answer, explain}
    state = "seek"  # seek -> stem -> options -> answer -> explain

    def flush():
        nonlocal cur
        if cur and cur.get("options"):
            questions.append(cur)
        cur = None

    while i < n:
        line = lines[i]
        opt = looks_like_option(line)
        ans_m = ANSWER_RE.search(line)
        exp_m = EXPLAIN_RE.match(line)
        q_m = QSTART_RE.match(line)

        if exp_m and cur is not None:
            cur.setdefault("explain", "")
            rest = exp_m.group(1)
            cur["explain"] = (cur["explain"] + rest).strip()
            state = "explain"
            i += 1
            continue

        if ans_m and cur is not None:
            cur["answer"] = _norm_answer(ans_m.group(1))
            state = "answer"
            i += 1
            continue

        if opt is not None and cur is not None and state in ("stem", "options"):
            letter, content = opt
            cur.setdefault("options", {})
            cur["options"][letter] = content
            state = "options"
            i += 1
            continue

        # 新题起始：行以数字打头，且不是选项，且（当前无题 或 已进入 answer/explain 状态）
        if q_m and (opt is None):
            num = int(q_m.group(1))
            # 合理性：题号应递增或重置（跨套卷）；避免把解析里的 "1." 误判
            start_new = False
            if cur is None:
                start_new = True
            elif state in ("answer", "explain"):
                start_new = True
            if start_new:
                flush()
                cur = {"num": num, "stem": q_m.group(2), "options": {}, "answer": "", "explain": ""}
                state = "stem"
                i += 1
                continue

        # 续行：题干续行 / 解析续行
        if cur is not None:
            if state == "stem":
                cur["stem"] += line
            elif state == "explain":
                cur["explain"] += line
            elif state == "options" and cur.get("options"):
                # 选项内容换行续接到最后一个选项
                last = list(cur["options"])[-1]
                cur["options"][last] += line
        i += 1

    flush()

    # 判定单选/多选、置信度
    for q in questions:
        ans = q.get("answer", "")
        q["type"] = "multi" if len(ans) > 1 else ("single" if len(ans) == 1 else "unknown")
        conf = "high"
        opts = q.get("options", {})
        if not ans:
            conf = "low"  # 无答案
        if len(opts) < 2:
            conf = "low"  # 选项太少
        if ans and any(a not in opts for a in ans):
            conf = "low"  # 答案字母不在选项里
        if len(q.get("stem", "")) < 4:
            conf = "low"
        q["confidence"] = conf
    return questions


def main():
    files = glob.glob(os.path.join(BASE, "**", "*.txt"), recursive=True)
    # 只处理真题 + 习题类目录
    targets = [f for f in files if ("/真题/" in f or "/习题专项/" in f or "/模拟卷押题/" in f or "/默写本/" in f)]
    summary = []
    for f in sorted(targets):
        qs = parse_file(f)
        high = sum(1 for q in qs if q["confidence"] == "high")
        rel = os.path.relpath(f, BASE)
        safe = rel.replace("/", "__").replace(" ", "_")[:-4] + ".json"
        with open(os.path.join(OUT, safe), "w", encoding="utf-8") as w:
            json.dump({"source_file": rel, "questions": qs}, w, ensure_ascii=False, indent=1)
        summary.append((rel, len(qs), high))
    # 汇总
    print(f"{'文件':<70} {'题数':>5} {'高置信':>6}")
    tot = toth = 0
    for rel, c, h in summary:
        tot += c; toth += h
        cat = rel.split("/")[1] if "/" in rel else "?"
        print(f"[{cat:<10}] {rel.split('/')[-1][:52]:<52} {c:>5} {h:>6}")
    print("-" * 90)
    print(f"合计: {tot} 题, 其中高置信 {toth} ({toth*100//max(tot,1)}%)")

if __name__ == "__main__":
    main()
