"""
Training and Cross-Validation Module
scikit-learn + Optuna ベースの実装（Python 3.12対応）
"""
import json
import pandas as pd
import numpy as np
import mlflow
import mlflow.sklearn
from sklearn.model_selection import LeaveOneGroupOut, cross_val_predict
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import optuna
from optuna.samplers import TPESampler
import shap
import pickle
import os
from datetime import datetime

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import *
from core.utils import load_dataframe, save_dataframe, validate_columns, calculate_metrics

# Optunaの出力を抑制
optuna.logging.set_verbosity(optuna.logging.WARNING)


def get_model_class(model_name):
    """モデルクラスを取得"""
    model_map = {
        'catboost': 'catboost',
        'lightgbm': 'lightgbm',
        'xgboost': 'xgboost',
        'gbr': 'sklearn_gbr',
        'rf': 'sklearn_rf',
        'mlp': 'sklearn_mlp'
    }
    return model_map.get(model_name, 'sklearn_gbr')


def create_model_with_params(model_name, params=None):
    """パラメータでモデルを作成"""
    params = params or {}
    model_type = get_model_class(model_name)

    if model_type == 'catboost':
        from catboost import CatBoostRegressor
        default_params = {
            'iterations': 500,
            'learning_rate': 0.1,
            'depth': 6,
            'verbose': False,
            'random_seed': 42
        }
        default_params.update(params)
        return CatBoostRegressor(**default_params)

    elif model_type == 'lightgbm':
        from lightgbm import LGBMRegressor
        default_params = {
            'n_estimators': 500,
            'learning_rate': 0.1,
            'max_depth': 6,
            'verbose': -1,
            'random_state': 42
        }
        default_params.update(params)
        return LGBMRegressor(**default_params)

    elif model_type == 'xgboost':
        from xgboost import XGBRegressor
        default_params = {
            'n_estimators': 500,
            'learning_rate': 0.1,
            'max_depth': 6,
            'verbosity': 0,
            'random_state': 42
        }
        default_params.update(params)
        return XGBRegressor(**default_params)

    elif model_type == 'sklearn_mlp':
        default_params = {
            'hidden_layer_sizes': (100, 50),
            'max_iter': 1000,
            'random_state': 42
        }
        default_params.update(params)
        return Pipeline([
            ('scaler', StandardScaler()),
            ('mlp', MLPRegressor(**default_params))
        ])

    elif model_type == 'sklearn_rf':
        default_params = {
            'n_estimators': 100,
            'max_depth': 10,
            'random_state': 42
        }
        default_params.update(params)
        return RandomForestRegressor(**default_params)

    else:  # sklearn_gbr (default)
        default_params = {
            'n_estimators': 100,
            'learning_rate': 0.1,
            'max_depth': 5,
            'random_state': 42
        }
        default_params.update(params)
        return GradientBoostingRegressor(**default_params)


def train_model(dataset_id, x_list, target, model_name, cv_group, run_id, socketio=None):
    """
    学習・検証を実行

    Args:
        dataset_id: データセットID（ファイル名）
        x_list: 説明変数リスト
        target: 目的変数リスト
        model_name: モデル名（catboost, lightgbm, xgboost, gbr, rf, mlp）
        cv_group: CV用グループカラム
        run_id: Run ID
        socketio: WebSocket通知用

    Returns:
        dict: 学習結果
    """

    # ステータス通知関数
    def notify_status(message, progress=None):
        print(f"[{progress}%] {message}" if progress is not None else f"[INFO] {message}")
        if socketio:
            socketio.emit('training_progress', {
                'run_id': run_id,
                'message': message,
                'progress': progress,
                'timestamp': datetime.now().isoformat()
            })

    try:
        notify_status("データセット読み込み中...", 0)

        # データセット読み込み
        dataset_path = f"{get_dataset_path()}/{dataset_id}"
        if not dataset_path.endswith('.csv'):
            dataset_path += '.csv'

        df = load_dataframe(dataset_path)
        notify_status(f"データセット読み込み完了（{len(df)}行）", 10)

        # カラム検証（targetが文字列の場合はリストに変換）
        target_list = [target] if isinstance(target, str) else target
        validate_columns(df, x_list, target_list)

        # 欠損値処理
        df = df.fillna(0)

        notify_status("クロスバリデーション設定中...", 15)

        # CV設定
        cv_fold_num = 5
        rng = np.random.default_rng(seed=42)

        if cv_group == "" or cv_group not in df.columns:
            cv_group = "dummy_cv_group"
            values = np.tile(np.arange(1, cv_fold_num + 1), len(df) // cv_fold_num + 1)[:len(df)]
            rng.shuffle(values)
            df[cv_group] = values
            df[cv_group] = df[cv_group].apply(lambda x: f"cv{x}")
            notify_status(f"CV用グループを自動生成: {cv_group}", 18)

        # MLflow設定
        if is_databricks_environment():
            experiment_name = f"/Users/{get_current_user()}/ml-app/{run_id}"
            artifact_path = f"dbfs:{get_result_path()}"
        else:
            # ローカル環境
            experiment_name = f"ml-app-{run_id}"
            artifact_path = f"{get_result_path()}/{run_id}"
            os.makedirs(artifact_path, exist_ok=True)
            mlflow.set_tracking_uri("file:///tmp/mlruns")

        notify_status("MLflow実験を作成中...", 20)

        try:
            if mlflow.get_experiment_by_name(experiment_name) is None:
                mlflow.create_experiment(name=experiment_name, artifact_location=artifact_path)
            mlflow.set_experiment(experiment_name)
        except Exception as e:
            print(f"[WARN] MLflow experiment setup failed: {e}. Using default experiment.")

        # 各目的変数について学習実行
        results = {}
        shap_values_all = {}
        final_models = {}

        for idx, target_col in enumerate(target_list):
            notify_status(f"ハイパーパラメータ最適化中... ({idx+1}/{len(target_list)}: {target_col})", 25 + idx * 30)

            # HPO実行
            X = df[x_list].values
            y = df[target_col].values
            groups = df[cv_group].values

            best_params = hpo_optuna(X, y, groups, model_name)

            notify_status(f"クロスバリデーション実行中... ({idx+1}/{len(target_list)}: {target_col})", 35 + idx * 30)

            # CV実行
            cv_result, shap_values_dict, final_model = cv_predict_sklearn(
                df, x_list, target_col, model_name, best_params, cv_group
            )

            # メトリクス計算
            metrics = calculate_metrics(
                cv_result[target_col],
                cv_result[f"predicted_{target_col}"]
            )

            results[target_col] = {
                'metrics': metrics,
                'cv_result': cv_result,
                'best_params': best_params
            }
            shap_values_all[target_col] = shap_values_dict
            final_models[target_col] = final_model

            notify_status(f"{target_col} 学習完了 (RMSE: {metrics['rmse']:.4f})", 50 + idx * 30)

        notify_status("結果をMLflowに保存中...", 85)

        # MLflow保存
        mlflow_run_id = None
        with mlflow.start_run() as mlflow_run:
            mlflow_run_id = mlflow_run.info.run_id

            # 各目的変数のモデル保存
            for idx, target_col in enumerate(target_list):
                # モデル保存
                mlflow.sklearn.log_model(final_models[target_col], f"trained_model_{idx}")

                # メトリクス保存
                for metric_name, metric_value in results[target_col]['metrics'].items():
                    mlflow.log_metric(f"{target_col}_{metric_name}", metric_value)

            # CV結果を統合して保存
            cv_result_combined = df[x_list + [cv_group]].copy()
            for target_col in target_list:
                cv_result_combined[target_col] = results[target_col]['cv_result'][target_col]
                cv_result_combined[f"predicted_{target_col}"] = results[target_col]['cv_result'][f"predicted_{target_col}"]

            cv_result_path = f"{artifact_path}/cv_result.csv"
            save_dataframe(cv_result_combined, cv_result_path)
            mlflow.log_artifact(cv_result_path)

            # SHAP保存
            shap_path = f"{artifact_path}/shap_values_dict.pkl"
            with open(shap_path, "wb") as f:
                pickle.dump(shap_values_all, f)
            mlflow.log_artifact(shap_path)

            # パラメータ保存
            mlflow.log_param("model_name", model_name)
            mlflow.log_param("x_list", json.dumps(x_list))
            mlflow.log_param("target", json.dumps(target))
            mlflow.log_param("cv_group", cv_group)

        notify_status("学習完了！", 100)

        # 結果サマリー
        result_summary = {
            "mlflow_run_id": mlflow_run_id,
            "experiment_name": experiment_name,
            "artifact_path": artifact_path,
            "targets": {}
        }

        for target_col in target_list:
            result_summary["targets"][target_col] = results[target_col]['metrics']

        return result_summary

    except Exception as e:
        notify_status(f"エラー発生: {str(e)}", None)
        raise e


def hpo_optuna(X, y, groups, model_name, n_trials=30):
    """
    Optunaによるハイパーパラメータ最適化

    Args:
        X: 特徴量
        y: 目的変数
        groups: CVグループ
        model_name: モデル名
        n_trials: 試行回数

    Returns:
        dict: 最適パラメータ
    """
    model_type = get_model_class(model_name)

    def objective(trial):
        if model_type == 'catboost':
            params = {
                'iterations': trial.suggest_int('iterations', 100, 1000),
                'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
                'depth': trial.suggest_int('depth', 4, 10),
                'l2_leaf_reg': trial.suggest_float('l2_leaf_reg', 1e-8, 10.0, log=True),
            }
        elif model_type == 'lightgbm':
            params = {
                'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
                'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
                'max_depth': trial.suggest_int('max_depth', 3, 12),
                'num_leaves': trial.suggest_int('num_leaves', 10, 100),
                'min_child_samples': trial.suggest_int('min_child_samples', 5, 50),
            }
        elif model_type == 'xgboost':
            params = {
                'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
                'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
                'max_depth': trial.suggest_int('max_depth', 3, 12),
                'min_child_weight': trial.suggest_int('min_child_weight', 1, 10),
                'subsample': trial.suggest_float('subsample', 0.5, 1.0),
            }
        elif model_type == 'sklearn_mlp':
            params = {
                'hidden_layer_sizes': (
                    trial.suggest_int('hidden_layer_1', 50, 200),
                    trial.suggest_int('hidden_layer_2', 20, 100),
                ),
                'learning_rate_init': trial.suggest_float('learning_rate_init', 1e-4, 1e-2, log=True),
                'alpha': trial.suggest_float('alpha', 1e-5, 1e-2, log=True),
            }
        elif model_type == 'sklearn_rf':
            params = {
                'n_estimators': trial.suggest_int('n_estimators', 50, 300),
                'max_depth': trial.suggest_int('max_depth', 5, 20),
                'min_samples_split': trial.suggest_int('min_samples_split', 2, 20),
                'min_samples_leaf': trial.suggest_int('min_samples_leaf', 1, 10),
            }
        else:  # sklearn_gbr
            params = {
                'n_estimators': trial.suggest_int('n_estimators', 50, 300),
                'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
                'max_depth': trial.suggest_int('max_depth', 3, 10),
                'min_samples_split': trial.suggest_int('min_samples_split', 2, 20),
            }

        model = create_model_with_params(model_name, params)

        # Leave-One-Group-Out CV
        logo = LeaveOneGroupOut()
        scores = []

        for train_idx, test_idx in logo.split(X, y, groups):
            X_train, X_test = X[train_idx], X[test_idx]
            y_train, y_test = y[train_idx], y[test_idx]

            model.fit(X_train, y_train)
            pred = model.predict(X_test)
            rmse = np.sqrt(np.mean((y_test - pred) ** 2))
            scores.append(rmse)

        return np.mean(scores)

    sampler = TPESampler(seed=42)
    study = optuna.create_study(direction='minimize', sampler=sampler)
    study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

    return study.best_params


def cv_predict_sklearn(df, x_list, target, model_name, best_params, cv_group):
    """
    クロスバリデーション予測（scikit-learn版）

    Args:
        df: DataFrame
        x_list: 説明変数リスト
        target: 目的変数
        model_name: モデル名
        best_params: ハイパーパラメータ
        cv_group: CVグループカラム

    Returns:
        tuple: (result DataFrame, shap_values_dict, final_model)
    """
    result = df[x_list + [cv_group, target]].copy()
    result[f"predicted_{target}"] = np.nan

    shap_values_dict = {}
    X_all = df[x_list].values
    y_all = df[target].values
    groups = df[cv_group].values
    unique_groups = df[cv_group].unique()

    for i, group in enumerate(unique_groups):
        print(f"[INFO] CV fold {i+1}/{len(unique_groups)}: {group}")

        train_mask = groups != group
        test_mask = groups == group

        X_train = X_all[train_mask]
        y_train = y_all[train_mask]
        X_test = X_all[test_mask]

        model = create_model_with_params(model_name, best_params)
        model.fit(X_train, y_train)

        predictions = model.predict(X_test)
        result.loc[test_mask, f"predicted_{target}"] = predictions

        # SHAP計算
        try:
            # Pipeline の場合は最後のステップを取得
            if hasattr(model, 'named_steps'):
                explain_model = model.named_steps['mlp']
                X_test_scaled = model.named_steps['scaler'].transform(X_test)
                explainer = shap.Explainer(explain_model.predict, X_test_scaled)
                shap_values = explainer(X_test_scaled)
            else:
                explainer = shap.Explainer(model.predict, X_test)
                shap_values = explainer(X_test)
            shap_values_dict[group] = shap_values
        except Exception as e:
            print(f"[WARN] SHAP calculation failed for fold {group}: {e}")

    # 最終モデルを全データで学習
    final_model = create_model_with_params(model_name, best_params)
    final_model.fit(X_all, y_all)

    return result, shap_values_dict, final_model


def get_training_status(run_id):
    """
    学習ステータス取得

    Args:
        run_id: Run ID

    Returns:
        dict: ステータス情報
    """
    try:
        result_path = f"{get_result_path()}/{run_id}"
        if os.path.exists(result_path):
            return {"status": "completed", "run_id": run_id}
        else:
            return {"status": "running", "run_id": run_id}
    except Exception as e:
        return {"status": "unknown", "run_id": run_id, "error": str(e)}
