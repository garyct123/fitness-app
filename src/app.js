// 外殼：分頁、事件、各種小視窗。規則在 src/rules/，流程在 src/engine/，資料在 src/store.js，畫面在 src/views/。
import { createStore, localBackend } from './store.js';
import { hiitVersion } from './rules/hiit.js';
import { sleepHours } from './rules/today.js';
import { taipeiNow, addDays } from './lib/time.js';
import { esc } from './ui/kit.js';
import * as today from './views/today.js';
import * as pages from './views/pages.js';
import { createWorkout } from './views/workout.js';

const plan = await (await fetch('plan.json', { cache: 'no-cache' })).json();
const store = createStore(localBackend());
const $app = document.getElementById('app');
const $tabs = document.querySelector('#tabs > div');

const ICON = {
  today: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  schedule: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3M13 14h3M8 17h3"/>',
  progress: '<path d="M3 20h18"/><path d="M4 16l5-5 4 3 7-8"/><path d="M15 6h5v5"/>',
  library: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
  nutrition: '<path d="M12 3c3 3 5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 2-6 5-9z"/><path d="M12 12v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5l2 2.2 3-.4.6 3 2.6 1.6-1.2 2.8 1.2 2.8-2.6 1.6-.6 3-3-.4-2 2.2-2-2.2-3 .4-.6-3-2.6-1.6L5.6 12 4.4 9.2 7 7.6l.6-3 3 .4z"/>',
};
const svg = (id) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[id]}</svg>`;
const TABS = [['today', '👊', '今日'], ['schedule', '📅', '課表'], ['progress', '📈', '進度'], ['library', '🎬', '動作'], ['nutrition', '🥩', '飲食'], ['settings', '⚙️', '設定']];
const VIEWS = { today: today.view, schedule: pages.schedule, progress: pages.progress, library: pages.library, nutrition: pages.nutrition, settings: pages.settings };

const ctx = {
  plan, store, actions: {}, tab: 'today',
  now: () => taipeiNow(plan.timezone),
  render, go,
};
ctx.workout = createWorkout(ctx);

// ---------- HIIT 版本（只由計畫規則決定；精神、痠痛只記錄不影響） ----------
ctx.hiitFor = (date) => {
  const day = store.getDay(date);
  const last = store.sessions().find((s) => s.date === addDays(date, -1) && s.status !== 'missed' && s.status !== 'in-progress');
  const hrs = day.sleepManual ?? sleepHours(day.bedTime, day.wakeTime);
  const prior = store.allDays().filter((d) => d.date < date && d.restingHr).slice(-14).map((d) => d.restingHr);
  const usualHr = prior.length >= 3 ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
  const id = hiitVersion({ lastNight: last ? last.day : null, sleepHours: hrs, restingHr: day.restingHr ?? null, usualHr }, plan.hiit);
  return { id, ...plan.hiit.versions[id], lastNight: last ? last.day : null, hrs };
};

// ---------- 小視窗 ----------
let sheetEl = null;
function openSheet(html) {
  sheetEl?.remove();
  sheetEl = document.createElement('div');
  sheetEl.className = 'sheet';
  sheetEl.innerHTML = `<div>${html}</div>`;
  document.body.appendChild(sheetEl);
  return sheetEl;
}
const closeSheet = () => { sheetEl?.remove(); sheetEl = null; };
function ask(html, ready) {
  return new Promise((resolve) => {
    const el = openSheet(html);
    const finish = (v) => { closeSheet(); resolve(v); };
    ready?.(el, finish);
    el.addEventListener('click', (e) => { if (e.target === el) finish(null); });
  });
}
ctx.toast = (msg) => {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(110px + env(safe-area-inset-bottom));background:#e2e8f0;color:#000;padding:10px 18px;border-radius:999px;font-weight:800;z-index:90;max-width:90vw';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
};
ctx.askNumber = (title, val) => ask(`<h3>${esc(title)}</h3><input type="number" inputmode="decimal" step="any" id="n" value="${val ?? ''}" style="width:100%;margin-top:12px;font-size:1.6rem;text-align:center">
  <div class="row mt"><button class="grow" data-x>取消</button><button class="grow b-primary" data-ok>確定</button></div>`, (el, fin) => {
  const i = el.querySelector('#n');
  setTimeout(() => { i.focus(); i.select(); }, 50);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.hasAttribute('data-x')) fin(null);
    if (b?.hasAttribute('data-ok')) fin(i.value === '' || Number.isNaN(Number(i.value)) ? null : Math.max(0, Number(i.value)));
  });
});
ctx.askText = (title) => ask(`<h3>${esc(title)}</h3><input type="text" id="t" style="margin-top:12px">
  <div class="row mt"><button class="grow" data-x>取消</button><button class="grow b-primary" data-ok>確定</button></div>`, (el, fin) => {
  const i = el.querySelector('#t');
  setTimeout(() => i.focus(), 50);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.hasAttribute('data-x')) fin(null);
    if (b?.hasAttribute('data-ok')) fin(i.value.trim() || null);
  });
});
ctx.askReason = (title) => ask(`<h3>${esc(title)}</h3><div class="chips mt">${plan.skipReasons.map((r) => `<button data-r="${r.id}">${esc(r.label)}</button>`).join('')}</div>
  <input type="text" id="note" placeholder="說明（選「其他」必填）" style="margin-top:12px"><div class="small bad-c mt-s" id="err"></div>
  <div class="row mt"><button class="grow" data-x>取消</button><button class="grow b-primary" data-ok>確定</button></div>`, (el, fin) => {
  let picked = null;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.r) { picked = b.dataset.r; el.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b)); }
    if (b.hasAttribute('data-x')) fin(null);
    if (b.hasAttribute('data-ok')) {
      const note = el.querySelector('#note').value.trim();
      if (!picked) el.querySelector('#err').textContent = '請選原因';
      else if (picked === 'other' && !note) el.querySelector('#err').textContent = '選「其他」要寫說明';
      else fin({ reason: picked, note });
    }
  });
});
ctx.choose = (title, opts) => ask(`<h3>${esc(title)}</h3><div class="mt">${opts.map((o) => `<button class="b-block mt-s ${o.danger ? 'b-danger' : ''}" data-c="${o.id}">${esc(o.label)}</button>`).join('')}</div>`, (el, fin) => {
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b) fin(b.dataset.c); });
});

// 晨間紀錄：體重、睡眠、狀態；只有睡眠和心率會影響 HIIT 版本
ctx.checkin = () => {
  const { date } = ctx.now();
  const d = store.getDay(date);
  const f = (k, label, type = 'number', unit = '', step = 'any') => `<label class="field"><span>${label}</span><span><input type="${type}" ${type === 'number' ? `inputmode="decimal" step="${step}"` : ''} data-k="${k}" value="${d[k] ?? ''}"> ${unit}</span></label>`;
  return ask(`<h3>晨間紀錄</h3><div class="xs muted">${date}</div>
    ${f('weight', '體重', 'number', 'kg')}${f('bodyFat', '體脂', 'number', '%')}${f('bedTime', '昨晚就寢', 'time')}${f('wakeTime', '起床', 'time')}${f('restingHr', '起床心率（選填）', 'number', '下', '1')}
    <div class="field"><span>精神</span><span class="chips" id="energy">${[1, 2, 3, 4, 5].map((n) => `<button data-e="${n}" class="${d.energy === n ? 'on' : ''}">${n}</button>`).join('')}</span></div>
    ${f('soreness', '痠痛（0–10）', 'number', '', '1')}
    <label class="check"><input type="checkbox" id="red"><span class="t bad-c">今天有胸痛、頭暈、關節刺痛或發燒</span></label>
    <div class="xs dim">精神和痠痛只是記錄；HIIT 版本只看睡眠和心率。</div>
    <div class="row mt"><button class="grow" data-x>先略過</button><button class="grow b-primary" data-ok>儲存</button></div>`, (el, fin) => {
    let energy = d.energy ?? null;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.e) { energy = Number(b.dataset.e); el.querySelectorAll('[data-e]').forEach((x) => x.classList.toggle('on', x === b)); }
      if (b.hasAttribute('data-x')) fin(d.checkedIn ? true : 'skip');
      if (b.hasAttribute('data-ok')) {
        const patch = { checkedIn: true, energy };
        el.querySelectorAll('input[data-k]').forEach((i) => { patch[i.dataset.k] = i.value === '' ? null : i.type === 'number' ? Number(i.value) : i.value; });
        store.updateDay(date, patch);
        if (!store.getDay(date).done.includes('weigh')) store.toggleDone(date, 'weigh');
        if (el.querySelector('#red').checked) {
          store.updateDay(date, { redFlag: true });
          fin(false);
          await ctx.choose('今天先不要練', [{ id: 'ok', label: '知道了' }]);
          return;
        }
        fin(true);
      }
    });
  }).then((r) => { render(); if (r === 'skip') return true; if (r === false) { ctx.toast('今天先休息，有疑慮找醫師'); } return r; });
};

// ---------- 事件 ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.matches('input, select, textarea')) return;
  ctx.actions[el.dataset.act]?.(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act]');
  if (el?.matches('input, select, textarea')) ctx.actions[el.dataset.act]?.(el, e);
});
$tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
ctx.actions['resume'] = () => ctx.workout.resume();

function go(tab) {
  ctx.tab = tab;
  render();
  window.scrollTo(0, 0);
}
function render() {
  $tabs.innerHTML = TABS.map(([id, ic, label]) => `<button data-tab="${id}" class="${ctx.tab === id ? 'on' : ''}"><span>${svg(id)}</span>${label}</button>`).join('');
  $app.innerHTML = VIEWS[ctx.tab](ctx) + (store.getActive() && !ctx.workout.isOpen() ? '<button class="resume-fab" data-act="resume">▶ 繼續進行中的訓練</button>' : '');
}
today.init(ctx);
pages.init(ctx);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
render();
if (store.getActive()) ctx.workout.resume();
setInterval(() => {
  if (sheetEl || ctx.workout.isOpen() || !['today', 'nutrition'].includes(ctx.tab)) return;
  if (document.activeElement?.matches?.('input, textarea')) return;
  render();
}, 30_000);
