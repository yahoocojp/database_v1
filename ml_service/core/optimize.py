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
                param_type = config["type"]

                if param_type == "整数":
                    params[name] = trial.suggest_int(name, int(config["low"]), int(config["high"]))
                elif param_type == "小数":
                    params[name] = trial.suggest_float(name, float(config["low"]), float(config["high"]))
                elif param_type == "カテゴリ":
                    params[name] = trial.suggest_categorical(name, config["choices"])

            # 予測実行
            input_df = pd.DataFrame([params])
            scores = []

            for i, target_config in enumerate(target_param_configs):
                if i >= len(loaded_models):
                    break

                pred = loaded_models[i].predict(input_df)[0]

                if target_config["type"] == "目標値":
                    # 目標値との差を最小化
                    score = abs(pred - target_config["value"])
                else:
                    # 最大化/最小化
                    score = pred

                scores.append(score)

            return scores if len(scores) > 1 else scores[0]

        # 最適化方向の設定
        directions = []
        for target_config in target_param_configs:
            if target_config["type"] == "最大化":
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

        # 結果保存
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
            best_value = best_trial.value
        else:
            # 多目的最適化: パレート最適解を返す
            best_trials = study.best_trials
            best_params = [t.params for t in best_trials[:5]]  # 上位5件
            best_value = [t.values for t in best_trials[:5]]

        return {
            "num_trials": n_trials,
            "num_objectives": len(target_param_configs),
            "best_params": best_params,
            "best_value": best_value,
            "result_path": result_path if run_id else None,
            "optimization_result": optimization_result.to_dict(orient='records')
        }

    except Exception as e:
        notify_status(f"エラー発生: {str(e)}", None)
        raise e
