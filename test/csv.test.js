import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCSV, trainingCSV, dailyCSV } from '../src/lib/csv.js';
import { createStore, memoryBackend } from '../src/store.js';

test('逗號、引號、換行要跳脫', () => {
  const csv = toCSV([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2' }], ['a', 'b', 'c']);
  assert.equal(csv, 'a,b,c\r\n"x,y","say ""hi""","l1\nl2"\r\n');
});

test('空值留空、數字原樣', () => {
  assert.equal(toCSV([{ a: null, b: 0, c: undefined }], ['a', 'b', 'c']), 'a,b,c\r\n,0,\r\n');
});

test('訓練 CSV：每組一列，含原因', () => {
  const s = createStore(memoryBackend());
  s.saveWorkout({ kind: 'evening', date: '2026-11-28', day: 'chest', test: false, status: 'partial', sets: [
    { exerciseId: 'incline-press', exerciseName: '上斜臥推', setNo: 1, weight: 60, reps: 10, rir: 2, status: 'done' },
    { exerciseId: 'cable-fly', exerciseName: '繩索夾胸', setNo: 1, status: 'skipped', reason: 'tired', reps: 0 },
  ] });
  const lines = trainingCSV(s, { chest: { name: '胸日' } }).trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('日期,'));
  assert.ok(lines[1].includes('上斜臥推') && lines[1].includes('60'));
  assert.ok(lines[2].includes('tired'));
});

test('每日 CSV：依日期排序', () => {
  const s = createStore(memoryBackend());
  s.updateDay('2026-11-25', { weight: 85 });
  s.updateDay('2026-11-24', { weight: 86 });
  const lines = dailyCSV(s).trim().split('\r\n');
  assert.ok(lines[1].startsWith('2026-11-24'));
});
