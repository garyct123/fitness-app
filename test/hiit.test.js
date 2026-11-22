import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hiitVersion } from '../src/rules/hiit.js';

test('睡不到 6 小時：快走（最優先）', () => {
  assert.equal(hiitVersion({ lastNight: 'legA', sleepHours: 5.5 }), 'walk');
  assert.equal(hiitVersion({ lastNight: null, sleepHours: 5.5 }), 'walk');
});

test('前晚練腿：低衝擊', () => {
  assert.equal(hiitVersion({ lastNight: 'legA', sleepHours: 7 }), 'low');
  assert.equal(hiitVersion({ lastNight: 'legB', sleepHours: 7 }), 'low');
});

test('前晚練胸或背：標準', () => {
  assert.equal(hiitVersion({ lastNight: 'chest', sleepHours: 7 }), 'standard');
  assert.equal(hiitVersion({ lastNight: 'back', sleepHours: 8 }), 'standard');
});

test('前晚沒重訓、睡 6.5 小時以上：全力', () => {
  assert.equal(hiitVersion({ lastNight: null, sleepHours: 7 }), 'full');
  assert.equal(hiitVersion({ lastNight: null, sleepHours: 6.5 }), 'full');
});

test('前晚沒重訓、睡 6 到 6.5 小時：標準', () => {
  assert.equal(hiitVersion({ lastNight: null, sleepHours: 6.2 }), 'standard');
});

test('起床心率比平常高 7 下以上：快走', () => {
  assert.equal(hiitVersion({ lastNight: null, sleepHours: 8, restingHr: 70, usualHr: 62 }), 'walk');
  assert.equal(hiitVersion({ lastNight: null, sleepHours: 8, restingHr: 68, usualHr: 62 }), 'full');
});

test('還沒填睡眠：照前晚規則，不擋', () => {
  assert.equal(hiitVersion({ lastNight: null, sleepHours: null }), 'full');
});
