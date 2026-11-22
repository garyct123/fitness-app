// 組間倒數的聲音與語音（不震動）。iPhone 要先有一次點擊才能出聲，所以在「完成這組」時呼叫 unlock()。
let ctx = null;
export function unlock() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* 沒有音效也能用 */ }
}
export function beep(freq = 880, ms = 180) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + ms / 1000 + 0.05);
}
export function say(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* 不支援語音就只有嗶聲 */ }
}
let lock = null;
export async function keepAwake(on) {
  try {
    if (on && !lock && 'wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
    if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
