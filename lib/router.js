/**
 * Unified Router for ML Platform
 * Phase 1B - タブ乱立解消のためのURLルーティングシステム
 */

class Router {
    constructor() {
        if (Router.instance) {
            return Router.instance;
        }

        this.routes = new Map();
        this.currentRoute = null;
        this.history = [];
        this.maxHistory = 50;

        // Initialize
        this.init();

        Router.instance = this;
    }

    /**
     * 初期化
     */
    init() {
        // Handle browser back/forward
        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.route) {
                this.handleRoute(event.state.route, false);
            }
        });

        // Handle initial route
        this.handleInitialRoute();
    }

    /**
     * 初期ルートを処理
     */
    handleInitialRoute() {
        const hash = window.location.hash.slice(1) || '';
        const path = window.location.pathname;

        // Determine current app and view
        if (path.includes('ml-app')) {
            this.currentApp = 'ml-app';
            this.currentView = hash || 'runs';
        } else if (path.includes('ml-training')) {
            this.currentApp = 'ml-training';
            this.currentView = hash || 'step1';
        } else {
            this.currentApp = 'database';
            this.currentView = hash || 'graph';
        }

        // Store in history
        this.addToHistory({
            app: this.currentApp,
            view: this.currentView,
            timestamp: Date.now()
        });
    }

    /**
     * ルートを登録
     * @param {string} pattern - ルートパターン
     * @param {Function} handler - ハンドラー関数
     */
    register(pattern, handler) {
        this.routes.set(pattern, handler);
    }

    /**
     * 指定ルートに遷移
     * @param {string} route - ルート（例: 'ml-app#datasets', 'database#graph'）
     * @param {boolean} addHistory - 履歴に追加するか
     * @param {Object} options - オプション
     */
    navigate(route, addHistory = true, options = {}) {
        const [app, view] = route.split('#');

        // Same window navigation
        if (options.sameWindow !== false) {
            // Check if we need to change app
            if (app !== this.currentApp) {
                // Store navigation intent
                sessionStorage.setItem('router_navigate_to', JSON.stringify({
                    view: view || '',
                    options: options
                }));

                // Navigate to new app
                const appUrls = {
                    'database': '/',
                    'ml-app': '/ml-app.html',
                    'ml-training': '/ml-training.html'
                };

                window.location.href = appUrls[app] + (view ? '#' + view : '');
                return;
            }

            // Same app, different view
            this.handleRoute(route, addHistory);
        } else {
            // Open in new tab (legacy behavior)
            const appUrls = {
                'database': '/',
                'ml-app': '/ml-app.html',
                'ml-training': '/ml-training.html'
            };

            window.open(appUrls[app] + (view ? '#' + view : ''), '_blank');
        }
    }

    /**
     * ルートを処理
     * @param {string} route - ルート
     * @param {boolean} addHistory - 履歴に追加するか
     */
    handleRoute(route, addHistory = true) {
        const [app, view] = route.split('#');

        // Update URL hash without page reload
        if (view && window.location.hash !== '#' + view) {
            if (addHistory) {
                window.history.pushState({ route }, '', '#' + view);
            } else {
                window.history.replaceState({ route }, '', '#' + view);
            }
        }

        // Find and execute handler
        const handler = this.routes.get(view) || this.routes.get('*');
        if (handler) {
            handler(view, route);
        }

        // Update current state
        this.currentView = view;

        if (addHistory) {
            this.addToHistory({
                app: app || this.currentApp,
                view: view,
                timestamp: Date.now()
            });
        }

        // Dispatch event
        window.dispatchEvent(new CustomEvent('routechange', {
            detail: { app, view, route }
        }));
    }

    /**
     * 履歴に追加
     * @param {Object} entry - 履歴エントリ
     */
    addToHistory(entry) {
        this.history.push(entry);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }

    /**
     * 前のルートに戻る
     */
    back() {
        if (this.history.length > 1) {
            this.history.pop(); // Remove current
            const prev = this.history[this.history.length - 1];
            if (prev) {
                this.navigate(`${prev.app}#${prev.view}`, false);
            }
        } else {
            window.history.back();
        }
    }

    /**
     * 現在のルート情報を取得
     */
    getCurrentRoute() {
        return {
            app: this.currentApp,
            view: this.currentView,
            full: `${this.currentApp}#${this.currentView}`
        };
    }

    /**
     * ナビゲーション意図をチェック（ページ遷移後）
     */
    checkNavigationIntent() {
        const intent = sessionStorage.getItem('router_navigate_to');
        if (intent) {
            sessionStorage.removeItem('router_navigate_to');
            try {
                const { view, options } = JSON.parse(intent);
                if (view) {
                    setTimeout(() => {
                        this.handleRoute(`${this.currentApp}#${view}`, true);
                    }, 100);
                }
                return { view, options };
            } catch (e) {
                console.error('[Router] Failed to parse navigation intent:', e);
            }
        }
        return null;
    }
}

// Create singleton instance
window.router = new Router();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Router;
}
