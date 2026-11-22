// 早晨 HIIT 版本（計畫「早晨 HIIT」）。規則值可從 plan.hiit 傳入。
const LEG_DAYS = ['legA', 'legB'];

export function hiitVersion(
  { lastNight, sleepHours, restingHr = null, usualHr = null },
  rules = { fullMinSleep: 6.5, walkBelowSleep: 6, hrRiseWalk: 7 },
) {
  if (sleepHours != null && sleepHours < rules.walkBelowSleep) return 'walk';
  if (restingHr != null && usualHr != null && restingHr - usualHr >= rules.hrRiseWalk) return 'walk';
  if (LEG_DAYS.includes(lastNight)) return 'low';
  if (lastNight) return 'standard';
  if (sleepHours != null && sleepHours < rules.fullMinSleep) return 'standard';
  return 'full';
}
