import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTarget, regressionStreak } from '../src/rules/progression.js';

const incline = { id: 'incline-press', sets: 4, repMin: 6, repMax: 10, body: 'upper' };
const squat = { id: 'squat', sets: 4, repMin: 6, repMax: 10, body: 'lower' };
const lateral = { id: 'lateral-raise', sets: 5, repMin: 12, repMax: 20, body: 'upper', small: true, increment: 1 };

const sets = (w, reps) => reps.map((r) => ({ weight: w, reps: r, status: 'done' }));

test('上半身每組都到上限：加 2.5 kg，次數回下限', () => {
  const t = nextTarget(incline, [sets(60, [10, 10, 10, 10])]);
  assert.deepEqual(t, { weight: 62.5, reps: [6, 6, 6, 6], reason: 'increase' });
});

test('下半身每組都到上限：加 5 kg', () => {
  const t = nextTarget(squat, [sets(80, [10, 10, 10, 10])]);
  assert.deepEqual(t, { weight: 85, reps: [6, 6, 6, 6], reason: 'increase' });
});

test('沒全部到上限：同重量、每組多 1 下但不超過上限', () => {
  const t = nextTarget(incline, [sets(60, [10, 9, 8, 8])]);
  assert.deepEqual(t, { weight: 60, reps: [10, 10, 9, 9], reason: 'add-reps' });
});

test('少做一組也不加重', () => {
  const t = nextTarget(incline, [sets(60, [10, 10, 10])]);
  assert.equal(t.weight, 60);
  assert.equal(t.reason, 'add-reps');
  assert.deepEqual(t.reps, [10, 10, 10, 6]);
});

test('小肌群用動作自己的增量', () => {
  const t = nextTarget(lateral, [sets(20, [20, 20, 20, 20, 20])]);
  assert.equal(t.weight, 21);
  assert.equal(t.reason, 'increase-small');
});

test('沒有紀錄：用鑑測起始重量、目標下限', () => {
  const t = nextTarget(incline, [], 40);
  assert.deepEqual(t, { weight: 40, reps: [6, 6, 6, 6], reason: 'start' });
});

test('沒有紀錄也沒有起始重量：重量留空', () => {
  const t = nextTarget(incline, []);
  assert.deepEqual(t, { weight: null, reps: [6, 6, 6, 6], reason: 'need-start' });
});

test('跳過的組不算；整次跳過就用上一次有做的紀錄', () => {
  const skipped = [{ weight: 60, reps: 0, status: 'skipped', reason: 'no-equipment' }];
  const t = nextTarget(incline, [skipped, sets(60, [10, 10, 10, 10])]);
  assert.equal(t.weight, 62.5);
});

test('各組重量不同時，用最常用的工作重量，且不加重', () => {
  const mixed = [
    { weight: 60, reps: 10, status: 'done' },
    { weight: 60, reps: 10, status: 'done' },
    { weight: 55, reps: 10, status: 'done' },
    { weight: 55, reps: 10, status: 'done' },
  ];
  const t = nextTarget(incline, [mixed]);
  assert.equal(t.weight, 60);
  assert.equal(t.reason, 'add-reps');
});

test('同重量總次數連續兩次變少：退步 2 次', () => {
  const history = [sets(60, [8, 7, 7, 6]), sets(60, [9, 8, 8, 7]), sets(60, [10, 9, 9, 8])];
  assert.equal(regressionStreak(history), 2);
});

test('加重後次數變少不算退步', () => {
  const history = [sets(62.5, [6, 6, 6, 6]), sets(60, [10, 10, 10, 10])];
  assert.equal(regressionStreak(history), 0);
});

test('有進步就歸零', () => {
  const history = [sets(60, [10, 9, 9, 8]), sets(60, [9, 8, 8, 7]), sets(60, [10, 9, 9, 8])];
  assert.equal(regressionStreak(history), 0);
});
