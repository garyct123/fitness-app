import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, fmtDate, fmtDur, fmtHM, fastingStatus, daysBetween, taipeiNow } from '../src/lib/time.js';

test('日期加減與格式', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-11-22', -1), '2026-11-21');
  assert.equal(fmtDate('2026-11-22'), '11/22（日）');
  assert.equal(daysBetween('2026-11-22', '2026-11-28'), 6);
});
test('時間格式', () => {
  assert.equal(fmtDur(75), '1:15');
  assert.equal(fmtDur(3725), '1:02:05');
  assert.equal(fmtHM(4500), '1 小時 15 分');
  assert.equal(fmtHM(1500), '25 分');
});
test('台灣時間：UTC 16:30 已經是隔天', () => {
  assert.deepEqual(taipeiNow('Asia/Taipei', new Date('2026-11-22T16:30:00Z')), { date: '2026-11-23', time: '00:30' });
});
test('168：進食中、禁食中、跨午夜倒數', () => {
  assert.deepEqual(fastingStatus('11:30', '19:30', '14:00'), { state: 'eating', secondsToNext: 5.5 * 3600, nextLabel: '開始禁食' });
  assert.equal(fastingStatus('11:30', '19:30', '20:00').secondsToNext, 15.5 * 3600);
  assert.equal(fastingStatus('11:30', '19:30', '09:30').secondsToNext, 2 * 3600);
});
