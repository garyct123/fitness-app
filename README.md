# 健身訓練 App（v0.1）

Gary 的 iPhone 網頁 App。內容照《增肌減脂訓練計畫》v3.3，需求見 PRD：
https://claude.ai/artifact/FXAhVzAEFLg9SpJGfPPAGR

## 結構
- `plan.json`：計畫內容（動作、組數、次數、休息、輪替、HIIT、時間表、目標）。計畫改版只改這裡，並更新 `planVersion`。
- `src/rules/`：規則（輪替、雙重進步法、HIIT 版本、今日指引），全部有測試。
- `src/store.js`：本機資料、匯出匯入。
- `src/app.js`：畫面。
- `sw.js`：離線快取，改版時把 VERSION 加一。

## 測試
    npm test        # node --test，不需要安裝套件

## 本機預覽
    python3 -m http.server 8765   # 打開 http://localhost:8765

## 已完成的開發項目
1–10、12（今日指引、逐組記錄、組間倒數、鑑測、跳過與換動作要選原因、每日清單、匯出還原、加到主畫面）。
未完成：13 發布到 iPhone（要 Gary 的 GitHub）、14 週回顧、15 成就。
