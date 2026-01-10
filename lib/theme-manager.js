/**
 * Theme Manager for ML Platform
 * Phase 1B - 統一デザインシステムとテーマ切り替え
 */

class ThemeManager {
    constructor() {
        if (ThemeManager.instance) {
            return ThemeManager.instance;
        }

        this.themes = {
            dark: {
                name: 'ダーク',
                icon: 'fa-moon',
                colors: {
                    // Primary colors
                    '--bg-primary': '#0a0a0f',
                    '--bg-secondary': '#12121a',
                    '--bg-tertiary': '#1a1a25',
                    '--bg-card': '#1e1e2a',
                    '--bg-hover': '#252535',

                    // Accent colors
                    '--accent-primary': '#6366f1',
                    '--accent-secondary': '#8b5cf6',
                    '--accent-glow': 'rgba(99, 102, 241, 0.3)',

                    // Text colors
                    '--text-primary': '#f1f5f9',
                    '--text-secondary': '#94a3b8',
                    '--text-muted': '#64748b',

                    // Border colors
                    '--border-color': '#2a2a3a',
                    '--border-light': '#3a3a4a',

                    // Status colors
                    '--success': '#10b981',
                    '--warning': '#f59e0b',
                    '--error': '#ef4444',
                    '--info': '#3b82f6',

                    // Shadows
                    '--shadow-md': '0 4px 16px rgba(0, 0, 0, 0.4)',
                    '--shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.5)',

                    // Sidebar
                    '--sidebar-bg': 'linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)',
                    '--sidebar-text': '#ffffff',
                    '--sidebar-text-muted': 'rgba(255, 255, 255, 0.7)'
                }
            },
            light: {
                name: 'ライト',
                icon: 'fa-sun',
                colors: {
                    // Primary colors
                    '--bg-primary': '#f8fafc',
                    '--bg-secondary': '#ffffff',
                    '--bg-tertiary': '#f1f5f9',
                    '--bg-card': '#ffffff',
                    '--bg-hover': '#e2e8f0',

                    // Accent colors
                    '--accent-primary': '#6366f1',
                    '--accent-secondary': '#8b5cf6',
                    '--accent-glow': 'rgba(99, 102, 241, 0.15)',

                    // Text colors
                    '--text-primary': '#1e293b',
                    '--text-secondary': '#475569',
                    '--text-muted': '#94a3b8',

                    // Border colors
                    '--border-color': '#e2e8f0',
                    '--border-light': '#cbd5e1',

                    // Status colors
                    '--success': '#10b981',
                    '--warning': '#f59e0b',
                    '--error': '#ef4444',
                    '--info': '#3b82f6',

                    // Shadows
                    '--shadow-md': '0 4px 16px rgba(0, 0, 0, 0.08)',
                    '--shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.12)',

                    // Sidebar
                    '--sidebar-bg': 'linear-gradient(180deg, #4f46e5 0%, #6366f1 100%)',
                    '--sidebar-text': '#ffffff',
                    '--sidebar-text-muted': 'rgba(255, 255, 255, 0.8)'
                }
            },
            system: {
                name: 'システム',
                icon: 'fa-desktop',
                colors: null // Will use dark or light based on system preference
            }
        };

        this.currentTheme = 'dark';
        this.listeners = [];

        this.init();

        ThemeManager.instance = this;
    }

    /**
     * 初期化
     */
    init() {
        // Load saved theme
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.setTheme(savedTheme, false);

        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (this.currentTheme === 'system') {
                    this.applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    /**
     * テーマを設定
     * @param {string} themeName - テーマ名 (dark, light, system)
     * @param {boolean} save - LocalStorageに保存するか
     */
    setTheme(themeName, save = true) {
        if (!this.themes[themeName]) {
            console.warn(`[ThemeManager] Unknown theme: ${themeName}`);
            return;
        }

        this.currentTheme = themeName;

        if (save) {
            localStorage.setItem('theme', themeName);
        }

        // Apply theme colors
        if (themeName === 'system') {
            const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.applyTheme(isDark ? 'dark' : 'light');
        } else {
            this.applyTheme(themeName);
        }

        // Notify listeners
        this.notifyListeners(themeName);
    }

    /**
     * テーマカラーを適用
     * @param {string} themeName - 実際に適用するテーマ名
     */
    applyTheme(themeName) {
        const theme = this.themes[themeName];
        if (!theme || !theme.colors) return;

        const root = document.documentElement;
        Object.entries(theme.colors).forEach(([property, value]) => {
            root.style.setProperty(property, value);
        });

        // Set data attribute for CSS selectors
        document.body.setAttribute('data-theme', themeName);

        // Update meta theme-color for mobile browsers
        let metaTheme = document.querySelector('meta[name="theme-color"]');
        if (!metaTheme) {
            metaTheme = document.createElement('meta');
            metaTheme.name = 'theme-color';
            document.head.appendChild(metaTheme);
        }
        metaTheme.content = theme.colors['--bg-primary'];
    }

    /**
     * テーマを切り替え（トグル）
     */
    toggle() {
        const themes = ['dark', 'light'];
        const currentIndex = themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        this.setTheme(themes[nextIndex]);
    }

    /**
     * 現在のテーマを取得
     */
    getTheme() {
        return this.currentTheme;
    }

    /**
     * 実効テーマを取得（system選択時の実際のテーマ）
     */
    getEffectiveTheme() {
        if (this.currentTheme === 'system') {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
        }
        return this.currentTheme;
    }

    /**
     * リスナーを追加
     * @param {Function} callback - コールバック関数
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * リスナーを削除
     * @param {Function} callback - コールバック関数
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    /**
     * リスナーに通知
     * @param {string} themeName - テーマ名
     */
    notifyListeners(themeName) {
        this.listeners.forEach(callback => {
            try {
                callback(themeName, this.getEffectiveTheme());
            } catch (e) {
                console.error('[ThemeManager] Listener error:', e);
            }
        });
    }

    /**
     * テーマ切り替えUIを作成
     * @param {HTMLElement} container - コンテナ要素
     */
    createThemeToggle(container) {
        const toggle = document.createElement('div');
        toggle.className = 'theme-toggle';
        toggle.innerHTML = `
            <button class="theme-toggle-btn" onclick="window.themeManager.toggle()" title="テーマを切り替え">
                <i class="fas ${this.themes[this.getEffectiveTheme()].icon}"></i>
            </button>
        `;

        // Add styles if not already present
        if (!document.getElementById('theme-toggle-styles')) {
            const styles = document.createElement('style');
            styles.id = 'theme-toggle-styles';
            styles.textContent = `
                .theme-toggle-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    color: var(--text-secondary);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .theme-toggle-btn:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                    border-color: var(--accent-primary);
                }
            `;
            document.head.appendChild(styles);
        }

        container.appendChild(toggle);

        // Update icon on theme change
        this.addListener((theme, effective) => {
            const icon = toggle.querySelector('i');
            if (icon) {
                icon.className = `fas ${this.themes[effective].icon}`;
            }
        });

        return toggle;
    }
}

// Create singleton instance after DOM is ready
function initThemeManager() {
    if (!window.themeManager) {
        window.themeManager = new ThemeManager();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeManager);
} else {
    initThemeManager();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}
