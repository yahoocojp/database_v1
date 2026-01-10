/**
 * ML Service Client
 * Python MLサービスとの通信を管理
 */
const axios = require('axios');
const io = require('socket.io-client');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';

class MLClient {
    constructor() {
        this.socket = null;
        this.eventHandlers = {};
    }

    /**
     * WebSocket接続開始
     */
    connectWebSocket(handlers = {}) {
        if (this.socket && this.socket.connected) {
            console.log('[ML Client] WebSocket already connected');
            return this.socket;
        }

        console.log(`[ML Client] Connecting to ${ML_SERVICE_URL}...`);
        this.socket = io(ML_SERVICE_URL, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });

        this.eventHandlers = handlers;

        this.socket.on('connect', () => {
            console.log('[ML Client] WebSocket connected');
            if (handlers.onConnect) handlers.onConnect();
        });

        this.socket.on('disconnect', () => {
            console.log('[ML Client] WebSocket disconnected');
            if (handlers.onDisconnect) handlers.onDisconnect();
        });

        this.socket.on('connection_response', (data) => {
            console.log('[ML Client] Connection response:', data);
        });

        // 学習関連イベント
        this.socket.on('training_progress', (data) => {
            console.log(`[ML Client] Training progress: ${data.progress}% - ${data.message}`);
            if (handlers.onTrainingProgress) handlers.onTrainingProgress(data);
        });

        this.socket.on('training_complete', (data) => {
            console.log('[ML Client] Training complete:', data.run_id);
            if (handlers.onTrainingComplete) handlers.onTrainingComplete(data);
        });

        this.socket.on('training_error', (data) => {
            console.error('[ML Client] Training error:', data.error);
            if (handlers.onTrainingError) handlers.onTrainingError(data);
        });

        // 予測関連イベント
        this.socket.on('prediction_progress', (data) => {
            console.log(`[ML Client] Prediction progress: ${data.progress}%`);
            if (handlers.onPredictionProgress) handlers.onPredictionProgress(data);
        });

        this.socket.on('prediction_complete', (data) => {
            console.log('[ML Client] Prediction complete:', data.run_id);
            if (handlers.onPredictionComplete) handlers.onPredictionComplete(data);
        });

        this.socket.on('prediction_error', (data) => {
            console.error('[ML Client] Prediction error:', data.error);
            if (handlers.onPredictionError) handlers.onPredictionError(data);
        });

        // 最適化関連イベント
        this.socket.on('optimization_progress', (data) => {
            console.log(`[ML Client] Optimization progress: ${data.progress}%`);
            if (handlers.onOptimizationProgress) handlers.onOptimizationProgress(data);
        });

        this.socket.on('optimization_complete', (data) => {
            console.log('[ML Client] Optimization complete:', data.run_id);
            if (handlers.onOptimizationComplete) handlers.onOptimizationComplete(data);
        });

        this.socket.on('optimization_error', (data) => {
            console.error('[ML Client] Optimization error:', data.error);
            if (handlers.onOptimizationError) handlers.onOptimizationError(data);
        });

        return this.socket;
    }

    /**
     * WebSocket切断
     */
    disconnectWebSocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            console.log('[ML Client] WebSocket disconnected manually');
        }
    }

    /**
     * ヘルスチェック
     */
    async healthCheck() {
        try {
            const response = await axios.get(`${ML_SERVICE_URL}/health`, {
                timeout: 5000
            });
            return response.data;
        } catch (error) {
            throw new Error(`ML Service health check failed: ${error.message}`);
        }
    }

    /**
     * 学習開始
     */
    async trainModel(params) {
        try {
            const response = await axios.post(`${ML_SERVICE_URL}/api/ml/train`, params, {
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            throw new Error(`Training request failed: ${error.message}`);
        }
    }

    /**
     * 予測実行
     */
    async predictModel(params) {
        try {
            const response = await axios.post(`${ML_SERVICE_URL}/api/ml/predict`, params, {
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            throw new Error(`Prediction request failed: ${error.message}`);
        }
    }

    /**
     * 最適化実行
     */
    async optimizeModel(params) {
        try {
            const response = await axios.post(`${ML_SERVICE_URL}/api/ml/optimize`, params, {
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            throw new Error(`Optimization request failed: ${error.message}`);
        }
    }

    /**
     * ステータス取得
     */
    async getStatus(runId) {
        try {
            const response = await axios.get(`${ML_SERVICE_URL}/api/ml/status/${runId}`, {
                timeout: 5000
            });
            return response.data;
        } catch (error) {
            throw new Error(`Status request failed: ${error.message}`);
        }
    }

    /**
     * イベントハンドラを登録
     */
    on(event, handler) {
        if (this.socket) {
            this.socket.on(event, handler);
        }
    }

    /**
     * イベントを送信
     */
    emit(event, data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data);
        }
    }
}

module.exports = MLClient;
