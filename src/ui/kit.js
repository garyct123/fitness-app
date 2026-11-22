// 畫面小零件（回傳 HTML 字串）。
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pill = (t, c = '') => `<span class="pill ${c}">${esc(t)}</span>`;
export const bar = (v, max, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, Math.round(((v || 0) / max) * 100)))}%"></i></div>`;
export const section = (title, right = '') => `<div class="sec"><h2>${esc(title)}</h2>${right}</div>`;
export const stepper = (k, val, unit, step, cls = '') => `<div class="stepper ${cls}">
  <button data-act="wo-adj" data-k="${k}" data-d="${-step}">−</button>
  <div class="val" data-act="wo-type" data-k="${k}">${val}<small> ${unit}</small></div>
  <button data-act="wo-adj" data-k="${k}" data-d="${step}">+</button></div>`;
export const C = 2 * Math.PI * 90;
export function ring(frac, inner, color = 'var(--hero)') {
  const off = C * (1 - Math.max(0, Math.min(1, frac)));
  return `<div class="ring" style="width:220px;height:220px"><svg width="220" height="220" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="90" fill="none" stroke="var(--panel2)" stroke-width="12"/>
    <circle id="tring" cx="100" cy="100" r="90" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}"/></svg>
    <div class="in">${inner}</div></div>`;
}
export const fnum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
export const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
