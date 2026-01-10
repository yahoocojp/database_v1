"""
Prediction Module
Streamlit予測コードをリファクタリング
"""
import pandas as pd
import numpy as np
import mlflow
import mlflow.pyfunc
import shap
import pickle
import os
from datetime import datetime

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *
from core.utils import load_dataframe, save_dataframe


def predict_model(mlflow_id, x_list, input_data, run_id=None, socketio=None):
    """
    予測実行

    Args:
        mlflow_id: MLflow Run ID
        x_list: 説明変数リスト
        input_data: 予測用データ（DataFrame or dict or list of dict）
        run_id: Prediction Run ID（オプション）
        socketio: WebSocket通知用

    Returns:
        dict: 予測結果
    """

    def notify_status(message, progress=None):
        print(f"[{progress}%] {message}" if progress is not None else f"[INFO] {message}")
        if socketio and run_id:
            socketio.emit('prediction_progress', {
                'run_id': run_id,
                'message': message,
                'progress': progress,
                'timestamp': datetime.now().isoformat()
            })

    try:
        notify_status("予測データ準備中...", 0)

        # 入力データをDataFrameに変換
        if isinstance(input_data, dict):
            df = pd.DataFrame([input_data])
        elif isinstance(input_data, list):
            df = pd.DataFrame(input_data)
        elif isinstance(input_data, pd.DataFrame):
            df = input_data.copy()
        elif isinstance(input_data, str):
            # ファイルパスの場合
            df = load_dataframe(input_data)
        else:
            raise ValueError(f"Unsupported input_data type: {type(input_data)}")

        # 必要なカラムのみ抽出
        df = df[x_list]
        df = df.fillna(0)

        notify_status(f"予測データ準備完了（{len(df)}行）", 10)

        # MLflowからモデルをロード
        notify_status("モデルロード中...", 20)

        # 複数の目的変数に対応
        result_df = df.copy()
        shap_values_dict = {}

        # ローカル環境ではファイルから直接読み込む
        if not is_databricks_environment():
            # ローカルのartifact_pathからモデルを探索
            result_base = f"{get_result_path()}"

            # mlflow_idからrun_idを検索
            model_path = None
            for run_dir in os.listdir(result_base):
                run_path = os.path.join(result_base, run_dir)
                if os.path.isdir(run_path):
                    # mlflow_idディレクトリを確認
                    mlflow_dir = os.path.join(run_path, mlflow_id)
                    if os.path.exists(mlflow_dir):
                        model_path = run_path
                        break
                    # modelsディレクトリ内を探索
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
            model_idx = 0
            for model_name in sorted(os.listdir(models_dir)):
                pkl_path = os.path.join(models_dir, model_name, "artifacts", "model.pkl")
                if os.path.exists(pkl_path):
                    notify_status(f"モデル {model_idx} をロード中...", 30 + model_idx * 20)
                    with open(pkl_path, 'rb') as f:
                        model = pickle.load(f)

                    # 予測実行
                    predictions = model.predict(df)
                    result_df[f"predicted_target_{model_idx}"] = predictions

                    # SHAP値計算
                    try:
                        explainer = shap.Explainer(model.predict, df)
                        shap_values = explainer(df)
                        shap_values_dict[f"target_{model_idx}"] = shap_values
                    except Exception as e:
                        print(f"[WARN] SHAP calculation failed for model {model_idx}: {e}")

                    model_idx += 1
        else:
            # Databricks環境ではMLflowから読み込む
            mlflow.set_tracking_uri(get_mlflow_tracking_uri())
            model_idx = 0
            while True:
                try:
                    model_uri = f'runs:/{mlflow_id}/trained_model_{model_idx}'
                    loaded_model = mlflow.pyfunc.load_model(model_uri)

                    notify_status(f"モデル {model_idx} で予測中...", 30 + model_idx * 30)

                    # 予測実行
                    predictions = loaded_model.predict(df)
                    result_df[f"predicted_target_{model_idx}"] = predictions

                    # SHAP値計算
                    try:
                        explainer = shap.Explainer(loaded_model.predict, df)
                        shap_values = explainer(df)
                        shap_values_dict[f"target_{model_idx}"] = shap_values
                    except Exception as e:
                        print(f"[WARN] SHAP calculation failed for model {model_idx}: {e}")

                    model_idx += 1

                except Exception as e:
                    # モデルが見つからなくなったら終了
                    if "does not exist" in str(e) or "not found" in str(e).lower():
                        break
                    else:
                        raise e

        if model_idx == 0:
            raise ValueError(f"No models found for MLflow run: {mlflow_id}")

        notify_status("予測結果保存中...", 90)

        # 結果保存
        result_path = None
        if run_id:
            result_path = f"{get_result_path()}/{run_id}"
            os.makedirs(result_path, exist_ok=True)

            # CSV保存
            result_csv = f"{result_path}/prediction_result.csv"
            save_dataframe(result_df, result_csv)

            # SHAP保存
            if shap_values_dict:
                shap_path = f"{result_path}/shap_values_dict.pkl"
                with open(shap_path, "wb") as f:
                    pickle.dump(shap_values_dict, f)

        notify_status("予測完了！", 100)

        return {
            "predictions": result_df.to_dict(orient='records'),
            "num_models": model_idx,
            "num_samples": len(result_df),
            "result_path": result_path if run_id else None
        }

    except Exception as e:
        notify_status(f"エラー発生: {str(e)}", None)
        raise e
