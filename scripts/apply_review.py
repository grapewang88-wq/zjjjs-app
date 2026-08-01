#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""应用并行教研结果到 docs/bank.json。
用法: python3 apply_review.py <issues.json>
issues = [{"id","problem":wrong_answer|garbled|bad_explain,"correct_answer"?,"note"}]
- wrong_answer: 校验 correct_answer 都是有效选项且≠原答案 → 改 answer+type;记录待重写解析
- garbled: 隔离(移出题库)
- bad_explain: 记录待重写解析
输出: 改后的 bank.json + data/review_apply_report.json + /tmp/reexplain_ids.json(待重写解析的题)
"""
import json, sys, os, re
APP = "/Users/grapewang/Documents/中级经济师考试/备考app"
BANK = os.path.join(APP, "docs/bank.json")

def norm(a): return ''.join(sorted(set(re.findall(r'[A-E]', (a or '').upper()))))

def main(path):
    issues = json.load(open(path, encoding='utf-8'))
    if isinstance(issues, dict): issues = issues.get('issues', [])
    bank = json.load(open(BANK, encoding='utf-8'))
    byid = {q['id']: q for q in bank}
    # 去重:同题多个 problem 合并
    quarantine, ans_fix, reexplain = set(), {}, set()
    for it in issues:
        q = byid.get(it['id'])
        if not q: continue
        p = it.get('problem')
        if p == 'garbled':
            quarantine.add(it['id'])
        elif p == 'wrong_answer':
            ca = norm(it.get('correct_answer'))
            if ca and ca != norm(q['answer']) and all(c in q['options'] for c in ca):
                ans_fix[it['id']] = ca
                reexplain.add(it['id'])
        elif p == 'bad_explain':
            reexplain.add(it['id'])
    # 应用
    for qid, ca in ans_fix.items():
        if qid in quarantine: continue
        byid[qid]['answer'] = ca
        byid[qid]['type'] = 'multi' if len(ca) > 1 else 'single'
    kept = [q for q in bank if q['id'] not in quarantine]
    reexplain = {i for i in reexplain if i not in quarantine}
    json.dump(kept, open(BANK, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    report = {'issues_in': len(issues), 'quarantined': len(quarantine),
              'answers_fixed': len(ans_fix), 'need_reexplain': len(reexplain),
              'total_after': len(kept)}
    json.dump(report, open(os.path.join(APP, 'data/review_apply_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump(sorted(reexplain), open('/tmp/reexplain_ids.json', 'w'))
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__':
    main(sys.argv[1])
