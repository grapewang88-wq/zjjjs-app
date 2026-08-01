#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把生成的解析回填到 docs/bank.json。
用法: python3 patch_explains.py <explanations.json>
  explanations.json = [{"id":..,"explain":..}, ...]
只回填「原解析缺失(更新中/空/过短)」的题;不覆盖已有好解析;校验 id 存在。
"""
import json, sys, os

APP = "/Users/grapewang/Documents/中级经济师考试/备考app"
BANK = os.path.join(APP, "docs/bank.json")

def placeholder(e):
    return (not e) or e.strip() in ('更新中', '', '待更新', '暂无') or len(e.strip()) < 4

def main(path):
    exps = json.load(open(path, encoding='utf-8'))
    if isinstance(exps, dict):
        exps = exps.get('explanations', [])
    bank = json.load(open(BANK, encoding='utf-8'))
    byid = {q['id']: q for q in bank}
    patched = skipped_exists = notfound = tooshort = 0
    for e in exps:
        qid = e.get('id'); txt = (e.get('explain') or '').strip()
        q = byid.get(qid)
        if not q:
            notfound += 1; continue
        if len(txt) < 15:
            tooshort += 1; continue
        if not placeholder(q.get('explain')):
            skipped_exists += 1; continue          # 已有好解析,不覆盖
        q['explain'] = txt
        patched += 1
    still_missing = sum(1 for q in bank if placeholder(q.get('explain')))
    json.dump(bank, open(BANK, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"回填 {patched} 条  | 已有解析跳过 {skipped_exists} | id未找到 {notfound} | 过短丢弃 {tooshort}")
    print(f"回填后仍缺解析: {still_missing} / {len(bank)}")

if __name__ == '__main__':
    main(sys.argv[1])
