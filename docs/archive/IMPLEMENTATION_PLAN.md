# ML機能統合実装プラン（確定版）

**更新日**: 2026-01-09
**前提条件確認済み**: ✅

---

## 📋 確定した前提条件

### インフラ・環境
- ✅ **Databricks環境**: 利用可能（Unity Catalog + MLflow）
- ✅ **ストレージ**: POCはローカルファイル、本番はDatabricks Volumes
- ✅ **認証**: Databricks Secrets（環境変数経由）
- ✅ **ユーザー管理**: マルチユーザー（Databricksアカウント連携）
- ✅ **モデルバージョン管理**: MLflowで管理（必須）

### 機能要件
- ✅ **学習ステータス監視**: WebSocketで実装（リアルタイム）
- ✅ **SHAP可視化**: 必要（beeswarm / waterfall / bar）
- ✅ **最適化結果表示**: テーブル + 散布図（Phase 1A）、対話的可視化はPhase 2

### 技術スタック
- Backend: Node.js/Express + Python/Flask
- Database: Databricks Unity Catalog
- Model Registry: MLflow（Databricks管理）
- Real-time: WebSocket（Socket.IO）
- Storage: ローカル（開発）→ Databricks Volumes（本番）

---

## 🏗️ アーキテクチャ（確定版）

```
┌────────────────────────────────────────────────────────┐
│              Node.js/Express (Port 8000)               │
│  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │  Database App    │  │     ML App (HTML)        │   │
│  │  (index.html)    │  │  - データセット管理       │   │
│  │  - グラフ可視化   │  │  - モデル学習UI          │   │
│  │  - トレーサビリティ│  │  - 予測UI                │   │
│  └──────────────────┘  │  - 最適化UI              │   │
│                         │  - SHAP可視化            │   │
│                         └──────────────────────────┘   │
│                                                         │
│  WebSocket Server (Socket.IO)                          │
│  └── リアルタイム学習ステータス通知                     │
└────────────────┬───────────────────────────────────────┘
                 │ REST API
                 ↓
┌────────────────────────────────────────────────────────┐
│          Python ML Service (Port 5000)                 │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Flask API                                       │ │
│  │  - POST /api/ml/train    (学習・検証)           │ │
│  │  - POST /api/ml/predict  (予測)                 │ │
│  │  - POST /api/ml/optimize (最適化)               │ │
│  │  - GET  /api/ml/status/:run_id (ステータス)    │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │  ML Core (Streamlitコードをリファクタリング)     │ │
│  │  - hpo() : ハイパーパラメータ最適化              │ │
│  │  - cv_predict() : クロスバリデーション           │ │
│  │  - optimize() : Optuna最適化                     │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────┬───────────────────────────────────────┘
                 │
                 ↓
┌────────────────────────────────────────────────────────┐
│              Databricks Environment                    │
│  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ Unity Catalog    │  │  MLflow Registry         │   │
│  │ - Users          │  │  - Models                │   │
│  │ - Projects       │  │  - Experiments           │   │
│  │ - Datasets       │  │  - Runs                  │   │
│  │ - Runs           │  │  - Artifacts             │   │
│  └──────────────────┘  └──────────────────────────┘   │
│                                                         │
│  Databricks Volumes (ファイルストレージ)                │
│  /Volumes/ml_app/ml_app/datasets/                      │
│  /Volumes/ml_app/ml_app/results/                       │
└────────────────────────────────────────────────────────┘
```

---

## 📦 Phase 1A: 基盤構築（1-2週間）

### 1.1 Python MLサービスの基本構造

#### ディレクトリ構造
```
database_v1/
├── app.js                          # Node.js Express（既存）
├── package.json
├── public/
│   ├── index.html                  # Database App（既存）
│   └── ml-app.html                 # ML App（拡張）
├── ml_service/                     # 新規作成
│   ├── app.py                      # Flask API
│   ├── requirements.txt
│   ├── config.py                   # Databricks設定
│   ├── core/
│   │   ├── __init__.py
│   │   ├── train.py                # 学習ロジック（Streamlitから移植）
│   │   ├── predict.py              # 予測ロジック
│   │   ├── optimize.py             # 最適化ロジック
│   │   └── utils.py                # 共通ユーティリティ
│   └── tests/
│       └── test_train.py
└── lib/
    └── ml-client.js                # Node.js → Python APIクライアント
```

#### ml_service/config.py
```python
import os

# Databricks設定
WORKSPACE_URL = "https://dbc-9c716f92-8f62.cloud.databricks.com"
CATALOG_NAME = "ml_app"
SCHEMA_NAME = "ml_app"

# Databricks Secretsから取得
def get_databricks_token():
    """環境変数からDatabricksトークンを取得"""
    return os.getenv("DATABRICKS_TOKEN")

def get_aws_credentials():
    """AWS認証情報を取得"""
    return {
        'aws_access_key_id': "AKIASHBNSOPDAI6BV5ID",
        'aws_secret_access_key': os.getenv("AWS_SECRET_KEY"),
        'region_name': 'us-east-1'
    }

# MLflow設定
MLFLOW_TRACKING_URI = "databricks"
MLFLOW_REGISTRY_URI = "databricks-uc"

# ローカルストレージ（POC用）
LOCAL_DATASET_PATH = "./data/datasets"
LOCAL_RESULT_PATH = "./data/results"

# Databricks Volumes（本番用）
DATABRICKS_DATASET_PATH = f"/Volumes/{CATALOG_NAME}/{SCHEMA_NAME}/datasets"
DATABRICKS_RESULT_PATH = f"/Volumes/{CATALOG_NAME}/{SCHEMA_NAME}/results"

# 環境判定（POC: local, 本番: databricks）
ENVIRONMENT = os.getenv("ML_ENVIRONMENT", "local")

def get_dataset_path():
    return LOCAL_DATASET_PATH if ENVIRONMENT == "local" else DATABRICKS_DATASET_PATH

def get_result_path():
    return LOCAL_RESULT_PATH if ENVIRONMENT == "local" else DATABRICKS_RESULT_PATH
```

#### ml_service/requirements.txt
```txt
flask==3.0.0
flask-cors==4.0.0
flask-socketio==5.3.5
python-socketio==5.10.0
pycaret==3.2.0
catboost==1.2
lightgbm==4.1.0
xgboost==2.0.3
optuna==3.5.0
shap==0.44.0
mlflow==2.9.2
pandas==2.1.4
numpy==1.26.2
scikit-learn==1.3.2
chardet==5.2.0
boto3==1.34.0
databricks-sql-connector==3.0.0
```

#### ml_service/app.py
```python
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
import threading
import uuid
from datetime import datetime
import mlflow

from core.train import train_model, get_training_status
from core.predict import predict_model
from core.optimize import optimize_model
from config import *

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# アクティブな学習タスク管理
active_training_tasks = {}

# MLflow設定
mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
mlflow.set_registry_uri(MLFLOW_REGISTRY_URI)

@app.route('/health', methods=['GET'])
def health_check():
    """ヘルスチェック"""
    return jsonify({"status": "healthy", "service": "ML Service"})

@app.route('/api/ml/train', methods=['POST'])
def train():
    """学習・検証API"""
    try:
        data = request.json

        # パラメータ検証
        required_params = ['dataset_id', 'model_name', 'x_list', 'target']
        for param in required_params:
            if param not in data:
                return jsonify({"error": f"Missing required parameter: {param}"}), 400

        # Run ID生成
        run_id = str(uuid.uuid4())

        # バックグラウンドで学習開始
        def train_async():
            try:
                result = train_model(
                    dataset_id=data['dataset_id'],
                    x_list=data['x_list'],
                    target=data['target'],
                    model_name=data['model_name'],
                    cv_group=data.get('cv_group', ''),
                    run_id=run_id,
                    socketio=socketio  # WebSocket通知用
                )

                # 完了通知
                socketio.emit('training_complete', {
                    'run_id': run_id,
                    'status': 'completed',
                    'result': result
                })

            except Exception as e:
                socketio.emit('training_error', {
                    'run_id': run_id,
                    'status': 'failed',
                    'error': str(e)
                })

        # 非同期実行開始
        thread = threading.Thread(target=train_async)
        thread.start()

        active_training_tasks[run_id] = {
            'status': 'running',
            'started_at': datetime.now().isoformat(),
            'thread': thread
        }

        return jsonify({
            "run_id": run_id,
            "status": "started",
            "message": "Training started. Use WebSocket to monitor progress."
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ml/status/<run_id>', methods=['GET'])
def get_status(run_id):
    """学習ステータス取得"""
    if run_id in active_training_tasks:
        return jsonify(active_training_tasks[run_id])
    else:
        # Databricks Unity Catalogから取得
        try:
            status = get_training_status(run_id)
            return jsonify(status)
        except Exception as e:
            return jsonify({"error": "Run ID not found"}), 404

@app.route('/api/ml/predict', methods=['POST'])
def predict():
    """予測API"""
    try:
        data = request.json

        result = predict_model(
            mlflow_id=data['mlflow_id'],
            x_list=data['x_list'],
            input_data=data['input_data']
        )

        return jsonify(result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ml/optimize', methods=['POST'])
def optimize():
    """最適化API"""
    try:
        data = request.json

        # Run ID生成
        run_id = str(uuid.uuid4())

        # バックグラウンドで最適化開始
        def optimize_async():
            try:
                result = optimize_model(
                    mlflow_id=data['mlflow_id'],
                    param_configs=data['param_configs'],
                    target_param_configs=data['target_param_configs'],
                    run_id=run_id,
                    socketio=socketio
                )

                socketio.emit('optimization_complete', {
                    'run_id': run_id,
                    'status': 'completed',
                    'result': result
                })

            except Exception as e:
                socketio.emit('optimization_error', {
                    'run_id': run_id,
                    'status': 'failed',
                    'error': str(e)
                })

        thread = threading.Thread(target=optimize_async)
        thread.start()

        return jsonify({
            "run_id": run_id,
            "status": "started"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# WebSocketイベントハンドラ
@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('connection_response', {'data': 'Connected to ML Service'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

if __name__ == '__main__':
    # データディレクトリ作成
    os.makedirs(LOCAL_DATASET_PATH, exist_ok=True)
    os.makedirs(LOCAL_RESULT_PATH, exist_ok=True)

    # サーバー起動
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
```

---

### 1.2 学習ロジックのリファクタリング

#### ml_service/core/train.py
```python
import json
import pandas as pd
import numpy as np
import mlflow
import mlflow.sklearn
from pycaret.regression import *
from sklearn.model_selection import LeaveOneGroupOut
import shap
import pickle

from config import *

def train_model(dataset_id, x_list, target, model_name, cv_group, run_id, socketio=None):
    """
    学習・検証を実行

    Args:
        dataset_id: データセットID
        x_list: 説明変数リスト
        target: 目的変数リスト
        model_name: モデル名（catboost, lightgbm, mlp）
        cv_group: CV用グループカラム
        run_id: Run ID
        socketio: WebSocket通知用

    Returns:
        dict: 学習結果
    """

    # ステータス通知
    def notify_status(message, progress=None):
        if socketio:
            socketio.emit('training_progress', {
                'run_id': run_id,
                'message': message,
                'progress': progress
            })

    notify_status("データセット読み込み中...", 0)

    # データセット読み込み
    dataset_path = f"{get_dataset_path()}/{dataset_id}.csv"
    df = pd.read_csv(dataset_path)

    notify_status(f"データセット読み込み完了（{len(df)}行）", 10)

    # CV設定
    cv_fold_num = 5
    rng = np.random.default_rng(seed=42)

    if cv_group == "":
        cv_group = "dummy"
        values = np.tile(np.arange(1, cv_fold_num + 1), len(df) // cv_fold_num + 1)[:len(df)]
        rng.shuffle(values)
        df[cv_group] = values
        df[cv_group] = df[cv_group].apply(lambda x: f"cv{x}")

    fold_strategy = LeaveOneGroupOut()

    # MLflow設定
    experiment_name = f"/Users/{get_current_user()}/ml-app/{run_id}"
    artifact_path = f"dbfs:/Volumes/{CATALOG_NAME}/{SCHEMA_NAME}/results"

    if mlflow.get_experiment_by_name(experiment_name) is None:
        mlflow.create_experiment(name=experiment_name, artifact_location=artifact_path)
    mlflow.set_experiment(experiment_name)

    notify_status("ハイパーパラメータ最適化中...", 20)

    # HPO実行
    best_params, finalized_model = hpo(df, x_list, target[0], model_name, fold_strategy, cv_group)

    notify_status("クロスバリデーション実行中...", 50)

    # CV実行
    shap_values_dict = {}
    cv_result, shap_values_dict = cv_predict(
        df, x_list, target[0], model_name, best_params, cv_group, shap_values_dict
    )

    notify_status("結果保存中...", 80)

    # MLflow保存
    with mlflow.start_run() as mlflow_run:
        mlflow_run_id = mlflow_run.info.run_id

        # モデル保存
        mlflow.sklearn.log_model(finalized_model, "trained_model")

        # CV結果保存
        cv_result.to_csv("cv_result.csv", index=False)
        mlflow.log_artifact("cv_result.csv")

        # SHAP保存
        with open("shap_values_dict.pkl", "wb") as f:
            pickle.dump(shap_values_dict, f)
        mlflow.log_artifact("shap_values_dict.pkl")

        # メトリクス計算
        rmse = np.sqrt(np.mean((cv_result[f"predicted_{target[0]}"] - cv_result[target[0]]) ** 2))
        mlflow.log_metric("rmse", rmse)

    notify_status("学習完了", 100)

    return {
        "mlflow_run_id": mlflow_run_id,
        "rmse": rmse,
        "cv_result_path": f"{artifact_path}/{mlflow_run_id}/artifacts/cv_result.csv"
    }

def hpo(df, x_list, target, model_name, fold_strategy, cv_group):
    """ハイパーパラメータ最適化（Streamlitコードから移植）"""

    if model_name == "mlp":
        hpo_setup = setup(
            data=df[x_list+[target]], target=target, session_id=123,
            verbose=False, n_jobs=-1, normalize=True,
            transformation=False,
            fold_strategy=fold_strategy, fold_groups=df[cv_group]
        )
    else:
        hpo_setup = setup(
            data=df[x_list+[target]], target=target, session_id=123,
            verbose=False, n_jobs=-1,
            fold_strategy=fold_strategy, fold_groups=df[cv_group]
        )

    hpo_model = create_model(model_name, verbose=False)

    try:
        hpo_model = tune_model(
            hpo_model, n_iter=30, optimize="RMSE", verbose=False,
            search_library="optuna", search_algorithm="tpe"
        )
    except Exception as e:
        print(f"[WARN] Optuna TPE failed: {e}")
        hpo_model = tune_model(
            hpo_model, n_iter=30, optimize="RMSE", verbose=False,
            search_algorithm="random"
        )

    finalized = finalize_model(hpo_model)
    best_params = hpo_model.get_params()

    return best_params, finalized

def cv_predict(df, x_list, target, model_name, best_params, cv_group, shap_values_dict=None):
    """クロスバリデーション予測（Streamlitコードから移植）"""

    result = df[x_list+[cv_group, target]].copy()

    for i, group in enumerate(df[cv_group].unique()):
        test_data = df[df[cv_group]==group][x_list+[target]]

        if model_name == "mlp":
            ml_setup = setup(
                data=df[~df[cv_group].isin([group])][x_list+[target]],
                target=target, verbose=False, n_jobs=-1, normalize=True,
                transformation=False
            )
        else:
            ml_setup = setup(
                data=df[~df[cv_group].isin([group])][x_list+[target]],
                target=target, verbose=False, n_jobs=-1
            )

        loaded_model = create_model(model_name, **best_params)
        finalized = finalize_model(loaded_model)

        # SHAP計算
        if shap_values_dict is not None:
            explainer_cv = shap.Explainer(finalized.predict, df[df[cv_group]!=group][x_list])
            shap_values_cv = explainer_cv(df[df[cv_group]==group][x_list])
            shap_values_dict[group] = shap_values_cv

        predictions = predict_model(finalized, test_data, verbose=False)["prediction_label"]

        for idx, value in predictions.items():
            result.at[idx, f"predicted_{target}"] = value

    return result, shap_values_dict

def get_training_status(run_id):
    """Databricks Unity Catalogから学習ステータス取得"""
    # TODO: Unity Catalog接続実装
    return {"status": "unknown", "run_id": run_id}

def get_current_user():
    """現在のユーザー名取得"""
    # TODO: Databricks認証から取得
    return "default_user"
```

---

### 1.3 Node.js WebSocket統合

#### package.json（追加）
```json
{
  "dependencies": {
    "express": "^4.21.0",
    "socket.io": "^4.7.2",
    "socket.io-client": "^4.7.2",
    "axios": "^1.6.2"
  }
}
```

#### lib/ml-client.js
```javascript
const axios = require('axios');
const io = require('socket.io-client');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';

class MLClient {
    constructor() {
        this.socket = null;
    }

    /**
     * WebSocket接続開始
     */
    connectWebSocket(onProgress, onComplete, onError) {
        this.socket = io(ML_SERVICE_URL);

        this.socket.on('connect', () => {
            console.log('Connected to ML Service via WebSocket');
        });

        this.socket.on('training_progress', (data) => {
            if (onProgress) onProgress(data);
        });

        this.socket.on('training_complete', (data) => {
            if (onComplete) onComplete(data);
        });

        this.socket.on('training_error', (data) => {
            if (onError) onError(data);
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
        }
    }

    /**
     * 学習開始
     */
    async trainModel(params) {
        const response = await axios.post(`${ML_SERVICE_URL}/api/ml/train`, params);
        return response.data;
    }

    /**
     * 予測実行
     */
    async predictModel(params) {
        const response = await axios.post(`${ML_SERVICE_URL}/api/ml/predict`, params);
        return response.data;
    }

    /**
     * 最適化実行
     */
    async optimizeModel(params) {
        const response = await axios.post(`${ML_SERVICE_URL}/api/ml/optimize`, params);
        return response.data;
    }

    /**
     * ステータス取得
     */
    async getStatus(runId) {
        const response = await axios.get(`${ML_SERVICE_URL}/api/ml/status/${runId}`);
        return response.data;
    }
}

module.exports = MLClient;
```

#### app.js（追加部分）
```javascript
const express = require('express');
const path = require('path');
const socketIO = require('socket.io');
const MLClient = require('./lib/ml-client');

const app = express();
const port = 8000;

// Socket.IOサーバー
const server = require('http').createServer(app);
const io = socketIO(server);

// MLクライアント
const mlClient = new MLClient();

// 既存のExpress設定...
app.use(express.json());
app.use(express.static('public'));

// ML学習エンドポイント
app.post('/api/ml/train', async (req, res) => {
    try {
        const result = await mlClient.trainModel(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// WebSocket中継（Node.js → ブラウザ）
io.on('connection', (socket) => {
    console.log('Browser client connected');

    // Python MLサービスからの通知を転送
    const mlSocket = mlClient.connectWebSocket(
        (data) => socket.emit('training_progress', data),
        (data) => socket.emit('training_complete', data),
        (data) => socket.emit('training_error', data)
    );

    socket.on('disconnect', () => {
        console.log('Browser client disconnected');
        mlClient.disconnectWebSocket();
    });
});

// サーバー起動
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
```

---

### 1.4 ML App UI拡張（WebSocket対応）

#### public/ml-app.html（追加部分）
```html
<!-- Socket.IO CDN -->
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>

<script>
// WebSocket接続
const socket = io('http://localhost:8000');

socket.on('connect', () => {
    console.log('WebSocket connected');
});

socket.on('training_progress', (data) => {
    console.log('Training progress:', data);

    // プログレスバー更新
    const progressBar = document.getElementById('trainingProgress');
    if (progressBar) {
        progressBar.style.width = `${data.progress}%`;
        progressBar.textContent = data.message;
    }

    // ログ表示
    const logDiv = document.getElementById('trainingLog');
    if (logDiv) {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${data.message}`;
        logDiv.appendChild(logEntry);
        logDiv.scrollTop = logDiv.scrollHeight;
    }
});

socket.on('training_complete', (data) => {
    console.log('Training complete:', data);
    alert(`学習完了！\nRMSE: ${data.result.rmse.toFixed(4)}`);

    // モデル一覧を更新
    loadModels();
});

socket.on('training_error', (data) => {
    console.error('Training error:', data);
    alert(`学習失敗: ${data.error}`);
});

// 学習開始関数
async function startTraining() {
    const datasetId = document.getElementById('trainDatasetSelect').value;
    const modelName = document.getElementById('trainModelType').value;
    const xList = getSelectedColumns('features');
    const target = getSelectedColumns('target');
    const cvGroup = getSelectedColumns('cv_group')[0] || '';

    if (target.length === 0) {
        alert('目的変数を選択してください');
        return;
    }

    // 学習ダイアログ表示
    showTrainingDialog();

    try {
        const response = await fetch('/api/ml/train', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                dataset_id: datasetId,
                model_name: modelName,
                x_list: xList,
                target: target,
                cv_group: cvGroup
            })
        });

        const result = await response.json();
        console.log('Training started:', result);

    } catch (error) {
        alert(`エラー: ${error.message}`);
        closeTrainingDialog();
    }
}

// 学習ダイアログ表示
function showTrainingDialog() {
    const dialog = document.getElementById('trainingDialog');
    dialog.style.display = 'block';

    // プログレスバーリセット
    const progressBar = document.getElementById('trainingProgress');
    progressBar.style.width = '0%';
    progressBar.textContent = '待機中...';

    // ログクリア
    const logDiv = document.getElementById('trainingLog');
    logDiv.innerHTML = '';
}

function closeTrainingDialog() {
    document.getElementById('trainingDialog').style.display = 'none';
}
</script>

<!-- 学習進捗ダイアログ -->
<div id="trainingDialog" class="modal" style="display:none;">
    <div class="modal-content">
        <h3>学習中...</h3>

        <!-- プログレスバー -->
        <div class="progress-container">
            <div id="trainingProgress" class="progress-bar">0%</div>
        </div>

        <!-- ログ表示 -->
        <div id="trainingLog" class="log-container" style="height:300px; overflow-y:auto; border:1px solid #ccc; padding:10px; margin-top:20px;">
        </div>

        <button onclick="closeTrainingDialog()">閉じる</button>
    </div>
</div>

<style>
.progress-container {
    width: 100%;
    height: 40px;
    background-color: #f0f0f0;
    border-radius: 5px;
    overflow: hidden;
    margin-top: 20px;
}

.progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50, #45a049);
    text-align: center;
    line-height: 40px;
    color: white;
    font-weight: bold;
    transition: width 0.3s ease;
}

.log-container {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    background-color: #1e1e1e;
    color: #d4d4d4;
}

.log-entry {
    padding: 2px 0;
    border-bottom: 1px solid #333;
}
</style>
```

---

## 📅 実装スケジュール（詳細）

### Week 1: 基盤構築
- **Day 1-2**: Python MLサービスの基本構造作成
  - [ ] ディレクトリ構成
  - [ ] Flask app.py
  - [ ] config.py（Databricks設定）

- **Day 3-4**: 学習ロジックのリファクタリング
  - [ ] train.py（hpo, cv_predict）
  - [ ] ローカルでの動作確認

- **Day 5-7**: WebSocket統合
  - [ ] ml-client.js
  - [ ] app.js（Socket.IO）
  - [ ] ml-app.html（WebSocket UI）
  - [ ] 統合テスト

### Week 2: 機能拡張
- **Day 8-10**: 予測機能実装
  - [ ] predict.py
  - [ ] 予測API
  - [ ] 予測UI

- **Day 11-12**: SHAP可視化
  - [ ] SHAP値の取得API
  - [ ] Plotly.jsでの可視化

- **Day 13-14**: テスト・ドキュメント
  - [ ] 単体テスト
  - [ ] 統合テスト
  - [ ] README更新

---

## 🔧 開発環境セットアップ

### Python MLサービス起動
```bash
cd ml_service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 環境変数設定
export DATABRICKS_TOKEN="your_token"
export AWS_SECRET_KEY="your_key"
export ML_ENVIRONMENT="local"  # POC用

# サーバー起動
python app.py
# → http://localhost:5000
```

### Node.jsサーバー起動
```bash
npm install
npm start
# → http://localhost:8000
```

---

## ✅ 次のアクション

1. **Week 1のタスクを開始しますか？**
   - Python MLサービスの基本構造を作成
   - 学習ロジックのリファクタリング
   - WebSocket統合

2. **WebSocketの実装サンプルを先に作成しますか？**
   - シンプルなプログレスバー通知のデモ

3. **特定の部分から始めたいですか？**
   - 例: SHAP可視化だけ先に実装

どこから始めましょうか？
