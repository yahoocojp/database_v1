# 実装優先順位（ユーザー要望ベース）

**作成日**: 2026-01-09
**ベース**: INTEGRATION_REVIEW.md のユーザーフィードバック

---

## 📋 ユーザー要望サマリー

### ✅ 実装する（高優先度）

1. **デザインシステムの統一** ⭐⭐⭐⭐⭐
   - いい感じに統合
   - 設定で切り替え可能（ダーク/ライト）

2. **WebSocket改善** ⭐⭐⭐⭐⭐
   - 改善策が決まっているなら実装を進める
   - シングルトンパターン実装

3. **URLルーティング実装** ⭐⭐⭐⭐⭐
   - タブが乱立する問題を解消
   - SPA化

4. **グラフビュー⇄ML連携** ⭐⭐⭐⭐⭐
   - サンプルデータで可視化可能に
   - グラフから直接ML学習

5. **重複コード削減** ⭐⭐⭐⭐
   - リファクタリング実施

6. **エラーハンドリング統一** ⭐⭐⭐⭐
   - 統一した実装

7. **デバッグ機能** ⭐⭐⭐⭐
   - 開発環境 ⇄ Databricks環境のシームレス移行
   - デバッグモード実装

### 📝 整理する（中優先度）

8. **バンドルサイズ・読込速度** ⭐⭐⭐
   - 課題と対策を整理

### ⏸️ 後回し（低優先度）

9. **モバイル対応** ⭐
   - Phase 2以降

### ✅ 方針確認（解決済み）

10. **LocalStorage依存・データ転送**
    - → Databricks UC統合で解消（Phase 1B）
    - ML実行はDatabricks Jobでバックエンド実行
    - データ永続化はサーバーDB（Databricks）

11. **テストの欠如**
    - → デバッグ機能として実装

---

## 🎯 実装計画

### Phase 1A++ （今すぐ実装）

#### 1. WebSocket改善（シングルトンパターン） ⭐⭐⭐⭐⭐
**所要時間**: 30分

```javascript
// lib/websocket-manager.js
class WebSocketManager {
    constructor() {
        if (WebSocketManager.instance) {
            return WebSocketManager.instance;
        }

        this.socket = null;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        WebSocketManager.instance = this;
    }

    connect() {
        if (this.socket?.connected) {
            return this.socket;
        }

        this.socket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: this.maxReconnectAttempts
        });

        this.socket.on('connect', () => {
            console.log('[WebSocket] Connected');
            this.reconnectAttempts = 0;
        });

        this.socket.on('disconnect', () => {
            console.log('[WebSocket] Disconnected');
        });

        this.socket.on('reconnect_attempt', (attempt) => {
            this.reconnectAttempts = attempt;
            console.log(`[WebSocket] Reconnect attempt ${attempt}`);
        });

        return this.socket;
    }

    on(event, callback) {
        if (!this.socket) this.connect();

        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
            this.socket.on(event, (data) => {
                this.listeners.get(event).forEach(cb => cb(data));
            });
        }

        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        if (!this.socket) this.connect();
        this.socket.emit(event, data);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;

        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }
}

export default new WebSocketManager();
```

---

#### 2. エラーハンドリング統一 ⭐⭐⭐⭐
**所要時間**: 1時間

```javascript
// lib/error-handler.js
class ErrorHandler {
    static handleError(error, context = {}) {
        // エラーログ
        const errorLog = {
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack,
            context,
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        console.error('[Error]', errorLog);

        // 開発環境: 詳細ログ
        if (this.isDebugMode()) {
            console.group('🔍 Debug Info');
            console.log('Context:', context);
            console.log('Stack:', error.stack);
            console.groupEnd();
        }

        // ユーザー通知
        this.notifyUser(error);

        // サーバーに送信（本番環境のみ）
        if (this.isProduction()) {
            this.sendToServer(errorLog);
        }
    }

    static notifyUser(error) {
        if (error instanceof NetworkError) {
            Toast.show('ネットワークエラーが発生しました。接続を確認してください。', 'error');
        } else if (error instanceof ValidationError) {
            Toast.show(error.message, 'warning');
        } else if (error instanceof AuthError) {
            Toast.show('認証エラーが発生しました。再ログインしてください。', 'error');
        } else {
            Toast.show('予期しないエラーが発生しました。', 'error');
        }
    }

    static isDebugMode() {
        return localStorage.getItem('debug_mode') === 'true' ||
               window.location.hostname === 'localhost';
    }

    static isProduction() {
        return !this.isDebugMode();
    }

    static async sendToServer(errorLog) {
        try {
            await fetch('/api/errors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(errorLog)
            });
        } catch (e) {
            console.error('Failed to send error log:', e);
        }
    }
}

// カスタムエラークラス
class NetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NetworkError';
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}

export { ErrorHandler, NetworkError, ValidationError, AuthError };
```

---

#### 3. デバッグ機能実装 ⭐⭐⭐⭐
**所要時間**: 1.5時間

```javascript
// lib/debug-manager.js
class DebugManager {
    constructor() {
        this.enabled = this.isDebugMode();
        this.logs = [];
        this.maxLogs = 1000;

        if (this.enabled) {
            this.initialize();
        }
    }

    isDebugMode() {
        return localStorage.getItem('debug_mode') === 'true' ||
               new URLSearchParams(window.location.search).get('debug') === 'true' ||
               window.location.hostname === 'localhost';
    }

    initialize() {
        // デバッグパネルを追加
        this.createDebugPanel();

        // グローバルエラーハンドラ
        window.addEventListener('error', (e) => {
            this.log('error', 'Global Error', {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno
            });
        });

        // Promise rejection
        window.addEventListener('unhandledrejection', (e) => {
            this.log('error', 'Unhandled Promise Rejection', {
                reason: e.reason
            });
        });

        // WebSocket監視
        this.monitorWebSocket();

        // API呼び出し監視
        this.monitorFetch();
    }

    createDebugPanel() {
        const panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 0;
            right: 0;
            width: 400px;
            height: 300px;
            background: rgba(0, 0, 0, 0.9);
            color: #00ff00;
            font-family: monospace;
            font-size: 12px;
            overflow: auto;
            z-index: 9999;
            border-top: 2px solid #00ff00;
            padding: 10px;
            display: none;
        `;

        const header = document.createElement('div');
        header.innerHTML = `
            <strong>🔍 Debug Console</strong>
            <button onclick="window.debugManager.clear()" style="float: right; margin-left: 10px;">Clear</button>
            <button onclick="window.debugManager.toggle()" style="float: right;">Close</button>
            <button onclick="window.debugManager.exportLogs()" style="float: right; margin-right: 10px;">Export</button>
        `;
        panel.appendChild(header);

        const logs = document.createElement('div');
        logs.id = 'debug-logs';
        logs.style.cssText = 'margin-top: 10px; max-height: 250px; overflow: auto;';
        panel.appendChild(logs);

        document.body.appendChild(panel);

        // トグルボタン
        const toggleBtn = document.createElement('button');
        toggleBtn.innerHTML = '🔍';
        toggleBtn.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #00ff00;
            border: none;
            cursor: pointer;
            z-index: 9998;
            font-size: 20px;
        `;
        toggleBtn.onclick = () => this.toggle();
        document.body.appendChild(toggleBtn);
    }

    toggle() {
        const panel = document.getElementById('debug-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    log(level, message, data = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data
        };

        this.logs.push(logEntry);

        // 最大ログ数を超えたら古いものを削除
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // パネルに表示
        this.displayLog(logEntry);

        // コンソールにも出力
        const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[consoleMethod](`[${level.toUpperCase()}] ${message}`, data);
    }

    displayLog(logEntry) {
        const logsContainer = document.getElementById('debug-logs');
        if (!logsContainer) return;

        const logDiv = document.createElement('div');
        logDiv.style.cssText = `
            margin-bottom: 5px;
            padding: 5px;
            border-left: 3px solid ${this.getLevelColor(logEntry.level)};
            background: rgba(255, 255, 255, 0.05);
        `;

        const time = new Date(logEntry.timestamp).toLocaleTimeString();
        logDiv.innerHTML = `
            <span style="color: #888;">[${time}]</span>
            <span style="color: ${this.getLevelColor(logEntry.level)};">[${logEntry.level.toUpperCase()}]</span>
            ${logEntry.message}
            ${Object.keys(logEntry.data).length > 0 ? '<br><span style="color: #888;">' + JSON.stringify(logEntry.data, null, 2) + '</span>' : ''}
        `;

        logsContainer.appendChild(logDiv);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    getLevelColor(level) {
        const colors = {
            error: '#ff0000',
            warn: '#ffaa00',
            info: '#00aaff',
            debug: '#00ff00'
        };
        return colors[level] || '#00ff00';
    }

    clear() {
        this.logs = [];
        const logsContainer = document.getElementById('debug-logs');
        if (logsContainer) {
            logsContainer.innerHTML = '';
        }
    }

    exportLogs() {
        const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    monitorWebSocket() {
        const originalIo = window.io;
        window.io = function(...args) {
            const socket = originalIo(...args);

            window.debugManager.log('info', 'WebSocket created', { args });

            socket.on('connect', () => {
                window.debugManager.log('info', 'WebSocket connected', { id: socket.id });
            });

            socket.on('disconnect', (reason) => {
                window.debugManager.log('warn', 'WebSocket disconnected', { reason });
            });

            return socket;
        };
    }

    monitorFetch() {
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const startTime = Date.now();
            const url = args[0];

            window.debugManager.log('info', 'API Call started', { url });

            try {
                const response = await originalFetch(...args);
                const duration = Date.now() - startTime;

                window.debugManager.log('info', 'API Call completed', {
                    url,
                    status: response.status,
                    duration: `${duration}ms`
                });

                return response;
            } catch (error) {
                const duration = Date.now() - startTime;

                window.debugManager.log('error', 'API Call failed', {
                    url,
                    error: error.message,
                    duration: `${duration}ms`
                });

                throw error;
            }
        };
    }
}

// グローバルに公開
window.debugManager = new DebugManager();

export default DebugManager;
```

---

### Phase 1B （2-4週間）

#### 4. URLルーティング実装 ⭐⭐⭐⭐⭐
**所要時間**: 1日

#### 5. デザインシステム統一 ⭐⭐⭐⭐⭐
**所要時間**: 2-3日

#### 6. グラフビュー⇄ML連携 ⭐⭐⭐⭐⭐
**所要時間**: 1-2日

#### 7. 重複コード削減 ⭐⭐⭐⭐
**所要時間**: 2日

#### 8. バンドルサイズ・読込速度の整理 ⭐⭐⭐
**所要時間**: 半日（調査・ドキュメント化）

---

## 🚀 次のアクション

### 即座に実装（今のセッション）

1. **WebSocket改善** - lib/websocket-manager.js 作成
2. **エラーハンドリング統一** - lib/error-handler.js 作成
3. **デバッグ機能** - lib/debug-manager.js 作成

これらは独立したモジュールとして実装し、既存コードへの影響を最小限にします。

### 次回セッション

4. **URLルーティング実装** - SPA化の基盤
5. **デザインシステム統一** - 設定で切り替え可能
6. **グラフビュー⇄ML連携** - サンプルデータで可視化

---

## 📊 Databricks統合の前提条件

### 解決される課題（Phase 1B Databricks統合時）

1. **LocalStorage依存** → Unity Catalog Tables
2. **データ転送の非効率性** → Databricks Volumes
3. **ML実行** → Databricks Jobs（バックエンド実行）
4. **データ永続化** → Databricks SQL Warehouse

### 開発環境 ⇄ Databricks環境のシームレス移行

```javascript
// lib/config.js
class EnvironmentConfig {
    constructor() {
        this.env = this.detectEnvironment();
    }

    detectEnvironment() {
        // URLまたは環境変数で判定
        if (window.location.hostname === 'localhost') {
            return 'development';
        } else if (window.location.hostname.includes('.databricks.com')) {
            return 'databricks';
        } else {
            return 'production';
        }
    }

    getAPIBaseURL() {
        return {
            development: 'http://localhost:5000',
            databricks: '/api/ml',  // Databricks Apps経由
            production: 'https://api.example.com'
        }[this.env];
    }

    getDataStorageType() {
        return {
            development: 'localStorage',
            databricks: 'unity-catalog',
            production: 'unity-catalog'
        }[this.env];
    }

    isDebugMode() {
        return this.env === 'development' ||
               localStorage.getItem('debug_mode') === 'true';
    }
}

export default new EnvironmentConfig();
```

---

**作成日**: 2026-01-09
**承認**: ユーザーフィードバックベース
**次のアクション**: Phase 1A++ の即座実装を開始
