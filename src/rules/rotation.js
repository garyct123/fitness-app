// 今晚練哪一天：照 plan.rotation 輪，接在最後一次正式訓練（完成、部分完成或沒練）後面。
// 沒練的那次不補，也佔掉一格。

/** 'YYYY-MM-DD' 是星期幾（0=日）。用 UTC 算，避免時區影響日期。 */
export function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** 'training' | 'stretch' | 'rest' */
export function dayKind(plan, date) {
  const wd = weekday(date);
  if (plan.weekdays.training.includes(wd)) return 'training';
  if (plan.weekdays.stretch.includes(wd)) return 'stretch';
  return 'rest';
}

export function nextWorkoutDay(plan, sessions) {
  const regular = sessions
    .filter((s) => s.kind === 'regular' && ['done', 'partial', 'missed'].includes(s.status))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (regular.length === 0) return plan.rotation[0];
  const last = regular[regular.length - 1].day;
  const i = plan.rotation.indexOf(last);
  return plan.rotation[(i + 1) % plan.rotation.length];
}
