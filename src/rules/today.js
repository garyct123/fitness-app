// 今天要做什麼：依 plan.schedule 產生今天的清單，並挑出「現在要做的一件事」。
import { dayKind, nextWorkoutDay } from './rotation.js';

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 這一天晚上要練什麼：{type:'test'|'regular', day} | {type:'stretch'} | {type:'rest'} */
export function workoutFor(plan, date, sessions) {
  const t = plan.testWeek.find((x) => x.date === date);
  if (t) return { type: 'test', day: t.day };
  const kind = dayKind(plan, date);
  if (kind === 'stretch') return { type: 'stretch' };
  if (kind !== 'training' || date < plan.regularStart) return { type: 'rest' };
  const today = sessions.find((s) => s.kind === 'regular' && s.date === date);
  if (today) return { type: 'regular', day: today.day };
  const before = sessions.filter((s) => s.date < date);
  return { type: 'regular', day: nextWorkoutDay(plan, before) };
}

export function eveningTitle(plan, w) {
  if (w.type === 'test') return `${plan.days[w.day].name}鑑測`;
  if (w.type === 'regular') return `今晚練${plan.days[w.day].name}`;
  if (w.type === 'stretch') return '拉伸修復 20–25 分鐘';
  return '休息';
}

export function todayItems(plan, date, sessions) {
  const w = workoutFor(plan, date, sessions);
  return plan.schedule
    .filter((it) => !(it.id === 'hiit' && date < plan.hiit.start))
    .filter((it) => !(it.id === 'evening' && w.type === 'rest'))
    .map((it) => (it.id === 'evening' ? { ...it, title: eveningTitle(plan, w), workout: w } : { ...it }));
}

/** 現在要做的事：時間已到、還沒做的最晚一件；都做完就給下一件。 */
export function nowItem(items, hhmm, done) {
  const now = toMin(hhmm);
  const arrived = items.filter((it) => toMin(it.time) <= now);
  const pending = arrived.filter((it) => !done.has(it.id));
  if (pending.length) {
    return { item: pending[pending.length - 1], missed: pending.length - 1, upcoming: false };
  }
  const next = items.find((it) => toMin(it.time) > now && !done.has(it.id));
  return { item: next ?? null, missed: 0, upcoming: Boolean(next) };
}

export function sleepHours(bed, wake) {
  if (!bed || !wake) return null;
  let diff = toMin(wake) - toMin(bed);
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

export function eatingWindowCheck(plan, firstMeal, lastMealEnd) {
  return {
    earlyStart: firstMeal ? toMin(firstMeal) < toMin(plan.targets.eatStart) : false,
    lateEnd: lastMealEnd ? toMin(lastMealEnd) > toMin(plan.targets.eatEnd) : false,
  };
}
