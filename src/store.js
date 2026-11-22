// 資料層：所有資料存在本機（瀏覽器 localStorage），可整包匯出、匯入。
const KEY = 'fitness-app-v1';
const EMPTY = () => ({ days: {}, sessions: [], sets: [], startWeights: {}, weekly: {} });

export function memoryBackend() {
  let raw = null;
  return { load: () => raw, save: (s) => { raw = s; } };
}

export function localBackend(ls = globalThis.localStorage) {
  return {
    load: () => { try { return ls.getItem(KEY); } catch { return null; } },
    save: (s) => { ls.setItem(KEY, s); },
  };
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function requireReason(x) {
  if (!x.reason) throw new Error('請選原因');
  if (x.reason === 'other' && !x.note) throw new Error('選「其他」要寫說明');
}

export function createStore(backend) {
  let data;
  try { data = { ...EMPTY(), ...JSON.parse(backend.load() || 'null') }; } catch { data = EMPTY(); }
  const persist = () => backend.save(JSON.stringify(data));

  const api = {
    getDay(date) {
      return { date, done: [], ...(data.days[date] || {}) };
    },
    updateDay(date, patch) {
      data.days[date] = { ...api.getDay(date), ...patch };
      persist();
      return data.days[date];
    },
    toggleDone(date, id) {
      const d = api.getDay(date);
      const done = d.done.includes(id) ? d.done.filter((x) => x !== id) : [...d.done, id];
      return api.updateDay(date, { done });
    },

    sessions() { return [...data.sessions]; },
    session(id) { return data.sessions.find((s) => s.id === id); },
    startSession({ date, day, kind }) {
      const s = { id: uid(), date, day, kind, status: 'in-progress', startedAt: new Date().toISOString() };
      data.sessions.push(s);
      persist();
      return s;
    },
    finishSession(id, status = 'done') {
      const s = api.session(id);
      Object.assign(s, { status, endedAt: new Date().toISOString() });
      persist();
      return s;
    },
    updateSession(id, patch) {
      Object.assign(api.session(id), patch);
      persist();
      return api.session(id);
    },
    /** 換動作：一定要有原因。之後這次訓練記的組都標成替換後的動作。 */
    swapExercise(id, exerciseId, { name, reason, note }) {
      if (!name) throw new Error('請寫要換成什麼動作');
      requireReason({ reason, note });
      const s = api.session(id);
      return api.updateSession(id, {
        swaps: { ...(s.swaps || {}), [exerciseId]: name },
        swapReasons: { ...(s.swapReasons || {}), [exerciseId]: { reason, note: note || '' } },
      });
    },
    markMissed({ date, day, reason, note }) {
      requireReason({ reason, note });
      const s = { id: uid(), date, day, kind: 'regular', status: 'missed', reason, note: note || '' };
      data.sessions.push(s);
      persist();
      return s;
    },

    logSet(sessionId, set) {
      const status = set.status || 'done';
      if (status === 'skipped') requireReason(set);
      const row = { ...set, status, sessionId, at: new Date().toISOString() };
      const i = data.sets.findIndex((x) => x.sessionId === sessionId && x.exerciseId === set.exerciseId && x.setNo === set.setNo);
      if (i >= 0) data.sets[i] = row; else data.sets.push(row);
      persist();
      return row;
    },
    setsOf(sessionId) { return data.sets.filter((x) => x.sessionId === sessionId); },

    /** 這個動作的正式訓練紀錄，依訓練分組，最新在前。 */
    history(exerciseId) {
      const regular = data.sessions
        .filter((s) => s.kind === 'regular' && s.status !== 'missed')
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      return regular
        .map((s) => data.sets.filter((x) => x.sessionId === s.id && x.exerciseId === exerciseId).sort((a, b) => a.setNo - b.setNo))
        .filter((g) => g.length > 0);
    },
    /** 最近一次（含鑑測）做這個動作的組，給畫面顯示「上次」。 */
    lastSets(exerciseId) {
      const all = [...data.sessions].sort((a, b) => (a.date < b.date ? 1 : -1));
      for (const s of all) {
        const g = data.sets.filter((x) => x.sessionId === s.id && x.exerciseId === exerciseId && x.status === 'done');
        if (g.length) return { date: s.date, kind: s.kind, sets: g.sort((a, b) => a.setNo - b.setNo) };
      }
      return null;
    },

    startWeight(exerciseId) { return data.startWeights[exerciseId] ?? null; },
    setStartWeight(exerciseId, w) { data.startWeights[exerciseId] = w; persist(); },

    updateWeek(weekStart, patch) {
      data.weekly[weekStart] = { ...(data.weekly[weekStart] || {}), ...patch };
      persist();
    },
    week(weekStart) { return data.weekly[weekStart] || {}; },
    allDays() { return Object.values(data.days); },

    /** 清掉全部資料（設定頁的重置按鈕用）。 */
    reset() {
      data = EMPTY();
      persist();
    },

    exportJSON() {
      return JSON.stringify({ app: 'fitness-app', version: 1, exportedAt: new Date().toISOString(), data }, null, 1);
    },
    importJSON(text) {
      const parsed = JSON.parse(text);
      if (parsed.app !== 'fitness-app' || !parsed.data || !Array.isArray(parsed.data.sessions)) {
        throw new Error('這不是本 App 匯出的檔案');
      }
      data = { ...EMPTY(), ...parsed.data };
      persist();
    },
  };
  return api;
}
