/**
 * WebSocket Manager - Singleton Pattern
 * 複数のWebSocket接続を一元管理
 */

class WebSocketManager {
    constructor() {
        // シングルトンパターン
        if (WebSocketManager.instance) {
            return WebSocketManager.instance;
        }

        this.socket = null;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.connected = false;

        WebSocketManager.instance = this;
    }

    /**
     * WebSocket接続を確立
     */
    connect() {
        if (this.socket?.connected) {
            console.log('[WebSocketManager] Already connected');
            return this.socket;
        }

        console.log('[WebSocketManager] Connecting...');

        this.socket = io({
            reconnection: true,
            reconnectionDelay: this.reconnectDelay,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: this.maxReconnectAttempts,
            timeout: 10000
        });

        // 接続イベント
        this.socket.on('connect', () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            console.log('[WebSocketManager] Connected', { id: this.socket.id });

            if (window.debugManager) {
                window.debugManager.log('info', 'WebSocket Connected', { id: this.socket.id });
            }
        });

        // 切断イベント
        this.socket.on('disconnect', (reason) => {
            this.connected = false;
            console.log('[WebSocketManager] Disconnected', { reason });

            if (window.debugManager) {
                window.debugManager.log('warn', 'WebSocket Disconnected', { reason });
            }
        });

        // 再接続試行
        this.socket.on('reconnect_attempt', (attempt) => {
            this.reconnectAttempts = attempt;
            console.log(`[WebSocketManager] Reconnect attempt ${attempt}/${this.maxReconnectAttempts}`);

            if (window.debugManager) {
                window.debugManager.log('info', 'WebSocket Reconnecting', {
                    attempt,
                    maxAttempts: this.maxReconnectAttempts
                });
            }
        });

        // 再接続失敗
        this.socket.on('reconnect_failed', () => {
            console.error('[WebSocketManager] Reconnection failed');

            if (window.debugManager) {
                window.debugManager.log('error', 'WebSocket Reconnection Failed', {
                    attempts: this.reconnectAttempts
                });
            }

            // ユーザーに通知
            if (window.Toast) {
                window.Toast.show('WebSocket接続に失敗しました。ページを再読み込みしてください。', 'error');
            }
        });

        // 接続エラー
        this.socket.on('connect_error', (error) => {
            console.error('[WebSocketManager] Connection error', error);

            if (window.debugManager) {
                window.debugManager.log('error', 'WebSocket Connection Error', {
                    message: error.message
                });
            }
        });

        return this.socket;
    }

    /**
     * イベントリスナーを登録
     * @param {string} event - イベント名
     * @param {function} callback - コールバック関数
     */
    on(event, callback) {
        if (!this.socket) {
            this.connect();
        }

        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);

            // Socket.IOイベントを登録（1回のみ）
            this.socket.on(event, (data) => {
                // すべての登録されたコールバックを実行
                this.listeners.get(event).forEach(cb => {
                    try {
                        cb(data);
                    } catch (error) {
                        console.error(`[WebSocketManager] Error in listener for "${event}"`, error);

                        if (window.debugManager) {
                            window.debugManager.log('error', `WebSocket Listener Error: ${event}`, {
                                message: error.message,
                                stack: error.stack
                            });
                        }
                    }
                });
            });
        }

        this.listeners.get(event).push(callback);

        if (window.debugManager) {
            window.debugManager.log('debug', `WebSocket Listener Added: ${event}`, {
                totalListeners: this.listeners.get(event).length
            });
        }
    }

    /**
     * イベントを送信
     * @param {string} event - イベント名
     * @param {*} data - 送信データ
     */
    emit(event, data) {
        if (!this.socket) {
            this.connect();
        }

        if (!this.connected) {
            console.warn('[WebSocketManager] Not connected, queuing event:', event);
            // 接続されるまで待つ
            this.socket.once('connect', () => {
                this.socket.emit(event, data);
            });
            return;
        }

        this.socket.emit(event, data);

        if (window.debugManager) {
            window.debugManager.log('debug', `WebSocket Emit: ${event}`, { data });
        }
    }

    /**
     * イベントリスナーを削除
     * @param {string} event - イベント名
     * @param {function} callback - 削除するコールバック関数
     */
    off(event, callback) {
        if (!this.listeners.has(event)) return;

        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);

        if (index > -1) {
            callbacks.splice(index, 1);

            if (window.debugManager) {
                window.debugManager.log('debug', `WebSocket Listener Removed: ${event}`, {
                    remainingListeners: callbacks.length
                });
            }
        }

        // すべてのリスナーが削除されたらSocket.IOイベントも削除
        if (callbacks.length === 0) {
            this.socket.off(event);
            this.listeners.delete(event);
        }
    }

    /**
     * すべてのイベントリスナーをクリア
     */
    clearAllListeners() {
        if (this.socket) {
            this.socket.removeAllListeners();
        }
        this.listeners.clear();

        if (window.debugManager) {
            window.debugManager.log('info', 'WebSocket All Listeners Cleared');
        }
    }

    /**
     * WebSocket接続を切断
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;

            if (window.debugManager) {
                window.debugManager.log('info', 'WebSocket Disconnected Manually');
            }
        }
    }

    /**
     * 接続状態を取得
     * @returns {boolean}
     */
    isConnected() {
        return this.connected && this.socket?.connected;
    }

    /**
     * 接続統計を取得
     * @returns {object}
     */
    getStats() {
        return {
            connected: this.connected,
            socketId: this.socket?.id,
            reconnectAttempts: this.reconnectAttempts,
            registeredEvents: Array.from(this.listeners.keys()),
            totalListeners: Array.from(this.listeners.values()).reduce((sum, arr) => sum + arr.length, 0)
        };
    }
}

// シングルトンインスタンスをエクスポート
const wsManager = new WebSocketManager();

// Node.js環境の場合
if (typeof module !== 'undefined' && module.exports) {
    module.exports = wsManager;
}

// グローバルに公開（デバッグ用）
if (typeof window !== 'undefined') {
    window.wsManager = wsManager;
}
