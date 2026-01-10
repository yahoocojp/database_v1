/**
 * Debug Manager - 開発環境⇄Databricks環境のシームレスなデバッグ
 */

class DebugManager {
    constructor() {
        this.enabled = this.isDebugMode();
        this.logs = [];
        this.maxLogs = 1000;
        this.panelVisible = false;

        if (this.enabled) {
            this.initialize();
        }
    }

    /**
     * デバッグモードかどうか
     */
    isDebugMode() {
        if (typeof window === 'undefined') return false;

        return localStorage.getItem('debug_mode') === 'true' ||
               new URLSearchParams(window.location.search).get('debug') === 'true' ||
               window.location.hostname === 'localhost' ||
               window.location.hostname === '127.0.0.1';
    }

    /**
     * 初期化
     */
    initialize() {
        console.log('🔍 [DebugManager] Initialized');

        // デバッグパネルを作成
        this.createDebugPanel();

        // グローバルエラーハンドラ
        window.addEventListener('error', (e) => {
            this.log('error', 'Global Error', {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                stack: e.error?.stack
            });
        });

        // Promise rejection
        window.addEventListener('unhandledrejection', (e) => {
            this.log('error', 'Unhandled Promise Rejection', {
                reason: e.reason,
                promise: e.promise
            });
        });

        // WebSocket監視
        this.monitorWebSocket();

        // API呼び出し監視
        this.monitorFetch();

        // パフォーマンス監視
        this.monitorPerformance();

        // ショートカット（Ctrl+Shift+D でデバッグパネル toggle）
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.toggle();
            }
        });

        this.log('info', 'Debug Mode Active', {
            environment: this.getEnvironment(),
            hostname: window.location.hostname,
            userAgent: navigator.userAgent
        });
    }

    /**
     * デバッグパネルを作成
     */
    createDebugPanel() {
        // パネル本体
        const panel = document.createElement('div');
        panel.id = 'debug-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 0;
            right: 0;
            width: 500px;
            height: 400px;
            background: rgba(0, 0, 0, 0.95);
            color: #00ff00;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            overflow: hidden;
            z-index: 99999;
            border-top: 2px solid #00ff00;
            border-left: 2px solid #00ff00;
            display: none;
            flex-direction: column;
        `;

        // ヘッダー
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 8px 12px;
            background: rgba(0, 255, 0, 0.1);
            border-bottom: 1px solid #00ff00;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <strong>🔍 Debug Console</strong>
                <span style="font-size: 10px; color: #888;">${this.getEnvironment()}</span>
            </div>
            <div style="display: flex; gap: 5px;">
                <button id="debug-clear-btn" style="padding: 2px 8px; font-size: 10px; background: #333; color: #0f0; border: 1px solid #0f0; cursor: pointer;">Clear</button>
                <button id="debug-export-btn" style="padding: 2px 8px; font-size: 10px; background: #333; color: #0f0; border: 1px solid #0f0; cursor: pointer;">Export</button>
                <button id="debug-close-btn" style="padding: 2px 8px; font-size: 10px; background: #333; color: #0f0; border: 1px solid #0f0; cursor: pointer;">Close</button>
            </div>
        `;
        panel.appendChild(header);

        // タブ
        const tabs = document.createElement('div');
        tabs.style.cssText = `
            display: flex;
            gap: 5px;
            padding: 5px 12px;
            background: rgba(0, 0, 0, 0.3);
            border-bottom: 1px solid #00ff00;
        `;
        tabs.innerHTML = `
            <button class="debug-tab active" data-tab="logs" style="padding: 4px 12px; background: #0f0; color: #000; border: none; cursor: pointer; font-weight: bold;">Logs</button>
            <button class="debug-tab" data-tab="network" style="padding: 4px 12px; background: #333; color: #0f0; border: 1px solid #0f0; cursor: pointer;">Network</button>
            <button class="debug-tab" data-tab="websocket" style="padding: 4px 12px; background: #333; color: #0f0; border: 1px solid #0f0; cursor: pointer;">WebSocket</button>
            <button class="debug-tab" data-tab="performance" style="padding: 4px 12px; background: #333; color: #0f0; border: 1px solid #0f0; cursor: pointer;">Performance</button>
        `;
        panel.appendChild(tabs);

        // ログコンテナ
        const logsContainer = document.createElement('div');
        logsContainer.id = 'debug-logs';
        logsContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px 12px;
        `;
        panel.appendChild(logsContainer);

        // ネットワークコンテナ
        const networkContainer = document.createElement('div');
        networkContainer.id = 'debug-network';
        networkContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px 12px; display: none;';
        panel.appendChild(networkContainer);

        // WebSocketコンテナ
        const websocketContainer = document.createElement('div');
        websocketContainer.id = 'debug-websocket';
        websocketContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px 12px; display: none;';
        panel.appendChild(websocketContainer);

        // パフォーマンスコンテナ
        const performanceContainer = document.createElement('div');
        performanceContainer.id = 'debug-performance';
        performanceContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px 12px; display: none;';
        panel.appendChild(performanceContainer);

        document.body.appendChild(panel);

        // トグルボタン
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'debug-toggle-btn';
        toggleBtn.innerHTML = '🔍';
        toggleBtn.title = 'Debug Console (Ctrl+Shift+D)';
        toggleBtn.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 45px;
            height: 45px;
            border-radius: 50%;
            background: linear-gradient(135deg, #00ff00, #00cc00);
            border: 2px solid #00ff00;
            cursor: pointer;
            z-index: 99998;
            font-size: 22px;
            box-shadow: 0 4px 12px rgba(0, 255, 0, 0.4);
            transition: all 0.2s;
        `;
        toggleBtn.onmouseover = () => {
            toggleBtn.style.transform = 'scale(1.1)';
            toggleBtn.style.boxShadow = '0 6px 16px rgba(0, 255, 0, 0.6)';
        };
        toggleBtn.onmouseout = () => {
            toggleBtn.style.transform = 'scale(1)';
            toggleBtn.style.boxShadow = '0 4px 12px rgba(0, 255, 0, 0.4)';
        };
        toggleBtn.onclick = () => this.toggle();
        document.body.appendChild(toggleBtn);

        // イベントリスナー
        document.getElementById('debug-clear-btn').onclick = () => this.clear();
        document.getElementById('debug-export-btn').onclick = () => this.exportLogs();
        document.getElementById('debug-close-btn').onclick = () => this.toggle();

        // タブ切り替え
        document.querySelectorAll('.debug-tab').forEach(tab => {
            tab.onclick = () => this.switchTab(tab.dataset.tab);
        });
    }

    /**
     * タブを切り替え
     */
    switchTab(tabName) {
        // タブボタンの状態更新
        document.querySelectorAll('.debug-tab').forEach(tab => {
            if (tab.dataset.tab === tabName) {
                tab.style.background = '#0f0';
                tab.style.color = '#000';
                tab.classList.add('active');
            } else {
                tab.style.background = '#333';
                tab.style.color = '#0f0';
                tab.classList.remove('active');
            }
        });

        // コンテナの表示切り替え
        ['logs', 'network', 'websocket', 'performance'].forEach(name => {
            const container = document.getElementById(`debug-${name}`);
            if (container) {
                container.style.display = name === tabName ? 'block' : 'none';
            }
        });
    }

    /**
     * パネルの表示/非表示を切り替え
     */
    toggle() {
        const panel = document.getElementById('debug-panel');
        if (panel) {
            this.panelVisible = !this.panelVisible;
            panel.style.display = this.panelVisible ? 'flex' : 'none';
        }
    }

    /**
     * ログを記録
     */
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

    /**
     * ログを表示
     */
    displayLog(logEntry) {
        const logsContainer = document.getElementById('debug-logs');
        if (!logsContainer) return;

        const logDiv = document.createElement('div');
        logDiv.style.cssText = `
            margin-bottom: 4px;
            padding: 4px 6px;
            border-left: 3px solid ${this.getLevelColor(logEntry.level)};
            background: rgba(255, 255, 255, 0.03);
            font-size: 10px;
        `;

        const time = new Date(logEntry.timestamp).toLocaleTimeString();
        const hasData = Object.keys(logEntry.data).length > 0;

        logDiv.innerHTML = `
            <div>
                <span style="color: #666;">[${time}]</span>
                <span style="color: ${this.getLevelColor(logEntry.level)}; font-weight: bold;">[${logEntry.level.toUpperCase()}]</span>
                <span style="color: #fff;">${this.escapeHtml(logEntry.message)}</span>
            </div>
            ${hasData ? `<div style="color: #888; margin-left: 70px; font-size: 9px;"><pre style="margin: 2px 0; white-space: pre-wrap;">${this.escapeHtml(JSON.stringify(logEntry.data, null, 2))}</pre></div>` : ''}
        `;

        logsContainer.appendChild(logDiv);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    /**
     * ログをクリア
     */
    clear() {
        this.logs = [];
        const logsContainer = document.getElementById('debug-logs');
        if (logsContainer) {
            logsContainer.innerHTML = '';
        }
        this.log('info', 'Logs cleared');
    }

    /**
     * ログをエクスポート
     */
    exportLogs() {
        const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.log('info', 'Logs exported', { count: this.logs.length });
    }

    /**
     * WebSocketを監視
     */
    monitorWebSocket() {
        // Socket.IOの監視
        if (typeof io !== 'undefined') {
            const originalIo = io;
            window.io = (...args) => {
                const socket = originalIo(...args);

                this.log('info', 'WebSocket Created', { args: args[0] });

                socket.on('connect', () => {
                    this.log('info', 'WebSocket Connected', { id: socket.id });
                    this.updateWebSocketStatus('Connected', socket.id);
                });

                socket.on('disconnect', (reason) => {
                    this.log('warn', 'WebSocket Disconnected', { reason });
                    this.updateWebSocketStatus('Disconnected', null);
                });

                socket.on('error', (error) => {
                    this.log('error', 'WebSocket Error', { error });
                });

                // すべてのイベントをログ
                const originalOn = socket.on.bind(socket);
                socket.on = function(event, callback) {
                    return originalOn(event, function(...args) {
                        window.debugManager.log('debug', `WS Event: ${event}`, { args });
                        return callback(...args);
                    });
                };

                return socket;
            };
        }
    }

    /**
     * WebSocketステータスを更新
     */
    updateWebSocketStatus(status, socketId) {
        const container = document.getElementById('debug-websocket');
        if (!container) return;

        const statusDiv = document.getElementById('ws-status') || document.createElement('div');
        statusDiv.id = 'ws-status';
        statusDiv.style.cssText = `
            padding: 8px;
            margin-bottom: 8px;
            background: rgba(0, 255, 0, 0.1);
            border: 1px solid #0f0;
            border-radius: 4px;
        `;

        const statusColor = status === 'Connected' ? '#0f0' : '#f00';
        statusDiv.innerHTML = `
            <div><strong>Status:</strong> <span style="color: ${statusColor};">${status}</span></div>
            ${socketId ? `<div><strong>Socket ID:</strong> ${socketId}</div>` : ''}
            ${window.wsManager ? `<div><strong>Listeners:</strong> ${window.wsManager.getStats().totalListeners}</div>` : ''}
        `;

        if (!document.getElementById('ws-status')) {
            container.insertBefore(statusDiv, container.firstChild);
        }
    }

    /**
     * Fetch APIを監視
     */
    monitorFetch() {
        const originalFetch = window.fetch;
        const networkLogs = [];

        window.fetch = async function(...args) {
            const startTime = performance.now();
            const url = typeof args[0] === 'string' ? args[0] : args[0].url;
            const method = args[1]?.method || 'GET';

            const requestLog = {
                id: Date.now(),
                url,
                method,
                startTime,
                status: null,
                duration: null
            };

            networkLogs.push(requestLog);

            try {
                const response = await originalFetch(...args);
                const duration = (performance.now() - startTime).toFixed(2);

                requestLog.status = response.status;
                requestLog.duration = duration;

                window.debugManager.log('info', `API ${method} ${url}`, {
                    status: response.status,
                    duration: `${duration}ms`
                });

                window.debugManager.updateNetworkLog(networkLogs);

                return response;
            } catch (error) {
                const duration = (performance.now() - startTime).toFixed(2);

                requestLog.status = 'ERROR';
                requestLog.duration = duration;
                requestLog.error = error.message;

                window.debugManager.log('error', `API ${method} ${url} Failed`, {
                    error: error.message,
                    duration: `${duration}ms`
                });

                window.debugManager.updateNetworkLog(networkLogs);

                throw error;
            }
        };
    }

    /**
     * ネットワークログを更新
     */
    updateNetworkLog(networkLogs) {
        const container = document.getElementById('debug-network');
        if (!container) return;

        container.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>Network Requests: ${networkLogs.length}</strong></div>
            ${networkLogs.slice(-20).reverse().map(log => `
                <div style="padding: 4px; margin-bottom: 2px; border-left: 3px solid ${log.status === 'ERROR' ? '#f00' : log.status >= 400 ? '#ff0' : '#0f0'}; background: rgba(255,255,255,0.03); font-size: 10px;">
                    <div>
                        <span style="color: #0f0;">[${log.method}]</span>
                        <span style="color: #fff;">${this.escapeHtml(log.url)}</span>
                    </div>
                    <div style="color: #888; font-size: 9px;">
                        Status: ${log.status} | Duration: ${log.duration}ms
                    </div>
                </div>
            `).join('')}
        `;
    }

    /**
     * パフォーマンスを監視
     */
    monitorPerformance() {
        if (!window.performance) return;

        setInterval(() => {
            const perfData = {
                memory: performance.memory ? {
                    used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
                    total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
                    limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
                } : 'N/A',
                navigation: performance.getEntriesByType('navigation')[0] || {},
                resources: performance.getEntriesByType('resource').length
            };

            this.updatePerformanceLog(perfData);
        }, 5000);
    }

    /**
     * パフォーマンスログを更新
     */
    updatePerformanceLog(perfData) {
        const container = document.getElementById('debug-performance');
        if (!container) return;

        container.innerHTML = `
            <div style="padding: 8px;">
                <div style="margin-bottom: 12px;">
                    <strong>Memory Usage:</strong>
                    ${perfData.memory !== 'N/A' ? `
                        <div style="margin-left: 12px; margin-top: 4px;">
                            <div>Used: ${perfData.memory.used}</div>
                            <div>Total: ${perfData.memory.total}</div>
                            <div>Limit: ${perfData.memory.limit}</div>
                        </div>
                    ` : '<div style="margin-left: 12px;">Not available</div>'}
                </div>
                <div>
                    <strong>Resources Loaded:</strong> ${perfData.resources}
                </div>
            </div>
        `;
    }

    /**
     * 環境を取得
     */
    getEnvironment() {
        const hostname = window.location.hostname;

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'Development';
        } else if (hostname.includes('.databricks.com')) {
            return 'Databricks';
        } else {
            return 'Production';
        }
    }

    /**
     * レベルに応じた色を取得
     */
    getLevelColor(level) {
        const colors = {
            error: '#ff0000',
            warn: '#ffaa00',
            info: '#00aaff',
            debug: '#00ff00'
        };
        return colors[level] || '#00ff00';
    }

    /**
     * HTMLエスケープ
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初期化
if (typeof window !== 'undefined') {
    window.debugManager = new DebugManager();
}

// Node.js環境の場合
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DebugManager;
}
