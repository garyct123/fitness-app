// 把每日時間表轉成 iPhone 日曆檔（.ics）：每項一個每日重複事件，開始時跳提醒。
// UID 固定，重複匯入會更新原本的事件，不會重複。

const CRLF = '\r\n';
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// RFC 5545：每行最多 75 位元組，超過就折行（續行開頭一個空白）。不切斷中文字。
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > limit) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join(CRLF);
}

const compact = (date) => date.replaceAll('-', '');
const hhmmss = (t) => `${t.replace(':', '')}00`;

function addMinutes(t, n) {
  const [h, m] = t.split(':').map(Number);
  const total = (h * 60 + m + n) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const TITLE_OVERRIDE = { evening: '晚上重訓或拉伸修復' };

export function buildICS(plan, { appUrl, stamp }) {
  const tz = plan.timezone;
  const start = plan.testWeek[0].date;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//fitness-app//reminders//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:健身訓練提醒（計畫 v${plan.planVersion}）`,
    `X-WR-TIMEZONE:${tz}`,
    'BEGIN:VTIMEZONE',
    `TZID:${tz}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:CST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  for (const it of plan.schedule) {
    const first = it.id === 'hiit' ? plan.hiit.start : start;
    const title = TITLE_OVERRIDE[it.id] ?? it.title;
    const desc = `${it.title}\n打開 App 看現在該做的事：${appUrl}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.id}@fitness-app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${tz}:${compact(first)}T${hhmmss(it.time)}`,
      `DTEND;TZID=${tz}:${compact(first)}T${hhmmss(addMinutes(it.time, 15))}`,
      'RRULE:FREQ=DAILY',
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(desc)}`,
      `URL:${appUrl}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}
