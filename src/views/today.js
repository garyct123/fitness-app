// 今日：現在該做的一件事、早晨／晚間訓練、168 狀態、今日清單。
import { todayItems, nowItem, workoutFor, sleepHours } from '../rules/today.js';
import { nextTarget } from '../rules/progression.js';
import { fmtDate, fastingStatus, fmtDur, fmtHM, daysBetween, addDays, weekdayOf } from '../lib/time.js';
import { estimateTotalSec } from '../engine/workout.js';
import { buildEveningSteps, buildMorningSteps } from '../engine/steps.js';
import { esc, pill, bar, section, fnum } from '../ui/kit.js';

export function weekLabel(plan, date) {
  if (date < plan.regularStart) return `鑑測週 第 ${daysBetween(plan.testWeek[0].date, date) + 1} 天`;
  return `正式訓練 第 ${Math.floor(daysBetween(plan.regularStart, date) / 7) + 1} 週`;
}
export const weekStartOf = (date) => addDays(date, -((weekdayOf(date) + 6) % 7));

export function view(ctx) {
  const { plan, store } = ctx;
  const { date, time } = ctx.now();
  const sessions = store.sessions();
  const items = todayItems(plan, date, sessions);
  const day = store.getDay(date);
  const done = new Set(day.done);
  const r = nowItem(items, time, done);
  const w = workoutFor(plan, date, sessions);
  const [hh, mm] = time.split(':').map(Number);
  const fs = fastingStatus(plan.targets.eatStart, plan.targets.eatEnd, time);

  const hero = !r.item
    ? `<div class="card okb"><div class="kick ok-c">今天都完成了</div><h3>00:00 前睡，明天 07:00 起床</h3></div>`
    : `<div class="card hl"><div class="kick">${r.upcoming ? '下一件' : '現在該做'} · ${r.item.time}</div><h3>${esc(heroTitle(ctx, r.item, date))}</h3>${heroBody(ctx, r.item, date)}</div>`;

  return `<div class="row between"><div><h1>${fmtDate(date)}</h1><div class="muted small">${weekLabel(plan, date)} · 計畫 v${plan.planVersion}</div></div>
      <div>${fs.state === 'eating' ? pill('進食中', 'g') : pill('禁食中', 'b')}</div></div>
    <div class="mt">${hero}</div>
    ${r.missed ? `<div class="small muted center" style="margin:-4px 0 10px">還有 ${r.missed} 件沒勾，往下看完整清單</div>` : ''}
    ${section('早晨訓練')}${morningCard(ctx, date)}
    ${section('晚間訓練')}${eveningCard(ctx, date, w)}
    ${section('今日狀態')}${statusCard(ctx, day, fs, time)}
    ${section('今日清單')}<div class="card">${items.map((it) => `<label class="check ${done.has(it.id) ? 'done' : ''}"><input type="checkbox" data-act="toggle" data-id="${it.id}" ${done.has(it.id) ? 'checked' : ''}><span class="tm">${it.time}</span><span class="t">${esc(it.id === 'hiit' ? `HIIT：${ctx.hiitFor(date).name}` : it.title)}</span></label>`).join('')}</div>`;
}

function heroTitle(ctx, item, date) {
  if (item.id === 'hiit') return `早晨訓練：${ctx.hiitFor(date).name}`;
  return item.title;
}
function heroBody(ctx, item, date) {
  const { plan } = ctx;
  const doneBtn = `<button class="b-primary b-block mt" data-act="done" data-id="${item.id}">完成</button>`;
  switch (item.id) {
    case 'weigh': return `<button class="b-primary b-block mt" data-act="checkin">記錄體重、睡眠、狀態</button>`;
    case 'hiit': return `<div class="muted small mt-s">暖身 5 分 → HIIT → 冷水澡</div><button class="b-primary b-big b-block mt" data-act="morning">開始早晨訓練</button>`;
    case 'evening': {
      const w = item.workout;
      if (w.type === 'rest') return doneBtn;
      return `<button class="b-primary b-big b-block mt" data-act="evening">${ctx.workout.hasActive() ? '繼續訓練' : w.type === 'stretch' ? '開始拉伸' : '開始訓練'}</button>`;
    }
    case 'first-meal': return `<div class="muted small mt-s">肌酸 ${plan.targets.creatineG} g，蛋白質約 50 g。</div>${doneBtn}`;
    case 'protein-powder': return `<div class="muted small mt-s">這之後不再喝咖啡、茶。</div>${doneBtn}`;
    default: return doneBtn;
  }
}

function morningCard(ctx, date) {
  const { plan, store } = ctx;
  const day = store.getDay(date);
  if (date < plan.hiit.start) {
    return `<div class="card"><div class="bold">早晨訓練 ${plan.hiit.start.slice(5).replace('-', '/')} 開始</div><div class="muted small">鑑測週先不做 HIIT。現在可以先記體重、睡眠。</div>
      <button class="b-block mt" data-act="checkin">記錄體重、睡眠、狀態</button></div>`;
  }
  const h = ctx.hiitFor(date);
  const steps = buildMorningSteps(plan, h.id);
  const isDone = day.hiitDone;
  return `<div class="card ${isDone ? 'okb' : ''}"><div class="row between"><div class="bold">① 暖身 5 分 ② ${esc(h.name)} ③ 冷水澡</div>${isDone ? pill('已完成', 'g') : pill(fmtHM(estimateTotalSec({ steps })))}</div>
    <div class="muted small mt-s">${esc(h.content)}</div>
    <div class="xs dim mt-s">${h.hrs == null ? '還沒填睡眠，填了版本會更準。' : `睡 ${h.hrs} 小時`}${h.lastNight ? `；昨晚練${plan.days[h.lastNight].name}` : ''}</div>
    ${isDone ? '' : '<button class="b-primary b-block mt" data-act="morning">開始早晨訓練</button>'}
    <button class="b-ghost b-block mt-s" data-act="checkin">晨間紀錄（體重、睡眠、狀態）</button></div>`;
}

function eveningCard(ctx, date, w) {
  const { plan, store } = ctx;
  const day = store.getDay(date);
  if (w.type === 'rest') return `<div class="card"><div class="bold">今晚休息</div><div class="muted small">走路、補水、早點睡。</div></div>`;
  if (w.type === 'stretch') {
    return `<div class="card ${day.stretchDone ? 'okb' : ''}"><div class="row between"><div class="bold">拉伸修復</div>${day.stretchDone ? pill('已完成', 'g') : pill('20–25 分')}</div>
      <div class="muted small mt-s">${plan.stretch.map((s) => esc(s.name)).join('、')}</div>
      <button class="b-primary b-block mt" data-act="evening">開始拉伸</button></div>`;
  }
  const dayDef = plan.days[w.day];
  const test = w.type === 'test';
  const skip = test ? plan.testWeek.find((t) => t.date === date)?.skip || [] : [];
  const steps = buildEveningSteps(plan, w.day, { history: store.history, startWeight: store.startWeight, test, skip });
  const finished = store.sessions().some((s) => s.date === date && s.status !== 'in-progress' && s.status !== 'missed' && s.day === w.day);
  const rows = dayDef.exercises.filter((e) => !skip.includes(e.id)).map((e) => {
    const t = test ? null : nextTarget(e, store.history(e.id), store.startWeight(e.id));
    return `<div class="row between small" style="padding:3px 0"><span>${esc(e.name)}</span><span class="muted">${test ? '2 組 · 找 8 下' : `${e.sets}×${e.repMin}-${e.repMax} · ${t.weight == null ? '待鑑測' : `${fnum(t.weight)} kg`}`}</span></div>`;
  }).join('');
  return `<div class="card ${finished ? 'okb' : ''}"><div class="row between"><div class="bold">${esc(dayDef.name)}${test ? '鑑測' : ''}日 · 21:00</div>${finished ? pill('已完成', 'g') : pill(fmtHM(estimateTotalSec({ steps })))}</div>
    <div class="mt-s">${rows}</div>
    ${test ? '<div class="xs muted mt-s">鑑測：每個動作找「做 8 下、還剩 1–2 下」的重量，太輕加 5–10%，做不到 8 下減 5–10%。</div>' : ''}
    <button class="b-primary b-block mt" data-act="evening">${ctx.workout.hasActive() ? '繼續訓練' : finished ? '再練一次' : '開始訓練'}</button>
    ${w.type === 'regular' && !finished ? `<button class="b-ghost b-block mt-s" data-act="missed" data-day="${w.day}">今天沒練（選原因）</button>` : ''}</div>`;
}

function statusCard(ctx, day, fs, time) {
  const { plan } = ctx;
  const t = plan.targets;
  return `<div class="card"><div class="row between"><div class="bold">${fs.state === 'eating' ? '進食窗口' : '禁食中'}</div><div class="${fs.state === 'eating' ? 'ok-c' : 'info-c'} bold">${fmtDur(fs.secondsToNext).replace(/:\d\d$/, '')} 後${fs.nextLabel}</div></div>
    <div class="muted small">窗口 ${t.eatStart}–${t.eatEnd}，現在 ${time}</div>
    <div class="row between mt"><span class="small">蛋白質</span><span class="small">${day.proteinG ?? 0} / ${t.proteinG} g</span></div>${bar(day.proteinG, t.proteinG, 'g')}
    <div class="row between mt-s"><span class="small">水</span><span class="small">${day.waterMl ?? 0} / ${t.waterMl} ml</span></div>${bar(day.waterMl, t.waterMl)}
    <div class="row between mt-s"><span class="small">步數</span><span class="small">${day.steps ?? 0} / ${t.steps}</span></div>${bar(day.steps, t.steps, 'g')}</div>`;
}

export function init(ctx) {
  const { plan, store, actions: A } = ctx;
  A.toggle = (el) => { store.toggleDone(ctx.now().date, el.dataset.id); ctx.render(); };
  A.done = (el) => {
    const { date, time } = ctx.now();
    const id = el.dataset.id;
    const d = store.getDay(date);
    if (id === 'first-meal') store.updateDay(date, { creatine: true, firstMeal: d.firstMeal || time });
    if (id === 'last-meal') store.updateDay(date, { lastMealEnd: d.lastMealEnd || time });
    if (id === 'protein-powder') store.updateDay(date, { proteinPowder: true });
    if (!store.getDay(date).done.includes(id)) store.toggleDone(date, id);
    ctx.render();
  };
  A.morning = async () => {
    const { date } = ctx.now();
    if (ctx.workout.hasActive()) return ctx.workout.resume();
    if (date < plan.hiit.start) return ctx.toast(`早晨訓練從 ${plan.hiit.start.slice(5).replace('-', '/')} 開始`);
    const d = store.getDay(date);
    if (!d.checkedIn) { const ok = await ctx.checkin(); if (!ok) return; }
    ctx.workout.open({ kind: 'morning', date, version: ctx.hiitFor(date).id });
  };
  A.evening = () => {
    const { date } = ctx.now();
    if (ctx.workout.hasActive()) return ctx.workout.resume();
    const w = workoutFor(plan, date, store.sessions());
    if (w.type === 'stretch') return ctx.workout.open({ kind: 'stretch', date });
    if (w.type === 'rest') return;
    ctx.workout.open({ kind: 'evening', date, dayId: w.day, test: w.type === 'test' });
  };
  A.missed = async (el) => {
    const { date } = ctx.now();
    const r = await ctx.askReason(`今天的${plan.days[el.dataset.day].name}沒練，原因？`);
    if (!r) return;
    store.markMissed({ date, day: el.dataset.day, ...r });
    if (!store.getDay(date).done.includes('evening')) store.toggleDone(date, 'evening');
    ctx.render();
  };
  A.checkin = () => ctx.checkin();
}
export { sleepHours };
