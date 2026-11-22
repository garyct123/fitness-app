// 把計畫（plan.json）轉成一步一步的訓練流程。
import { nextTarget } from '../rules/progression.js';

const block = (id, section, title, seconds, moves = [], extra = {}) => ({ id, kind: 'block', section, title, seconds, moves, ...extra });

export function buildMorningSteps(plan, version) {
  const w = plan.warmupMorning;
  const v = plan.hiit.versions[version];
  const warm = block('warm', 'warmup', w.title, w.seconds, w.moves);
  const cold = block('cold', 'cold', plan.coldShower.title, plan.coldShower.seconds, [], { note: plan.coldShower.note });
  const main = version === 'walk'
    ? block('hiit', 'walk', v.name, v.minutes * 60, [], { note: v.content })
    : { id: 'hiit', kind: 'hiit', version, title: v.name, content: v.content, video: v.video, minutes: v.minutes };
  return [warm, main, cold];
}

export function buildStretchSteps(plan) {
  return plan.stretch.map((s) => {
    const id = `st-${s.id}`;
    if (s.kind === 'time') {
      const sides = s.perSide ? 2 : 1;
      return block(id, 'stretch', s.name, s.seconds * sides, s.perSide ? ['左側', '右側'] : [], { cue: s.cue, note: plan.stretchNote });
    }
    return { id, kind: 'task', section: 'stretch', title: s.name, text: `${s.reps} 下${s.sets > 1 ? ` × ${s.sets} 組` : ''}`, cue: s.cue };
  });
}

/**
 * 晚上重訓：熱身 → 每個動作的每一組（組間休息）。
 * ctx：{ history(exId), startWeight(exId), test?, skip? }
 */
export function buildEveningSteps(plan, dayId, ctx) {
  const w = plan.warmupEvening;
  const steps = [block('warm', 'warmup', w.title, w.seconds, w.moves)];
  const skip = ctx.skip || [];
  const list = plan.days[dayId].exercises.filter((e) => !skip.includes(e.id));
  list.forEach((ex, ei) => {
    const target = ctx.test ? null : nextTarget(ex, ctx.history(ex.id), ctx.startWeight(ex.id));
    const total = ctx.test ? 2 : ex.sets;
    for (let n = 1; n <= total; n++) {
      steps.push({
        id: `${dayId}-${ex.id}-${n}`, kind: 'set', exerciseId: ex.id, name: ex.name, en: ex.en,
        setNo: n, totalSets: total, repMin: ex.repMin, repMax: ex.repMax, unilateral: ex.unilateral || null,
        body: ex.body, small: Boolean(ex.small), cue: ex.cue, test: Boolean(ctx.test),
        targetReps: ctx.test ? 8 : target.reps[n - 1] ?? ex.repMin,
        targetWeight: ctx.test ? (ctx.startWeight(ex.id) ?? null) : target.weight,
        reason: target?.reason ?? 'test',
      });
      const last = ei === list.length - 1 && n === total;
      if (!last) steps.push({ id: `${dayId}-${ex.id}-${n}-rest`, kind: 'rest', seconds: ex.restSec, label: '組間休息' });
    }
  });
  return steps;
}
