import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend } from '../src/store.js';

const mk = () => createStore(memoryBackend());

test('每天的資料可以分次更新', () => {
  const s = mk();
  s.updateDay('2026-11-24', { weight: 85.6, bodyFat: 27 });
  s.updateDay('2026-11-24', { proteinG: 50 });
  assert.deepEqual(s.getDay('2026-11-24'), { date: '2026-11-24', weight: 85.6, bodyFat: 27, proteinG: 50, done: [] });
});

test('勾選清單項目', () => {
  const s = mk();
  s.toggleDone('2026-11-24', 'hiit');
  assert.deepEqual(s.getDay('2026-11-24').done, ['hiit']);
  s.toggleDone('2026-11-24', 'hiit');
  assert.deepEqual(s.getDay('2026-11-24').done, []);
});

test('一個動作的歷史：依訓練分組，最新在前', () => {
  const s = mk();
  const a = s.startSession({ date: '2026-11-28', day: 'chest', kind: 'regular' });
  s.logSet(a.id, { exerciseId: 'incline-press', setNo: 1, weight: 60, reps: 10, rir: 2 });
  s.logSet(a.id, { exerciseId: 'incline-press', setNo: 2, weight: 60, reps: 9, rir: 1 });
  const b = s.startSession({ date: '2026-12-01', day: 'chest', kind: 'regular' });
  s.logSet(b.id, { exerciseId: 'incline-press', setNo: 1, weight: 60, reps: 10, rir: 2 });
  const h = s.history('incline-press');
  assert.equal(h.length, 2);
  assert.equal(h[0][0].reps, 10);
  assert.equal(h[1].length, 2);
});

test('鑑測紀錄不進正式歷史', () => {
  const s = mk();
  const t = s.startSession({ date: '2026-11-25', day: 'chest', kind: 'test' });
  s.logSet(t.id, { exerciseId: 'incline-press', setNo: 1, weight: 40, reps: 8, rir: 2 });
  assert.equal(s.history('incline-press').length, 0);
});

test('跳過一組一定要有原因', () => {
  const s = mk();
  const a = s.startSession({ date: '2026-11-28', day: 'chest', kind: 'regular' });
  assert.throws(() => s.logSet(a.id, { exerciseId: 'cable-fly', setNo: 1, status: 'skipped' }), /原因/);
  assert.throws(() => s.logSet(a.id, { exerciseId: 'cable-fly', setNo: 1, status: 'skipped', reason: 'other' }), /說明/);
  s.logSet(a.id, { exerciseId: 'cable-fly', setNo: 1, status: 'skipped', reason: 'no-equipment' });
});

test('沒練一定要有原因，且記成 missed', () => {
  const s = mk();
  assert.throws(() => s.markMissed({ date: '2026-11-29', day: 'legA' }), /原因/);
  const m = s.markMissed({ date: '2026-11-29', day: 'legA', reason: 'tired' });
  assert.equal(m.status, 'missed');
  assert.equal(s.sessions()[0].kind, 'regular');
});

test('起始重量可手動設定', () => {
  const s = mk();
  s.setStartWeight('squat', 60);
  assert.equal(s.startWeight('squat'), 60);
});

test('同一組重記會覆蓋，不會重複', () => {
  const s = mk();
  const a = s.startSession({ date: '2026-11-28', day: 'chest', kind: 'regular' });
  s.logSet(a.id, { exerciseId: 'incline-press', setNo: 1, weight: 60, reps: 8 });
  s.logSet(a.id, { exerciseId: 'incline-press', setNo: 1, weight: 60, reps: 9 });
  assert.equal(s.setsOf(a.id).length, 1);
  assert.equal(s.setsOf(a.id)[0].reps, 9);
});

test('匯出再匯入：資料完全一樣', () => {
  const s = mk();
  s.updateDay('2026-11-24', { weight: 85.6 });
  const a = s.startSession({ date: '2026-11-28', day: 'chest', kind: 'regular' });
  s.logSet(a.id, { exerciseId: 'incline-press', setNo: 1, weight: 60, reps: 10 });
  s.setStartWeight('squat', 60);
  const json = s.exportJSON();
  const s2 = mk();
  s2.importJSON(json);
  assert.deepEqual(JSON.parse(s2.exportJSON()).data, JSON.parse(json).data);
});

test('匯入壞掉的檔案：拒絕並保留原資料', () => {
  const s = mk();
  s.updateDay('2026-11-24', { weight: 85.6 });
  assert.throws(() => s.importJSON('{"hello":1}'));
  assert.equal(s.getDay('2026-11-24').weight, 85.6);
});

test('換動作一定要有原因，並記下換成什麼', () => {
  const s = mk();
  const a = s.startSession({ date: '2026-11-28', day: 'chest', kind: 'regular' });
  assert.throws(() => s.swapExercise(a.id, 'cable-fly', { name: '啞鈴飛鳥' }), /原因/);
  s.swapExercise(a.id, 'cable-fly', { name: '啞鈴飛鳥', reason: 'no-equipment' });
  assert.equal(s.session(a.id).swaps['cable-fly'], '啞鈴飛鳥');
  assert.equal(s.session(a.id).swapReasons['cable-fly'].reason, 'no-equipment');
});

test('重置：清掉所有資料，重新載入也是空的', () => {
  const backend = memoryBackend();
  const s = createStore(backend);
  s.updateDay('2026-11-24', { weight: 85.6 });
  const a = s.startSession({ date: '2026-11-28', day: 'chest', kind: 'regular' });
  s.logSet(a.id, { exerciseId: 'incline-press', setNo: 1, weight: 60, reps: 10 });
  s.setStartWeight('squat', 60);
  s.reset();
  assert.equal(s.sessions().length, 0);
  assert.equal(s.startWeight('squat'), null);
  assert.equal(s.getDay('2026-11-24').weight, undefined);
  const s2 = createStore(backend);
  assert.equal(s2.sessions().length, 0);
});

test('進行中的訓練可存取，重新載入後還在', () => {
  const backend = memoryBackend();
  const s = createStore(backend);
  s.setActive({ id: 'x', index: 3 });
  assert.equal(createStore(backend).getActive().index, 3);
  s.clearActive();
  assert.equal(createStore(backend).getActive(), null);
});

test('saveWorkout：晚上重訓存成 session 與每組，鑑測不進正式歷史', () => {
  const s = mk();
  const sets = [
    { exerciseId: 'incline-press', exerciseName: '上斜臥推', setNo: 1, weight: 60, reps: 10, rir: 2, status: 'done' },
    { exerciseId: 'cable-fly', exerciseName: '繩索夾胸', setNo: 1, status: 'skipped', reason: 'tired', reps: 0 },
  ];
  s.saveWorkout({ kind: 'evening', date: '2026-11-28', day: 'chest', test: false, status: 'partial', sets });
  assert.equal(s.sessions()[0].status, 'partial');
  assert.equal(s.history('incline-press').length, 1);
  s.saveWorkout({ kind: 'evening', date: '2026-11-25', day: 'chest', test: true, status: 'done', sets: [sets[0]] });
  assert.equal(s.history('incline-press').length, 1);
});

test('偏好預設開聲音、可改', () => {
  const s = mk();
  assert.equal(s.prefs().voice, true);
  s.setPref('voice', false);
  assert.equal(s.prefs().voice, false);
});
