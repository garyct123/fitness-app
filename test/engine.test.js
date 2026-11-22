import { test } from 'node:test';
import assert from 'node:assert/strict';
import plan from '../plan.json' with { type: 'json' };
import { buildEveningSteps, buildMorningSteps, buildStretchSteps } from '../src/engine/steps.js';
import {
  createSession, reduce, currentStep, stepRemainingSec, totalElapsedMs, resultsToSets, workSteps, nextWorkStep, estimateTotalSec,
} from '../src/engine/workout.js';

const noHistory = () => [];
const noStart = () => null;
const ctx = (extra = {}) => ({ history: noHistory, startWeight: noStart, ...extra });

// ---------- 步驟產生 ----------
test('胸日：熱身 → 7 個動作，每組一個 set，組與組之間有休息，最後一組後沒有休息', () => {
  const steps = buildEveningSteps(plan, 'chest', ctx());
  assert.equal(steps[0].kind, 'block');
  const sets = steps.filter((s) => s.kind === 'set');
  const planned = plan.days.chest.exercises.reduce((n, e) => n + e.sets, 0);
  assert.equal(sets.length, planned);
  assert.equal(steps.at(-1).kind, 'set');
  assert.equal(steps.filter((s) => s.kind === 'rest').length, planned - 1);
});

test('休息秒數取該動作的 restSec', () => {
  const steps = buildEveningSteps(plan, 'chest', ctx());
  const i = steps.findIndex((s) => s.kind === 'set' && s.exerciseId === 'incline-press');
  assert.equal(steps[i + 1].kind, 'rest');
  assert.equal(steps[i + 1].seconds, 150);
});

test('目標重量與次數來自雙重進步法', () => {
  const hist = (id) => (id === 'incline-press' ? [[{ weight: 60, reps: 10, status: 'done' }, { weight: 60, reps: 10, status: 'done' }, { weight: 60, reps: 10, status: 'done' }, { weight: 60, reps: 10, status: 'done' }]] : []);
  const steps = buildEveningSteps(plan, 'chest', ctx({ history: hist }));
  const first = steps.find((s) => s.kind === 'set');
  assert.equal(first.targetWeight, 62.5);
  assert.equal(first.targetReps, 6);
});

test('沒有紀錄時用起始重量', () => {
  const steps = buildEveningSteps(plan, 'chest', ctx({ startWeight: (id) => (id === 'incline-press' ? 40 : null) }));
  assert.equal(steps.find((s) => s.kind === 'set').targetWeight, 40);
});

test('鑑測：每個動作 2 組測試組、目標 8 下，背日與鑑測週略過項目', () => {
  const steps = buildEveningSteps(plan, 'chest', ctx({ test: true, skip: ['lateral-raise'] }));
  const sets = steps.filter((s) => s.kind === 'set');
  assert.ok(sets.every((s) => s.test && s.targetReps === 8));
  assert.ok(!sets.some((s) => s.exerciseId === 'lateral-raise'));
  assert.equal(sets.filter((s) => s.exerciseId === 'incline-press').length, 2);
});

test('早晨：暖身 → HIIT（版本）→ 冷水澡', () => {
  const steps = buildMorningSteps(plan, 'standard');
  assert.deepEqual(steps.map((s) => s.kind), ['block', 'hiit', 'block']);
  assert.equal(steps[1].version, 'standard');
  assert.ok(steps[1].video);
  assert.equal(steps[2].section, 'cold');
});

test('早晨：快走版沒有影片，是一個計時區塊', () => {
  const steps = buildMorningSteps(plan, 'walk');
  assert.deepEqual(steps.map((s) => s.kind), ['block', 'block', 'block']);
  assert.equal(steps[1].seconds, 15 * 60);
});

test('拉伸日：每個動作一步，計時的有秒數，次數的要手動完成', () => {
  const steps = buildStretchSteps(plan);
  assert.equal(steps.length, plan.stretch.length);
  const trap = steps.find((s) => s.id.includes('upper-trap'));
  assert.equal(trap.kind, 'block');
  assert.equal(trap.seconds, 60);
  const chin = steps.find((s) => s.id.includes('chin-tuck'));
  assert.equal(chin.kind, 'task');
});

// ---------- 狀態機與計時 ----------
const mini = () => createSession({
  id: 's1', kind: 'evening', date: '2026-11-28', title: '胸日',
  steps: [
    { id: 'a', kind: 'set', exerciseId: 'x', name: 'X', setNo: 1, totalSets: 2, targetReps: 8, targetWeight: 50 },
    { id: 'b', kind: 'rest', seconds: 90 },
    { id: 'c', kind: 'set', exerciseId: 'x', name: 'X', setNo: 2, totalSets: 2, targetReps: 8, targetWeight: 50 },
  ],
});

test('開始前是 ready，開始後 running', () => {
  const s = mini();
  assert.equal(s.status, 'ready');
  assert.equal(reduce(s, { type: 'start', now: 1000 }).status, 'running');
});

test('完成一組：記錄實際值並進到休息', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 5000, actual: { weight: 50, reps: 9, rir: 2 } });
  assert.equal(s.results.a.status, 'done');
  assert.equal(s.results.a.reps, 9);
  assert.equal(currentStep(s).kind, 'rest');
});

test('休息倒數用時間戳：重新整理（物件還原）後剩餘秒數一致', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 5000, actual: { weight: 50, reps: 9 } });
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(stepRemainingSec(restored, 5000 + 30_000), 60);
});

test('暫停不計入時間', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 1000, actual: { weight: 50, reps: 8 } });
  s = reduce(s, { type: 'pause', now: 11_000 });
  assert.equal(stepRemainingSec(s, 99_000), 80);
  s = reduce(s, { type: 'resume', now: 101_000 });
  assert.equal(stepRemainingSec(s, 111_000), 70);
  assert.equal(totalElapsedMs(s, 111_000), 21_000);
});

test('休息時間到：tick 自動進下一組；還沒到不動', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 1000, actual: { weight: 50, reps: 8 } });
  assert.equal(currentStep(reduce(s, { type: 'tick', now: 60_000 })).kind, 'rest');
  assert.equal(currentStep(reduce(s, { type: 'tick', now: 91_001 })).id, 'c');
});

test('次數動作不會因為時間到就自動完成', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'tick', now: 10 * 60_000 });
  assert.equal(currentStep(s).id, 'a');
  assert.equal(s.results.a, undefined);
});

test('跳過一組一定要有原因', () => {
  const s = reduce(mini(), { type: 'start', now: 0 });
  assert.throws(() => reduce(s, { type: 'skip', now: 1 }), /原因/);
  assert.throws(() => reduce(s, { type: 'skip', now: 1, reason: 'other' }), /說明/);
  const k = reduce(s, { type: 'skip', now: 1, reason: 'no-equipment' });
  assert.equal(k.results.a.status, 'skipped');
  assert.equal(k.results.a.reason, 'no-equipment');
});

test('跳過休息不用原因', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 1, actual: { weight: 50, reps: 8 } });
  s = reduce(s, { type: 'skip', now: 2 });
  assert.equal(currentStep(s).id, 'c');
});

test('返回：回到上一個工作步驟，並清掉它的紀錄', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 1, actual: { weight: 50, reps: 8 } });
  s = reduce(s, { type: 'skip', now: 2 });
  s = reduce(s, { type: 'back', now: 3 });
  assert.equal(currentStep(s).id, 'a');
  assert.equal(s.results.a, undefined);
});

test('全部做完自動變 finished', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 1, actual: { weight: 50, reps: 8 } });
  s = reduce(s, { type: 'skip', now: 2 });
  s = reduce(s, { type: 'complete', now: 3, actual: { weight: 50, reps: 7 } });
  assert.equal(s.status, 'finished');
  assert.equal(s.endedEarly, false);
});

test('中途結束：只留下真的完成的組', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 1, actual: { weight: 50, reps: 8 } });
  s = reduce(s, { type: 'finish', now: 2, early: true });
  assert.equal(s.status, 'finished');
  assert.equal(s.endedEarly, true);
  const sets = resultsToSets(s);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].weight, 50);
});

test('摘要可修正實際值', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 1, actual: { weight: 50, reps: 8 } });
  s = reduce(s, { type: 'finish', now: 2, early: true });
  s = reduce(s, { type: 'editResult', stepId: 'a', actual: { reps: 10, weight: 52.5 } });
  assert.equal(resultsToSets(s)[0].reps, 10);
  assert.equal(resultsToSets(s)[0].weight, 52.5);
});

test('resultsToSets 帶出動作 id、第幾組、跳過原因', () => {
  let s = reduce(mini(), { type: 'start', now: 0 });
  s = reduce(s, { type: 'skip', now: 1, reason: 'tired' });
  s = reduce(s, { type: 'finish', now: 2, early: true });
  const [x] = resultsToSets(s);
  assert.deepEqual([x.exerciseId, x.setNo, x.status, x.reason], ['x', 1, 'skipped', 'tired']);
});

test('鑑測：「這個動作測完了」略過同動作剩下的組，不留紀錄', () => {
  const steps = buildEveningSteps(plan, 'chest', ctx({ test: true }));
  let s = reduce(createSession({ id: 't', kind: 'evening', date: '2026-11-25', title: '胸日鑑測', steps }), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 1 }); // 熱身
  s = reduce(s, { type: 'complete', now: 2, actual: { weight: 40, reps: 8 } });
  s = reduce(s, { type: 'finishExercise', now: 3 });
  const cur = currentStep(s);
  assert.equal(cur.kind, 'set');
  assert.notEqual(cur.exerciseId, 'incline-press');
  assert.equal(resultsToSets(s).length, 1);
});

test('預估總時間、下一個工作步驟', () => {
  const s = mini();
  assert.ok(estimateTotalSec(s) > 90);
  assert.equal(nextWorkStep(reduce(s, { type: 'start', now: 0 })).id, 'c');
  assert.equal(workSteps(s).length, 2);
});

test('換動作：要原因，之後同動作的組改名並記下原因', () => {
  const steps = buildEveningSteps(plan, 'chest', ctx());
  let s = reduce(createSession({ id: 'w', kind: 'evening', date: '2026-11-28', title: '胸日', steps }), { type: 'start', now: 0 });
  s = reduce(s, { type: 'complete', now: 1 }); // 熱身
  assert.throws(() => reduce(s, { type: 'swap', name: '啞鈴上斜推' }), /原因/);
  s = reduce(s, { type: 'swap', name: '啞鈴上斜推', reason: 'no-equipment' });
  const sets = s.steps.filter((x) => x.kind === 'set' && x.exerciseId === 'incline-press');
  assert.ok(sets.every((x) => x.name === '啞鈴上斜推' && x.swappedFrom === '上斜臥推'));
  assert.equal(s.meta.swaps['incline-press'].reason, 'no-equipment');
  s = reduce(s, { type: 'complete', now: 2, actual: { weight: 20, reps: 8 } });
  assert.equal(resultsToSets(s)[0].swappedFrom, '上斜臥推');
});

test('休息可以加減秒數', () => {
  const steps = [{ id: 'r', kind: 'rest', seconds: 60 }, { id: 'a', kind: 'task' }];
  let s = reduce(createSession({ id: 'x', kind: 'k', date: 'd', title: 't', steps }), { type: 'start', now: 0 });
  s = reduce(s, { type: 'extend', sec: 30 });
  assert.equal(currentStep(s).seconds, 90);
});
