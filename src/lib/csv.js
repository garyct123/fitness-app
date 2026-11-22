// 匯出成 CSV（Excel 可開）。
const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows, headers) {
  return [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n') + '\r\n';
}

export function trainingCSV(store, days = {}) {
  const sessions = [...store.sessions()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const rows = [];
  for (const s of sessions) {
    const dayName = days[s.day]?.name ?? s.day;
    if (s.status === 'missed') {
      rows.push({ 日期: s.date, 類型: '沒練', 訓練日: dayName, 狀態: 'missed', 原因: s.reason, 說明: s.note });
      continue;
    }
    for (const x of store.setsOf(s.id).sort((a, b) => a.setNo - b.setNo)) {
      rows.push({
        日期: s.date, 類型: s.kind === 'test' ? '鑑測' : '正式', 訓練日: dayName, 動作: x.exerciseName ?? x.exerciseId,
        替換自: x.swappedFrom, 組: x.setNo, 重量kg: x.weight, 次數: x.reps, 還剩幾下: x.rir, 狀態: x.status, 原因: x.reason, 說明: x.note,
      });
    }
  }
  return toCSV(rows, ['日期', '類型', '訓練日', '動作', '替換自', '組', '重量kg', '次數', '還剩幾下', '狀態', '原因', '說明']);
}

export function dailyCSV(store) {
  const rows = [...store.allDays()].sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({
    日期: d.date, 體重kg: d.weight, 體脂: d.bodyFat, 就寢: d.bedTime, 起床: d.wakeTime, 睡眠小時: d.sleepManual, 靜止心率: d.restingHr,
    HIIT: d.hiitDone, 冷水澡: d.coldShower ? 1 : '', 肌酸: d.creatine ? 1 : '', 蛋白粉: d.proteinPowder ? 1 : '', 第一餐: d.firstMeal, 最後吃完: d.lastMealEnd,
    蛋白質g: d.proteinG, 水ml: d.waterMl, 咖啡茶cc: d.caffeineCc, 步數: d.steps, 破功: d.cheat ? 1 : '', 備註: d.cheatNote,
  }));
  return toCSV(rows, ['日期', '體重kg', '體脂', '就寢', '起床', '睡眠小時', '靜止心率', 'HIIT', '冷水澡', '肌酸', '蛋白粉', '第一餐', '最後吃完', '蛋白質g', '水ml', '咖啡茶cc', '步數', '破功', '備註']);
}
