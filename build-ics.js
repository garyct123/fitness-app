// 用法：node build-ics.js   → 依 plan.json 重新產生 reminders.ics（計畫改版後要執行並推上去）
import { readFileSync, writeFileSync } from 'node:fs';
import { buildICS } from './src/rules/reminders.js';

const plan = JSON.parse(readFileSync(new URL('./plan.json', import.meta.url)));
const appUrl = 'https://garyct123.github.io/fitness-app/';
const stamp = `${plan.testWeek[0].date.replaceAll('-', '')}T000000Z`; // 固定值，內容沒變就不會產生差異
writeFileSync(new URL('./reminders.ics', import.meta.url), buildICS(plan, { appUrl, stamp }));
console.log('reminders.ics 已更新');
