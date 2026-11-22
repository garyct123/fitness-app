// 畫面。規則都在 src/rules/，資料在 src/store.js，這裡只負責顯示和操作。
import { createStore, localBackend } from './store.js';
import { nextTarget, regressionStreak } from './rules/progression.js';
import { hiitVersion } from './rules/hiit.js';
import { todayItems, nowItem, workoutFor, sleepHours, eatingWindowCheck } from './rules/today.js';
import { unlock, beep, say, keepAwake } from './sound.js';

const plan = await (await fetch('plan.json', { cache: 'no-cache' })).json();
const store = createStore(localBackend());
const $app = document.getElementById('app');

// ---------- 時間（一律台灣時間） ----------
function taipeiNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: plan.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const fmtDate = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}（${WD[new Date(`${date}T00:00:00Z`).getUTCDay()]}）`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reasonLabel = (id) => plan.skipReasons.find((r) => r.id === id)?.label ?? id;

// ---------- HIIT ----------
function hiitFor(date) {
  const day = store.getDay(date);
  const prev = addDays(date, -1);
  const last = store.sessions().find((s) => s.date === prev && s.status !== 'missed' && s.status !== 'in-progress');
  const lastNight = last ? last.day : null;
  const hrs = sleepHours(day.bedTime, day.wakeTime);
  const id = hiitVersion({ lastNight, sleepHours: hrs, restingHr: day.restingHr ?? null, usualHr: usualHr(date) }, plan.hiit);
  return { id, ...plan.hiit.versions[id], lastNight, hrs };
}
function usualHr(date) {
  const vals = store.allDays().filter((d) => d.date < date && d.restingHr).slice(-14).map((d) => d.restingHr);
  return vals.length >= 3 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// ---------- 導覽 ----------
let state = { tab: 'today' };
function go(next) {
  state = next;
  document.body.classList.toggle('focus', Boolean(state.focus));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
  render();
  window.scrollTo(0, 0);
}
document.getElementById('tabs').addEventListener('click', (e) => {
  const t = e.target.closest('button')?.dataset.tab;
  if (t) go({ tab: t });
});
function render() {
  const views = { today: viewToday, checklist: viewChecklist, records: viewRecords, settings: viewSettings, workout: viewWorkout, rest: viewRest, starts: viewStarts };
  $app.innerHTML = (views[state.tab] || viewToday)();
  bind();
  runTimer();
}
// 用 data-act 綁定所有按鈕
const actions = {};
function bind() {
  $app.querySelectorAll('[data-act]').forEach((el) => {
    const ev = el.matches('input, select, textarea') ? 'change' : 'click';
    el.addEventListener(ev, (e) => actions[el.dataset.act]?.(el, e));
  });
}

// ---------- 今天 ----------
function viewToday() {
  const { date, time } = taipeiNow();
  const items = todayItems(plan, date, store.sessions());
  const day = store.getDay(date);
  const done = new Set(day.done);
  const r = nowItem(items, time, done);
  let hero;
  if (!r.item) {
    hero = `<div class="card hero"><div class="title">今天都完成了</div><div class="muted">00:00 前睡，明天 07:00 起床。</div></div>`;
  } else {
    hero = `<div class="card hero">
      <div class="time">${r.upcoming ? '下一件 ' : ''}${r.item.time}</div>
      <div class="title">${esc(heroTitle(r.item, date))}</div>
      ${heroBody(r.item, date)}
    </div>`;
  }
  return `<h1>${fmtDate(date)}</h1>
    <div class="muted small">計畫 v${plan.planVersion}</div>
    ${hero}
    ${r.missed ? `<button class="block" data-act="tab" data-to="checklist">今天還有 ${r.missed} 件沒勾，去清單看</button>` : ''}
    ${earlyStart(items, r, done)}
    <button class="block" data-act="tab" data-to="checklist">看今天完整清單</button>`;
}
// 晚上的訓練還沒輪到首頁時，留一顆小按鈕可以提早開始
function earlyStart(items, r, done) {
  const ev = items.find((x) => x.id === 'evening');
  if (!ev || r.item?.id === 'evening' || done.has('evening')) return '';
  const w = ev.workout;
  if (w.type !== 'regular' && w.type !== 'test') return '';
  return `<button class="block" data-act="start" data-day="${w.day}" data-kind="${w.type}">提早開始：${esc(ev.title)}</button>`;
}
function heroTitle(item, date) {
  if (item.id === 'hiit') return `HIIT：${hiitFor(date).name}`;
  return item.title;
}
function heroBody(item, date) {
  const doneBtn = `<button class="primary block" data-act="done" data-id="${item.id}">完成</button>`;
  if (item.id === 'weigh') return `<button class="primary block" data-act="tab" data-to="checklist">記體重、體脂、睡眠</button>`;
  if (item.id === 'hiit') {
    const h = hiitFor(date);
    const why = h.id === 'walk' ? '' : h.lastNight ? `昨晚練${plan.days[h.lastNight].name}。` : '昨晚沒重訓。';
    return `<div>${esc(h.content)}</div><div class="muted small">${why}${h.hrs == null ? '還沒填睡眠，填了會更準。' : `睡 ${h.hrs} 小時。`}</div>
      ${h.video ? `<a class="btn block" href="${h.video}" target="_blank" rel="noopener">打開影片</a>` : ''}
      <button class="primary block" data-act="hiit-done" data-v="${h.id}">完成 ${esc(h.name)}</button>`;
  }
  if (item.id === 'evening') {
    const w = item.workout;
    if (w.type === 'stretch') {
      return `<div class="muted small">${plan.stretch.map((s) => `${esc(s.name)} ${esc(s.dose)}`).join('、')}</div>${doneBtn}`;
    }
    const open = store.sessions().find((s) => s.date === date && s.status === 'in-progress');
    const first = plan.days[w.day].exercises[0];
    const t = w.type === 'regular' ? nextTarget(first, store.history(first.id), store.startWeight(first.id)) : null;
    return `${t ? `<div class="muted">第一個：${esc(first.name)} ${t.weight ?? '?'} kg × ${t.reps[0]}</div>` : `<div class="muted">鑑測：每個動作找「做 8 下、還剩 1–2 下」的重量。</div>`}
      <button class="primary block" data-act="start" data-day="${w.day}" data-kind="${w.type}">${open ? '繼續訓練' : '開始訓練'}</button>
      ${w.type === 'regular' && !open ? `<button class="block" data-act="missed" data-day="${w.day}">今天沒練（選原因）</button>` : ''}`;
  }
  if (item.id === 'first-meal') return `<div class="muted small">記得肌酸 ${plan.targets.creatineG} g。</div>${doneBtn}`;
  return doneBtn;
}
actions.tab = (el) => go({ tab: el.dataset.to });
actions.done = (el) => {
  const { date, time } = taipeiNow();
  const id = el.dataset.id;
  if (id === 'first-meal') store.updateDay(date, { creatine: true, firstMeal: store.getDay(date).firstMeal || time });
  if (id === 'last-meal') store.updateDay(date, { lastMealEnd: store.getDay(date).lastMealEnd || time });
  if (id === 'protein-powder') store.updateDay(date, { proteinPowder: true });
  if (!store.getDay(date).done.includes(id)) store.toggleDone(date, id);
  render();
};
actions['hiit-done'] = (el) => {
  const { date } = taipeiNow();
  store.updateDay(date, { hiitSuggested: el.dataset.v, hiitDone: el.dataset.v });
  if (!store.getDay(date).done.includes('hiit')) store.toggleDone(date, 'hiit');
  render();
};

// ---------- 沒練 / 跳過：一定要選原因 ----------
function reasonSheet(title, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet';
  wrap.innerHTML = `<div><h2>${esc(title)}</h2>
    <div class="chips">${plan.skipReasons.map((r) => `<button data-r="${r.id}">${esc(r.label)}</button>`).join('')}</div>
    <input type="text" placeholder="說明（選「其他」必填）" style="margin-top:12px">
    <div class="row" style="margin-top:12px"><button data-x>取消</button><button class="primary" data-ok>確定</button></div>
    <div class="bad small" data-err></div></div>`;
  let picked = null;
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) { if (e.target === wrap) wrap.remove(); return; }
    if (b.dataset.r) { picked = b.dataset.r; wrap.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b)); }
    if ('x' in b.dataset) wrap.remove();
    if ('ok' in b.dataset) {
      try { onPick({ reason: picked, note: wrap.querySelector('input').value.trim() }); wrap.remove(); }
      catch (err) { wrap.querySelector('[data-err]').textContent = err.message; }
    }
  });
  document.body.appendChild(wrap);
}
actions.missed = (el) => {
  const { date } = taipeiNow();
  reasonSheet(`今天的${plan.days[el.dataset.day].name}沒練，原因？`, ({ reason, note }) => {
    store.markMissed({ date, day: el.dataset.day, reason, note });
    if (!store.getDay(date).done.includes('evening')) store.toggleDone(date, 'evening');
    render();
  });
};

// ---------- 逐組記錄 ----------
actions.start = (el) => {
  const { date } = taipeiNow();
  let s = store.sessions().find((x) => x.date === date && x.status === 'in-progress');
  if (!s) s = store.startSession({ date, day: el.dataset.day, kind: el.dataset.kind });
  go({ tab: 'workout', focus: true, sessionId: s.id, ...firstOpenSet(s) });
};
function exercisesOf(s) {
  const list = plan.days[s.day].exercises;
  if (s.kind !== 'test') return list;
  const skip = plan.testWeek.find((t) => t.date === s.date)?.skip || [];
  return list.filter((e) => !skip.includes(e.id));
}
function firstOpenSet(s) {
  const logged = store.setsOf(s.id);
  const exs = exercisesOf(s);
  for (let i = 0; i < exs.length; i++) {
    const n = s.kind === 'test' ? testSetCount(s, exs[i]) : exs[i].sets;
    for (let k = 1; k <= n; k++) {
      if (!logged.some((x) => x.exerciseId === exs[i].id && x.setNo === k)) return { exIndex: i, setNo: k };
    }
  }
  return { exIndex: exs.length, setNo: 1 };
}
// 鑑測：每個動作最多 2 組測試組（計畫），使用者可以按「這個動作測完了」提早結束
function testSetCount(s, ex) {
  const n = store.setsOf(s.id).filter((x) => x.exerciseId === ex.id).length;
  return store.session(s.id).testDone?.includes(ex.id) ? n : Math.max(2, n);
}
function draftFor(s, ex, setNo) {
  const logged = store.setsOf(s.id).find((x) => x.exerciseId === ex.id && x.setNo === setNo);
  if (logged && logged.status === 'done') return { weight: logged.weight, reps: logged.reps, rir: logged.rir ?? 2 };
  const prevSet = store.setsOf(s.id).filter((x) => x.exerciseId === ex.id && x.status === 'done').sort((a, b) => b.setNo - a.setNo)[0];
  if (s.kind === 'test') {
    const last = store.lastSets(ex.id);
    return { weight: prevSet?.weight ?? last?.sets.at(-1)?.weight ?? 0, reps: 8, rir: 2 };
  }
  const t = nextTarget(ex, store.history(ex.id), store.startWeight(ex.id));
  return { weight: prevSet?.weight ?? t.weight ?? 0, reps: t.reps[setNo - 1] ?? ex.repMin, rir: 2 };
}
function viewWorkout() {
  const s = store.session(state.sessionId);
  const exs = exercisesOf(s);
  if (state.exIndex >= exs.length) return viewWorkoutEnd(s);
  const ex = exs[state.exIndex];
  const total = s.kind === 'test' ? testSetCount(s, ex) : ex.sets;
  if (!state.draft || state.draftKey !== `${ex.id}-${state.setNo}`) {
    state.draft = draftFor(s, ex, state.setNo);
    state.draftKey = `${ex.id}-${state.setNo}`;
  }
  const d = state.draft;
  const last = store.lastSets(ex.id);
  const t = s.kind === 'regular' ? nextTarget(ex, store.history(ex.id), store.startWeight(ex.id)) : null;
  const streak = s.kind === 'regular' ? regressionStreak(store.history(ex.id)) : 0;
  const step = ex.body === 'lower' ? 5 : 2.5;
  return `<div class="set-screen">
    <div class="top"><span>${plan.days[s.day].name}${s.kind === 'test' ? '鑑測' : ''} · 動作 ${state.exIndex + 1}/${exs.length}</span><button data-act="leave" style="min-height:36px;padding:4px 12px">離開</button></div>
    <div class="ex">${esc(s.swaps?.[ex.id] || ex.name)}</div>${s.swaps?.[ex.id] ? `<div class="muted small">替換自 ${esc(ex.name)}</div>` : ''}
    <div class="muted">第 ${state.setNo} 組 / ${s.kind === 'test' ? '測試組' : `${total} 組`} · ${ex.repMin}–${ex.repMax} 下${ex.unilateral ? `（${ex.unilateral}）` : ''}</div>
    ${t ? `<div class="good small">今天目標：${t.weight ?? '?'} kg × ${t.reps.join('/')}</div>` : '<div class="muted small">找「做 8 下、還剩 1–2 下」的重量；太輕加 5–10%，做不到 8 下減 5–10%。</div>'}
    ${last ? `<div class="muted small">上次 ${fmtDate(last.date)}${last.kind === 'test' ? '鑑測' : ''}：${last.sets.map((x) => `${x.weight}×${x.reps}`).join('、')}</div>` : '<div class="muted small">還沒有紀錄</div>'}
    ${streak >= 2 ? `<div class="warn small">這個動作連續 ${streak} 次退步，注意睡眠和恢復。</div>` : ''}
    <div class="stepper"><button data-act="adj" data-k="weight" data-d="-${step}">−</button><div class="val" data-act="type" data-k="weight">${d.weight}<span class="unit"> kg</span></div><button data-act="adj" data-k="weight" data-d="${step}">+</button></div>
    <div class="stepper"><button data-act="adj" data-k="reps" data-d="-1">−</button><div class="val" data-act="type" data-k="reps">${d.reps}<span class="unit"> 下</span></div><button data-act="adj" data-k="reps" data-d="1">+</button></div>
    <div class="muted small">還剩幾下</div>
    <div class="chips">${[0, 1, 2, 3, 4].map((n) => `<button data-act="rir" data-n="${n}" class="${d.rir === n ? 'on' : ''}">${n === 4 ? '4+' : n}</button>`).join('')}</div>
    <details><summary>動作要點</summary><div class="small">${esc(ex.cue)}</div></details>
    <div class="grow"></div>
    <button class="primary block" data-act="log">完成這組</button>
    <div class="row"><button class="block" data-act="skip">跳過這組</button><button class="block" data-act="swap">換動作</button></div>
    ${s.kind === 'test' ? '<button class="block" data-act="test-done">這個動作測完了</button>' : ''}
  </div>`;
}
actions.adj = (el) => {
  const k = el.dataset.k;
  state.draft[k] = Math.max(0, Math.round((state.draft[k] + Number(el.dataset.d)) * 100) / 100);
  render();
};
actions.type = (el) => {
  const k = el.dataset.k;
  const v = prompt(k === 'weight' ? '重量（kg）' : '次數', state.draft[k]);
  if (v == null || v.trim() === '' || Number.isNaN(Number(v))) return;
  state.draft[k] = Math.max(0, Number(v));
  render();
};
actions.rir = (el) => { state.draft.rir = Number(el.dataset.n); render(); };
function currentEx() {
  const s = store.session(state.sessionId);
  return { s, ex: exercisesOf(s)[state.exIndex] };
}
actions.log = () => {
  unlock();
  const { s, ex } = currentEx();
  const d = state.draft;
  store.logSet(s.id, { exerciseId: ex.id, exerciseName: s.swaps?.[ex.id] || ex.name, swappedFrom: s.swaps?.[ex.id] ? ex.name : undefined,
    setNo: state.setNo, weight: d.weight, reps: d.reps, rir: d.rir });
  const after = firstOpenSet(s);
  go({ tab: 'rest', focus: true, sessionId: s.id, ...after, restTotal: ex.restSec, endsAt: Date.now() + ex.restSec * 1000, from: ex.id });
};
actions.skip = () => {
  const { s, ex } = currentEx();
  reasonSheet(`跳過 ${ex.name} 第 ${state.setNo} 組，原因？`, ({ reason, note }) => {
    store.logSet(s.id, { exerciseId: ex.id, setNo: state.setNo, status: 'skipped', reason, note });
    go({ ...state, ...firstOpenSet(s), draft: null });
  });
};
actions.swap = () => {
  const { s, ex } = currentEx();
  const name = prompt(`把「${ex.name}」換成什麼動作？`);
  if (!name) return;
  reasonSheet(`為什麼換掉 ${ex.name}？`, ({ reason, note }) => {
    store.swapExercise(s.id, ex.id, { name, reason, note });
    render();
  });
};
actions['test-done'] = () => {
  const { s, ex } = currentEx();
  store.updateSession(s.id, { testDone: [...(store.session(s.id).testDone || []), ex.id] });
  const lastDone = store.setsOf(s.id).filter((x) => x.exerciseId === ex.id && x.status === 'done').at(-1);
  if (lastDone) store.setStartWeight(ex.id, lastDone.weight);
  go({ ...state, ...firstOpenSet(s), draft: null });
};
actions.leave = () => { keepAwake(false); go({ tab: 'today' }); };

// ---------- 組間倒數 ----------
let tick = null;
function viewRest() {
  const left = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  const s = store.session(state.sessionId);
  const exs = exercisesOf(s);
  const next = exs[state.exIndex];
  const changed = next && next.id !== state.from;
  const done = exs.filter((e) => e.id === state.from)[0];
  let summary = '';
  if (changed && done && s.kind === 'regular') {
    const t = nextTarget(done, store.history(done.id), store.startWeight(done.id));
    summary = `<div class="card"><div class="muted small">${esc(done.name)} 下次</div><div><b>${t.weight} kg × ${t.reps.join('/')}</b>${t.reason.startsWith('increase') ? ' <span class="good">加重</span>' : ''}</div>
      ${t.reason === 'increase-small' ? '<div class="muted small">小肌群加重困難的話，先同重量、放慢下放。</div>' : ''}</div>`;
  }
  return `<div class="set-screen">
    <div class="top"><span>組間休息</span><button data-act="leave" style="min-height:36px;padding:4px 12px">離開</button></div>
    <div class="timer" id="timer">${fmtSec(left)}</div>
    <div class="row"><button data-act="rest-adj" data-d="-30">−30 秒</button><button data-act="rest-adj" data-d="30">+30 秒</button></div>
    ${summary}
    <div class="muted" style="margin-top:16px">下一組：${next ? `${esc(next.name)} 第 ${state.setNo} 組` : '全部完成'}</div>
    <div class="grow"></div>
    <button class="primary block" data-act="rest-end">${next ? '開始下一組' : '結束訓練'}</button>
  </div>`;
}
const fmtSec = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
function runTimer() {
  clearInterval(tick);
  if (state.tab !== 'rest') { keepAwake(false); return; }
  keepAwake(true);
  let warned = false;
  let ended = false;
  tick = setInterval(() => {
    if (state.tab !== 'rest') { clearInterval(tick); return; }
    const left = Math.ceil((state.endsAt - Date.now()) / 1000);
    const el = document.getElementById('timer');
    if (el) el.textContent = fmtSec(Math.max(0, left));
    if (left <= 10 && left > 0 && !warned) { warned = true; beep(660, 150); }
    if (left <= 0 && !ended) {
      ended = true;
      beep(880, 250); setTimeout(() => beep(880, 250), 350);
      const s = store.session(state.sessionId);
      const next = exercisesOf(s)[state.exIndex];
      if (next) say(`休息結束，${next.name}，第 ${state.setNo} 組`);
    }
  }, 250);
}
actions['rest-adj'] = (el) => { state.endsAt += Number(el.dataset.d) * 1000; render(); };
actions['rest-end'] = () => { go({ tab: 'workout', focus: true, sessionId: state.sessionId, exIndex: state.exIndex, setNo: state.setNo }); };

function viewWorkoutEnd(s) {
  const sets = store.setsOf(s.id);
  const skipped = sets.filter((x) => x.status === 'skipped').length;
  return `<h1>${plan.days[s.day].name}${s.kind === 'test' ? '鑑測' : ''}完成</h1>
    <div class="card">完成 ${sets.filter((x) => x.status === 'done').length} 組${skipped ? `，跳過 ${skipped} 組` : ''}。</div>
    ${s.kind === 'test' ? '<div class="card">起始重量已用每個動作最後一組測試的重量填好，可以到「設定 → 起始重量」修改。</div>' : ''}
    <button class="primary block" data-act="finish" data-status="${skipped ? 'partial' : 'done'}">儲存並結束</button>`;
}
actions.finish = (el) => {
  const s = store.session(state.sessionId);
  if (s.kind === 'test') {
    for (const ex of exercisesOf(s)) {
      const last = store.setsOf(s.id).filter((x) => x.exerciseId === ex.id && x.status === 'done').at(-1);
      if (last && store.startWeight(ex.id) == null) store.setStartWeight(ex.id, last.weight);
    }
  }
  store.finishSession(s.id, el.dataset.status);
  const { date } = taipeiNow();
  if (!store.getDay(date).done.includes('evening')) store.toggleDone(date, 'evening');
  go({ tab: 'today' });
};

// ---------- 每日清單 ----------
function viewChecklist() {
  const { date } = taipeiNow();
  const day = store.getDay(date);
  const items = todayItems(plan, date, store.sessions());
  const done = new Set(day.done);
  const hrs = sleepHours(day.bedTime, day.wakeTime);
  const win = eatingWindowCheck(plan, day.firstMeal, day.lastMealEnd);
  const num = (k, label, unit, step = 'any') => `<label class="field"><span>${label}</span><span><input type="number" inputmode="decimal" step="${step}" data-act="field" data-k="${k}" value="${day[k] ?? ''}"> ${unit}</span></label>`;
  const tm = (k, label) => `<label class="field"><span>${label}</span><input type="time" data-act="field" data-k="${k}" value="${day[k] ?? ''}"></label>`;
  const add = (k, label, target, unit, steps) => `<div class="field" style="display:block;padding:10px 0;border-bottom:1px solid var(--line)">
      <div class="row" style="align-items:center"><span>${label}</span><span style="text-align:right"><b>${day[k] ?? 0}</b> / ${target} ${unit}</span></div>
      <div class="chips" style="margin-top:6px">${steps.map((n) => `<button data-act="add" data-k="${k}" data-n="${n}">+${n}</button>`).join('')}<button data-act="add" data-k="${k}" data-n="reset">歸零</button></div></div>`;
  return `<h1>今天的清單</h1><div class="muted small">${fmtDate(date)}</div>
    <div class="card">${items.map((it) => `<label class="check ${done.has(it.id) ? 'done' : ''}"><input type="checkbox" data-act="toggle" data-id="${it.id}" ${done.has(it.id) ? 'checked' : ''}><span class="tm">${it.time}</span><span class="t">${esc(it.id === 'hiit' ? `HIIT：${hiitFor(date).name}` : it.title)}</span></label>`).join('')}</div>
    <h2>起床</h2><div class="card">
      ${num('weight', '體重', 'kg')}${num('bodyFat', '體脂', '%')}
      ${tm('bedTime', '昨晚就寢')}${tm('wakeTime', '起床')}
      <div class="muted small" style="padding-top:8px">${hrs == null ? '填了就寢和起床，HIIT 版本會依睡眠調整。' : `睡 ${hrs} 小時${hrs < 6 ? '，今天 HIIT 改快走' : ''}`}</div>
      ${num('restingHr', '起床靜止心率（選填）', '下', '1')}
    </div>
    <h2>吃與補給</h2><div class="card">
      <label class="check"><input type="checkbox" data-act="flag" data-k="creatine" ${day.creatine ? 'checked' : ''}><span class="t">肌酸 ${plan.targets.creatineG} g</span></label>
      <label class="check"><input type="checkbox" data-act="flag" data-k="proteinPowder" ${day.proteinPowder ? 'checked' : ''}><span class="t">14:00 蛋白粉</span></label>
      ${tm('firstMeal', '第一餐時間')}${tm('lastMealEnd', '最後一餐吃完')}
      ${win.earlyStart ? `<div class="warn small">第一餐早於 ${plan.targets.eatStart}</div>` : ''}${win.lateEnd ? `<div class="warn small">最後一餐超過 ${plan.targets.eatEnd}</div>` : ''}
      ${add('proteinG', '蛋白質', plan.targets.proteinG, 'g', [10, 20, 25, 50])}
      ${add('waterMl', '水', plan.targets.waterMl, 'ml', [250, 500])}
      ${num('caffeineCc', '咖啡、茶', 'cc', '50')}
    </div>
    <h2>活動</h2><div class="card">
      ${num('steps', `步數（目標 ${plan.targets.steps}）`, '步', '1')}
    </div>
    <h2>破功日</h2><div class="card">
      <label class="check"><input type="checkbox" data-act="flag" data-k="cheat" ${day.cheat ? 'checked' : ''}><span class="t">今天破功（聚餐、喝酒、吃太多）</span></label>
      ${day.cheat ? `<textarea data-act="field" data-k="cheatNote" placeholder="吃了什麼、原因">${esc(day.cheatNote)}</textarea><div class="muted small">照常就好：明天照原本時間表走，不補償斷食、不多加 HIIT。</div>` : ''}
    </div>`;
}
actions.toggle = (el) => { store.toggleDone(taipeiNow().date, el.dataset.id); render(); };
actions.flag = (el) => { store.updateDay(taipeiNow().date, { [el.dataset.k]: el.checked }); render(); };
actions.field = (el) => {
  const v = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;
  store.updateDay(taipeiNow().date, { [el.dataset.k]: v });
  render();
};
actions.add = (el) => {
  const { date } = taipeiNow();
  const k = el.dataset.k;
  const cur = store.getDay(date)[k] ?? 0;
  store.updateDay(date, { [k]: el.dataset.n === 'reset' ? 0 : cur + Number(el.dataset.n) });
  render();
};

// ---------- 紀錄（週回顧、成就之後補，先放訓練紀錄和體重） ----------
function viewRecords() {
  const sessions = store.sessions().filter((s) => s.status !== 'in-progress').sort((a, b) => (a.date < b.date ? 1 : -1));
  const days = store.allDays().filter((d) => d.weight).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7);
  const avg = days.length ? (days.reduce((n, d) => n + d.weight, 0) / days.length).toFixed(1) : null;
  const doneCount = sessions.filter((s) => s.kind === 'regular' && s.status !== 'missed').length;
  return `<h1>紀錄</h1>
    <div class="card"><div class="row"><div><div class="muted small">7 天平均體重</div><b>${avg ?? '—'} kg</b></div><div><div class="muted small">完成的訓練次數</div><b>${doneCount}</b></div></div></div>
    <h2>訓練</h2><div class="card">${sessions.length ? `<table>${sessions.slice(0, 30).map((s) => `<tr><td>${fmtDate(s.date)}</td><td>${plan.days[s.day].name}${s.kind === 'test' ? '鑑測' : ''}</td><td>${s.status === 'missed' ? `<span class="warn">沒練：${esc(reasonLabel(s.reason))}${s.note ? `（${esc(s.note)}）` : ''}</span>` : s.status === 'partial' ? '部分完成' : '完成'}</td></tr>`).join('')}</table>` : '<div class="muted">還沒有紀錄</div>'}</div>
    <div class="muted small">週回顧和成就（PR、連續、完成次數）是下一批要做的項目。</div>`;
}

// ---------- 設定：匯出、匯入、起始重量 ----------
function viewSettings() {
  return `<h1>設定</h1>
    <div class="card"><b>備份</b><div class="muted small">資料只存在這支 iPhone。每週匯出一次到 Google Drive。</div>
      <button class="primary block" data-act="export">匯出（分享到 Google Drive）</button>
      <label class="btn block">從檔案還原<input type="file" accept="application/json,.json" data-act="import" hidden></label></div>
    <button class="block" data-act="tab" data-to="starts">起始重量</button>
    <div class="card small muted">計畫版本 v${plan.planVersion}。規則來源：增肌減脂訓練計畫。</div>`;
}
actions.export = async () => {
  const { date } = taipeiNow();
  const name = `fitness-backup-${date}.json`;
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
};
actions.import = async (el) => {
  const f = el.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    if (!confirm('還原會用檔案取代這支手機上的全部資料，確定嗎？')) return;
    store.importJSON(text);
    alert('已還原');
  } catch (e) { alert(`還原失敗：${e.message}`); }
  render();
};
function viewStarts() {
  const ids = new Set();
  const rows = Object.values(plan.days).flatMap((d) => d.exercises.filter((e) => !ids.has(e.id) && ids.add(e.id)).map((e) => ({ ...e, dayName: d.name })));
  return `<h1>起始重量</h1><div class="muted small">鑑測後自動填入，也可以自己改。正式訓練的第一次用這個重量。</div>
    <div class="card">${rows.map((e) => `<label class="field"><span>${esc(e.name)}<br><span class="muted small">${e.dayName}</span></span><span><input type="number" inputmode="decimal" step="0.5" data-act="start-w" data-id="${e.id}" value="${store.startWeight(e.id) ?? ''}"> kg</span></label>`).join('')}</div>
    <button class="block" data-act="tab" data-to="settings">返回</button>`;
}
actions['start-w'] = (el) => { store.setStartWeight(el.dataset.id, el.value === '' ? null : Number(el.value)); };

// ---------- 啟動 ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
go({ tab: 'today' });
setInterval(() => { if (state.tab === 'today') render(); }, 60_000);
