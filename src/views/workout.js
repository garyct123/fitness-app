// 訓練執行畫面（全螢幕）：晚上重訓、早晨訓練、拉伸共用同一套流程。
import { buildEveningSteps, buildMorningSteps, buildStretchSteps } from '../engine/steps.js';
import {
  createSession, reduce, currentStep, stepRemainingSec, totalElapsedMs, resultsToSets, workSteps, nextWorkStep,
  estimateTotalSec, estimateRemainingSec,
} from '../engine/workout.js';
import { nextTarget } from '../rules/progression.js';
import { unlock, beep, say, keepAwake } from '../sound.js';
import { fmtDur, fmtHM } from '../lib/time.js';
import { esc, ring, stepper, fnum, bar } from '../ui/kit.js';

export function createWorkout(ctx) {
  const { plan, store } = ctx;
  let s = null, draft = null, overlay = null, timer = null, announced = null, lastSec = null, ended = false;
  const exOf = (id) => Object.values(plan.days).flatMap((d) => d.exercises).find((e) => e.id === id);
  const prefs = () => store.prefs();

  function dispatch(a) {
    s = reduce(s, { ...a, now: Date.now() });
    store.setActive(s);
    render();
  }
  function safe(a) {
    try { dispatch(a); } catch (e) { ctx.toast(e.message); }
  }

  function open(spec) {
    let steps, title;
    if (spec.kind === 'evening') {
      const skip = spec.test ? plan.testWeek.find((t) => t.date === spec.date)?.skip || [] : [];
      steps = buildEveningSteps(plan, spec.dayId, { history: store.history, startWeight: store.startWeight, test: spec.test, skip });
      title = `${plan.days[spec.dayId].name}${spec.test ? '鑑測' : ''}`;
    } else if (spec.kind === 'morning') {
      steps = buildMorningSteps(plan, spec.version);
      title = '早晨訓練';
    } else {
      steps = buildStretchSteps(plan);
      title = '拉伸修復';
    }
    s = createSession({ id: `${spec.kind}-${Date.now()}`, kind: spec.kind, date: spec.date, title, steps, meta: { ...spec } });
    store.setActive(s);
    show();
  }
  function resume() {
    s = store.getActive();
    if (s) show();
  }
  function show() {
    if (!overlay) { overlay = document.createElement('div'); overlay.className = 'wo'; overlay.id = 'wo'; document.body.appendChild(overlay); }
    overlay.style.display = '';
    announced = null; lastSec = null; ended = false;
    keepAwake(true);
    clearInterval(timer);
    timer = setInterval(tick, 250);
    render();
  }
  function minimize() {
    clearInterval(timer);
    keepAwake(false);
    if (overlay) overlay.style.display = 'none';
    ctx.render();
  }
  function close() {
    clearInterval(timer);
    keepAwake(false);
    overlay?.remove();
    overlay = null;
    s = null;
    store.clearActive();
    ctx.render();
  }
  const isOpen = () => Boolean(overlay && overlay.style.display !== 'none');

  // ---------- 計時 ----------
  function tick() {
    if (!s || s.status === 'finished' || s.status === 'ready') return;
    const before = s.index;
    s = reduce(s, { type: 'tick', now: Date.now() });
    if (s.index !== before) { store.setActive(s); render(); announce(); return; }
    paint();
  }
  function paint() {
    const now = Date.now();
    const st = currentStep(s);
    const t = document.getElementById('telapsed');
    if (t) t.textContent = fmtDur(totalElapsedMs(s, now) / 1000);
    if (!st || st.seconds == null) return;
    const rem = stepRemainingSec(s, now);
    const shown = Math.max(0, Math.ceil(rem));
    const num = document.getElementById('tnum');
    if (num) num.textContent = fmtDur(shown);
    const r = document.getElementById('tring');
    if (r) r.setAttribute('stroke-dashoffset', String((2 * Math.PI * 90) * (1 - Math.max(0, Math.min(1, rem / st.seconds)))));
    if (st.moves?.length) {
      const per = st.seconds / st.moves.length;
      const i = Math.min(st.moves.length - 1, Math.max(0, Math.floor((st.seconds - rem) / per)));
      document.querySelectorAll('.moves div').forEach((d, k) => d.classList.toggle('on', k === i));
    }
    if (s.status === 'running' && shown !== lastSec) {
      lastSec = shown;
      if (prefs().beep) {
        if (shown > 0 && shown <= 5) beep(660, 120);
        if (shown === 0 && !ended) { ended = true; beep(880, 220); setTimeout(() => beep(880, 220), 300); if (st.kind !== 'rest') speak('時間到'); }
      }
    }
  }
  function speak(t) { if (prefs().voice && s?.status !== 'paused') say(t); }

  // ---------- 畫面 ----------
  function render() {
    if (!overlay || !s) return;
    const now = Date.now();
    let body;
    if (s.status === 'ready') body = readyView();
    else if (s.status === 'finished') body = summaryView();
    else body = stepView(now);
    overlay.innerHTML = body;
    lastSec = null; ended = false;
    paint();
  }
  const top = (now) => {
    const ws = workSteps(s);
    const doneN = ws.filter((x) => s.results[x.id]).length;
    return `<div class="wo-top"><button data-act="wo-min">縮小</button>
      <div class="center"><div class="bold">${esc(s.title)}</div><div class="xs muted">已進行 <span id="telapsed">${fmtDur(totalElapsedMs(s, now) / 1000)}</span> · 剩約 ${fmtHM(estimateRemainingSec(s, now))}</div></div>
      <button data-act="wo-end">結束</button></div>
      <div style="padding:8px 16px 0">${bar(doneN, ws.length)}</div>`;
  };
  function readyView() {
    const sets = s.steps.filter((x) => x.kind === 'set');
    const exs = [...new Map(sets.map((x) => [x.exerciseId, x])).values()];
    const list = s.kind === 'evening'
      ? exs.map((x) => `<div class="row between"><span>${esc(x.name)}</span><span class="muted">${x.totalSets} 組 · ${x.test ? '找 8 下的重量' : `${x.targetWeight ?? '?'} kg × ${x.targetReps}`}</span></div>`).join('')
      : s.steps.map((x) => `<div class="row between"><span>${esc(x.title)}</span><span class="muted">${x.seconds ? fmtHM(x.seconds) : x.minutes ? `${x.minutes} 分` : ''}</span></div>`).join('');
    return `<div class="wo-top"><button data-act="wo-min">返回</button><div></div><div></div></div>
      <div class="wo-mid"><div class="kick">${s.kind === 'evening' ? '晚間訓練' : s.kind === 'morning' ? '早晨訓練' : '拉伸修復'}</div><h1>${esc(s.title)}</h1>
      <div class="goal">預估 ${fmtHM(estimateTotalSec(s))}</div>
      <div class="moves" style="max-width:420px;color:var(--text)">${list}</div>
      ${s.meta.version ? `<div class="muted small mt">今天的版本：${esc(plan.hiit.versions[s.meta.version].name)}</div>` : ''}</div>
      <div class="wo-bar"><button class="b-primary b-big b-block" data-act="wo-start">開始</button></div>`;
  }
  function stepView(now) {
    const st = currentStep(s);
    const paused = s.status === 'paused';
    let mid = '';
    let main = '';
    if (st.kind === 'set') {
      if (!draft || draft.id !== st.id) draft = initDraft(st);
      const ex = exOf(st.exerciseId);
      const exs = [...new Set(s.steps.filter((x) => x.kind === 'set').map((x) => x.exerciseId))];
      const last = store.lastSets(st.exerciseId);
      const goal = st.test ? '找「做 8 下、還剩 1–2 下」的重量' : `目標 ${st.targetWeight ?? '?'} kg × ${st.targetReps} 下`;
      mid = `<div class="kick">動作 ${exs.indexOf(st.exerciseId) + 1}/${exs.length} · 第 ${st.setNo}/${st.totalSets} 組</div>
        <h1>${esc(st.name)}</h1>${st.swappedFrom ? `<div class="xs muted">替換自 ${esc(st.swappedFrom)}</div>` : `<div class="xs dim">${esc(st.en || '')}</div>`}
        <div class="goal">${goal}${st.unilateral ? `<div class="small muted">${esc(st.unilateral)}</div>` : ''}</div>
        <div class="small muted">${ex ? `${ex.repMin}–${ex.repMax} 下` : ''} · ${last ? `上次 ${last.sets.map((x) => `${fnum(x.weight)}×${x.reps}`).join('、')}` : '還沒有紀錄'}</div>
        ${stepper('weight', fnum(draft.weight), 'kg', st.body === 'lower' ? 5 : 2.5)}
        ${stepper('reps', draft.reps, '下', 1)}
        <div class="xs muted">還剩幾下</div><div class="rirs">${[0, 1, 2, 3, 4].map((n) => `<button data-act="wo-rir" data-n="${n}" class="${draft.rir === n ? 'on' : ''}">${n === 4 ? '4+' : n}</button>`).join('')}</div>
        <details class="mt"><summary>動作要點</summary><div class="small muted">${esc(st.cue)}</div></details>`;
      main = `<button class="b-primary b-big b-block" data-act="wo-done">完成這組</button>
        <div class="row mt-s"><button class="grow" data-act="wo-swap">換動作</button>${st.test ? '<button class="grow" data-act="wo-extest">這個動作測完了</button>' : ''}</div>`;
    } else if (st.kind === 'rest') {
      const nx = nextWorkStep(s);
      mid = `<div class="kick">組間休息</div>${ring(1, `<div class="num" id="tnum">${fmtDur(st.seconds)}</div>`)}
        <div class="row mt"><button data-act="wo-ext" data-s="-30">−30 秒</button><button data-act="wo-ext" data-s="30">+30 秒</button></div>
        <div class="next"><div class="xs muted">下一組</div>${nx ? `<div class="bold">${esc(nx.name)} 第 ${nx.setNo} 組</div><div class="small hero-c">${nx.test ? '鑑測重量' : `${nx.targetWeight ?? '?'} kg × ${nx.targetReps}`}</div>` : '<div class="bold">全部完成</div>'}</div>`;
      main = `<button class="b-primary b-big b-block" data-act="wo-done">${nx ? '開始下一組' : '結束訓練'}</button>`;
    } else if (st.kind === 'block') {
      mid = `<div class="kick">${{ warmup: '暖身', cold: '冷水澡', stretch: '拉伸', walk: '快走' }[st.section] || ''}</div><h1>${esc(st.title)}</h1>
        ${ring(1, `<div class="num" id="tnum">${fmtDur(st.seconds)}</div>`)}
        ${st.moves?.length ? `<div class="moves">${st.moves.map((m) => `<div>${esc(m)}</div>`).join('')}</div>` : ''}
        ${st.cue ? `<div class="small muted mt">${esc(st.cue)}</div>` : ''}${st.note ? `<div class="small muted mt" style="max-width:380px">${esc(st.note)}</div>` : ''}`;
      main = `<button class="b-ok b-big b-block" data-act="wo-done">完成</button>`;
    } else if (st.kind === 'hiit') {
      if (!draft || draft.id !== st.id) draft = { id: st.id, minutes: st.minutes };
      mid = `<div class="kick">HIIT · ${esc(st.title)}</div><h1>${st.minutes} 分鐘</h1><div class="goal" style="max-width:380px">${esc(st.content)}</div>
        ${st.video ? `<a class="btn b-ghost" href="${st.video}" target="_blank" rel="noopener">看示範影片</a>` : ''}
        <div class="xs muted mt">實際做了幾分鐘</div>${stepper('minutes', draft.minutes, '分', 1)}`;
      main = `<button class="b-ok b-big b-block" data-act="wo-done">完成 HIIT</button>`;
    } else {
      mid = `<div class="kick">拉伸</div><h1>${esc(st.title)}</h1><div class="goal">${esc(st.text)}</div><div class="small muted">${esc(st.cue || '')}</div>`;
      main = `<button class="b-ok b-big b-block" data-act="wo-done">完成</button>`;
    }
    const canBack = s.steps.slice(0, s.index).some((x) => x.kind !== 'rest');
    return `${top(now)}<div class="wo-mid">${paused ? '<div class="pill y">已暫停</div>' : ''}${mid}</div>
      <div class="wo-bar"><div class="grid3"><button data-act="wo-back" ${canBack ? '' : 'disabled'}>返回</button>
      <button data-act="wo-pause">${paused ? '繼續' : '暫停'}</button><button data-act="wo-skip">跳過</button></div>${main}</div>`;
  }
  function initDraft(st) {
    const prev = [...s.steps].reverse().find((x) => x.kind === 'set' && x.exerciseId === st.exerciseId && s.results[x.id]?.status === 'done');
    const last = store.lastSets(st.exerciseId)?.sets.at(-1);
    return {
      id: st.id,
      weight: (prev ? s.results[prev.id].weight : st.targetWeight) ?? last?.weight ?? 0,
      reps: st.targetReps, rir: 2,
    };
  }

  // ---------- 結果 ----------
  function summaryView() {
    const now = Date.now();
    const sets = resultsToSets(s);
    const done = sets.filter((x) => x.status === 'done');
    let body = '';
    if (s.kind === 'evening') {
      body = `<div class="card center"><div class="black" style="font-size:1.6rem">${done.length} 組完成${sets.length - done.length ? `，跳過 ${sets.length - done.length}` : ''}</div>
        <div class="muted small">總量 ${Math.round(done.reduce((n, x) => n + (x.weight || 0) * x.reps, 0))} kg · ${fmtHM(totalElapsedMs(s, now) / 1000)}</div></div>
        <div class="xs muted" style="margin:0 4px 6px">點 ± 可以修正重量和次數</div>
        ${sets.map((x) => x.status !== 'done' ? `<div class="sumset"><span>${esc(x.exerciseName)} 第${x.setNo}組</span><span class="bad-c">跳過</span></div>`
          : `<div class="sumset"><span style="flex:1">${esc(x.exerciseName)} #${x.setNo}</span>
            <span class="stepper sm"><button data-act="wo-sum" data-id="${x.stepId}" data-k="weight" data-d="-2.5">−</button><span class="val">${fnum(x.weight)}</span><button data-act="wo-sum" data-id="${x.stepId}" data-k="weight" data-d="2.5">+</button></span>
            <span class="stepper sm"><button data-act="wo-sum" data-id="${x.stepId}" data-k="reps" data-d="-1">−</button><span class="val">${x.reps}</span><button data-act="wo-sum" data-id="${x.stepId}" data-k="reps" data-d="1">+</button></span></div>`).join('')}
        ${s.meta.test ? '<div class="card small muted">存檔後，每個動作最後一組的重量會當成起始重量，可到「設定」修改。</div>' : nextPreview()}`;
    } else {
      const ok = (id) => s.results[id]?.status === 'done';
      body = `<div class="card">${s.steps.map((x) => `<div class="row between check"><span class="t">${esc(x.title)}</span><span class="${ok(x.id) ? 'ok-c' : 'dim'}">${ok(x.id) ? '完成' : '略過'}</span></div>`).join('')}</div>
        <div class="muted small center">${fmtHM(totalElapsedMs(s, now) / 1000)}</div>`;
    }
    return `<div class="wo-top"><div></div><div class="bold">${s.endedEarly ? '提早結束' : '訓練完成'}</div><div></div></div>
      <div class="wo-mid" style="justify-content:flex-start;align-items:stretch;text-align:left"><div class="trophy">${s.endedEarly ? '📝' : '🏆'}</div>${body}</div>
      <div class="wo-bar"><button class="b-primary b-big b-block" data-act="wo-save">儲存</button><button class="b-ghost b-block mt-s" data-act="wo-discard">不儲存</button></div>`;
  }
  function nextPreview() {
    const seen = new Set();
    const rows = s.steps.filter((x) => x.kind === 'set' && !seen.has(x.exerciseId) && seen.add(x.exerciseId)).map((x) => {
      const ex = exOf(x.exerciseId);
      const mine = resultsToSets(s).filter((y) => y.exerciseId === x.exerciseId && y.status === 'done');
      if (!mine.length) return '';
      const t = nextTarget(ex, [mine, ...store.history(x.exerciseId)], store.startWeight(x.exerciseId));
      return `<div class="row between small"><span>${esc(ex.name)}</span><span class="${t.reason.startsWith('increase') ? 'ok-c' : ''}">${t.weight} kg × ${t.reps.join('/')}${t.reason.startsWith('increase') ? ' ↑加重' : ''}</span></div>`;
    }).join('');
    return rows ? `<div class="card"><div class="xs muted">下次這個動作</div>${rows}</div>` : '';
  }
  function save() {
    const { kind, date } = s.meta;
    const doneIds = Object.entries(s.results).filter(([, r]) => r.status === 'done').map(([k]) => k);
    if (kind === 'evening') {
      const sets = resultsToSets(s);
      if (!sets.length) { ctx.toast('沒有任何一組紀錄，不儲存'); return close(); }
      const swaps = Object.fromEntries(Object.entries(s.meta.swaps || {}).map(([k, v]) => [k, v.to]));
      const status = s.endedEarly || sets.some((x) => x.status !== 'done') ? 'partial' : 'done';
      const rec = store.saveWorkout({ kind, date, day: s.meta.dayId, test: s.meta.test, status, sets, swaps });
      if (swaps && Object.keys(swaps).length) {
        store.updateSession(rec.id, { swapReasons: Object.fromEntries(Object.entries(s.meta.swaps).map(([k, v]) => [k, { reason: v.reason, note: v.note }])) });
      }
      if (s.meta.test) {
        for (const x of sets.filter((y) => y.status === 'done')) store.setStartWeight(x.exerciseId, x.weight);
      }
      if (!store.getDay(date).done.includes('evening')) store.toggleDone(date, 'evening');
    } else if (kind === 'morning') {
      const patch = { warmupDone: doneIds.includes('warm') };
      if (doneIds.includes('hiit')) {
        Object.assign(patch, { hiitSuggested: s.meta.version, hiitDone: s.meta.version, hiitMinutes: s.results.hiit.minutes ?? plan.hiit.versions[s.meta.version].minutes });
      }
      if (doneIds.includes('cold')) patch.coldShower = true;
      store.updateDay(date, patch);
      const d = store.getDay(date);
      if (doneIds.includes('hiit') && !d.done.includes('hiit')) store.toggleDone(date, 'hiit');
      if (doneIds.includes('cold') && !store.getDay(date).done.includes('cold-shower')) store.toggleDone(date, 'cold-shower');
    } else if (doneIds.length) {
      store.updateDay(date, { stretchDone: true });
      if (!store.getDay(date).done.includes('evening')) store.toggleDone(date, 'evening');
    }
    ctx.toast('已儲存');
    close();
  }

  // ---------- 操作 ----------
  const A = ctx.actions;
  A['wo-min'] = () => minimize();
  A['wo-start'] = () => { unlock(); dispatch({ type: 'start' }); announce(); };
  A['wo-pause'] = () => dispatch({ type: s.status === 'paused' ? 'resume' : 'pause' });
  A['wo-back'] = () => dispatch({ type: 'back' });
  A['wo-ext'] = (el) => dispatch({ type: 'extend', sec: Number(el.dataset.s) });
  A['wo-rir'] = (el) => { draft.rir = Number(el.dataset.n); render(); };
  A['wo-adj'] = (el) => {
    const k = el.dataset.k;
    draft[k] = Math.max(0, Math.round((draft[k] + Number(el.dataset.d)) * 100) / 100);
    render();
  };
  A['wo-type'] = async (el) => {
    const k = el.dataset.k;
    const v = await ctx.askNumber(k === 'weight' ? '重量（kg）' : '次數', draft[k]);
    if (v != null) { draft[k] = v; render(); }
  };
  A['wo-done'] = () => {
    unlock();
    const st = currentStep(s);
    const green = document.createElement('div');
    green.className = 'flash';
    document.body.appendChild(green);
    setTimeout(() => green.remove(), 500);
    const actual = st.kind === 'set' ? { weight: draft.weight, reps: draft.reps, rir: draft.rir } : st.kind === 'hiit' ? { minutes: draft.minutes } : undefined;
    dispatch({ type: 'complete', actual });
    announce();
  };
  A['wo-skip'] = async () => {
    const st = currentStep(s);
    if (st.kind === 'set') {
      const r = await ctx.askReason(`跳過 ${st.name} 第 ${st.setNo} 組，原因？`);
      if (!r) return;
      safe({ type: 'skip', ...r });
    } else dispatch({ type: 'skip' });
    announce();
  };
  A['wo-swap'] = async () => {
    const st = currentStep(s);
    const name = await ctx.askText(`把「${st.name}」換成什麼動作？`);
    if (!name) return;
    const r = await ctx.askReason(`為什麼換掉 ${st.name}？`);
    if (!r) return;
    safe({ type: 'swap', name, ...r });
  };
  A['wo-extest'] = () => { dispatch({ type: 'finishExercise' }); announce(); };
  A['wo-end'] = async () => {
    const c = await ctx.choose('結束這次訓練？', [
      { id: 'save', label: '結束並儲存已完成的部分' }, { id: 'drop', label: '放棄，不存任何紀錄', danger: true }, { id: 'back', label: '繼續訓練' }]);
    if (c === 'save') dispatch({ type: 'finish', early: true });
    if (c === 'drop' && confirm('放棄這次訓練，已記的組都不會存。確定嗎？')) close();
  };
  A['wo-sum'] = (el) => {
    const r = s.results[el.dataset.id];
    const k = el.dataset.k;
    dispatch({ type: 'editResult', stepId: el.dataset.id, actual: { [k]: Math.max(0, Math.round(((r[k] || 0) + Number(el.dataset.d)) * 100) / 100) } });
  };
  A['wo-save'] = () => save();
  A['wo-discard'] = () => { if (confirm('不儲存這次紀錄？')) close(); };
  function announce() {
    const st = s && currentStep(s);
    if (!st || s.status === 'finished' || announced === st.id) return;
    announced = st.id;
    if (st.kind === 'set') speak(`${st.name}，第${st.setNo}組，${st.test ? '鑑測' : `${fnum(st.targetWeight ?? 0)}公斤，${st.targetReps}下`}`);
    else if (st.kind === 'rest') speak(`休息 ${Math.round(st.seconds)} 秒`);
    else if (st.kind === 'block' || st.kind === 'hiit') speak(st.title);
  }

  return { open, resume, isOpen, hasActive: () => Boolean(store.getActive()), show, announce };
}
