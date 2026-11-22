// 雙重進步法（計畫「怎麼進步」）。
// history：這個動作過去每次訓練的組，最新的在前；每組 {weight, reps, status}。

const DEFAULT_INC = { upper: 2.5, lower: 5, core: 2.5 };

const doneSets = (session) => session.filter((s) => s.status === 'done' && s.reps > 0);

function mostUsedWeight(sets) {
  const count = new Map();
  for (const s of sets) count.set(s.weight, (count.get(s.weight) || 0) + 1);
  let best = null;
  let n = -1;
  for (const [w, c] of count) if (c > n || (c === n && w > best)) { best = w; n = c; }
  return best;
}

const round = (x) => Math.round(x * 100) / 100;

export function nextTarget(exercise, history, startWeight = null) {
  const { sets, repMin, repMax } = exercise;
  const last = history.map(doneSets).find((s) => s.length > 0);
  const floor = Array(sets).fill(repMin);

  if (!last) {
    return startWeight == null
      ? { weight: null, reps: floor, reason: 'need-start' }
      : { weight: startWeight, reps: floor, reason: 'start' };
  }

  const weight = mostUsedWeight(last);
  const sameWeight = last.length === last.filter((s) => s.weight === weight).length;
  const allAtMax = last.length >= sets && last.every((s) => s.reps >= repMax);

  if (sameWeight && allAtMax) {
    const inc = exercise.increment ?? DEFAULT_INC[exercise.body] ?? 2.5;
    return {
      weight: round(weight + inc),
      reps: floor,
      reason: exercise.small ? 'increase-small' : 'increase',
    };
  }

  const atWeight = last.filter((s) => s.weight === weight);
  const reps = Array.from({ length: sets }, (_, i) =>
    i < atWeight.length ? Math.min(repMax, atWeight[i].reps + 1) : repMin,
  );
  return { weight, reps, reason: 'add-reps' };
}

/** 同一重量下，總次數連續變少幾次（最新在前）。 */
export function regressionStreak(history) {
  const sessions = history.map(doneSets).filter((s) => s.length > 0);
  let streak = 0;
  for (let i = 0; i + 1 < sessions.length; i++) {
    const a = sessions[i];
    const b = sessions[i + 1];
    const wa = mostUsedWeight(a);
    if (wa !== mostUsedWeight(b)) break;
    const total = (s) => s.reduce((n, x) => n + x.reps, 0);
    if (total(a) < total(b)) streak++;
    else break;
  }
  return streak;
}
