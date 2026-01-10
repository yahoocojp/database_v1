/**
 * Error Handler - 統一されたエラーハンドリング
 */

// カスタムエラークラス
class NetworkError extends Error {
    constructor(message, statusCode = null) {
        super(message);
        this.name = 'NetworkError';
        this.statusCode = statusCode;
    }
}

class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
    }
}

class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}

class DataError extends Error {
    constructor(message, datasetId = null) {
        super(message);
        this.name = 'DataError';
        this.datasetId = datasetId;
    }
}

/**
 * エラーハンドラー
 */
class ErrorHandler {
    /**
     * エラーを処理
     * @param {Error} error - エラーオブジェクト
     * @param {object} context - エラーコンテキスト
     */
    static async handle(error, context = {}) {
        // エラーログの作成
        const errorLog = this.createErrorLog(error, context);

        // コンソールにログ出力
        console.error('[ErrorHandler]', errorLog);

        // デバッグマネージャーにログ
        if (window.debugManager) {
            window.debugManager.log('error', error.message, {
                name: error.name,
                context,
                stack: error.stack
            });
        }

        // ユーザーに通知
        this.notifyUser(error, context);

        // サーバーに送信（本番環境のみ）
        if (this.isProduction() && !this.isDebugMode()) {
            await this.sendToServer(errorLog);
        }

        // エラーの種類に応じた追加処理
        this.handleSpecificError(error, context);
    }

    /**
     * エラーログを作成
     */
    static createErrorLog(error, context) {
        return {
            timestamp: new Date().toISOString(),
            name: error.name,
            message: error.message,
            stack: error.stack,
            context,
            environment: this.getEnvironment(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            url: typeof window !== 'undefined' ? window.location.href : null,
            sessionId: this.getSessionId()
        };
    }

    /**
     * ユーザーに通知
     */
    static notifyUser(error, context = {}) {
        let message = '';
        let type = 'error';

        if (error instanceof NetworkError) {
            if (error.statusCode === 503) {
                message = 'MLサービスが利用できません。しばらく待ってから再試行してください。';
            } else if (error.statusCode === 404) {
                message = '要求されたリソースが見つかりません。';
            } else if (error.statusCode >= 500) {
                message = 'サーバーエラーが発生しました。管理者に連絡してください。';
            } else {
                message = 'ネットワークエラーが発生しました。接続を確認してください。';
            }
        } else if (error instanceof ValidationError) {
            message = error.message;
            type = 'warning';
        } else if (error instanceof AuthError) {
            message = '認証エラーが発生しました。再ログインしてください。';
        } else if (error instanceof DataError) {
            message = `データエラー: ${error.message}`;
        } else {
            // 一般的なエラー
            if (this.isDebugMode()) {
                message = `エラー: ${error.message}`;
            } else {
                message = '予期しないエラーが発生しました。';
            }
        }

        // Toast通知
        if (typeof window !== 'undefined' && window.Toast) {
            window.Toast.show(message, type);
        } else {
            // Toastが使えない場合はalert
            alert(message);
        }
    }

    /**
     * 特定のエラータイプに応じた処理
     */
    static handleSpecificError(error, context) {
        if (error instanceof AuthError) {
            // 認証エラーの場合、ログイン画面にリダイレクト
            if (typeof window !== 'undefined' && !this.isDebugMode()) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
        } else if (error instanceof NetworkError && error.statusCode === 503) {
            // MLサービスダウンの場合、リトライボタンを表示
            if (typeof window !== 'undefined' && window.Toast) {
                const retryBtn = document.createElement('button');
                retryBtn.textContent = 'リトライ';
                retryBtn.onclick = () => {
                    if (context.retryFunction) {
                        context.retryFunction();
                    } else {
                        window.location.reload();
                    }
                };
                // Toast内にボタンを追加（要Toast実装更新）
            }
        }
    }

    /**
     * サーバーにエラーログを送信
     */
    static async sendToServer(errorLog) {
        try {
            await fetch('/api/errors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(errorLog)
            });
        } catch (e) {
            console.error('[ErrorHandler] Failed to send error log to server:', e);
        }
    }

    /**
     * 環境を取得
     */
    static getEnvironment() {
        if (typeof window === 'undefined') return 'server';

        const hostname = window.location.hostname;

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'development';
        } else if (hostname.includes('.databricks.com')) {
            return 'databricks';
        } else {
            return 'production';
        }
    }

    /**
     * 本番環境かどうか
     */
    static isProduction() {
        return this.getEnvironment() === 'production';
    }

    /**
     * デバッグモードかどうか
     */
    static isDebugMode() {
        if (typeof window === 'undefined') return false;

        return localStorage.getItem('debug_mode') === 'true' ||
               new URLSearchParams(window.location.search).get('debug') === 'true' ||
               this.getEnvironment() === 'development';
    }

    /**
     * セッションIDを取得（またはget生成）
     */
    static getSessionId() {
        if (typeof window === 'undefined') return null;

        let sessionId = sessionStorage.getItem('session_id');

        if (!sessionId) {
            sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('session_id', sessionId);
        }

        return sessionId;
    }

    /**
     * Fetch APIのラッパー（自動エラーハンドリング付き）
     */
    static async fetchWithErrorHandling(url, options = {}, context = {}) {
        try {
            const response = await fetch(url, options);

            if (!response.ok) {
                // HTTPエラーステータスの場合
                const errorText = await response.text();
                let errorData;

                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { message: errorText };
                }

                throw new NetworkError(
                    errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`,
                    response.status
                );
            }

            return response;

        } catch (error) {
            // ネットワークエラーまたはFetchエラー
            if (error instanceof NetworkError) {
                await this.handle(error, { ...context, url, options });
                throw error;
            } else {
                const networkError = new NetworkError(
                    error.message || 'ネットワークエラーが発生しました',
                    null
                );
                await this.handle(networkError, { ...context, url, options });
                throw networkError;
            }
        }
    }

    /**
     * 非同期関数のエラーハンドリングラッパー
     */
    static async wrapAsync(fn, context = {}) {
        try {
            return await fn();
        } catch (error) {
            await this.handle(error, context);
            throw error;
        }
    }
}

// Node.js環境の場合
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ErrorHandler,
        NetworkError,
        ValidationError,
        AuthError,
        DataError
    };
}

// グローバルに公開
if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
    window.NetworkError = NetworkError;
    window.ValidationError = ValidationError;
    window.AuthError = AuthError;
    window.DataError = DataError;
}
