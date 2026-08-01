#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
题库清洗与修复（在 docs/bank.json 原地修复，保留 id 以不丢用户进度）。
修复内容：
 1) 去水印：课程咨询/环球网校/学员专用等噪音（就地删除，重新拼接被截断的词）
 2) 题干去来源页眉前缀：如 "4 年中级经济师…真题抢先看【单选】1." → 真正题干
 3) 恢复多选答案：源文件里 "参考答案：B,C" 被旧正则截成 "B" 导致多选被当单选。
    从源 txt 按题干匹配，安全地把 单选→多选(仅当恢复答案是原答案的超集且都是有效选项)
 4) 隔离无法修复的脏题（选项来自其它题/串讲义/挤在一起）：从题库移除
输出：docs/bank.json（修复后），data/clean_report.json（审计报告）
"""
import json, re, os, glob, sys

APP = "/Users/grapewang/Documents/中级经济师考试/备考app"
SRC = "/Users/grapewang/Documents/中级经济师考试/资料库_文本提取"
BANK = os.path.join(APP, "docs/bank.json")

# ---------- 正则 ----------
WM = re.compile(r'课程咨询[：:]*|环球网校[^\s，。]*|学员专用|请勿外泄|华图教育|中公教育|扫码\S{0,10}')
# 尾部网址/页码水印(总挂在内容末尾)与【N分】分值标记
WM_TAIL = re.compile(r'(?:https?://|www\.|官方网站[：:]|ekaoshi|mulupan|youlu).*$')
SCORE_MARK = re.compile(r'【\s*[12]\s*分\s*】|（\s*[12]\s*分\s*）|\[\s*[12]\s*分\s*\]')
# 题干页眉前缀：以 "N 年" 开头的来源标题 + 可选【单选/多选】 + 题号
PREFIX = re.compile(
    r'^\s*\d{1,4}\s*年.{0,40}?'
    r'(?:真题抢先看|月度测评卷|测评卷|真题卷[一二三四五]?|集训营套卷|考前冲刺|真题|经济基础|人力资源|中级经济师|《[^》]*》)'
    r'.{0,10}?(?:【\s*(?:单选|多选|不定项)\s*】)?\s*\d{1,3}\s*[.、．]\s*(?=\S)'
)
# 脏题标记（选项里）
OPT_CORRUPT = re.compile(r'答案及解析|全国经济专业技术资格|考前冲刺卷|答案和解析|【\s*\d+\s*[.、]\s*(?:单选|多选|案例)|参考解析|第\s*\d+\s*章[，,、）)]')
OPT_CRAM = re.compile(r'[ 　]+[B-E]\s*[.、．]\s*[\dA-Za-z一-鿿]')
PUNCT_ONLY = re.compile(r'^[\s.。*·\-—_、,，:：;；]+$')
STEMBLEED = re.compile(r'【\s*\d+\s*[.、]\s*(?:单选|多选|案例)|计算专项\s*\d|数字型考点默写|考点默写本|【课程导读】|专项提分'
                       r'|（\s*[A-E]\s*(?:正确|错误)|故\s*[A-E]\s*(?:项|表述|正确|错误|选项)|[A-E]\s*项(?:正确|错误|表述)|^\s*[%＝=]')

def normfull(s):
    return re.sub(r'[\s\(\)（）【】\[\]。，、；：:,.;?？!！""''…—\-_]', '', s)

def strip_wm(s):
    s = WM.sub('', s or '')
    s = WM_TAIL.sub('', s)      # 去尾部网址/页码水印
    s = SCORE_MARK.sub('', s)   # 去【N分】分值标记
    return s.strip()

# ---------- 源答案索引（用于恢复多选） ----------
ANS = re.compile(r'(?:参考答案|正确答案|答案)\s*[】\]]?\s*[:：]?\s*([A-Ea-e](?:[、,，和及/]\s*[A-Ea-e]|[A-Ea-e]){0,4})')
def norm_ans(a):
    return ''.join(sorted(set(re.findall(r'[A-E]', a.upper()))))

def build_answer_recs():
    recs = {'基础': [], '人力': []}
    for f in glob.glob(os.path.join(SRC, '**', '*.txt'), recursive=True):
        rel = os.path.relpath(f, SRC)
        if not any(x in f for x in ['真题', '习题专项', '模拟卷押题', '默写本']):
            continue
        subj = '基础' if rel.startswith('基础') else ('人力' if rel.startswith('人力') else None)
        if not subj:
            continue
        txt = open(f, encoding='utf-8', errors='ignore').read()
        for m in ANS.finditer(txt):
            a = norm_ans(m.group(1))
            if not a:
                continue
            before = normfull(txt[max(0, m.start()-300):m.start()])
            recs[subj].append((before, a))
    return recs

STRONG_LEC = re.compile(r'★|【提示】|【举例】|【注意】|项目内容|项目举例|。\s*[2-9]\s*[.、]|；\s*[2-9]\s*[.、]|（\s*1\s*）[^（]{0,90}（\s*2\s*）')
def _term_repeat(s):
    for k in range(4, 13):
        if len(s) >= 2*k and s[:k] == s[k:2*k]:
            return True
    return False
def is_lecture_stem(q):
    # 题干是"三色笔记/讲义/解析"碎片(定义、枚举、★评级、术语重复)而非真正的题目
    s = q['stem']
    return _term_repeat(s) or bool(STRONG_LEC.search(s))

def is_corrupt(q):
    r = []
    if is_lecture_stem(q): r.append('stem_lecture')
    opts = q['options']
    vals = [v.strip() for v in opts.values()]
    for k, v in opts.items():
        if OPT_CORRUPT.search(v): r.append('opt_corrupt')
        if len(OPT_CRAM.findall(v)) >= 2: r.append('opt_cram')
        if PUNCT_ONLY.match(v.strip()) or not v.strip(): r.append('opt_punct')
    if STEMBLEED.search(q['stem']): r.append('stem_bleed')
    L = sorted(len(v) for v in vals)
    if L and L[-1] > 150 and L[-1] > 3*max(1, (L[-2] if len(L) > 1 else 1)): r.append('opt_outlier')
    ans = q.get('answer', '') or ''
    if ans and any(a not in opts for a in ans): r.append('ans_invalid')
    nonempty = [v for v in vals if v]
    if len(set(nonempty)) < len(nonempty): r.append('opt_dup')
    # 插入顺序必须是 A,B,C,...（既查跳号，也查乱序 如 B,A,C,D,E）
    if list(opts.keys()) != [chr(65+i) for i in range(len(opts))]: r.append('opt_gap')
    if len(opts) < 2: r.append('few_opts')
    # 答案=全部选项(全选)：几乎必为解析串扰的错答案（如计算题被标 ABCD）
    if ans and len(opts) >= 3 and set(ans) == set(opts.keys()): r.append('ans_allopts')
    return sorted(set(r))

def main():
    bank = json.load(open(BANK, encoding='utf-8'))
    report = {'total_before': len(bank), 'wm_fixed': 0, 'prefix_fixed': 0,
              'multi_recovered': 0, 'multi_reverted': 0, 'quarantined': [], 'examples': {}}

    # 1) 去水印
    for q in bank:
        for k in list(q['options']):
            nv = strip_wm(q['options'][k])
            if nv != q['options'][k]:
                report['wm_fixed'] += 1
            q['options'][k] = nv
        q['stem'] = strip_wm(q['stem'])
        if q.get('explain'):
            q['explain'] = strip_wm(q['explain'])

    # 2) 题干去页眉前缀
    for q in bank:
        ns = PREFIX.sub('', q['stem'])
        if ns != q['stem'] and len(ns) >= 6:
            q['stem'] = ns.strip()
            report['prefix_fixed'] += 1

    # 3) 恢复多选答案
    recs = build_answer_recs()
    for q in bank:
        if q['type'] == 'multi':
            continue
        subj = q['subject']
        key = normfull(q['stem'])[:40]
        if len(key) < 8:
            continue
        cand = None
        for before, a in recs.get(subj, []):
            if key in before:
                cand = a
                break
        if not cand or len(cand) < 2:
            continue
        opts = set(q['options'].keys())
        old = q['answer'] or ''
        # 安全护栏：恢复答案须都是有效选项、且是原答案超集
        if not (all(c in opts for c in cand) and set(old) <= set(cand)):
            continue
        # 护栏 A：不接受"全选"(所有选项都对)——多为解析串扰
        if set(cand) == opts:
            report['multi_reverted'] += 1
            continue
        # 护栏 B：纯数字选项=计算题=单选，不升多选
        if all(re.fullmatch(r'[\d.,%()（）\s+\-*/×÷=元万亿]+', v.strip() or 'x') for v in q['options'].values()):
            report['multi_reverted'] += 1
            continue
        q['answer'] = cand
        q['type'] = 'multi'
        report['multi_recovered'] += 1

    # 4) 隔离脏题
    keep = []
    for q in bank:
        r = is_corrupt(q)
        if r:
            report['quarantined'].append({'id': q['id'], 'stem': q['stem'][:60], 'reasons': r})
        else:
            keep.append(q)

    report['total_after'] = len(keep)
    json.dump(keep, open(BANK, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(report, open(os.path.join(APP, 'data/clean_report.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print(f"清洗完成: {report['total_before']} -> {report['total_after']} 题")
    print(f"  去水印选项 {report['wm_fixed']}，题干去前缀 {report['prefix_fixed']}")
    print(f"  多选恢复 {report['multi_recovered']}，护栏回退 {report['multi_reverted']}")
    print(f"  隔离脏题 {len(report['quarantined'])}")
    from collections import Counter
    print("  隔离原因:", dict(Counter(x for it in report['quarantined'] for x in it['reasons'])))

if __name__ == '__main__':
    main()
