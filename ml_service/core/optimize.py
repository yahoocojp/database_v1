"""
Optimization Module using Optuna
Streamlit最適化コードをリファクタリング
"""
import pandas as pd
import numpy as np
import mlflow
import mlflow.pyfunc
import optuna
from optuna.samplers import TPESampler
import os
from datetime import datetime

import pickle

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *
from core.utils import save_dataframe


def optimize_model(mlflow_id, param_configs, target_param_configs, n_trials=100, run_id=None, socketio=None):
    """
    Optuna多目的最適化実行

    Args:
        mlflow_id: MLflow Run ID
        param_configs: パラメータ設定リスト
            例: [{"name": "temp", "type": "整数", "low": 800, "high": 1000}]
        target_param_configs: 目的変数設定リスト
            例: [{"name": "hardness", "type": "最大化"}]
        n_trials: 試行回数
        run_id: Optimization Run ID
        socketio: WebSocket通知用

    Returns:
        dict: 最適化結果
    """

    def notify_status(message, progress=None):
        print(f"[{progress}%] {message}" if progress is not None else f"[INFO] {message}")
        if socketio and run_id:
            socketio.emit('optimization_progress', {
                'run_id': run_id,
                'message': message,
                'progress': progress,
                'timestamp': datetime.now().isoformat()
            })

    try:
        notify_status("最適化準備中...", 0)

        # モデルロード
        loaded_models = []

        # ローカル環境ではファイルから直接読み込む
        if not is_databricks_environment():
            result_base = f"{get_result_path()}"

            # mlflow_idからモデルを検索
            model_path = None
            for run_dir in os.listdir(result_base):
                run_path = os.path.join(result_base, run_dir)
                if os.path.isdir(run_path):
                    mlflow_dir = os.path.join(run_path, mlflow_id)
                    if os.path.exists(mlflow_dir):
                        model_path = run_path
                        break
                    models_dir = os.path.join(run_path, "models")
                    if os.path.isdir(models_dir):
                        for m in os.listdir(models_dir):
                            pkl_path = os.path.join(models_dir, m, "artifacts", "model.pkl")
                            if os.path.exists(pkl_path):
                                model_path = run_path
                                break
                    if model_path:
                        break

            if not model_path:
                raise ValueError(f"No model found for MLflow ID: {mlflow_id}")

            # モデルをロード
            models_dir = os.path.join(model_path, "models")
            for model_name in sorted(os.listdir(models_dir)):
                pkl_path = os.path.join(models_dir, model_name, "artifacts", "model.pkl")
                if os.path.exists(pkl_path):
                    with open(pkl_path, 'rb') as f:
                        model = pickle.load(f)
                    loaded_models.append(model)
        else:
            # Databricks環境ではMLflowから読み込む
            model_idx = 0
            while True:
                try:
                    model_uri = f'runs:/{mlflow_id}/trained_model_{model_idx}'
                    loaded_model = mlflow.pyfunc.load_model(model_uri)
                    loaded_models.append(loaded_model)
                    model_idx += 1
                except Exception:
                    break

        if len(loaded_models) == 0:
            raise ValueError(f"No models found for MLflow run: {mlflow_id}")

        if len(loaded_models) != len(target_param_configs):
            print(f"[WARN] Model count ({len(loaded_models)}) != target count ({len(target_param_configs)})")

        notify_status(f"{len(loaded_models)}個のモデルをロード完了", 10)

        # Optuna目的関数定義
        def objective(trial):
            # パラメータ提案
            params = {}
            for config in param_configs:
                name = config["name"]
                param_type = config.get("type", "float")

                # 複数の形式に対応 (min/max or low/high)
                low = config.get("low", config.get("min", 0))
                high = config.get("high", config.get("max", 100))

                if param_type in ["整数", "int", "integer"]:
                    params[name] = trial.suggest_int(name, int(low), int(high))
                elif param_type in ["小数", "float", "number"]:
                    params[name] = trial.suggest_float(name, float(low), float(high))
                elif param_type in ["カテゴリ", "categorical", "category"]:
                    params[name] = trial.suggest_categorical(name, config.get("choices", []))
                else:
                    # デフォルトはfloat
                    params[name] = trial.suggest_float(name, float(low), float(high))

            # 予測実行
            input_df = pd.DataFrame([params])
            scores = []

            for i, target_config in enumerate(target_param_configs):
                if i >= len(loaded_models):
                    break

                pred = loaded_models[i].predict(input_df)[0]

                target_type = target_config.get("type", target_config.get("direction", "maximize"))
                target_value = target_config.get("value", target_config.get("target"))

                if target_type in ["目標値", "target"] and target_value is not None:
                    # 目標値との差を最小化
                    score = abs(pred - float(target_value))
                else:
                    # 最大化/最小化
                    score = pred

                scores.append(score)

            return scores if len(scores) > 1 else scores[0]

        # 最適化方向の設定
        directions = []
        for target_config in target_param_configs:
            target_type = target_config.get("type", target_config.get("direction", "maximize"))
            if target_type in ["最大化", "maximize"]:
                directions.append("maximize")
            else:
                # 最小化 or 目標値
                directions.append("minimize")

        notify_status("Optuna最適化実行中...", 20)

        # Optuna実行
        sampler = TPESampler(
            n_startup_trials=10,
            n_ei_candidates=24,
            multivariate=True,
            seed=42
        )

        if len(directions) > 1:
            study = optuna.create_study(sampler=sampler, directions=directions)
        else:
            study = optuna.create_study(sampler=sampler, direction=directions[0])

        # プログレスコールバック
        def progress_callback(study, trial):
            progress = int((trial.number / n_trials) * 70) + 20  # 20-90%
            notify_status(f"Trial {trial.number}/{n_trials} 完了", progress)

        study.optimize(objective, n_trials=n_trials, callbacks=[progress_callback])

        notify_status("最適化完了。結果を保存中...", 90)

        # 結果をDataFrameに変換
        optimization_result = study.trials_dataframe()

        # Timedelta型をfloat（秒）に変換
        for col in optimization_result.columns:
            if optimization_result[col].dtype == 'timedelta64[ns]':
                optimization_result[col] = optimization_result[col].dt.total_seconds()

        # 結果保存
        result_path = None
        if run_id:
            result_path = f"{get_result_path()}/{run_id}"
            os.makedirs(result_path, exist_ok=True)

            result_csv = f"{result_path}/optimization_result.csv"
            save_dataframe(optimization_result, result_csv)

        notify_status("最適化完了！", 100)

        # ベスト試行を取得
        if len(directions) == 1:
            best_trial = study.best_trial
            best_params = best_trial.params
            best_value = float(best_trial.value) if best_trial.value is not None else None
        else:
            # 多目的最適化: パレート最適解を返す
            best_trials = study.best_trials
            best_params = [t.params for t in best_trials[:5]]  # 上位5件
            best_value = [[float(v) for v in t.values] for t in best_trials[:5]]

        return {
            "num_trials": n_trials,
            "num_objectives": len(target_param_configs),
            "best_params": best_params,
            "best_value": best_value,
            "result_path": result_path,
            "optimization_result": optimization_result.head(20).to_dict(orient='records')  # 上位20件のみ
        }

    except Exception as e:
        notify_status(f"エラー発生: {str(e)}", None)
        raise e
