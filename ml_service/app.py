"""
ML Service Flask API
WebSocket対応のML学習・予測・最適化API
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import os
import threading
import uuid
from datetime import datetime
import mlflow
import traceback

from core import train_model, predict_model, optimize_model, get_training_status
from config import *

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# アクティブなタスク管理
active_tasks = {}

# MLflow設定
if not is_databricks_environment():
    mlflow.set_tracking_uri("file:///tmp/mlruns")


@app.route('/health', methods=['GET'])
def health_check():
    """ヘルスチェック"""
    return jsonify({
        "status": "healthy",
        "service": "ML Service",
        "environment": ENVIRONMENT,
        "mlflow_tracking_uri": mlflow.get_tracking_uri()
    })


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
                print(f"[INFO] Training started: {run_id}")
                result = train_model(
                    dataset_id=data['dataset_id'],
                    x_list=data['x_list'],
                    target=data['target'],
                    model_name=data['model_name'],
                    cv_group=data.get('cv_group', ''),
                    run_id=run_id,
                    socketio=socketio
                )

                # 完了通知
                socketio.emit('training_complete', {
                    'run_id': run_id,
                    'status': 'completed',
                    'result': result
                })

                active_tasks[run_id]['status'] = 'completed'
                active_tasks[run_id]['result'] = result

            except Exception as e:
                print(f"[ERROR] Training failed: {run_id}")
                print(traceback.format_exc())

                socketio.emit('training_error', {
                    'run_id': run_id,
                    'status': 'failed',
                    'error': str(e)
                })

                active_tasks[run_id]['status'] = 'failed'
                active_tasks[run_id]['error'] = str(e)

        # 非同期実行開始
        thread = threading.Thread(target=train_async, daemon=True)
        thread.start()

        active_tasks[run_id] = {
            'type': 'training',
            'status': 'running',
            'started_at': datetime.now().isoformat(),
            'thread': thread,
            'params': data
        }

        return jsonify({
            "run_id": run_id,
            "status": "started",
            "message": "Training started. Use WebSocket to monitor progress."
        })

    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/api/ml/status/<run_id>', methods=['GET'])
def get_status(run_id):
    """学習ステータス取得"""
    if run_id in active_tasks:
        task = active_tasks[run_id].copy()
        # threadオブジェクトは返せないので削除
        if 'thread' in task:
            del task['thread']
        return jsonify(task)
    else:
        # ファイルシステムから取得
        try:
            status = get_training_status(run_id)
            return jsonify(status)
        except Exception as e:
            return jsonify({"error": "Run ID not found", "run_id": run_id}), 404


@app.route('/api/ml/predict', methods=['POST'])
def predict():
    """予測API"""
    try:
        data = request.json

        required_params = ['mlflow_id', 'x_list', 'input_data']
        for param in required_params:
            if param not in data:
                return jsonify({"error": f"Missing required parameter: {param}"}), 400

        # Run ID生成
        run_id = str(uuid.uuid4())

        # バックグラウンドで予測開始
        def predict_async():
            try:
                print(f"[INFO] Prediction started: {run_id}")
                result = predict_model(
                    mlflow_id=data['mlflow_id'],
                    x_list=data['x_list'],
                    input_data=data['input_data'],
                    run_id=run_id,
                    socketio=socketio
                )

                socketio.emit('prediction_complete', {
                    'run_id': run_id,
                    'status': 'completed',
                    'result': result
                })

                active_tasks[run_id]['status'] = 'completed'
                active_tasks[run_id]['result'] = result

            except Exception as e:
                print(f"[ERROR] Prediction failed: {run_id}")
                print(traceback.format_exc())

                socketio.emit('prediction_error', {
                    'run_id': run_id,
                    'status': 'failed',
                    'error': str(e)
                })

                active_tasks[run_id]['status'] = 'failed'
                active_tasks[run_id]['error'] = str(e)

        thread = threading.Thread(target=predict_async, daemon=True)
        thread.start()

        active_tasks[run_id] = {
            'type': 'prediction',
            'status': 'running',
            'started_at': datetime.now().isoformat(),
            'thread': thread
        }

        return jsonify({
            "run_id": run_id,
            "status": "started"
        })

    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/api/ml/optimize', methods=['POST'])
def optimize():
    """最適化API"""
    try:
        data = request.json

        required_params = ['mlflow_id', 'param_configs', 'target_param_configs']
        for param in required_params:
            if param not in data:
                return jsonify({"error": f"Missing required parameter: {param}"}), 400

        # Run ID生成
        run_id = str(uuid.uuid4())

        # バックグラウンドで最適化開始
        def optimize_async():
            try:
                print(f"[INFO] Optimization started: {run_id}")
                result = optimize_model(
                    mlflow_id=data['mlflow_id'],
                    param_configs=data['param_configs'],
                    target_param_configs=data['target_param_configs'],
                    n_trials=data.get('n_trials', 100),
                    run_id=run_id,
                    socketio=socketio
                )

                socketio.emit('optimization_complete', {
                    'run_id': run_id,
                    'status': 'completed',
                    'result': result
                })

                active_tasks[run_id]['status'] = 'completed'
                active_tasks[run_id]['result'] = result

            except Exception as e:
                print(f"[ERROR] Optimization failed: {run_id}")
                print(traceback.format_exc())

                socketio.emit('optimization_error', {
                    'run_id': run_id,
                    'status': 'failed',
                    'error': str(e)
                })

                active_tasks[run_id]['status'] = 'failed'
                active_tasks[run_id]['error'] = str(e)

        thread = threading.Thread(target=optimize_async, daemon=True)
        thread.start()

        active_tasks[run_id] = {
            'type': 'optimization',
            'status': 'running',
            'started_at': datetime.now().isoformat(),
            'thread': thread
        }

        return jsonify({
            "run_id": run_id,
            "status": "started"
        })

    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# WebSocketイベントハンドラ
@socketio.on('connect')
def handle_connect():
    print('[WebSocket] Client connected')
    emit('connection_response', {'data': 'Connected to ML Service'})


@socketio.on('disconnect')
def handle_disconnect():
    print('[WebSocket] Client disconnected')


@socketio.on('ping')
def handle_ping():
    emit('pong', {'timestamp': datetime.now().isoformat()})


if __name__ == '__main__':
    # データディレクトリ作成
    os.makedirs(LOCAL_DATASET_PATH, exist_ok=True)
    os.makedirs(LOCAL_RESULT_PATH, exist_ok=True)

    print("=" * 60)
    print("ML Service Starting...")
    print(f"Environment: {ENVIRONMENT}")
    print(f"Dataset Path: {get_dataset_path()}")
    print(f"Result Path: {get_result_path()}")
    print(f"MLflow Tracking URI: {mlflow.get_tracking_uri()}")
    print("=" * 60)

    # サーバー起動
    socketio.run(app, host='0.0.0.0', port=5000, debug=DEBUG, allow_unsafe_werkzeug=True)
