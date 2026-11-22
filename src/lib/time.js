// 時間工具：一律台灣時間。
export function taipeiNow(tz = 'Asia/Taipei', d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const WD = ['日', '一', '二', '三', '四', '五', '六'];
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const fmtDate = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}（${WD[weekdayOf(date)]}）`;
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
export function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtHM(sec) {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分`;
}
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** 168：現在是進食中還是禁食中、距離下一個轉換還有幾秒（窗口不跨午夜）。 */
export function fastingStatus(eatStart, eatEnd, hhmm, sec = 0) {
  const now = toMin(hhmm) * 60 + sec, s = toMin(eatStart) * 60, e = toMin(eatEnd) * 60;
  if (now >= s && now < e) return { state: 'eating', secondsToNext: e - now, nextLabel: '開始禁食' };
  const until = now < s ? s - now : 24 * 3600 - now + s;
  return { state: 'fasting', secondsToNext: until, nextLabel: '開始進食' };
}
