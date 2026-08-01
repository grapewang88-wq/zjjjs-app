/* 中级经济师备考 App —— 纯前端，数据存 localStorage */
'use strict';

// ---------- 常量 ----------
const SUBJECTS = ['基础', '人力'];
const SUBJECT_FULL = { '基础': '经济基础知识', '人力': '人力资源管理' };
// 模拟考规格（题量/分值/时长/合格线）
const EXAM_SPEC = {
  '基础': { single: 70, multi: 35, singlePt: 1, multiPt: 2, minutes: 90, total: 140, pass: 84 },
  '人力': { single: 60, multi: 40, singlePt: 1, multiPt: 2, minutes: 90, total: 140, pass: 84 },
};
// 间隔重复（天）：错题进盒子0，做对升盒，做错回0；升到最高盒即“毕业”
const SR_INTERVALS = [0, 1, 3, 7]; // 盒子0~3；答对4次毕业

// ---------- 存储 ----------
const LS_KEY = 'zjjjs_v1';
// 请求持久化存储，降低被浏览器（尤其内存紧张/长期不用时）清除的概率
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
let store = loadStore();
function loadStore() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
}
function saveStore() { localStorage.setItem(LS_KEY, JSON.stringify(store)); }
// 备份/恢复：进度导出成一串备份码，换手机或被清后粘回即恢复（静态托管无云端的兜底）
function backupProgress() {
  try {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(store))));
    try { if (navigator.clipboard) navigator.clipboard.writeText(code); } catch (e) {}
    window.prompt('这是你的备份码（已尝试自动复制）。请长按全选复制，粘到备忘录/微信收藏保存好。以后在任意设备点“恢复进度”粘回即可：', code);
  } catch (e) { alert('备份失败：' + e.message); }
}
function restoreProgress() {
  const code = window.prompt('粘贴你之前保存的备份码，恢复学习进度：');
  if (!code) return;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!data || typeof data !== 'object') throw new Error('格式不对');
    store = data; saveStore();
    alert('恢复成功！进度已还原。');
    location.reload();
  } catch (e) { alert('恢复失败，备份码可能不完整或有误：' + e.message); }
}
function S() {
  store.answered = store.answered || {};   // id -> {correct:bool, ts}
  store.wrong = store.wrong || {};          // id -> {box, due, addTs, lastTs, wrongCount}
  store.stats = store.stats || {};          // subject -> {done, correct}
  store.exams = store.exams || [];          // 模拟考历史
  return store;
}
const now = () => Date.now();
const DAY = 86400000;

// ---------- 卜卜吉祥物 ----------
const BUBU_DIR = 'assets/bubu/';
// 表情别名 -> 文件
const BUBU = { happy: 'bubu-happy-big', wink: 'bubu-wink', sad: 'bubu-sad',
  sleep: 'bubu-sleep', surprise: 'bubu-surprise', base: 'bubu-base' };
function bubuImg(mood, size = 96, cls = '') {
  const f = BUBU[mood] || BUBU.base;
  return `<img class="${cls}" src="${BUBU_DIR}${f}.png" width="${size}" height="${size}" alt="卜卜" loading="lazy" />`;
}
// 卜卜说话气泡
function bubuSay(mood, msg, sub = '') {
  return `<div class="bubu-say">${bubuImg(mood, 56)}
    <div class="msg">${msg}${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
}

// ---------- 数据 ----------
let BANK = [];
let BYID = {};
let CHAPTERS = { '基础': [], '人力': [] };
let CHBYID = {};
let LECTURE = {};
// 运行期兜底：即便题库有漏网的脏数据，也不让坏题渲染给用户（防御性过滤）
// 同时用「答案长度」强制校正 单选/多选 类型，杜绝多选被当单选。
function sanitizeBank(list) {
  const JIANG = /答案及解析|全国经济专业技术资格|考前冲刺卷|答案和解析|参考解析|课程咨询|环球网校|【\s*\d+\s*[.、]\s*(?:单选|多选|案例)/;
  const PUNCT = /^[\s.。*·\-—_、,，:：;；]+$/;
  const out = [];
  for (const q of (list || [])) {
    if (!q || !q.options) continue;
    const ks = Object.keys(q.options);
    if (ks.length < 2) continue;                                   // 选项太少
    if (ks.join('') !== ks.map((_, i) => String.fromCharCode(65 + i)).join('')) continue; // 选项字母跳号
    const vals = ks.map(k => String(q.options[k] == null ? '' : q.options[k]));
    if (vals.some(v => !v.trim() || PUNCT.test(v.trim()))) continue; // 空/纯符号选项
    if (vals.some(v => JIANG.test(v))) continue;                    // 选项串入讲义/解析/水印
    const seen = new Set(vals.map(v => v.trim()));
    if (seen.size !== vals.length) continue;                        // 选项重复
    const ans = (q.answer || '').toUpperCase().replace(/[^A-E]/g, '');
    if (!ans || [...ans].some(a => !(a in q.options))) continue;    // 答案缺失/不在选项
    if (ks.length >= 3 && ans.length === ks.length) continue;       // 答案=全选（解析串扰）
    q.answer = ans;
    q.type = ans.length > 1 ? 'multi' : 'single';                   // 依答案强制校正题型
    out.push(q);
  }
  return out;
}
async function loadBank() {
  const [b, c, l, ch2] = await Promise.all([
    fetch('bank.json').then(r => r.json()),
    fetch('chapters.json').then(r => r.json()).catch(() => ({ '基础': [], '人力': [] })),
    fetch('lecture.json').then(r => r.json()).catch(() => ({})),
    fetch('changes.json').then(r => r.json()).catch(() => ({})),
  ]);
  BANK = sanitizeBank(b); BANK.forEach(q => BYID[q.id] = q);
  CHAPTERS = c; Object.values(c).flat().forEach(ch => CHBYID[ch.id] = ch);
  LECTURE = l; CHANGES = ch2;
}
let CHANGES = {};
function changeAlert(cid) {
  const cg = CHANGES[cid];
  if (!cg) return '';
  const adds = (cg.adds && cg.adds.length) ? `<div style="margin-top:8px"><b>2025 新增/变动考点：</b><ul style="margin:6px 0 0;padding-left:20px">${cg.adds.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : '';
  return `<div class="card" style="border-left:4px solid var(--warn);display:flex;gap:12px;align-items:flex-start">
    <div>${bubuImg('surprise', 48)}</div>
    <div style="flex:1">
    <div style="color:var(--warn);font-weight:700">⚠️ 2025 考纲变动章节${cg.big ? '（较大变动）' : ''}</div>
    ${cg.note ? `<div class="sub" style="margin-top:6px">${esc(cg.note)}</div>` : ''}
    ${adds}
    <div class="sub" style="margin-top:8px;font-size:12px">提示：历年真题可能未覆盖这些新增点，2026 年需重点关注。</div>
    </div>
  </div>`;
}
function chName(cid) { return CHBYID[cid] ? CHBYID[cid].name : '未分类'; }
function chPart(cid) { return CHBYID[cid] ? CHBYID[cid].part : ''; }

// ---------- 工具 ----------
const $ = sel => document.querySelector(sel);
const app = () => $('#app');
function esc(s) { return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function sample(arr, n) { return shuffle(arr).slice(0, n); }
function srcPill(t) { const m = { '真题': 'real', '模拟题': 'mock', '习题': 'ex' }; return `<span class="pill ${m[t] || ''}">${t}</span>`; }

// ---------- 路由 ----------
const routes = {};
function nav(name, params) {
  const h = '#' + name + (params ? '?' + new URLSearchParams(params) : '');
  if (location.hash === h) router();   // hash 未变化时 hashchange 不触发，手动渲染
  else location.hash = h;
}
function router() {
  const raw = location.hash.slice(1) || 'home';
  const [name, qs] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  (routes[name] || routes.home)(params);
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', router);

// ==================================================================
// 首页
// ==================================================================
routes.home = () => {
  S();
  const totalDone = Object.keys(store.answered).length;
  const totalCorrect = Object.values(store.answered).filter(a => a.correct).length;
  const dueCount = dueWrongIds().length;
  const wrongTotal = Object.keys(store.wrong).length;
  const rate = totalDone ? Math.round(totalCorrect / totalDone * 100) : 0;
  app().innerHTML = `
    <div class="hero">
      <div class="htext">
        <h1>中级经济师备考</h1>
        <div class="sub">距 2026 年 11 月 7 日考试 · 以通过为目标</div>
        <span class="bless">🎉 卜卜祝你考试成功</span>
      </div>
    </div>
    <div class="card"><div class="grid2">
      <div class="stat"><div class="n">${totalDone}</div><div class="l">累计做题</div></div>
      <div class="stat"><div class="n">${rate}%</div><div class="l">正确率</div></div>
      <div class="stat"><div class="n" style="color:var(--bad)">${wrongTotal}</div><div class="l">错题总数</div></div>
      <div class="stat"><div class="n" style="color:var(--warn)">${dueCount}</div><div class="l">今日待复习</div></div>
    </div></div>
    <button class="menu-btn" onclick="nav('practice')">
      <span class="ico">✏️</span><div><div>刷题练习</div><div class="d">真题优先 · 即时解析</div></div><span class="arrow">›</span></button>
    <button class="menu-btn" onclick="nav('wrong')">
      <span class="ico">📕</span><div><div>错题本 · 间隔重复</div><div class="d">${dueCount ? `有 ${dueCount} 道待复习` : '按遗忘曲线自动安排复习'}</div></div><span class="arrow">›</span></button>
    <button class="menu-btn" onclick="nav('exam')">
      <span class="ico">📝</span><div><div>模拟考试</div><div class="d">仿真题量·限时·自动评分</div></div><span class="arrow">›</span></button>
    <button class="menu-btn" onclick="nav('chapters')">
      <span class="ico">📖</span><div><div>章节讲解 · 按章练习</div><div class="d">三色笔记 · 重点高亮</div></div><span class="arrow">›</span></button>
    <div class="card sub" style="font-size:13px">
      题库共 <b>${BANK.length}</b> 道（基础 ${BANK.filter(q => q.subject === '基础').length} · 人力 ${BANK.filter(q => q.subject === '人力').length}），
      来源含历年真题、模拟卷与习题。
    </div>
    <div class="row" style="margin-bottom:14px">
      <button class="ghost sm" onclick="backupProgress()">💾 备份进度</button>
      <button class="ghost sm" onclick="restoreProgress()">↩️ 恢复进度</button>
    </div>
    <div class="sub" style="font-size:12px;text-align:center;margin-bottom:8px">换手机或进度丢失时，用备份码找回学习记录</div>`;
};

// ==================================================================
// 刷题练习
// ==================================================================
let practiceState = null;
routes.practice = (params) => {
  if (params.start) return renderPractice();
  const subj = params.subject || store._lastSubject || '基础';
  store._lastSubject = subj; saveStore();
  const src = params.src || '全部';
  const chap = params.chap || '';   // 章节 id，空=全部章节
  const pool = filterPool(subj, src, chap);
  app().innerHTML = `
    ${topbar('刷题练习', "nav('home')")}
    <div class="card">
      <h3>选择科目</h3>
      <div class="seg">${SUBJECTS.map(s => `<button class="${s === subj ? 'active' : ''}" onclick="nav('practice',{subject:'${s}',src:'${src}'})">${SUBJECT_FULL[s]}</button>`).join('')}</div>
      <h3>题目来源</h3>
      <div>${['全部', '真题', '模拟题', '习题'].map(t => `<span class="chip ${t === src ? 'active' : ''}" onclick="nav('practice',{subject:'${subj}',src:'${t}',chap:'${chap}'})">${t}${t !== '全部' ? ` (${filterPool(subj, t, '').length})` : ` (${filterPool(subj, '全部', '').length})`}</span>`).join('')}</div>
      <h3 style="margin-top:14px">章节 ${chap ? `· <span style="color:var(--brand)">${esc(chName(chap))}</span>` : '· 全部'}</h3>
      <div class="row">
        <button class="sec sm" onclick="nav('practice',{subject:'${subj}',src:'${src}',chap:''})">全部章节</button>
        <button class="sec sm" onclick="pickChapter('${subj}','${src}')">按章节选择 ›</button>
      </div>
    </div>
    <div class="card center">
      <div class="sub">可练习 <b style="color:var(--brand);font-size:20px">${pool.length}</b> 道题</div>
      <div class="row" style="margin-top:14px">
        <button onclick="startPractice('${subj}','${src}',false,false,'${chap}')" ${pool.length ? '' : 'disabled'}>顺序练习</button>
        <button class="ghost" onclick="startPractice('${subj}','${src}',true,false,'${chap}')" ${pool.length ? '' : 'disabled'}>乱序练习</button>
      </div>
      <button class="sec sm" style="margin-top:10px;flex:none" onclick="startPractice('${subj}','${src}',true,true,'${chap}')">只练未做过的题</button>
    </div>`;
};
function filterPool(subj, src, chap) {
  return BANK.filter(q => q.subject === subj
    && (src === '全部' || !src || q.source_type === src)
    && (!chap || q.chapter === chap));
}
window.pickChapter = (subj, src) => {
  const chs = CHAPTERS[subj] || [];
  // 按部分分组
  const groups = {};
  chs.forEach(c => { (groups[c.part] = groups[c.part] || []).push(c); });
  const cnt = cid => BANK.filter(q => q.subject === subj && q.chapter === cid).length;
  app().innerHTML = `${topbar('选择章节', `nav('practice',{subject:'${subj}',src:'${src}'})`)}
    ${Object.entries(groups).map(([part, list]) => `
      <div class="card">
        <h3>${esc(part || '其他')}</h3>
        ${list.map(c => `<div class="opt" style="cursor:pointer" onclick="nav('practice',{subject:'${subj}',src:'${src}',chap:'${c.id}'})">
          <div style="flex:1">${esc(c.name)}</div><div class="pill">${cnt(c.id)}</div></div>`).join('')}
      </div>`).join('')}`;
};
window.startPractice = (subj, src, shuf, onlyNew, chap) => {
  let pool = filterPool(subj, src, chap);
  if (onlyNew) pool = pool.filter(q => !store.answered[q.id]);
  if (!pool.length) { alert('没有符合条件的题目'); return; }
  if (shuf) pool = shuffle(pool);
  practiceState = { ids: pool.map(q => q.id), i: 0, subj, src, chap: chap || '' };
  renderPractice();
};
function renderPractice() {
  const st = practiceState;
  if (!st) return nav('practice');
  const q = BYID[st.ids[st.i]];
  app().innerHTML = `
    ${topbar(`${st.subj} · ${st.i + 1}/${st.ids.length}`, "if(confirm('退出本次练习？'))nav('practice')")}
    <div class="progress"><i style="width:${(st.i + 1) / st.ids.length * 100}%"></i></div>
    ${questionCard(q, { mode: 'practice' })}`;
  wireQuestion(q, { mode: 'practice', onNext: () => { if (st.i < st.ids.length - 1) { st.i++; renderPractice(); } else finishPractice(); } });
}
function finishPractice() {
  const st = practiceState;
  const ids = st.ids;
  const correct = ids.filter(id => store.answered[id] && store.answered[id].correct).length;
  const pct = Math.round(correct / ids.length * 100);
  const mood = pct >= 80 ? 'happy' : pct >= 60 ? 'wink' : 'sad';
  const word = pct >= 80 ? '太棒了，这一组你稳稳拿下！' : pct >= 60 ? '不错，再巩固下错题就更牢啦' : '没关系，错题都收好了，卜卜陪你再战';
  app().innerHTML = `${topbar('练习完成', "nav('home')")}
    <div class="card center">
      ${bubuImg(mood, 104, 'bubu-hero bubu-pop')}
      <div class="scorebig" style="color:var(--brand)">${pct}%</div>
      <div class="sub">共 ${ids.length} 题 · 答对 ${correct} · 答错 ${ids.length - correct}</div>
      <div style="margin-top:8px;font-weight:600;color:var(--brand)">${word}</div>
      <div class="row" style="margin-top:18px">
        <button onclick="startPractice('${st.subj}','${st.src}',true,false,'${st.chap || ''}')">再来一组</button>
        <button class="ghost" onclick="nav('wrong')">看错题本</button>
      </div>
    </div>`;
}

// ==================================================================
// 通用题目卡片 + 作答逻辑
// ==================================================================
function questionCard(q, opt = {}) {
  const isMulti = q.type === 'multi';
  return `
    <div class="card" id="qcard">
      <div class="qmeta">
        ${srcPill(q.source_type)}${q.year ? `<span class="pill">${q.year}</span>` : ''}
        <span class="pill ${isMulti ? 'multi' : ''}">${isMulti ? '多选题' : '单选题'}</span>
        ${q.chapter ? `<span class="pill brand" style="cursor:pointer" onclick="openLecture('${q.chapter}')">${esc(chName(q.chapter))} ›</span>` : ''}
        ${store.wrong[q.id] ? '<span class="pill" style="color:var(--bad)">错题</span>' : ''}
      </div>
      <div class="qstem">${esc(q.stem)}</div>
      <div id="opts">${Object.entries(q.options).map(([k, v]) =>
        `<div class="opt" data-k="${k}"><div class="k">${k}</div><div>${esc(v)}</div></div>`).join('')}</div>
      <div id="feedback"></div>
      <div class="sticky-actions"><button id="submitBtn" ${''}>${isMulti ? '确认（多选）' : '提交'}</button></div>
    </div>`;
}
function wireQuestion(q, { mode, onNext }) {
  const isMulti = q.type === 'multi';
  let sel = new Set();
  let submitted = false;
  const optsEl = $('#opts');
  optsEl.querySelectorAll('.opt').forEach(el => {
    el.onclick = () => {
      if (submitted) return;
      const k = el.dataset.k;
      if (isMulti) { sel.has(k) ? sel.delete(k) : sel.add(k); el.classList.toggle('sel'); }
      else { sel = new Set([k]); optsEl.querySelectorAll('.opt').forEach(o => o.classList.toggle('sel', o === el)); }
    };
  });
  const btn = $('#submitBtn');
  btn.onclick = () => {
    if (!submitted) {
      if (!sel.size) { alert('请选择答案'); return; }
      submitted = true;
      const picked = [...sel].sort().join('');
      const answer = q.answer.split('').sort().join('');
      const correct = picked === answer;
      // 展示对错
      optsEl.querySelectorAll('.opt').forEach(el => {
        const k = el.dataset.k;
        const inAns = q.answer.includes(k), inSel = sel.has(k);
        el.style.pointerEvents = 'none';
        if (inAns) el.classList.add('correct');
        else if (inSel) el.classList.add('wrong');
      });
      recordAnswer(q, correct, mode);
      $('#feedback').innerHTML = `
        ${correct
          ? bubuSay('happy', '答对啦！', '卜卜给你比个心 💛')
          : bubuSay('sad', '别灰心，已记进错题本', '卜卜陪你下次拿下它')}
        <div class="explain">
          <div class="lbl">${correct ? '<span class="res-ok">✓ 回答正确</span>' : '<span class="res-bad">✗ 回答错误</span>'} · 正确答案：${q.answer}</div>
          ${q.explain ? esc(q.explain) : '<span class="sub">（本题暂无解析）</span>'}
        </div>`;
      const bs = $('#feedback .bubu-say img'); if (bs) bs.classList.add('bubu-pop');
      btn.textContent = '下一题 ›';
    } else {
      onNext();
    }
  };
}
function recordAnswer(q, correct, mode) {
  S();
  store.answered[q.id] = { correct, ts: now() };
  // 错题本 + 间隔重复调度
  if (mode === 'review') {
    updateSR(q.id, correct);
  } else {
    if (!correct) addWrong(q.id);
    else if (store.wrong[q.id]) updateSR(q.id, true); // 平时做对错题也算复习
  }
  saveStore();
}

// ==================================================================
// 错题本 + 间隔重复
// ==================================================================
function addWrong(id) {
  S();
  const w = store.wrong[id];
  if (!w) store.wrong[id] = { box: 0, due: now(), addTs: now(), lastTs: now(), wrongCount: 1 };
  else { w.box = 0; w.due = now(); w.lastTs = now(); w.wrongCount++; }
}
function updateSR(id, correct) {
  S();
  const w = store.wrong[id];
  if (!w) return;
  if (correct) {
    w.box++;
    if (w.box >= SR_INTERVALS.length) { delete store.wrong[id]; return; } // 毕业
    w.due = now() + SR_INTERVALS[w.box] * DAY;
  } else {
    w.box = 0; w.due = now(); w.wrongCount++;
  }
  w.lastTs = now();
}
function dueWrongIds() {
  S();
  return Object.keys(store.wrong).filter(id => BYID[id] && store.wrong[id].due <= now());
}

let reviewState = null;
routes.wrong = (params) => {
  if (params.start) return renderReview();
  S();
  const all = Object.keys(store.wrong).filter(id => BYID[id]);
  const due = dueWrongIds();
  const bySubj = {};
  all.forEach(id => { const s = BYID[id].subject; bySubj[s] = (bySubj[s] || 0) + 1; });
  app().innerHTML = `
    ${topbar('错题本', "nav('home')")}
    <div class="card"><div class="grid2">
      <div class="stat"><div class="n" style="color:var(--bad)">${all.length}</div><div class="l">错题总数</div></div>
      <div class="stat"><div class="n" style="color:var(--warn)">${due.length}</div><div class="l">今日待复习</div></div>
    </div>
    <div class="sub center" style="margin-top:6px">${SUBJECTS.map(s => `${SUBJECT_FULL[s]} ${bySubj[s] || 0}`).join(' · ')}</div>
    </div>
    ${all.length === 0 ? `<div class="empty">${bubuImg('sleep', 96, 'bubu-hero')}<div style="margin-top:6px;font-weight:600">还没有错题，卜卜先睡会儿 💤</div><span class="sub">做错的题会自动收进这里，并按遗忘曲线安排复习</span></div>` : `
    <div class="card">
      <h3>间隔重复复习</h3>
      <div class="sub" style="margin-bottom:12px">答对一次进入下一复习周期（今天→1天→3天→7天后），连续答对 4 次即“毕业”移出错题本；答错则重新开始。</div>
      <button onclick="startReview('due')" ${due.length ? '' : 'disabled'}>开始复习今日待复习（${due.length}）</button>
      <div class="row" style="margin-top:10px">
        ${SUBJECTS.map(s => `<button class="ghost" onclick="startReview('${s}')" ${(bySubj[s] || 0) ? '' : 'disabled'}>复习${s}全部(${bySubj[s] || 0})</button>`).join('')}
      </div>
    </div>
    ${wrongChapterBreakdown(all)}`}`;
};
function wrongChapterBreakdown(ids) {
  // 按章节统计错题，倒序，帮助定位薄弱章节
  const byCh = {};
  ids.forEach(id => { const c = BYID[id].chapter || '未分类'; byCh[c] = (byCh[c] || 0) + 1; });
  const rows = Object.entries(byCh).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (!rows.length) return '';
  const max = rows[0][1];
  return `<div class="card"><h3>薄弱章节（错题分布）</h3>
    <div class="sub" style="margin-bottom:10px">点击章节可直接练该章错题以外的题，或查看讲解。</div>
    ${rows.map(([cid, n]) => `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:3px">
          <span style="cursor:pointer" onclick="${cid !== '未分类' ? `openLecture('${cid}')` : ''}">${esc(cid === '未分类' ? '未分类' : chName(cid))}${cid !== '未分类' && LECTURE[cid] ? ' 📖' : ''}</span>
          <span style="color:var(--bad);font-weight:700">${n}</span>
        </div>
        <div class="progress"><i style="width:${n / max * 100}%;background:var(--bad)"></i></div>
      </div>`).join('')}
  </div>`;
}
// 章节讲解
window.openLecture = (cid) => { location.hash = '#lecture?cid=' + cid; };
routes.lecture = (params) => {
  const cid = params.cid;
  const ch = CHBYID[cid];
  const content = LECTURE[cid];
  const qn = BANK.filter(q => q.chapter === cid).length;
  const back = "history.length>1?history.back():nav('home')";
  app().innerHTML = `${topbar(ch ? ch.name : '章节讲解', back)}
    <div class="card">
      <div class="qmeta">${ch ? `<span class="pill">${esc(ch.part)}</span>` : ''}<span class="pill brand">${qn} 道题</span></div>
      <h2>${ch ? esc(ch.name) : '未分类'}</h2>
      <div class="row" style="margin-top:10px">
        <button class="sm" onclick="startPractice('${cid.split('-')[0]}','全部',false,false,'${cid}')">练本章题目</button>
      </div>
    </div>
    ${changeAlert(cid)}
    ${content ? `<div class="card"><h3>考点讲解</h3><div class="lecture">${renderLecture(content)}</div>
      <div class="sub" style="margin-top:10px">红色为重点、蓝色为次重点。</div></div>`
      : `<div class="empty"><div class="big">📖</div>本章暂无三色笔记讲解<br><span class="sub">可先通过“练本章题目”结合解析复习</span></div>`}`;
};
function renderLecture(runs) {
  const color = { '重点': 'var(--bad)', '次重点': 'var(--brand2)', '补充': 'var(--ok)' };
  return runs.map(r => {
    const t = esc(r.t).replace(/\n/g, '<br>');
    if (r.tier && r.tier !== '常规' && color[r.tier]) return `<span style="color:${color[r.tier]};font-weight:600">${t}</span>`;
    return t;
  }).join('');
}
// 章节浏览
routes.chapters = (params) => {
  const subj = params.subject || store._lastSubject || '基础';
  const chs = CHAPTERS[subj] || [];
  const groups = {};
  chs.forEach(c => { (groups[c.part] = groups[c.part] || []).push(c); });
  const cnt = cid => BANK.filter(q => q.subject === subj && q.chapter === cid).length;
  app().innerHTML = `${topbar('章节讲解', "nav('home')")}
    <div class="card">
      <div class="seg">${SUBJECTS.map(s => `<button class="${s === subj ? 'active' : ''}" onclick="nav('chapters',{subject:'${s}'})">${SUBJECT_FULL[s]}</button>`).join('')}</div>
    </div>
    ${Object.entries(groups).map(([part, list]) => `
      <div class="card">
        <h3>${esc(part || '其他')}</h3>
        ${list.map(c => `<div class="opt" style="cursor:pointer" onclick="openLecture('${c.id}')">
          <div style="flex:1">${esc(c.name)} ${LECTURE[c.id] ? '📖' : ''} ${CHANGES[c.id] ? '<span style="color:var(--warn)">⚠️2025变动</span>' : ''}</div>
          <div class="pill">${cnt(c.id)} 题</div></div>`).join('')}
      </div>`).join('')}`;
};
window.startReview = (which) => {
  S();
  let ids;
  if (which === 'due') ids = dueWrongIds();
  else ids = Object.keys(store.wrong).filter(id => BYID[id] && BYID[id].subject === which);
  if (!ids.length) return;
  // 按到期时间排序，先复习最该复习的
  ids.sort((a, b) => store.wrong[a].due - store.wrong[b].due);
  reviewState = { ids, i: 0, which };
  renderReview();
};
function renderReview() {
  const st = reviewState;
  if (!st || !st.ids.length) return nav('wrong');
  // 动态：若当前 id 已毕业则跳过
  while (st.i < st.ids.length && !store.wrong[st.ids[st.i]]) st.i++;
  if (st.i >= st.ids.length) return finishReview();
  const q = BYID[st.ids[st.i]];
  const w = store.wrong[q.id];
  app().innerHTML = `
    ${topbar(`复习 · ${st.i + 1}/${st.ids.length}`, "if(confirm('结束复习？'))nav('wrong')")}
    <div class="progress"><i style="width:${(st.i + 1) / st.ids.length * 100}%"></i></div>
    <div class="sub" style="margin-bottom:8px">已错 ${w.wrongCount} 次 · 复习进度 ${w.box}/${SR_INTERVALS.length}</div>
    ${questionCard(q, { mode: 'review' })}`;
  wireQuestion(q, { mode: 'review', onNext: () => { st.i++; renderReview(); } });
}
function finishReview() {
  const remaining = dueWrongIds().length;
  app().innerHTML = `${topbar('复习完成', "nav('home')")}
    <div class="card center"><div class="scorebig">✓</div>
    <div class="sub" style="margin-top:8px">本轮复习结束${remaining ? `，还有 ${remaining} 道待复习` : '，今日复习已清空 🎉'}</div>
    <div class="row" style="margin-top:18px">
      ${remaining ? `<button onclick="startReview('due')">继续复习</button>` : ''}
      <button class="ghost" onclick="nav('wrong')">返回错题本</button>
    </div></div>`;
}

// ==================================================================
// 模拟考试
// ==================================================================
let examState = null;
routes.exam = (params) => {
  if (examState && params.resume) return renderExam();
  S();
  app().innerHTML = `
    ${topbar('模拟考试', "nav('home')")}
    ${SUBJECTS.map(s => {
    const sp = EXAM_SPEC[s];
    const poolS = BANK.filter(q => q.subject === s && q.type === 'single').length;
    const poolM = BANK.filter(q => q.subject === s && q.type === 'multi').length;
    const enough = poolS >= sp.single && poolM >= sp.multi;
    return `<div class="card">
        <h3>${SUBJECT_FULL[s]}</h3>
        <div class="sub">${sp.single} 单选（${sp.singlePt}分）+ ${sp.multi} 多选（${sp.multiPt}分） · 满分 ${sp.total} · 合格 ${sp.pass} · ${sp.minutes} 分钟</div>
        <button style="margin-top:12px" onclick="startExam('${s}')" ${enough ? '' : 'disabled'}>${enough ? '开始模拟考' : '题量不足，暂不可考'}</button>
      </div>`;
  }).join('')}
    ${store.exams.length ? `<div class="card"><h3>历史成绩</h3>${store.exams.slice(-8).reverse().map(e =>
    `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
        <span>${SUBJECT_FULL[e.subject]}</span>
        <span class="${e.score >= e.pass ? 'res-ok' : 'res-bad'}">${e.score}/${e.total} ${e.score >= e.pass ? '合格' : '未过'}</span>
      </div>`).join('')}</div>` : ''}`;
};
window.startExam = (subj) => {
  const sp = EXAM_SPEC[subj];
  const singles = sample(BANK.filter(q => q.subject === subj && q.type === 'single'), sp.single);
  const multis = sample(BANK.filter(q => q.subject === subj && q.type === 'multi'), sp.multi);
  const qs = [...singles, ...multis];
  examState = { subj, sp, ids: qs.map(q => q.id), answers: {}, i: 0, endAt: now() + sp.minutes * 60000, submitted: false };
  renderExam();
};
function renderExam() {
  const st = examState;
  const q = BYID[st.ids[st.i]];
  const remainMs = st.endAt - now();
  if (remainMs <= 0 && !st.submitted) return submitExam(true);
  app().innerHTML = `
    <div class="topbar">
      <button class="back" onclick="if(confirm('交卷并查看成绩？'))submitExam(false)">✕</button>
      <div class="t">${st.i + 1}/${st.ids.length}</div>
      <div class="r timer" id="timer"></div>
    </div>
    <div class="progress"><i style="width:${(st.i + 1) / st.ids.length * 100}%"></i></div>
    ${examQuestionCard(q, st)}
    <div class="row" style="margin-top:8px">
      <button class="sec" onclick="examGoto(${st.i - 1})" ${st.i === 0 ? 'disabled' : ''}>‹ 上一题</button>
      ${st.i < st.ids.length - 1 ? `<button onclick="examGoto(${st.i + 1})">下一题 ›</button>`
      : `<button onclick="if(confirm('确认交卷？'))submitExam(false)">交卷</button>`}
    </div>
    <button class="sec sm" style="margin-top:10px" onclick="examSheet()">答题卡（已答 ${Object.keys(st.answers).length}/${st.ids.length}）</button>`;
  tickTimer();
}
function examQuestionCard(q, st) {
  const isMulti = q.type === 'multi';
  const cur = new Set(st.answers[q.id] || []);
  return `<div class="card">
    <div class="qmeta"><span class="pill ${isMulti ? 'multi' : ''}">${isMulti ? '多选题' : '单选题'}</span><span class="pill">${isMulti ? st.sp.multiPt : st.sp.singlePt}分</span></div>
    <div class="qstem">${esc(q.stem)}</div>
    <div id="opts">${Object.entries(q.options).map(([k, v]) =>
    `<div class="opt ${cur.has(k) ? 'sel' : ''}" onclick="examPick('${q.id}','${k}',${isMulti})"><div class="k">${k}</div><div>${esc(v)}</div></div>`).join('')}</div>
  </div>`;
}
window.examPick = (id, k, isMulti) => {
  const st = examState; const cur = new Set(st.answers[id] || []);
  if (isMulti) { cur.has(k) ? cur.delete(k) : cur.add(k); }
  else { cur.clear(); cur.add(k); }
  st.answers[id] = [...cur];
  if (!cur.size) delete st.answers[id];
  renderExam();
};
window.examGoto = (i) => { examState.i = Math.max(0, Math.min(examState.ids.length - 1, i)); renderExam(); };
window.examSheet = () => {
  const st = examState;
  app().innerHTML = `${topbar('答题卡', "renderExam()")}
    <div class="card"><div style="display:flex;flex-wrap:wrap;gap:8px">
      ${st.ids.map((id, i) => `<button class="sm ${st.answers[id] ? '' : 'sec'}" style="flex:none;width:44px" onclick="examState.i=${i};renderExam()">${i + 1}</button>`).join('')}
    </div>
    <div class="sub" style="margin-top:12px">已答 ${Object.keys(st.answers).length} / ${st.ids.length}</div>
    <button style="margin-top:12px" onclick="if(confirm('确认交卷？'))submitExam(false)">交卷</button>
    </div>`;
};
let timerRAF = null;
function tickTimer() {
  const el = $('#timer'); if (!el || !examState) return;
  const upd = () => {
    if (!examState || examState.submitted) return;
    const ms = examState.endAt - now();
    const e = $('#timer'); if (!e) return;
    if (ms <= 0) { submitExam(true); return; }
    const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000);
    e.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    e.classList.toggle('warn', ms < 5 * 60000);
    timerRAF = setTimeout(upd, 1000);
  };
  clearTimeout(timerRAF); upd();
}
window.submitExam = (auto) => {
  const st = examState; if (st.submitted) return;
  st.submitted = true; clearTimeout(timerRAF);
  const sp = st.sp;
  let score = 0, nCorrect = 0;
  const detail = st.ids.map(id => {
    const q = BYID[id];
    const picked = (st.answers[id] || []).slice().sort().join('');
    const ans = q.answer.split('').sort().join('');
    let pts = 0, ok = false;
    if (q.type === 'single') { ok = picked === ans; pts = ok ? sp.singlePt : 0; }
    else {
      const pickedSet = new Set(st.answers[id] || []);
      const ansSet = new Set(q.answer.split(''));
      const anyWrong = [...pickedSet].some(k => !ansSet.has(k));
      if (picked === ans) { pts = sp.multiPt; ok = true; }
      else if (!anyWrong && pickedSet.size > 0) { pts = Math.min(pickedSet.size * 0.5, sp.multiPt - 0.5); } // 少选部分分
      else pts = 0;
    }
    if (ok) nCorrect++;
    score += pts;
    // 记录：错题进错题本
    S(); store.answered[id] = { correct: ok, ts: now() };
    if (!ok) addWrong(id);
    return { id, picked, ans, ok, pts };
  });
  score = Math.round(score * 10) / 10;
  S(); store.exams.push({ subject: st.subj, score, total: sp.total, pass: sp.pass, ts: now(), n: st.ids.length, nCorrect });
  saveStore();
  st.detail = detail;
  renderExamResult();
};
function renderExamResult() {
  const st = examState, sp = st.sp;
  const last = store.exams[store.exams.length - 1];
  const pass = last.score >= sp.pass;
  app().innerHTML = `${topbar('模拟考成绩', "nav('exam')")}
    <div class="card center">
      ${bubuImg(pass ? 'happy' : 'wink', 104, 'bubu-hero bubu-pop')}
      <div class="scorebig ${pass ? 'res-ok' : 'res-bad'}">${last.score}</div>
      <div class="sub">满分 ${sp.total} · 合格线 ${sp.pass} · 答对 ${last.nCorrect}/${st.ids.length}</div>
      <div style="margin-top:10px"><span class="pill ${pass ? 'real' : ''}" style="${pass ? '' : 'background:var(--badbg);color:var(--bad)'}">${pass ? '✓ 达到合格线' : '✗ 未达合格线'}</span></div>
      <div style="margin-top:10px;font-weight:600;color:var(--brand)">${pass ? '卜卜为你鼓掌，保持手感！' : '差一点点，卜卜相信你下次能过线'}</div>
    </div>
    <div class="card"><h3>逐题回顾</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${st.detail.map((d, i) => `<button class="sm ${d.ok ? '' : 'sec'}" style="flex:none;width:44px;${d.ok ? 'background:var(--ok)' : 'background:var(--badbg);color:var(--bad)'}" onclick="examReview(${i})">${i + 1}</button>`).join('')}
      </div>
      <div class="sub" style="margin-top:10px">绿=对，红=错。点击查看题目与解析。错题已自动加入错题本。</div>
    </div>
    <button onclick="nav('exam')">返回</button>`;
}
window.examReview = (i) => {
  const st = examState; const q = BYID[st.ids[i]]; const d = st.detail[i];
  app().innerHTML = `${topbar(`第 ${i + 1} 题`, "renderExamResult()")}
    <div class="card">
      <div class="qmeta">${srcPill(q.source_type)}<span class="pill ${q.type === 'multi' ? 'multi' : ''}">${q.type === 'multi' ? '多选' : '单选'}</span>
        <span class="pill ${d.ok ? 'real' : ''}" style="${d.ok ? '' : 'background:var(--badbg);color:var(--bad)'}">${d.ok ? '✓ +' + d.pts : '✗'}</span></div>
      <div class="qstem">${esc(q.stem)}</div>
      <div>${Object.entries(q.options).map(([k, v]) => {
    const inAns = q.answer.includes(k), inPick = (d.picked || '').includes(k);
    let cls = ''; if (inAns) cls = 'correct'; else if (inPick) cls = 'wrong';
    return `<div class="opt ${cls}" style="pointer-events:none"><div class="k">${k}</div><div>${esc(v)}</div></div>`;
  }).join('')}</div>
      <div class="explain"><div class="lbl">你的答案：${d.picked || '未答'} · 正确答案：${q.answer}</div>${q.explain ? esc(q.explain) : '<span class="sub">（暂无解析）</span>'}</div>
    </div>
    <div class="row"><button class="sec" onclick="examReview(${Math.max(0, i - 1)})" ${i === 0 ? 'disabled' : ''}>‹ 上一题</button>
      <button class="sec" onclick="examReview(${Math.min(st.ids.length - 1, i + 1)})" ${i === st.ids.length - 1 ? 'disabled' : ''}>下一题 ›</button></div>`;
};

// ---------- 公共组件 ----------
function topbar(title, backJs) {
  return `<div class="topbar"><button class="back" onclick="${backJs}">‹</button><div class="t">${title}</div></div>`;
}
document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => nav(b.dataset.nav));

// ---------- 启动 ----------
(async function () {
  app().innerHTML = `<div class="empty" style="padding-top:60px">${bubuImg('base', 96, 'bubu-hero')}<div style="margin-top:10px;font-weight:600;color:var(--brand)">卜卜正在准备题库…</div></div>`;
  try {
    await loadBank();
    $('#tabbar').hidden = false;
    router();
  } catch (e) {
    app().innerHTML = '<div class="empty"><div class="big">⚠️</div>题库加载失败<br><span class="sub">' + esc(e.message) + '</span></div>';
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
