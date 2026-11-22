import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutFor, todayItems, nowItem, sleepHours, eatingWindowCheck } from '../src/rules/today.js';
import plan from '../plan.json' with { type: 'json' };

test('鑑測週日期：回傳鑑測的訓練日', () => {
  assert.deepEqual(workoutFor(plan, '2026-11-22', []), { type: 'test', day: 'back' });
  assert.deepEqual(workoutFor(plan, '2026-11-25', []), { type: 'test', day: 'chest' });
});

test('週一、週四：拉伸修復', () => {
  assert.deepEqual(workoutFor(plan, '2026-11-23', []), { type: 'stretch' });
});

test('11/28 起照輪替，第一次胸日', () => {
  assert.deepEqual(workoutFor(plan, '2026-11-28', []), { type: 'regular', day: 'chest' });
});

test('當天已有正式紀錄：顯示當天那一天，不往下推', () => {
  const sessions = [{ date: '2026-11-28', day: 'chest', kind: 'regular', status: 'done' }];
  assert.deepEqual(workoutFor(plan, '2026-11-28', sessions), { type: 'regular', day: 'chest' });
  assert.deepEqual(workoutFor(plan, '2026-11-29', sessions), { type: 'regular', day: 'legA' });
});

test('HIIT 開始前（11/22、11/23）清單沒有 HIIT', () => {
  const ids = todayItems(plan, '2026-11-23', []).map((x) => x.id);
  assert.ok(!ids.includes('hiit'));
  assert.ok(todayItems(plan, '2026-11-24', []).some((x) => x.id === 'hiit'));
});

test('晚上項目的標題寫今晚練哪一天', () => {
  const ev = todayItems(plan, '2026-11-28', []).find((x) => x.id === 'evening');
  assert.equal(ev.title, '今晚練胸日');
  const st = todayItems(plan, '2026-11-26', []).find((x) => x.id === 'evening');
  assert.equal(st.title, '拉伸修復 20–25 分鐘');
  const t = todayItems(plan, '2026-11-22', []).find((x) => x.id === 'evening');
  assert.equal(t.title, '背日鑑測');
});

test('14:05、蛋白粉沒勾：首頁顯示 14:00 蛋白粉', () => {
  const items = todayItems(plan, '2026-11-28', []);
  const done = new Set(['weigh', 'hiit', 'cold-shower', 'first-meal']);
  const r = nowItem(items, '14:05', done);
  assert.equal(r.item.id, 'protein-powder');
  assert.equal(r.missed, 0);
});

test('舊的沒勾不擋住現在的事，只算進漏掉數量', () => {
  const items = todayItems(plan, '2026-11-28', []);
  const r = nowItem(items, '14:05', new Set(['weigh', 'hiit', 'cold-shower']));
  assert.equal(r.item.id, 'protein-powder');
  assert.equal(r.missed, 1);
});

test('時間到了的都做完：顯示下一件', () => {
  const items = todayItems(plan, '2026-11-28', []);
  const r = nowItem(items, '06:30', new Set());
  assert.equal(r.item.id, 'weigh');
  assert.equal(r.upcoming, true);
});

test('全部做完：item 是 null', () => {
  const items = todayItems(plan, '2026-11-28', []);
  const r = nowItem(items, '23:00', new Set(items.map((x) => x.id)));
  assert.equal(r.item, null);
});

test('睡眠時數會跨午夜', () => {
  assert.equal(sleepHours('23:30', '07:00'), 7.5);
  assert.equal(sleepHours('01:30', '07:00'), 5.5);
  assert.equal(sleepHours(null, '07:00'), null);
});

test('168：第一餐太早、最後一餐超過 19:30 都要標示', () => {
  assert.deepEqual(eatingWindowCheck(plan, '11:30', '19:25'), { earlyStart: false, lateEnd: false });
  assert.deepEqual(eatingWindowCheck(plan, '11:00', '19:45'), { earlyStart: true, lateEnd: true });
});
