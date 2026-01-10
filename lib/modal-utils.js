/**
 * モーダル操作ユーティリティ
 *
 * common.cssのモーダルシステムと連携するためのヘルパー関数
 *
 * 使用例:
 *   ModalUtils.open('myModal');
 *   ModalUtils.close('myModal');
 */

(function() {
    'use strict';

    var ModalUtils = {
        /**
         * モーダルを開く
         * @param {string} modalId - モーダル要素のID
         * @param {Object} options - オプション
         * @param {Function} options.onOpen - 開いた後に実行するコールバック
         */
        open: function(modalId, options) {
            options = options || {};
            var modal = document.getElementById(modalId);

            if (!modal) {
                console.warn('ModalUtils: モーダルが見つかりません - ' + modalId);
                return false;
            }

            // display と active クラスの両方を設定（common.css対応）
            modal.style.display = 'flex';
            modal.classList.add('active');

            // ESCキーで閉じる機能を追加
            modal._escHandler = function(e) {
                if (e.key === 'Escape') {
                    ModalUtils.close(modalId);
                }
            };
            document.addEventListener('keydown', modal._escHandler);

            // オーバーレイクリックで閉じる
            modal._overlayHandler = function(e) {
                if (e.target === modal) {
                    ModalUtils.close(modalId);
                }
            };
            modal.addEventListener('click', modal._overlayHandler);

            if (typeof options.onOpen === 'function') {
                options.onOpen(modal);
            }

            return true;
        },

        /**
         * モーダルを閉じる
         * @param {string} modalId - モーダル要素のID
         * @param {Object} options - オプション
         * @param {Function} options.onClose - 閉じた後に実行するコールバック
         */
        close: function(modalId, options) {
            options = options || {};
            var modal = document.getElementById(modalId);

            if (!modal) {
                console.warn('ModalUtils: モーダルが見つかりません - ' + modalId);
                return false;
            }

            // display と active クラスの両方を解除
            modal.style.display = 'none';
            modal.classList.remove('active');

            // イベントリスナーをクリーンアップ
            if (modal._escHandler) {
                document.removeEventListener('keydown', modal._escHandler);
                delete modal._escHandler;
            }
            if (modal._overlayHandler) {
                modal.removeEventListener('click', modal._overlayHandler);
                delete modal._overlayHandler;
            }

            if (typeof options.onClose === 'function') {
                options.onClose(modal);
            }

            return true;
        },

        /**
         * モーダルの開閉をトグル
         * @param {string} modalId - モーダル要素のID
         */
        toggle: function(modalId) {
            var modal = document.getElementById(modalId);
            if (!modal) return false;

            if (modal.classList.contains('active')) {
                return this.close(modalId);
            } else {
                return this.open(modalId);
            }
        },

        /**
         * モーダルが開いているかチェック
         * @param {string} modalId - モーダル要素のID
         * @returns {boolean}
         */
        isOpen: function(modalId) {
            var modal = document.getElementById(modalId);
            return modal ? modal.classList.contains('active') : false;
        },

        /**
         * 全てのモーダルを閉じる
         */
        closeAll: function() {
            var modals = document.querySelectorAll('.modal-overlay.active');
            var self = this;
            modals.forEach(function(modal) {
                if (modal.id) {
                    self.close(modal.id);
                }
            });
        }
    };

    // グローバルに公開
    if (typeof window !== 'undefined') {
        window.ModalUtils = ModalUtils;
    }

    // CommonJS対応
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ModalUtils;
    }
})();
