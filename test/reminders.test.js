import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildICS } from '../src/rules/reminders.js';
import plan from '../plan.json' with { type: 'json' };

const ics = buildICS(plan, { appUrl: 'https://example.com/app/', stamp: '20261122T000000Z' });

test('是合法的日曆檔：開頭結尾、CRLF 換行', () => {
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.ok(!/[^\r]\n/.test(ics));
});

test('時間表每一項各一個每日重複事件', () => {
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, plan.schedule.length);
  assert.equal((ics.match(/RRULE:FREQ=DAILY/g) || []).length, plan.schedule.length);
});

test('每個事件開始時跳提醒', () => {
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, plan.schedule.length);
  assert.ok(ics.includes('TRIGGER:PT0M'));
});

test('時間用台灣時區', () => {
  assert.ok(ics.includes('DTSTART;TZID=Asia/Taipei:20261122T140000'));
  assert.ok(ics.includes('BEGIN:VTIMEZONE'));
});

test('HIIT 從 11/24 開始，不早於 11/24', () => {
  const hiit = ics.split('BEGIN:VEVENT').find((e) => e.includes('UID:hiit@'));
  assert.ok(hiit.includes('DTSTART;TZID=Asia/Taipei:20261124T071500'));
});

test('UID 固定，重複匯入會更新而不是重複', () => {
  assert.ok(ics.includes('UID:protein-powder@fitness-app'));
});

test('晚上事件標題不寫死哪一天，說明裡有 App 連結', () => {
  const ev = ics.split('BEGIN:VEVENT').find((e) => e.includes('UID:evening@'));
  assert.ok(ev.includes('SUMMARY:晚上重訓或拉伸修復'));
  assert.ok(ev.includes('https://example.com/app/'));
});

test('超過 75 字元的行會折行', () => {
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
});

test('訂閱用：每小時更新一次', () => {
  assert.ok(ics.includes('REFRESH-INTERVAL;VALUE=DURATION:PT1H'));
  assert.ok(ics.includes('X-PUBLISHED-TTL:PT1H'));
});
