# 統合前提での改善点・確認事項レビュー

**作成日**: 2026-01-09
**対象**: Database App、ML App、ML Training の3アプリケーション統合

---

## 📋 エグゼクティブサマリー

### 現状
- **3つの独立したアプリケーション**が存在
- 相互のナビゲーションは実装済み
- データ連携はLocalStorage経由

### 統合の方向性
- **シングルページアプリケーション（SPA）化**が最適
- タブ/ビュー切り替えで3つの機能を統合
- 統一されたUI/UXデザイン

---

## 🎯 改善点（重要度順）

---

## 【重要度：最高】データ管理・永続化

### 1. LocalStorage依存の問題 ⭐⭐⭐⭐⭐

**現状の問題**:
```javascript
// 3つのアプリで異なるキーを使用
localStorage.getItem('mlapp_datasets_all')      // ML App
localStorage.getItem('mlapp_temp_dataset')      // 一時データセット
localStorage.getItem('mlapp_dataset')           // Database → ML App転送用
```

**問題点**:
- データ同期の不整合
- ブラウザを閉じるとデータが残る（意図しない永続化）
- 複数タブで開くとデータ競合の可能性
- ストレージ制限（5-10MB）
- セキュリティリスク（ブラウザストレージは平文）

**改善案**:
```javascript
// 統一されたデータストア
class DataStore {
    constructor() {
        this.datasets = new Map();
        this.models = new Map();
        this.runs = new Map();
    }

    // メモリベースの一元管理
    saveDataset(dataset) {
        this.datasets.set(dataset.id, dataset);
        this.persistToStorage(); // オプションで永続化
    }

    // サーバーサイドAPI（Phase 1B）
    async syncToServer() {
        await fetch('/api/datasets', {
            method: 'POST',
            body: JSON.stringify(Array.from(this.datasets.values()))
        });
    }
}
```

**確認事項**:
- [ ] データの永続化は本当に必要か？（セッションベースでよいか）
- [ ] Databricks統合時のデータ保存先はどこか？（Unity Catalog Tables/Volumes）
- [ ] マルチユーザー対応時のデータ分離方法は？

**実装優先度**: Phase 1B（Databricks統合時に必須）

---

### 2. データセット転送の非効率性 ⭐⭐⭐⭐⭐

**現状の問題**:
```javascript
// Database App → ML Training
// 1. LocalStorageに保存
localStorage.setItem('mlapp_datasets_all', JSON.stringify(datasets));
localStorage.setItem('mlapp_temp_dataset', JSON.stringify(exportData));

// 2. ML Trainingで読み込み
const tempDataset = JSON.parse(localStorage.getItem('mlapp_temp_dataset'));

// 3. Python MLサービスには転送されていない
// → dataset IDだけ送信して、サーバー側で処理
```

**問題点**:
- データが3箇所に重複（ブラウザメモリ、LocalStorage × 2箇所、Python側は未保存）
- データサイズが大きいとLocalStorage制限に到達
- Python MLサービスへの実データ転送が未実装

**改善案（短期：Phase 1A+）**:
```javascript
// サーバーサイドAPIでデータセット保存
async function saveDatasetToServer(dataset) {
    const formData = new FormData();

    // CSVファイルとして送信
    const csv = convertToCSV(dataset.data);
    const blob = new Blob([csv], { type: 'text/csv' });
    formData.append('file', blob, dataset.name + '.csv');
    formData.append('metadata', JSON.stringify({
        id: dataset.id,
        name: dataset.name,
        createdAt: dataset.createdAt
    }));

    await fetch('/api/datasets/upload', {
        method: 'POST',
        body: formData
    });
}
```

**改善案（長期：Phase 1B）**:
```python
# app.js (Node.js側)
app.post('/api/datasets/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    const metadata = JSON.parse(req.body.metadata);

    // Python MLサービスに転送
    const formData = new FormData();
    formData.append('file', fs.createReadStream(file.path));
    formData.append('metadata', JSON.stringify(metadata));

    await axios.post('http://localhost:5000/api/datasets/upload', formData);

    res.json({ success: true, dataset_id: metadata.id });
});
```

**確認事項**:
- [ ] データセットの最大サイズは？（目安：10MB、100MB、1GB？）
- [ ] CSV以外のフォーマット（Excel、Parquet等）のサポートは必要か？
- [ ] データセットのバージョン管理は必要か？

**実装優先度**: Phase 1A+ または Phase 1B初期

---

## 【重要度：高】UI/UX統合

### 3. デザインシステムの不統一 ⭐⭐⭐⭐

**現状の問題**:

| アプリ | デザイン | カラーパレット | フォント |
|--------|---------|---------------|---------|
| Database App | ダーク、現代的 | #0a0a0f, #6366f1 | Inter |
| ML App | ライト、Tailwind風 | #f9fafb, #6366f1 | Inter |
| ML Training | グラデーション | #667eea, #764ba2 | System fonts |

**改善案**:
```css
/* 統一されたデザインシステム */
:root {
    /* 共通カラーパレット */
    --color-primary: #6366f1;
    --color-secondary: #8b5cf6;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-error: #ef4444;

    /* ダーク/ライトモード対応 */
    --bg-primary: light-dark(#ffffff, #0a0a0f);
    --bg-secondary: light-dark(#f9fafb, #12121a);
    --text-primary: light-dark(#1f2937, #f1f5f9);

    /* スペーシング */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;

    /* タイポグラフィ */
    --font-family: 'Inter', -apple-system, sans-serif;
    --font-size-xs: 12px;
    --font-size-sm: 14px;
    --font-size-md: 16px;
    --font-size-lg: 18px;
    --font-size-xl: 24px;
}
```

**確認事項**:
- [ ] ダーク/ライトモード切り替えは必要か？
- [ ] 既存のDatabase Appのダークテーマを維持するか、ML Appのライトテーマに統一するか？
- [ ] アクセシビリティ（WCAG準拠）の要件は？

**実装優先度**: Phase 1B中盤（UI統合時）

---

### 4. ナビゲーション構造の複雑さ ⭐⭐⭐⭐

**現状の問題**:
```
Database App (index.html)
├─ サイドバー（5パネル）
├─ グラフビュー
└─ 3つのボタン → ML App / ML Training

ML App (ml-app.html)
├─ サイドバー（6項目）
├─ トップバナー → ML Training
└─ メインエリア（ラン管理/データセット/他）

ML Training (ml-training.html)
├─ ナビゲーションバー（3リンク）
└─ 4ステップウィザード
```

**改善案（統合後）**:
```
統合アプリ (index.html)
├─ グローバルナビゲーション（トップバー）
│   ├─ ロゴ
│   ├─ メインメニュー: [Database] [ML] [Analysis]
│   └─ ユーザーメニュー
│
├─ サイドバー（コンテキスト依存）
│   ├─ Database モード時: 現行のパネル
│   ├─ ML モード時: データセット/モデル/学習/予測/最適化
│   └─ Analysis モード時: SHAP/グラフ/レポート
│
└─ メインエリア
    └─ 選択されたビューを表示
```

**確認事項**:
- [ ] Database機能とML機能、どちらが主要機能か？（デフォルト画面）
- [ ] グラフビューとML機能の連携は必要か？（例：グラフから直接ML学習）
- [ ] ブレッドクラムナビゲーションは必要か？

**実装優先度**: Phase 1B中盤

---

### 5. モバイル対応の欠如 ⭐⭐⭐

**現状の問題**:
- すべてのアプリがデスクトップ専用UI
- レスポンシブデザイン未実装
- 小画面では使用不可

**改善案**:
```css
/* レスポンシブブレークポイント */
@media (max-width: 768px) {
    .sidebar { width: 100%; height: auto; }
    .main-content { margin-left: 0; }
    .graph-view { height: 300px; }
}

@media (max-width: 480px) {
    .wizard-step { flex-direction: column; }
    .table { display: block; overflow-x: auto; }
}
```

**確認事項**:
- [ ] モバイル対応の優先度は？（デスクトップのみでよいか）
- [ ] タブレット（iPad等）での使用は想定しているか？
- [ ] モバイルでは読み取り専用でよいか、編集機能も必要か？

**実装優先度**: Phase 2以降（低優先度）

---

## 【重要度：高】機能統合

### 6. WebSocket接続の重複 ⭐⭐⭐⭐

**現状の問題**:
```javascript
// ML Training (ml-training.js)
socket = io();

// ML App（未実装だが将来的に必要）
socket = io();

// → 同じユーザーが複数タブで開くと、複数のWebSocket接続
```

**改善案**:
```javascript
// 統合後: シングルトンパターン
class WebSocketManager {
    constructor() {
        if (WebSocketManager.instance) {
            return WebSocketManager.instance;
        }

        this.socket = io();
        this.listeners = new Map();

        WebSocketManager.instance = this;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
            this.socket.on(event, (data) => {
                this.listeners.get(event).forEach(cb => cb(data));
            });
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        this.socket.emit(event, data);
    }
}

// 使用例
const wsManager = new WebSocketManager();
wsManager.on('training_progress', handleProgress);
```

**確認事項**:
- [ ] 同時に複数の学習タスクを実行可能にするか？
- [ ] WebSocketの再接続ロジックは実装済みか？
- [ ] 接続エラー時のフォールバック（ポーリング等）は必要か？

**実装優先度**: Phase 1B初期

---

### 7. ルーティングの欠如 ⭐⭐⭐⭐

**現状の問題**:
- URLが変わらない（すべて別HTMLファイル）
- ブラウザの戻る/進むボタンが使えない
- ブックマーク不可
- 状態の共有不可（例：特定のデータセットへの直リンク）

**改善案**:
```javascript
// URLルーティング実装
class Router {
    constructor() {
        this.routes = new Map();
        window.addEventListener('popstate', () => this.handleRoute());
    }

    register(path, handler) {
        this.routes.set(path, handler);
    }

    navigate(path, params = {}) {
        const url = new URL(path, window.location.origin);
        Object.entries(params).forEach(([key, val]) => {
            url.searchParams.set(key, val);
        });

        window.history.pushState({}, '', url);
        this.handleRoute();
    }

    handleRoute() {
        const path = window.location.pathname;
        const handler = this.routes.get(path) || this.routes.get('*');
        if (handler) handler();
    }
}

// 使用例
const router = new Router();
router.register('/database', showDatabaseView);
router.register('/ml/datasets', showDatasetsView);
router.register('/ml/training', showTrainingView);
router.register('/ml/training/:id', showTrainingViewWithDataset);

// ナビゲーション
router.navigate('/ml/training', { dataset: 'dataset_123' });
// → URL: /ml/training?dataset=dataset_123
```

**確認事項**:
- [ ] URLルーティングは必須か、オプションか？
- [ ] SEO対応は必要か？（サーバーサイドレンダリング）
- [ ] ディープリンク（特定のビューへの直リンク）の要件は？

**実装優先度**: Phase 1B中盤

---

### 8. グラフビューとML機能の連携 ⭐⭐⭐⭐

**現状の問題**:
- Database AppのグラフビューからML機能へのショートカットなし
- グラフで選択したノード（材料、試験片等）を直接ML学習に使えない
- 手動でデータセットを再構築する必要がある

**改善案**:
```javascript
// グラフノード選択時
function onNodeClick(nodeId) {
    const node = getNodeData(nodeId);

    // コンテキストメニュー表示
    showContextMenu([
        { label: 'データセット詳細', action: () => showDetails(nodeId) },
        { label: 'ML学習を開始', action: () => startMLFromGraph(nodeId) },
        { label: '予測を実行', action: () => startPredictionFromGraph(nodeId) },
        { label: '関連データを表示', action: () => showRelatedData(nodeId) }
    ]);
}

function startMLFromGraph(nodeId) {
    // グラフから直接データセットを構築
    const dataset = buildDatasetFromGraph(nodeId);

    // ML Trainingビューに切り替え
    router.navigate('/ml/training', { autoload: true });

    // データセットを自動設定
    dataStore.setTemporaryDataset(dataset);
}
```

**確認事項**:
- [ ] グラフからのML学習は頻繁に使う機能か？
- [ ] グラフで複数ノードを選択してバッチ学習は必要か？
- [ ] グラフの可視化とML結果の可視化を統合するか？（例：予測結果をグラフに色付け）

**実装優先度**: Phase 1B後半

---

## 【重要度：中】パフォーマンス・最適化

### 9. 重複コードの削減 ⭐⭐⭐

**現状の問題**:
```javascript
// 3つのアプリで類似のコードが重複

// Database App (index.html)
function showToast(message, type) { /* 実装A */ }

// ML App (ml-app.html)
function showToast(message, type) { /* 実装B（微妙に異なる） */ }

// ML Training (ml-training.js)
// showToast関数なし（独自のログ表示）
```

**改善案**:
```javascript
// shared/ui-components.js
export class Toast {
    static show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// shared/data-utils.js
export function convertToCSV(data) { /* 共通実装 */ }
export function validateDataset(dataset) { /* 共通実装 */ }
export function formatDate(date) { /* 共通実装 */ }

// 使用例
import { Toast } from './shared/ui-components.js';
Toast.show('データセットを保存しました', 'success');
```

**確認事項**:
- [ ] ES6モジュール（import/export）を使用可能か？（古いブラウザ対応不要？）
- [ ] ビルドツール（Webpack、Vite等）の導入は検討しているか？
- [ ] TypeScriptへの移行は検討しているか？

**実装優先度**: Phase 1B中盤（リファクタリング）

---

### 10. バンドルサイズ・読み込み速度 ⭐⭐⭐

**現状の問題**:
```html
<!-- 各ページで外部ライブラリを個別に読み込み -->
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/vis-network/9.1.9/dist/vis-network.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/plotly.js-dist@2.26.0/plotly.min.js"></script>
```

**問題点**:
- 毎回CDNから読み込み（ネットワーク遅延）
- キャッシュされていない場合、初回ロードが遅い
- CDNダウン時にアプリが動作しない

**改善案**:
```javascript
// package.json
{
  "dependencies": {
    "socket.io-client": "^4.7.2",
    "vis-network": "^9.1.9",
    "plotly.js": "^2.26.0"
  }
}

// Viteでバンドル
import { io } from 'socket.io-client';
import { Network } from 'vis-network';
import Plotly from 'plotly.js-dist';

// ビルド後、単一のバンドルファイルとして配信
// → 初回ロード: 500ms（バンドル済み）vs 2000ms（CDN × 4）
```

**確認事項**:
- [ ] オフライン動作は必要か？
- [ ] CDN使用は社内ポリシーで許可されているか？
- [ ] ビルドプロセスの導入は可能か？（CI/CD環境）

**実装優先度**: Phase 2以降

---

## 【重要度：中】開発効率

### 11. テストの欠如 ⭐⭐⭐

**現状の問題**:
- ユニットテストなし
- 統合テストなし
- E2Eテストなし
- リグレッション検出不可

**改善案**:
```javascript
// tests/unit/data-store.test.js
import { describe, it, expect } from 'vitest';
import { DataStore } from '../src/shared/data-store.js';

describe('DataStore', () => {
    it('should save and retrieve dataset', () => {
        const store = new DataStore();
        const dataset = { id: 'test_1', name: 'Test Dataset', data: [] };

        store.saveDataset(dataset);
        const retrieved = store.getDataset('test_1');

        expect(retrieved).toEqual(dataset);
    });

    it('should handle duplicate dataset names', () => {
        const store = new DataStore();
        const dataset1 = { id: 'test_1', name: 'Test', data: [] };
        const dataset2 = { id: 'test_2', name: 'Test', data: [] };

        store.saveDataset(dataset1);
        expect(() => store.saveDataset(dataset2)).toThrow('Duplicate name');
    });
});

// tests/e2e/ml-training.spec.js
import { test, expect } from '@playwright/test';

test('ML Training workflow', async ({ page }) => {
    await page.goto('http://localhost:8000/ml/training');

    // Step 1: データセット選択
    await page.selectOption('#datasetSelect', 'dataset_123');
    await page.click('#nextBtn');

    // Step 2: モデル選択
    await page.selectOption('#modelSelect', 'catboost');
    await page.click('#nextBtn');

    // Step 3: 変数選択
    // ...

    // Step 4: 学習開始
    await page.click('#trainBtn');

    // 学習完了を待つ
    await expect(page.locator('#resultSummary')).toBeVisible({ timeout: 60000 });
});
```

**確認事項**:
- [ ] テストフレームワークの選定は？（Jest、Vitest、Playwright等）
- [ ] テストカバレッジの目標は？（70%、80%等）
- [ ] CI/CDパイプラインでテスト自動実行するか？

**実装優先度**: Phase 2以降

---

### 12. エラーハンドリングの不統一 ⭐⭐⭐

**現状の問題**:
```javascript
// パターン1: try-catch + alert
try {
    const result = await fetch('/api/ml/train', { /* ... */ });
} catch (error) {
    alert('エラー: ' + error.message);
}

// パターン2: try-catch + console.error
try {
    const result = await someFunction();
} catch (error) {
    console.error('Failed:', error);
}

// パターン3: エラーハンドリングなし
const result = await fetch('/api/ml/train', { /* ... */ });
```

**改善案**:
```javascript
// shared/error-handler.js
export class ErrorHandler {
    static async handle(error, context = {}) {
        // エラーログ
        console.error('[Error]', {
            message: error.message,
            stack: error.stack,
            context
        });

        // ユーザー通知
        if (error instanceof NetworkError) {
            Toast.show('ネットワークエラーが発生しました', 'error');
        } else if (error instanceof ValidationError) {
            Toast.show(error.message, 'warning');
        } else {
            Toast.show('予期しないエラーが発生しました', 'error');
        }

        // エラーレポート送信（本番環境のみ）
        if (process.env.NODE_ENV === 'production') {
            await this.sendErrorReport(error, context);
        }
    }

    static async sendErrorReport(error, context) {
        await fetch('/api/errors', {
            method: 'POST',
            body: JSON.stringify({
                message: error.message,
                stack: error.stack,
                context,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            })
        });
    }
}

// 使用例
try {
    await trainModel(params);
} catch (error) {
    await ErrorHandler.handle(error, { action: 'trainModel', params });
}
```

**確認事項**:
- [ ] エラーレポート収集サービス（Sentry等）の導入は検討しているか？
- [ ] エラーメッセージの多言語対応は必要か？
- [ ] ユーザーへのエラーメッセージはどの程度詳細にするか？（技術的詳細 vs 平易な表現）

**実装優先度**: Phase 1B後半

---

## 【重要度：低】その他

### 13. アクセシビリティ（a11y） ⭐⭐

**現状の問題**:
- キーボードナビゲーション未対応
- スクリーンリーダー対応不足
- カラーコントラスト未検証
- ARIA属性の欠如

**改善案**:
```html
<!-- ARIA属性の追加 -->
<button
    aria-label="データセットを削除"
    aria-describedby="delete-warning"
    onclick="deleteDataset(index)">
    <i class="fas fa-trash" aria-hidden="true"></i>
</button>
<div id="delete-warning" class="sr-only">
    この操作は取り消せません
</div>

<!-- キーボードナビゲーション -->
<div
    role="tablist"
    aria-label="ML機能メニュー">
    <button
        role="tab"
        aria-selected="true"
        aria-controls="training-panel"
        tabindex="0">
        学習
    </button>
    <button
        role="tab"
        aria-selected="false"
        aria-controls="prediction-panel"
        tabindex="-1">
        予測
    </button>
</div>
```

**確認事項**:
- [ ] アクセシビリティの要件（WCAG Level A、AA、AAA）は？
- [ ] 対象ユーザーに視覚障害者は含まれるか？
- [ ] キーボードのみでの操作は必須か？

**実装優先度**: Phase 3以降

---

### 14. 国際化（i18n） ⭐⭐

**現状の問題**:
- すべて日本語ハードコード
- 多言語対応なし

**改善案**:
```javascript
// i18n/ja.json
{
    "ml.training.title": "モデル学習",
    "ml.training.step1": "データセット選択",
    "ml.training.step2": "モデル設定",
    "ml.dataset.empty": "データセットがありません",
    "error.network": "ネットワークエラーが発生しました"
}

// i18n/en.json
{
    "ml.training.title": "Model Training",
    "ml.training.step1": "Select Dataset",
    "ml.training.step2": "Model Configuration",
    "ml.dataset.empty": "No datasets available",
    "error.network": "Network error occurred"
}

// i18n.js
class I18n {
    constructor(locale = 'ja') {
        this.locale = locale;
        this.messages = {};
        this.load(locale);
    }

    async load(locale) {
        this.messages = await import(`./i18n/${locale}.json`);
    }

    t(key, params = {}) {
        let message = this.messages[key] || key;
        Object.entries(params).forEach(([k, v]) => {
            message = message.replace(`{${k}}`, v);
        });
        return message;
    }
}

// 使用例
const i18n = new I18n('ja');
document.title = i18n.t('ml.training.title');
```

**確認事項**:
- [ ] 英語対応は必要か？
- [ ] 他の言語（中国語、韓国語等）は必要か？
- [ ] 日付・数値フォーマットのローカライズは必要か？

**実装優先度**: Phase 3以降（要件次第）

---

## 📊 確認事項サマリー（チェックリスト）

### データ管理
- [ ] **[最重要]** データの永続化方針は？（セッションのみ / LocalStorage / サーバーDB / Databricks）
- [ ] **[最重要]** データセットの最大サイズは？（10MB / 100MB / 1GB）
- [ ] **[重要]** Databricks統合時のデータ保存先は？（Unity Catalog Tables / Volumes）
- [ ] **[重要]** マルチユーザー対応時のデータ分離方法は？
- [ ] CSV以外のフォーマット対応は必要か？
- [ ] データセットのバージョン管理は必要か？

### UI/UX
- [ ] **[最重要]** デフォルト画面はDatabaseかMLか？
- [ ] **[重要]** ダークモード/ライトモードどちらに統一するか？（または両対応）
- [ ] **[重要]** グラフビューとML機能の連携は必要か？
- [ ] ダーク/ライトモード切り替え機能は必要か？
- [ ] アクセシビリティ要件（WCAG Level）は？
- [ ] モバイル対応の優先度は？

### 機能統合
- [ ] **[最重要]** 同時に複数の学習タスクを実行可能にするか？
- [ ] **[重要]** URLルーティングは必須か？
- [ ] **[重要]** ディープリンク（特定のビューへの直リンク）の要件は？
- [ ] WebSocketの再接続ロジックは実装済みか？
- [ ] グラフで複数ノードを選択してバッチ学習は必要か？
- [ ] グラフの可視化とML結果の可視化を統合するか？

### 開発環境
- [ ] **[重要]** ビルドツール（Webpack、Vite等）の導入は検討しているか？
- [ ] **[重要]** TypeScriptへの移行は検討しているか？
- [ ] ES6モジュール（import/export）を使用可能か？
- [ ] テストフレームワークの選定は？
- [ ] テストカバレッジの目標は？
- [ ] CI/CDパイプラインの有無は？

### セキュリティ・運用
- [ ] **[重要]** オフライン動作は必要か？
- [ ] CDN使用は社内ポリシーで許可されているか？
- [ ] エラーレポート収集サービスの導入は検討しているか？
- [ ] エラーメッセージはどの程度詳細にするか？

### 国際化・その他
- [ ] 英語対応は必要か？
- [ ] 他の言語対応は必要か？
- [ ] SEO対応は必要か？

---

## 🎯 推奨実装ロードマップ

### Phase 1A+ （即座に対応可能）
**期間**: 1-2日

1. **データセット転送API実装** ⭐⭐⭐⭐⭐
   - Node.js側: `/api/datasets/upload` エンドポイント
   - Python側: データセット受信・保存
   - 目的: LocalStorage制限回避、データ整合性確保

2. **WebSocket接続の一元管理** ⭐⭐⭐⭐
   - シングルトンパターン実装
   - 接続状態管理
   - 目的: 重複接続回避、リソース効率化

### Phase 1B （2-4週間）
**期間**: 2-4週間

1. **予測・最適化UI実装** ⭐⭐⭐⭐⭐
2. **SHAP可視化実装** ⭐⭐⭐⭐⭐
3. **Databricks統合** ⭐⭐⭐⭐⭐
   - Unity Catalog接続
   - データ永続化の本格実装
4. **デザインシステム統一** ⭐⭐⭐⭐
5. **URLルーティング実装** ⭐⭐⭐⭐
6. **エラーハンドリング統一** ⭐⭐⭐

### Phase 2 （1-2ヶ月）
**期間**: 1-2ヶ月

1. **3アプリのSPA統合** ⭐⭐⭐⭐
   - 単一HTMLファイル化
   - ビュー切り替え機構
2. **ビルドツール導入** ⭐⭐⭐
   - Vite/Webpack
   - バンドル最適化
3. **共通コンポーネント化** ⭐⭐⭐
4. **テスト実装** ⭐⭐⭐
   - ユニットテスト
   - E2Eテスト

### Phase 3 （必要に応じて）
**期間**: 随時

1. **モバイル対応** ⭐⭐⭐
2. **アクセシビリティ対応** ⭐⭐
3. **国際化対応** ⭐⭐
4. **パフォーマンス最適化** ⭐⭐

---

## 📝 次のアクション

### 即座に決定すべき事項（次回セッションまでに）

1. **データ永続化方針** ⭐⭐⭐⭐⭐
   - [ ] LocalStorage継続 or サーバーDB移行
   - [ ] Databricks統合のタイムライン

2. **UI統合の方向性** ⭐⭐⭐⭐
   - [ ] 3アプリ独立継続 or SPA統合
   - [ ] ダーク/ライトモードの選択

3. **Phase 1A+ の実装** ⭐⭐⭐⭐⭐
   - [ ] データセット転送API
   - [ ] WebSocket一元管理

### 次回セッション開始時の推奨指示

```
INTEGRATION_REVIEW.mdを読んで、以下を実装してください：

優先度1（Phase 1A+）:
1. データセット転送API（Node.js + Python MLサービス）
2. WebSocket接続の一元管理

これらが完了したら、Phase 1Bの予測UIまたは最適化UIに進んでください。
```

---

**作成日**: 2026-01-09
**最終更新**: 2026-01-09
**レビュー**: 待機中
