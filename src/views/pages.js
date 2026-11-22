// 課表、進度、動作、飲食、設定。
import { fmtDate, addDays, WD, weekdayOf, fastingStatus, fmtDur } from '../lib/time.js';
import { esc, pill, bar, section, fnum, avg } from '../ui/kit.js';
import { weekStartOf } from './today.js';
import { trainingCSV, dailyCSV } from '../lib/csv.js';

const reasonLabel = (plan, id) => plan.skipReasons.find((r) => r.id === id)?.label ?? id;
const est1rm = (w, r) => w * (1 + r / 30);
const allExercises = (plan) => {
  const seen = new Map();
  for (const d of Object.values(plan.days)) for (const e of d.exercises) if (!seen.has(e.id)) seen.set(e.id, { ...e, dayName: d.name });
  return [...seen.values()];
};

// ---------- 課表 ----------
export function schedule(ctx) {
  const { plan, store } = ctx;
  const { date } = ctx.now();
  const sess = store.sessions();
  const next = date < plan.regularStart ? plan.rotation[0] : null;
  return `<h1>課表</h1><div class="muted small">計畫 v${plan.planVersion} · 輪替：${plan.rotation.map((d) => plan.days[d].name).join(' → ')}</div>
    ${section('鑑測週')}<div class="card">${plan.testWeek.map((t) => `<div class="row between check"><span>${fmtDate(t.date)}</span><span>${esc(plan.days[t.day].name)}鑑測${t.date === date ? ' ' + pill('今天', 'y') : ''}</span></div>`).join('')}
      <div class="small muted mt-s">${fmtDate(plan.regularStart)} 起正式訓練，從${esc(plan.days[next || plan.rotation[0]].name)}開始。</div></div>
    ${section('每週')}<div class="card">${[1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const kind = plan.weekdays.training.includes(wd) ? '晚上重訓 21:00' : '拉伸修復 + 走路';
    return `<div class="row between check"><span class="bold">週${WD[wd]}</span><span class="muted">${kind}</span></div>`;
  }).join('')}<div class="xs dim mt-s">每天：早上暖身 + HIIT + 冷水澡（${plan.hiit.start.slice(5).replace('-', '/')} 起）、步數 ${plan.targets.steps}。</div></div>
    ${Object.entries(plan.days).map(([id, d]) => `${section(d.name)}<div class="card">${d.exercises.map((e) => `<div class="row between check"><span>${esc(e.name)}</span><span class="muted small">${e.sets}×${e.repMin}-${e.repMax} · 休 ${e.restSec} 秒</span></div>`).join('')}
      <div class="xs dim mt-s">已完成 ${sess.filter((s) => s.day === id && s.kind === 'regular' && s.status !== 'missed').length} 次</div></div>`).join('')}
    ${section('拉伸修復日')}<div class="card">${plan.stretch.map((s) => `<div class="row between check"><span>${esc(s.name)}</span><span class="muted small">${s.kind === 'time' ? `${s.seconds} 秒${s.perSide ? ' ×左右' : ''}` : `${s.reps} 下${s.sets > 1 ? ` ×${s.sets}` : ''}`}</span></div>`).join('')}</div>
    ${section('HIIT 版本')}<div class="card">${Object.entries(plan.hiit.versions).map(([id, v]) => `<div class="check" style="display:block"><div class="bold">${esc(v.name)} · ${v.minutes} 分</div><div class="small muted">${esc(v.content)}</div></div>`).join('')}
      <div class="xs dim mt-s">睡不到 ${plan.hiit.walkBelowSleep} 小時，或起床心率比平常高 ${plan.hiit.hrRiseWalk} 下以上，改快走；腿日隔天用低衝擊版。</div></div>`;
}

// ---------- 進度 ----------
function weeklyStats(ctx, wk) {
  const { store } = ctx;
  const end = addDays(wk, 6);
  const days = store.allDays().filter((d) => d.date >= wk && d.date <= end);
  const ses = store.sessions().filter((s) => s.date >= wk && s.date <= end && s.status !== 'in-progress');
  const w = days.filter((d) => d.weight).map((d) => d.weight);
  return {
    wk, done: ses.filter((s) => s.status !== 'missed').length, missed: ses.filter((s) => s.status === 'missed'),
    weight: avg(w), steps: avg(days.filter((d) => d.steps).map((d) => d.steps)),
    proteinDays: days.filter((d) => (d.proteinG || 0) >= ctx.plan.targets.proteinG).length,
  };
}
function weightChart(pts) {
  if (pts.length < 2) return '<div class="muted small center" style="padding:16px">記滿 2 天體重就會出現趨勢圖</div>';
  const W = 320, H = 120, vs = pts.map((p) => p.v), lo = Math.min(...vs) - 0.5, hi = Math.max(...vs) + 0.5;
  const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * (W - 20) + 10},${H - 14 - ((p.v - lo) / (hi - lo)) * (H - 28)}`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><polyline fill="none" stroke="var(--hero)" stroke-width="2.5" points="${xy.join(' ')}"/>
    ${xy.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="var(--hero)"/>`).join('')}
    <text x="4" y="12" fill="var(--dim)" font-size="10">${hi.toFixed(1)}</text><text x="4" y="${H - 2}" fill="var(--dim)" font-size="10">${lo.toFixed(1)}</text></svg>`;
}
export function progress(ctx) {
  const { plan, store } = ctx;
  const { date } = ctx.now();
  const d = store.getDay(date);
  const wdays = store.allDays().filter((x) => x.weight).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last7 = wdays.slice(-7);
  const a7 = avg(last7.map((x) => x.weight));
  const first = wdays[0];
  const sessions = store.sessions().filter((s) => s.status !== 'in-progress').sort((a, b) => (a.date < b.date ? 1 : -1));
  const wk0 = weekStartOf(date);
  const weeks = [0, 1, 2, 3].map((i) => weeklyStats(ctx, addDays(wk0, -7 * i)));
  const note = store.week(wk0).note || '';
  const hint = weekHint(weeks);
  // 成就
  const regular = sessions.filter((s) => s.kind === 'regular' && s.status !== 'missed');
  let streak = 0;
  for (const s of sessions.filter((x) => x.kind !== 'test')) { if (s.status === 'missed') break; streak++; }
  const bests = allExercises(plan).map((e) => {
    const sets = store.history(e.id).flat().filter((x) => x.status === 'done' && x.weight);
    if (!sets.length) return null;
    const b = sets.reduce((m, x) => (est1rm(x.weight, x.reps) > est1rm(m.weight, m.reps) ? x : m));
    return { name: e.name, w: b.weight, r: b.reps, e1: est1rm(b.weight, b.reps) };
  }).filter(Boolean);
  const num = (k, label, unit, step = 'any') => `<label class="field"><span>${label}</span><span><input type="number" inputmode="decimal" step="${step}" data-act="field" data-k="${k}" value="${d[k] ?? ''}"> ${unit}</span></label>`;
  return `<h1>進度</h1>
    <div class="grid3 mt"><div class="card center"><div class="xs muted">7 天均重</div><div class="black hero-c" style="font-size:1.4rem">${a7 ? a7.toFixed(1) : '—'}</div></div>
      <div class="card center"><div class="xs muted">完成訓練</div><div class="black" style="font-size:1.4rem">${regular.length}</div></div>
      <div class="card center"><div class="xs muted">連續出勤</div><div class="black ok-c" style="font-size:1.4rem">${streak}</div></div></div>
    ${section('今天的身體數據')}<div class="card">${num('weight', '體重', 'kg')}${num('bodyFat', '體脂', '%')}${num('steps', `步數（目標 ${plan.targets.steps}）`, '步', '1')}
      <div class="xs dim">${first ? `起點 ${first.weight} kg${a7 ? `，現在均重 ${a7.toFixed(1)}（${a7 - first.weight >= 0 ? '+' : ''}${(a7 - first.weight).toFixed(1)}）` : ''}` : '還沒有體重紀錄'}</div></div>
    ${section('體重趨勢')}<div class="card">${weightChart(wdays.slice(-30).map((x) => ({ v: x.weight })))}</div>
    ${section('週回顧')}<div class="card">
      <table><tr><th>週</th><th class="n">訓練</th><th class="n">均重</th><th class="n">蛋白達標</th></tr>
      ${weeks.map((w, i) => `<tr><td>${w.wk.slice(5).replace('-', '/')}${i === 0 ? '（本週）' : ''}</td><td class="n">${w.done}</td><td class="n">${w.weight ? w.weight.toFixed(1) : '—'}</td><td class="n">${w.proteinDays} 天</td></tr>`).join('')}</table>
      ${weeks[0].missed.length ? `<div class="small mt-s bad-c">沒練：${weeks[0].missed.map((s) => `${fmtDate(s.date)} ${reasonLabel(plan, s.reason)}${s.note ? `（${esc(s.note)}）` : ''}`).join('、')}</div>` : ''}
      ${hint ? `<div class="card hl mt small">${hint}</div>` : ''}
      <textarea class="mt" rows="2" placeholder="這週的心得（睡眠、疼痛、卡關）" data-act="week-note">${esc(note)}</textarea></div>
    ${section('成就')}<div class="card">${bests.length ? bests.map((b) => `<div class="row between check"><span>${esc(b.name)}</span><span class="muted small">${fnum(b.w)}×${b.r} · 估 1RM ${b.e1.toFixed(0)}</span></div>`).join('') : '<div class="muted small">正式訓練開始後，這裡會列每個動作的最佳紀錄。</div>'}</div>
    ${section('訓練紀錄')}<div class="card">${sessions.length ? `<table>${sessions.slice(0, 30).map((s) => `<tr><td>${fmtDate(s.date)}</td><td>${esc(plan.days[s.day]?.name || '')}${s.kind === 'test' ? '鑑測' : ''}</td><td class="n">${s.status === 'missed' ? `<span class="bad-c">沒練：${esc(reasonLabel(plan, s.reason))}</span>` : s.status === 'partial' ? '部分' : '完成'}</td></tr>`).join('')}</table>` : '<div class="muted small">還沒有紀錄</div>'}</div>`;
}
function weekHint(weeks) {
  const [a, b, c] = weeks;
  if (!a.weight || !b.weight) return '';
  const d1 = a.weight - b.weight;
  if (c?.weight && d1 < -0.8 && b.weight - c.weight < -0.8) return '連兩週每週掉超過 0.8 kg，依計畫算太快，請跟教練說。';
  if (c?.weight && Math.abs(d1) < 0.2 && Math.abs(b.weight - c.weight) < 0.2) return '體重連兩週沒動：依計畫先把步數加到 10000，再觀察兩週。';
  return `本週均重 ${d1 > 0 ? '+' : ''}${d1.toFixed(1)} kg（和上週比）。`;
}

// ---------- 動作 ----------
export function library(ctx) {
  const { plan, store } = ctx;
  return `<h1>動作</h1><div class="muted small">每個動作的做法、起始重量與最佳紀錄。</div><div class="mt">${allExercises(plan).map((e) => {
    const last = store.lastSets(e.id);
    const sets = store.history(e.id).flat().filter((x) => x.status === 'done' && x.weight);
    const best = sets.length ? sets.reduce((m, x) => (est1rm(x.weight, x.reps) > est1rm(m.weight, m.reps) ? x : m)) : null;
    return `<details class="card"><summary><span class="bold">${esc(e.name)}</span> <span class="xs dim">${esc(e.dayName)} · ${e.sets}×${e.repMin}-${e.repMax}</span></summary>
      <div class="small muted mt-s">${esc(e.cue)}</div>
      <div class="small mt-s">起始重量：${store.startWeight(e.id) != null ? `${fnum(store.startWeight(e.id))} kg` : '待鑑測'}</div>
      <div class="small">上次：${last ? `${fmtDate(last.date)} ${last.sets.map((x) => `${fnum(x.weight)}×${x.reps}`).join('、')}` : '—'}</div>
      <div class="small">最佳：${best ? `${fnum(best.weight)}×${best.reps}（估 1RM ${est1rm(best.weight, best.reps).toFixed(0)}）` : '—'}</div>
      <a class="btn b-ghost mt-s" href="https://www.youtube.com/results?search_query=${encodeURIComponent(e.en || e.name)}" target="_blank" rel="noopener">搜尋示範影片（結果未經確認）</a></details>`;
  }).join('')}</div>`;
}

// ---------- 飲食 ----------
export function nutrition(ctx) {
  const { plan, store } = ctx;
  const { date, time } = ctx.now();
  const day = store.getDay(date);
  const t = plan.targets;
  const fs = fastingStatus(t.eatStart, t.eatEnd, time);
  const add = (k, label, target, unit, steps) => `<div class="card"><div class="row between"><span class="bold">${label}</span><span><b>${day[k] ?? 0}</b> / ${target} ${unit}</span></div>${bar(day[k], target, 'g')}
    <div class="chips mt-s">${steps.map((n) => `<button data-act="add" data-k="${k}" data-n="${n}">+${n}</button>`).join('')}<button data-act="add" data-k="${k}" data-n="reset">歸零</button></div></div>`;
  const tm = (k, label) => `<label class="field"><span>${label}</span><input type="time" data-act="field" data-k="${k}" value="${day[k] ?? ''}"></label>`;
  const early = day.firstMeal && day.firstMeal < t.eatStart, late = day.lastMealEnd && day.lastMealEnd > t.eatEnd;
  return `<h1>飲食</h1>
    <div class="card ${fs.state === 'eating' ? 'okb' : ''} mt"><div class="row between"><div><div class="kick">${fs.state === 'eating' ? '進食窗口中' : '禁食中'}</div><div class="black" style="font-size:1.6rem">${fmtDur(fs.secondsToNext).replace(/:\d\d$/, '')}</div></div><div class="muted small right">後${fs.nextLabel}<br>窗口 ${t.eatStart}–${t.eatEnd}</div></div>
      <div class="xs dim mt-s">${t.eatEnd} 前吃完所有東西，練完只喝水，不喝蛋白粉。</div></div>
    ${add('proteinG', '蛋白質', t.proteinG, 'g', [10, 20, 25, 50])}${add('waterMl', '水', t.waterMl, 'ml', [250, 500])}
    <div class="card"><label class="field"><span>咖啡、茶（${t.caffeineCutoff} 後不喝）</span><span><input type="number" inputmode="decimal" step="50" data-act="field" data-k="caffeineCc" value="${day.caffeineCc ?? ''}"> cc</span></label>
      ${time > t.caffeineCutoff ? '<div class="small bad-c">已過 14:00，今天不要再喝咖啡、茶。</div>' : ''}</div>
    <div class="card"><label class="check"><input type="checkbox" data-act="flag" data-k="creatine" ${day.creatine ? 'checked' : ''}><span class="t">肌酸 ${t.creatineG} g</span></label>
      <label class="check"><input type="checkbox" data-act="flag" data-k="proteinPowder" ${day.proteinPowder ? 'checked' : ''}><span class="t">14:00 蛋白粉</span></label>
      ${tm('firstMeal', '第一餐時間')}${tm('lastMealEnd', '最後一餐吃完')}
      ${early ? `<div class="small bad-c">第一餐早於 ${t.eatStart}</div>` : ''}${late ? `<div class="small bad-c">最後一餐超過 ${t.eatEnd}</div>` : ''}</div>
    <div class="card"><label class="check"><input type="checkbox" data-act="flag" data-k="cheat" ${day.cheat ? 'checked' : ''}><span class="t">今天破功（聚餐、喝酒、吃太多）</span></label>
      ${day.cheat ? `<textarea rows="2" data-act="field" data-k="cheatNote" placeholder="吃了什麼、原因">${esc(day.cheatNote)}</textarea><div class="muted small mt-s">照常就好：明天照原本時間表走，不補償斷食、不多加 HIIT。</div>` : ''}</div>`;
}

// ---------- 設定 ----------
export function settings(ctx) {
  const { plan, store } = ctx;
  const p = store.prefs();
  const url = new URL('reminders.ics', location.href).href.replace(/^https?:/, 'webcal:');
  const ex = allExercises(plan);
  return `<h1>設定</h1>
    <div class="card mt"><b>聲音</b><label class="check"><input type="checkbox" data-act="pref" data-k="voice" ${p.voice ? 'checked' : ''}><span class="t">語音提示（下一組、時間到）</span></label>
      <label class="check"><input type="checkbox" data-act="pref" data-k="beep" ${p.beep ? 'checked' : ''}><span class="t">倒數嗶聲（最後 5 秒）</span></label><div class="xs dim">不震動。iPhone 要先按過一次「完成」才會出聲。</div></div>
    <div class="card"><b>備份與匯出</b><div class="muted small">資料只存在這支手機。每週匯出一次到 Google Drive：我的雲端硬碟 → 健身訓練App → 備份。</div>
      <button class="b-primary b-block mt" data-act="export" data-fmt="json">匯出備份 JSON</button>
      <div class="row mt-s"><button class="grow" data-act="export" data-fmt="training">訓練紀錄 CSV</button><button class="grow" data-act="export" data-fmt="daily">每日紀錄 CSV</button></div>
      <label class="btn b-ghost b-block mt-s">從檔案還原<input type="file" accept="application/json,.json" data-act="import" hidden></label></div>
    <div class="card"><b>提醒（訂閱日曆）</b><div class="muted small">按「訂閱提醒」，iPhone 會問要不要訂閱。之後計畫時間有改，會自己更新（約一小時內）。</div>
      <a class="btn b-primary b-block mt" href="${url}">訂閱提醒</a></div>
    <details class="card"><summary>起始重量</summary><div class="xs muted mt-s">鑑測後自動填入，也可以自己改。</div>
      ${ex.map((e) => `<label class="field"><span>${esc(e.name)}<br><span class="xs dim">${esc(e.dayName)}</span></span><span><input type="number" inputmode="decimal" step="0.5" data-act="start-w" data-id="${e.id}" value="${store.startWeight(e.id) ?? ''}"> kg</span></label>`).join('')}</details>
    <div class="card"><b>重置</b><div class="muted small">清掉這支手機上 App 的全部紀錄，回到全新狀態。不會動 Google Drive 裡的備份。</div>
      <button class="b-danger b-block mt" data-act="reset">重置全部資料</button></div>
    <div class="card small muted">計畫版本 v${plan.planVersion}。規則來源：增肌減脂訓練計畫。<br>App 版本 0.2.0</div>`;
}

export function init(ctx) {
  const { plan, store, actions: A } = ctx;
  const today = () => ctx.now().date;
  A.field = (el) => {
    store.updateDay(today(), { [el.dataset.k]: el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value });
    ctx.render();
  };
  A.flag = (el) => { store.updateDay(today(), { [el.dataset.k]: el.checked }); ctx.render(); };
  A.add = (el) => {
    const k = el.dataset.k, cur = store.getDay(today())[k] ?? 0;
    store.updateDay(today(), { [k]: el.dataset.n === 'reset' ? 0 : cur + Number(el.dataset.n) });
    ctx.render();
  };
  A['week-note'] = (el) => { store.updateWeek(weekStartOf(today()), { note: el.value }); ctx.toast('已存'); };
  A.pref = (el) => store.setPref(el.dataset.k, el.checked);
  A['start-w'] = (el) => store.setStartWeight(el.dataset.id, el.value === '' ? null : Number(el.value));
  const share = async (name, text, type) => {
    const file = new File([new Blob([text], { type })], name, { type });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
  };
  A.export = (el) => {
    const d = today();
    if (el.dataset.fmt === 'json') share(`fitness-backup-${d}.json`, store.exportJSON(), 'application/json');
    else if (el.dataset.fmt === 'training') share(`training-${d}.csv`, trainingCSV(store, plan.days), 'text/csv');
    else share(`daily-${d}.csv`, dailyCSV(store), 'text/csv');
  };
  A.import = async (el) => {
    const f = el.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (!confirm('還原會用檔案取代這支手機上的全部資料，確定嗎？')) return;
      store.importJSON(text);
      ctx.toast('已還原');
    } catch (e) { ctx.toast(`還原失敗：${e.message}`); }
    ctx.render();
  };
  A.reset = () => {
    if (!confirm('重置會清掉這支手機上 App 的全部紀錄，無法復原。\n建議先匯出備份。\n\n確定要重置嗎？')) return;
    if (!confirm('最後確認：真的要清掉全部紀錄嗎？')) return;
    store.reset();
    ctx.go('today');
  };
}
