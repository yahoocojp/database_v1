# Phase 1A++ 統合ガイド

**作成日**: 2026-01-09
**実装完了**: WebSocket管理、エラーハンドリング、デバッグ機能

---

## 📦 実装した新機能

### 1. WebSocket Manager（シングルトンパターン）
**ファイル**: `lib/websocket-manager.js`

**機能**:
- WebSocket接続の一元管理
- 複数タブでの重複接続を防止
- 自動再接続機能
- イベントリスナーの管理
- 接続統計の取得

### 2. Error Handler（統一エラーハンドリング）
**ファイル**: `lib/error-handler.js`

**機能**:
- 統一されたエラー処理
- カスタムエラークラス（NetworkError, ValidationError, AuthError, DataError）
- 環境に応じたエラーログ送信
- ユーザーへの適切な通知
- Fetch APIラッパー（自動エラーハンドリング）

### 3. Debug Manager（開発⇄Databricks環境デバッグ）
**ファイル**: `lib/debug-manager.js`

**機能**:
- デバッグパネル（ログ、ネットワーク、WebSocket、パフォーマンス監視）
- WebSocket通信の監視
- API呼び出しの監視
- パフォーマンス監視
- ログのエクスポート
- 開発環境/Databricks環境の自動検出

---

## 🚀 統合手順

### Step 1: 既存HTMLファイルに読み込み

#### Database App ([public/index.html](public/index.html))

`</head>` タグの直前に追加:

```html
<!-- Phase 1A++ Libraries -->
<script src="/lib/error-handler.js"></script>
<script src="/lib/debug-manager.js"></script>
<script src="/lib/websocket-manager.js"></script>
```

#### ML App ([public/ml-app.html](public/ml-app.html))

`</head>` タグの直前（Socket.IO読み込みの後）に追加:

```html
<!-- Socket.IO -->
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>

<!-- Phase 1A++ Libraries -->
<script src="/lib/error-handler.js"></script>
<script src="/lib/debug-manager.js"></script>
<script src="/lib/websocket-manager.js"></script>
```

#### ML Training ([public/ml-training.html](public/ml-training.html))

`</head>` タグの直前（Socket.IO読み込みの後）に追加:

```html
<!-- Socket.IO -->
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>

<!-- Phase 1A++ Libraries -->
<script src="/lib/error-handler.js"></script>
<script src="/lib/debug-manager.js"></script>
<script src="/lib/websocket-manager.js"></script>
```

---

### Step 2: ML Training での WebSocket 置き換え

#### Before (public/ml-training.js - 行14-21):

```javascript
// WebSocket接続
function connectWebSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('[WebSocket] Connected');
        addLog('WebSocket接続完了');
    });
    // ...
}
```

#### After:

```javascript
// WebSocket接続
function connectWebSocket() {
    // WebSocket Manager を使用
    socket = window.wsManager.connect();

    window.wsManager.on('connect', () => {
        console.log('[WebSocket] Connected');
        if (typeof addLog === 'function') {
            addLog('WebSocket接続完了');
        }
    });

    window.wsManager.on('disconnect', () => {
        console.log('[WebSocket] Disconnected');
    });

    // 学習進捗
    window.wsManager.on('training_progress', (data) => {
        console.log('[Training Progress]', data);
        updateProgress(data.progress, data.message);
        addLog(data.message, data.progress);
    });

    // 学習完了
    window.wsManager.on('training_complete', (data) => {
        console.log('[Training Complete]', data);
        handleTrainingComplete(data);
    });

    // 学習エラー
    window.wsManager.on('training_error', (data) => {
        console.error('[Training Error]', data);
        handleTrainingError(data);
    });
}
```

---

### Step 3: エラーハンドリングの置き換え

#### Database App (public/index.html)

既存の `try-catch` ブロックを Error Handler に置き換え:

**Before**:
```javascript
try {
    const response = await fetch('/api/data', { method: 'POST', body: JSON.stringify(data) });
    const result = await response.json();
} catch (error) {
    console.error('Error:', error);
    alert('エラーが発生しました');
}
```

**After**:
```javascript
try {
    const response = await ErrorHandler.fetchWithErrorHandling(
        '/api/data',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
        { action: 'saveData', dataId: data.id }
    );
    const result = await response.json();
} catch (error) {
    // ErrorHandler が自動的に処理済み
    // 必要に応じて追加処理
}
```

#### ML Training (public/ml-training.js - 行326-372)

**Before (行367-371)**:
```javascript
    } catch (error) {
        console.error('Training start failed:', error);
        alert(`エラー: ${error.message}`);
        closeTrainingDialog();
    }
```

**After**:
```javascript
    } catch (error) {
        await ErrorHandler.handle(error, {
            action: 'startTraining',
            datasetId: datasetId,
            modelName: modelName
        });
        closeTrainingDialog();
    }
```

---

### Step 4: デバッグモードの有効化

#### 開発環境で自動有効化

以下の条件で自動的にデバッグモードが有効化されます:
- `localhost` または `127.0.0.1` でアクセス
- URL に `?debug=true` パラメータを付与
- LocalStorage に `debug_mode` = `'true'` を設定

#### 手動で有効化

ブラウザのコンソールで:
```javascript
localStorage.setItem('debug_mode', 'true');
location.reload();
```

#### デバッグパネルの操作

- **表示/非表示**: 右下の🔍ボタンをクリック、または `Ctrl+Shift+D`
- **タブ切り替え**: `Logs`, `Network`, `WebSocket`, `Performance`
- **ログクリア**: `Clear` ボタン
- **ログエクスポート**: `Export` ボタン（JSON形式）

---

## 📊 使用例

### WebSocket Manager

```javascript
// グローバルに公開されている wsManager を使用

// イベントリスナーを登録
window.wsManager.on('training_progress', (data) => {
    console.log('Progress:', data.progress);
});

// イベントを送信
window.wsManager.emit('ping', { timestamp: Date.now() });

// イベントリスナーを削除
function handleProgress(data) { /* ... */ }
window.wsManager.on('training_progress', handleProgress);
// 後で削除
window.wsManager.off('training_progress', handleProgress);

// 接続統計を取得
const stats = window.wsManager.getStats();
console.log('WebSocket Stats:', stats);
// 出力例: { connected: true, socketId: "abc123", reconnectAttempts: 0, registeredEvents: ["training_progress", "training_complete"], totalListeners: 5 }
```

### Error Handler

```javascript
// Fetch API ラッパー
try {
    const response = await ErrorHandler.fetchWithErrorHandling(
        '/api/ml/train',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_id: 'test_1', model_name: 'catboost' })
        },
        { action: 'trainModel', datasetId: 'test_1' }
    );

    const result = await response.json();
    console.log('Training started:', result);

} catch (error) {
    // ErrorHandler が自動的にユーザーに通知
    // ログも自動的に記録
}

// カスタムエラー
try {
    if (!dataset) {
        throw new DataError('データセットが見つかりません', datasetId);
    }

    if (columns.length === 0) {
        throw new ValidationError('カラムを1つ以上選択してください', 'columns');
    }

} catch (error) {
    await ErrorHandler.handle(error, { action: 'validateDataset' });
}

// 非同期関数のラッパー
await ErrorHandler.wrapAsync(async () => {
    // エラーが発生する可能性のある処理
    const data = await loadData();
    await processData(data);
}, { action: 'dataProcessing' });
```

### Debug Manager

```javascript
// グローバルに公開されている debugManager を使用

// ログを記録
window.debugManager.log('info', 'User action', { action: 'click', button: 'train' });
window.debugManager.log('warn', 'Slow API response', { url: '/api/ml/train', duration: 5000 });
window.debugManager.log('error', 'Validation failed', { field: 'dataset', reason: 'empty' });

// デバッグパネルをトグル
window.debugManager.toggle();

// ログをクリア
window.debugManager.clear();

// ログをエクスポート
window.debugManager.exportLogs();

// 環境を確認
const env = window.debugManager.getEnvironment();
console.log('Environment:', env); // "Development", "Databricks", "Production"
```

---

## 🔍 デバッグパネルの機能

### Logs タブ
- 全てのログエントリを時系列で表示
- レベル別の色分け（Error: 赤、Warn: 黄、Info: 青、Debug: 緑）
- JSONデータの展開表示

### Network タブ
- すべてのFetch API呼び出しを記録
- リクエストURL、メソッド、ステータス、実行時間を表示
- 最新20件を表示

### WebSocket タブ
- WebSocket接続状態を表示
- Socket ID、登録されたリスナー数を表示
- 接続/切断イベントを記録

### Performance タブ
- メモリ使用量（used/total/limit）
- ロードされたリソース数
- 5秒ごとに自動更新

---

## 🎯 環境別の動作

### Development（localhost）
- デバッグモード: 自動有効
- エラーログ: コンソールのみ
- 詳細なスタックトレース表示
- デバッグパネル表示

### Databricks環境
- デバッグモード: `?debug=true` または LocalStorage設定で有効化
- エラーログ: サーバーに送信（`/api/errors`）
- ユーザーへの簡潔なエラーメッセージ
- デバッグパネル: 必要時のみ表示

### Production
- デバッグモード: デフォルト無効
- エラーログ: サーバーに送信（`/api/errors`）
- ユーザーへの平易なエラーメッセージ
- デバッグパネル: 表示不可

---

## 🚨 既知の制限事項

### WebSocket Manager
- Socket.IO のみ対応（ネイティブWebSocketは未対応）
- 最大再接続試行回数: 5回

### Error Handler
- サーバー側の `/api/errors` エンドポイントは未実装
- カスタムエラークラスの種類は4つのみ

### Debug Manager
- ログ最大保存数: 1,000件
- ネットワークログ表示: 最新20件のみ
- パフォーマンス監視: Chrome/Edge のみ（`performance.memory`）

---

## 📋 次のステップ

### Phase 1A++ 完了後

1. **サーバーサイドエラーログ収集API実装** (`app.js`)
   ```javascript
   app.post('/api/errors', function(req, res) {
       const errorLog = req.body;
       console.error('[Client Error]', errorLog);

       // TODO: Databricks に保存
       // await saveToUnity Catalog(errorLog);

       res.json({ success: true });
   });
   ```

2. **Toast通知コンポーネントの実装**
   - 現在 `window.Toast` に依存
   - 共通のToastライブラリを実装

3. **既存コードのリファクタリング**
   - すべての `try-catch` を Error Handler に置き換え
   - すべての `io()` を WebSocket Manager に置き換え

---

### Phase 1B への準備

- URLルーティング実装
- デザインシステム統一
- グラフビュー⇄ML連携

---

**作成日**: 2026-01-09
**実装済み**: WebSocket Manager, Error Handler, Debug Manager
**次のアクション**: 既存HTMLファイルに統合
