# ML App 不具合分析と再発防止策

## 発生した不具合一覧

### 1. サーバー起動エラー（SyntaxError）

**症状**: Node.jsサーバーが起動しない

**原因**: `app.js` で `const fs` と `const path` が重複宣言されていた（行506-507）

**修正内容**:
- 重複宣言を削除
- ファイルヘッダーに `var fs = require('fs')` を追加

**再発防止策**:
- コード追加時は既存のrequire文を確認する
- ESLintの `no-redeclare` ルールを有効化する

---

### 2. Toast/ThemeManager初期化エラー（TypeError）

**症状**: コンソールに `Cannot read properties of null (reading 'appendChild')` エラー

**原因**:
- `toast.js` と `theme-manager.js` が `document.body` にアクセスするが、DOMが読み込み完了前にスクリプトが実行された

**修正内容**:
```javascript
// 修正前
window.themeManager = new ThemeManager();

// 修正後
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeManager);
} else {
    initThemeManager();
}
```

**再発防止策**:
- DOM操作を行うライブラリは必ず `DOMContentLoaded` を待つパターンを採用
- ライブラリ作成時のチェックリストに追加

---

### 3. モーダルが表示されない（visibility: hidden）

**症状**:
- 「学習を開始」「新規タスク」などのボタンをクリックしてもモーダルが表示されない
- DevToolsで確認すると `display: flex` は設定されているが見えない

**原因**:
- `common.css` の `.modal-overlay` に `visibility: hidden` が設定されている
- `.modal-overlay.active` クラスで `visibility: visible` になる設計
- JavaScriptで `style.display = 'flex'` のみ設定し、`active` クラスを追加していなかった

**CSS設計（common.css 230-245行）**:
```css
.modal-overlay {
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.3s, visibility 0.3s;
}
.modal-overlay.active {
    opacity: 1;
    visibility: visible;
}
```

**修正内容**:
全てのモーダル開閉関数に `classList.add/remove('active')` を追加:

```javascript
// 修正前
function openTrainingModal() {
    document.getElementById('trainingModal').style.display = 'flex';
}

// 修正後
function openTrainingModal() {
    var modal = document.getElementById('trainingModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}
```

**影響を受けた関数**:
- `openTrainingModal` / `closeTrainingModal`
- `openRunDetailModal` / `closeRunDetailModal`
- `openPredictModal` / `closePredictModal`
- `openModelsModal` / `closeModelsModal`
- `openTaskSelectModal` / `closeTaskSelectModal`
- `openOptimizeModal` / `closeOptimizeModal`

**再発防止策**:
1. **モーダルユーティリティ関数の作成** - 以下のヘルパーを使用する

```javascript
// lib/modal-utils.js
function openModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}
```

2. **CSSとJSの連携ドキュメント化** - common.cssを使用する場合のモーダル操作ルールを明記

---

## 再発防止チェックリスト

### 新規モーダル作成時
- [ ] `modal-overlay` クラスを使用
- [ ] 開く際に `classList.add('active')` を設定
- [ ] 閉じる際に `classList.remove('active')` を設定
- [ ] `style.display` も適切に設定

### 新規ライブラリ作成時
- [ ] DOM操作がある場合は `DOMContentLoaded` を待つ
- [ ] グローバル変数/関数の重複をチェック

### コード追加時
- [ ] 既存のrequire/import文を確認
- [ ] 変数名の重複がないか確認

---

## 推奨設定

### ESLint設定追加
```json
{
  "rules": {
    "no-redeclare": "error",
    "no-undef": "error"
  }
}
```

### Git pre-commit hook
```bash
# 重複宣言チェック
grep -n "^const \|^var \|^let " app.js | sort -t: -k2 | uniq -d -f1
```

---

## 関連ファイル

| ファイル | 修正内容 |
|---------|---------|
| `app.js` | 重複require削除 |
| `lib/toast.js` | DOM ready待機 |
| `lib/theme-manager.js` | DOM ready待機 |
| `public/js/ml-app.js` | モーダルactive class追加 |
| `public/css/common.css` | 変更なし（参照のみ） |

---

作成日: 2026-01-10
