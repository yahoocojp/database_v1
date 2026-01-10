/**
 * Toast Notification Component
 * 統一された通知システム
 */

class Toast {
    constructor() {
        this.toasts = [];
        this.maxToasts = 5;
        this.defaultDuration = 3000;
        this.createContainer();
    }

    /**
     * Toastコンテナを作成
     */
    createContainer() {
        if (document.getElementById('toast-container')) return;

        const container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 100000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;

        document.body.appendChild(container);
    }

    /**
     * Toast通知を表示
     * @param {string} message - メッセージ
     * @param {string} type - タイプ (success, error, warning, info)
     * @param {number} duration - 表示時間（ミリ秒）
     */
    show(message, type = 'info', duration = this.defaultDuration) {
        const container = document.getElementById('toast-container');
        if (!container) {
            this.createContainer();
            return this.show(message, type, duration);
        }

        // 最大数を超えたら古いものを削除
        if (this.toasts.length >= this.maxToasts) {
            const oldestToast = this.toasts.shift();
            if (oldestToast && oldestToast.element) {
                this.removeToast(oldestToast.element);
            }
        }

        const toast = this.createToastElement(message, type);
        container.appendChild(toast);

        // アニメーション開始
        setTimeout(() => {
            toast.classList.add('toast-show');
        }, 10);

        // Toastオブジェクトを記録
        const toastObj = { element: toast, type, message };
        this.toasts.push(toastObj);

        // 自動削除
        if (duration > 0) {
            setTimeout(() => {
                this.removeToast(toast);
            }, duration);
        }

        // デバッグログ
        if (window.debugManager) {
            window.debugManager.log('info', `Toast: ${message}`, { type, duration });
        }

        return toast;
    }

    /**
     * Toast要素を作成
     */
    createToastElement(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const colors = {
            success: { bg: '#10b981', icon: '✓', border: '#059669' },
            error: { bg: '#ef4444', icon: '✕', border: '#dc2626' },
            warning: { bg: '#f59e0b', icon: '⚠', border: '#d97706' },
            info: { bg: '#3b82f6', icon: 'ℹ', border: '#2563eb' }
        };

        const color = colors[type] || colors.info;

        toast.style.cssText = `
            background: ${color.bg};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 250px;
            max-width: 400px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            pointer-events: all;
            transform: translateX(400px);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-left: 4px solid ${color.border};
        `;

        const icon = document.createElement('span');
        icon.style.cssText = `
            font-size: 18px;
            font-weight: bold;
            flex-shrink: 0;
        `;
        icon.textContent = color.icon;

        const messageSpan = document.createElement('span');
        messageSpan.style.cssText = 'flex: 1;';
        messageSpan.textContent = message;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: transparent;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.7;
            transition: opacity 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
        closeBtn.onmouseout = () => closeBtn.style.opacity = '0.7';
        closeBtn.onclick = () => this.removeToast(toast);

        toast.appendChild(icon);
        toast.appendChild(messageSpan);
        toast.appendChild(closeBtn);

        return toast;
    }

    /**
     * Toastを削除
     */
    removeToast(toast) {
        if (!toast) return;

        toast.classList.remove('toast-show');
        toast.style.transform = 'translateX(400px)';
        toast.style.opacity = '0';

        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }

            // 配列から削除
            this.toasts = this.toasts.filter(t => t.element !== toast);
        }, 300);
    }

    /**
     * すべてのToastをクリア
     */
    clearAll() {
        this.toasts.forEach(t => this.removeToast(t.element));
        this.toasts = [];
    }

    /**
     * 成功メッセージ
     */
    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    /**
     * エラーメッセージ
     */
    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    /**
     * 警告メッセージ
     */
    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    /**
     * 情報メッセージ
     */
    info(message, duration) {
        return this.show(message, 'info', duration);
    }
}

// CSSアニメーション用のスタイルを追加
const style = document.createElement('style');
style.textContent = `
    .toast-show {
        transform: translateX(0) !important;
        opacity: 1 !important;
    }
`;
document.head.appendChild(style);

// シングルトンインスタンスを作成（DOM読み込み後）
let toast = null;

function initToast() {
    if (!toast) {
        toast = new Toast();
    }
    return toast;
}

// グローバルに公開
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initToast);
    } else {
        initToast();
    }
    window.Toast = { show: function(msg, type, dur) { initToast().show(msg, type, dur); } };
}

// Node.js環境の場合
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Toast;
}
