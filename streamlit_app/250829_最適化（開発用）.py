# Databricks notebook source
# dbutils.widgets.text("file_key", "")
# dbutils.widgets.text("x_list", "[]")
# dbutils.widgets.text("target", "")
dbutils.widgets.text("param_configs", "{}")
dbutils.widgets.text("target_param_configs", "{}")
dbutils.widgets.text('mlflow_id', '')

# COMMAND ----------

# !pip install optuna pycaret catboost

# COMMAND ----------

# param_configs = [{
#     "name":"q",
#     "type":"整数",
#     "low":0.00454,
#     "high":5.31109538178113,
#     },
#  {
#     "name":"2",
#     "type":"整数",
#     "low":-1.2647949481017968,
#     "high":7.320841031842663,
#  }]

# COMMAND ----------

import mlflow
from apps_config import workspace_url, aws_access_key_id, region_name, catalog_name, bucket_name, output_path
# schema_name,
# , task_id
schema_name = "ml_app"
dbutils.widgets.text('mlflow_id', '')
logged_model = dbutils.widgets.get('mlflow_id')
print(logged_model)
# logged_model = 'runs:/030ae01a31c1496c80ff8267123e871f/test_model'
# loaded_model = mlflow.pyfunc.load_model(f'runs:/{logged_model}/trained_models')
# loaded_model.predict(df)

# COMMAND ----------

def id_registration(run_id):
    # runsへrun idを登録
    dbutils.widgets.text('run_id', '')
    job_run_id = dbutils.widgets.get('run_id')
    print(job_run_id)

    # query = f"""
    # UPDATE ml_app.ml_app.runs
    # SET mlflow_id = '{run_id}'
    # WHERE id = '{job_run_id}';
    # """
    # マージに変更
    query = f"""
        MERGE INTO ml_app.ml_app_share.runs AS target
        USING (SELECT '{job_run_id}' AS id, '{run_id}' AS mlflow_id) AS source
        ON target.id = source.id
        WHEN MATCHED THEN
        UPDATE SET target.mlflow_id = source.mlflow_id
    """ 
    # spark.sql(query) # ここでエラーが発生する可能性がある

    max_retries = 3
    retry_delay = 2  # 秒

    for attempt in range(max_retries):
        try:
            spark.sql(query)
            print("UPDATE succeeded.")
            break
        # except AnalysisException as e:
        except Exception as e:
            if "ConcurrentAppendException" in str(e):
                print(f"ConcurrentAppendException detected. Retrying... ({attempt + 1}/{max_retries})")
                time.sleep(retry_delay)
            else:
                time.sleep(retry_delay)
                raise  # 他の例外は再スロー
    else:
        raise RuntimeError("UPDATE failed after multiple retries due to concurrent updates.")

# COMMAND ----------

import optuna
import json
import ast
import pandas as pd

import time

# widgets から受け取った JSON を読み込む
# param_configs = json.loads(dbutils.widgets.get("param_configs"))
# param_configs = ast.literal_eval(param_configs)
param_configs = ast.literal_eval(dbutils.widgets.get("param_configs"))
# target_param_configs = json.loads(dbutils.widgets.get("target_param_configs"))
# target_param_configs = ast.literal_eval(target_param_configs)
target_param_configs = ast.literal_eval(dbutils.widgets.get("target_param_configs"))
print(param_configs)
print(target_param_configs)
def objective(trial):
    params = {}
    for config in param_configs:
        name = config["name"]
        if config["type"] == "整数":
            params[name] = trial.suggest_int(name, int(config["low"]), int(config["high"]))
        elif config["type"] == "小数":
            params[name] = trial.suggest_float(name, float(config["low"]), float(config["high"]))
        elif config["type"] == "カテゴリ":
            params[name] = trial.suggest_categorical(name, config["choices"])
    # ここに目的関数のロジックを記述（例：モデルの評価）
    # 例：単純なスコア計算（実際はモデルのスコアなど）
    scores = []
    # directions = []
    for i,target_config in enumerate(target_param_configs):
        loaded_model = mlflow.pyfunc.load_model(f'runs:/{logged_model}/trained_models{i}')
        if target_config["type"] == "目標値":
            score = abs(loaded_model.predict(pd.DataFrame([params]))-target_param_configs[i]["value"])
        else:
            score = loaded_model.predict(pd.DataFrame([params]))
        # if target_config["type"] == "最大化":
        #     direction = "maximize"
        # else:
        #     direction = "minimize"
        # directions.append(direction)
        scores.append(score)
    return scores



# COMMAND ----------

# target_param = [{'name': '1', 'type': '最大化'}]
# target_param[0]["type"]

# COMMAND ----------

from optuna.samplers import NSGAIISampler, TPESampler

sampler = TPESampler(
    n_startup_trials=10, # ランダム探索を行う初期試行数。TPEのモデル構築前に使われる。
    n_ei_candidates=24, # 期待改善（Expected Improvement）を計算する候補数。多いほど精度が上がるが計算コストも増える。
    # gamma=0.2, # 上位の試行を選ぶ割合（既存の良い試行の割合）。デフォルトは 0.2。
    prior_weight=1.0, # 事前分布の重み。事前知識をどれだけ重視するかを調整。
    consider_prior=True, # 事前分布を考慮するかどうか。Trueで事前分布を使う。
    consider_magic_clip=True, # 外れ値の影響を抑えるためのクリッピングを行うか。True推奨。
    consider_endpoints=False, # 探索範囲の端点を考慮するか。False推奨。
    multivariate=True, # 多変量分布を使うか（パラメータ間の相関を考慮）。Trueで精度向上。
    group=True, # 同じ名前空間のパラメータをグループ化して扱うか。True推奨。
    seed=42, # 乱数シード。再現性のために指定可能。
)

# sampler = NSGAIISampler(
#     population_size=50, # 各世代で保持する試行の数。
#     crossover_prob=0.9, # 親のパラメータを交差させる確率。
#     seed=42,
#     # constraints_func=None, # 制約条件を指定する関数。制約付き最適化を行いたい場合に使用。
#     )
directions = []
for i,target_config in enumerate(target_param_configs):
    print(target_param_configs)
    print(target_config)
    if target_config["type"] == "最大化":
        direction = "maximize"
    else:
        direction = "minimize"
    directions.append(direction)
# sampler=None

# if ast.literal_eval(target_param_configs)[0]["type"] == "最大化":
study = optuna.create_study(sampler=sampler, directions=directions)
study.optimize(objective, n_trials=100)

# best_params = study.best_params
# print("Best Parameters:", best_params)
# best_value = study.best_value
# print("Best Values:", best_value)
optimization_result = study.trials_dataframe()
display(optimization_result)

# COMMAND ----------

mlflow.set_tracking_uri("databricks")
mlflow.set_registry_uri("databricks-uc")
task_id = "250829_opt_dev"
experiment_name = "/Users/shintaro.kumai@nhkspg.co.jp/ml-app/"+task_id
# mlflow.set_experiment(experiment_name)

# ARTIFACT_PATH = f"/dbfs/Volumes/{catalog_name}/{schema_name}/artifacts"
ARTIFACT_PATH = f"dbfs:/Volumes/{catalog_name}/{schema_name}/results"


if mlflow.get_experiment_by_name(experiment_name) is None:
    mlflow.create_experiment(name=experiment_name, artifact_location=ARTIFACT_PATH)
mlflow.set_experiment(experiment_name)

with mlflow.start_run():
    # PyCaretの内部で開始されたMLflowランを取得
    active_run = mlflow.active_run()

    # モデルの保存
    if active_run is not None:
        run_id = active_run.info.run_id
        print("run_id",run_id)
        id_registration(run_id)
    #     # MLflowの実験を開始
    #     with mlflow.start_run(run_id=run_id, nested=True) as nested_run:
    #         # ネストされたランのIDを取得
    #         nested_run_id = nested_run.info.run_id
    #         print("nested_run_id",nested_run_id)

        volume_path = f"/Volumes/{catalog_name}/{schema_name}/results"
        dbutils.fs.mkdirs(f"{volume_path}/{run_id}")
        optimization_result.to_csv("optimization_result.csv", index=False) # 一時ファイルとして保存
        mlflow.log_artifact("optimization_result.csv")

# COMMAND ----------

# df_tpe = study.trials_dataframe()
# display(df_tpe)

# COMMAND ----------

# for trial in study.trials:
#     print(trial.params)
#     print(trial.value)
# best_params = study.best_params
# print("Best Parameters:", best_params)
# best_value = study.best_value
# print("Best Values:", best_value)
# df_moga = study.trials_dataframe()
# display(df_moga)

# COMMAND ----------

# def objective(trial):
#     #x0:{FH:0,IH:1},w1:焼入れ温度,w2:焼入れ時間
#     # x0 = trial.suggest_int('x0', 0, 1)
#     x1 = trial.suggest_int('x1', 900, 1000)
#     x2 = trial.suggest_int('x2', 1, 20)
#     x3 = trial.suggest_int('x3', 200, 500)
#     x4 = trial.suggest_int('x4', 1, 60)
    
#     res_charpy = charpy_model.predict(scaled_x_charpy)
#     res_TS = TS_model.predict(scaled_x_TS)
#     org_charpy = scaler_y_charpy.inverse_transform(res_charpy.reshape(-1,1))
#     org_TS = scaler_y_TS.inverse_transform(res_TS.reshape(-1,1))
#     v0 = org_charpy
#     v1 = np.abs(2000 - org_TS)
#     return v0, v1 #objectiveは全ての目的関数値を返す

# COMMAND ----------

# import streamlit as st

# st.title("Optuna ハイパーパラメータ設定")

# # 変数数を指定
# num_vars = st.number_input("変数の数を指定", min_value=1, max_value=20, value=4)

# param_configs = []

# for i in range(num_vars):
#     with st.expander(f"変数 {i+1} の設定"):
#         name = st.text_input(f"変数名 {i+1}", value=f"x{i+1}")
#         param_type = st.selectbox(f"{name} の型", ["int", "float", "categorical"])
        
#         if param_type == "categorical":
#             choices = st.text_input(f"{name} の選択肢（カンマ区切り）", value="A,B,C")
#             param_configs.append({
#                 "name": name,
#                 "type": param_type,
#                 "choices": choices.split(",")
#             })
#         else:
#             low = st.number_input(f"{name} の下限", value=0.0)
#             high = st.number_input(f"{name} の上限", value=10.0)
#             param_configs.append({
#                 "name": name,
#                 "type": param_type,
#                 "low": low,
#                 "high": high
#             })


# COMMAND ----------

# def objective(trial):
#     params = {}
#     for config in param_configs:
#         if config["type"] == "int":
#             params[config["name"]] = trial.suggest_int(config["name"], int(config["low"]), int(config["high"]))
#         elif config["type"] == "float":
#             params[config["name"]] = trial.suggest_float(config["name"], config["low"], config["high"])
#         elif config["type"] == "categorical":
#             params[config["name"]] = trial.suggest_categorical(config["name"], config["choices"])
    
#     # ここに目的関数のロジックを記述
#     result = some_evaluation_function(params)
#     return result
