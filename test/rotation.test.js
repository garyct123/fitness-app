import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKind, nextWorkoutDay } from '../src/rules/rotation.js';
import plan from '../plan.json' with { type: 'json' };

test('週一、週四是拉伸修復日', () => {
  assert.equal(dayKind(plan, '2026-11-30'), 'stretch'); // 週一
  assert.equal(dayKind(plan, '2026-12-03'), 'stretch'); // 週四
});

test('週二三五六日是重訓日', () => {
  for (const d of ['2026-12-01', '2026-12-02', '2026-12-04', '2026-12-05', '2026-12-06']) {
    assert.equal(dayKind(plan, d), 'training', d);
  }
});

test('正式訓練第一次是胸日', () => {
  assert.equal(nextWorkoutDay(plan, []), 'chest');
});

test('上次完成背日，今晚練腿B', () => {
  const sessions = [{ date: '2026-11-28', day: 'back', kind: 'regular', status: 'done' }];
  assert.equal(nextWorkoutDay(plan, sessions), 'legB');
});

test('腿B 之後回到胸日', () => {
  const sessions = [{ date: '2026-11-28', day: 'legB', kind: 'regular', status: 'done' }];
  assert.equal(nextWorkoutDay(plan, sessions), 'chest');
});

test('上次腿B 沒練，今晚接胸日，不補腿B', () => {
  const sessions = [
    { date: '2026-11-28', day: 'back', kind: 'regular', status: 'done' },
    { date: '2026-11-29', day: 'legB', kind: 'regular', status: 'missed', reason: 'tired' },
  ];
  assert.equal(nextWorkoutDay(plan, sessions), 'chest');
});

test('部分完成也算練過，順序往下', () => {
  const sessions = [{ date: '2026-11-28', day: 'chest', kind: 'regular', status: 'partial' }];
  assert.equal(nextWorkoutDay(plan, sessions), 'legA');
});

test('鑑測紀錄不影響正式輪替', () => {
  const sessions = [{ date: '2026-11-27', day: 'legB', kind: 'test', status: 'done' }];
  assert.equal(nextWorkoutDay(plan, sessions), 'chest');
});

test('取日期最新的一次，不管陣列順序', () => {
  const sessions = [
    { date: '2026-12-02', day: 'legA', kind: 'regular', status: 'done' },
    { date: '2026-12-01', day: 'chest', kind: 'regular', status: 'done' },
  ];
  assert.equal(nextWorkoutDay(plan, sessions), 'back');
});
