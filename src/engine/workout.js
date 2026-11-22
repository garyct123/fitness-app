// 訓練流程狀態機（純函式）。計時一律用時間戳算，重新整理或切換 App 回來都不會亂。
const clone = (x) => JSON.parse(JSON.stringify(x));

export function createSession({ id, kind, date, title, steps, meta = {} }) {
  return {
    id, kind, date, title, steps, meta, index: 0, status: 'ready', results: {},
    startedAt: null, stepStartedAt: null, pausedAt: null, pausedMs: 0, totalPausedMs: 0, endedAt: null, endedEarly: false,
  };
}

export const currentStep = (s) => s.steps[s.index];
const effNow = (s, now) => (s.status === 'paused' && s.pausedAt != null ? s.pausedAt : now);

export function stepElapsedMs(s, now) {
  if (s.stepStartedAt == null) return 0;
  return Math.max(0, effNow(s, now) - s.stepStartedAt - s.pausedMs);
}
export function stepRemainingSec(s, now) {
  const st = currentStep(s);
  if (!st || st.seconds == null) return null;
  return st.seconds - stepElapsedMs(s, now) / 1000;
}
export function totalElapsedMs(s, now) {
  if (s.startedAt == null) return 0;
  const end = s.status === 'finished' ? s.endedAt : effNow(s, now);
  return Math.max(0, end - s.startedAt - s.totalPausedMs);
}

export const workSteps = (s) => s.steps.filter((x) => x.kind !== 'rest');
export function nextWorkStep(s) {
  for (let i = s.index + 1; i < s.steps.length; i++) if (s.steps[i].kind !== 'rest') return s.steps[i];
  return null;
}
export function estimateTotalSec(s) {
  return s.steps.reduce((n, x) => {
    if (x.kind === 'rest' || x.kind === 'block') return n + (x.seconds || 0);
    if (x.kind === 'hiit') return n + (x.minutes || 0) * 60;
    if (x.kind === 'task') return n + 30;
    return n + 45; // 一組約 45 秒
  }, 0);
}
export function estimateRemainingSec(s, now) {
  let rest = 0;
  for (let i = s.index + 1; i < s.steps.length; i++) rest += estimateTotalSec({ steps: [s.steps[i]] });
  const cur = currentStep(s);
  const left = cur?.seconds != null ? Math.max(0, stepRemainingSec(s, now)) : estimateTotalSec({ steps: [cur] });
  return Math.round(rest + (cur ? left : 0));
}

function startStep(s, now) {
  s.stepStartedAt = now;
  s.pausedMs = 0;
  s.pausedAt = null;
}
function finish(s, now, early) {
  s.endedAt = s.status === 'paused' && s.pausedAt != null ? s.pausedAt : now;
  s.status = 'finished';
  s.endedEarly = early;
  s.pausedAt = null;
}
function advance(s, now, to = s.index + 1) {
  if (to >= s.steps.length) return finish(s, now, false);
  s.index = to;
  startStep(s, now);
}
function checkReason({ reason, note }) {
  if (!reason) throw new Error('請選原因');
  if (reason === 'other' && !note) throw new Error('選「其他」要寫說明');
}

export function reduce(prev, a) {
  const s = clone(prev);
  const st = currentStep(s);
  switch (a.type) {
    case 'start':
      if (s.status !== 'ready') return s;
      s.status = 'running';
      s.startedAt = a.now;
      startStep(s, a.now);
      return s;
    case 'pause':
      if (s.status !== 'running') return s;
      s.status = 'paused';
      s.pausedAt = a.now;
      return s;
    case 'resume':
      if (s.status !== 'paused') return s;
      s.pausedMs += a.now - s.pausedAt;
      s.totalPausedMs += a.now - s.pausedAt;
      s.pausedAt = null;
      s.status = 'running';
      return s;
    case 'tick':
      if (s.status === 'running' && st?.kind === 'rest' && stepRemainingSec(s, a.now) <= 0) advance(s, a.now);
      return s;
    case 'complete': {
      if (s.status !== 'running') return s;
      const r = { status: 'done', at: a.now };
      if (st.kind === 'set') Object.assign(r, { weight: a.actual?.weight ?? null, reps: a.actual?.reps ?? 0, rir: a.actual?.rir ?? null });
      if (st.kind === 'hiit') r.minutes = a.actual?.minutes ?? st.minutes;
      s.results[st.id] = r;
      advance(s, a.now);
      return s;
    }
    case 'skip': {
      if (s.status !== 'running' && s.status !== 'paused') return s;
      if (st.kind === 'set') {
        checkReason(a);
        s.results[st.id] = { status: 'skipped', reason: a.reason, note: a.note || '', at: a.now };
      } else if (st.kind !== 'rest') {
        s.results[st.id] = { status: 'skipped', at: a.now };
      }
      if (s.status === 'paused') { s.pausedMs += a.now - s.pausedAt; s.totalPausedMs += a.now - s.pausedAt; s.status = 'running'; }
      advance(s, a.now);
      return s;
    }
    case 'back': {
      let j = s.index - 1;
      while (j >= 0 && s.steps[j].kind === 'rest') j--;
      if (j < 0) return s;
      for (let i = j; i <= s.index; i++) delete s.results[s.steps[i].id];
      s.index = j;
      startStep(s, a.now);
      if (s.status === 'paused') s.pausedAt = a.now;
      return s;
    }
    case 'finishExercise': {
      let k = s.index;
      while (k >= 0 && s.steps[k].kind !== 'set') k--;
      if (k < 0) return s;
      const ex = s.steps[k].exerciseId;
      let i = s.index;
      while (i < s.steps.length && (s.steps[i].kind === 'rest' || (s.steps[i].kind === 'set' && s.steps[i].exerciseId === ex))) {
        if (s.steps[i].kind === 'set' && !s.results[s.steps[i].id]) s.results[s.steps[i].id] = { status: 'omitted', at: a.now };
        i++;
      }
      if (s.status === 'paused') { s.pausedMs += a.now - s.pausedAt; s.totalPausedMs += a.now - s.pausedAt; s.status = 'running'; }
      advance(s, a.now, i);
      return s;
    }
    case 'swap': {
      // 換動作：之後同動作的組都改成新動作，並記下原因
      if (st?.kind !== 'set') return s;
      checkReason(a);
      if (!a.name) throw new Error('請寫要換成什麼動作');
      const ex = st.exerciseId;
      s.meta.swaps = { ...(s.meta.swaps || {}), [ex]: { from: st.swappedFrom || st.name, to: a.name, reason: a.reason, note: a.note || '' } };
      for (const x of s.steps) {
        if (x.kind === 'set' && x.exerciseId === ex && !s.results[x.id]) { x.swappedFrom = x.swappedFrom || x.name; x.name = a.name; }
      }
      return s;
    }
    case 'extend':
      if (st?.seconds != null) st.seconds = Math.max(5, st.seconds + a.sec);
      return s;
    case 'finish':
      if (s.status === 'finished') return s;
      finish(s, a.now, Boolean(a.early));
      return s;
    case 'editResult':
      s.results[a.stepId] = { ...s.results[a.stepId], ...a.actual };
      return s;
    default:
      return s;
  }
}

/** 轉成要存進資料層的組紀錄（只含真的做完或有原因跳過的組） */
export function resultsToSets(s) {
  return s.steps
    .filter((x) => x.kind === 'set' && s.results[x.id] && s.results[x.id].status !== 'omitted')
    .map((x) => {
      const r = s.results[x.id];
      return {
        stepId: x.id, exerciseId: x.exerciseId, exerciseName: x.name, swappedFrom: x.swappedFrom, setNo: x.setNo, status: r.status,
        weight: r.weight ?? null, reps: r.reps ?? 0, rir: r.rir ?? null, reason: r.reason, note: r.note, test: x.test,
      };
    });
}
