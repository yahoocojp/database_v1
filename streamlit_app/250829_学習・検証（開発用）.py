# Databricks notebook source
!pip install scipy==1.10.1

# COMMAND ----------

#from unidecode import unidecode

# COMMAND ----------

# test_str = "てすともでる@__〇±Θ`@"
# def is_ascii(s):
#     try:
#         s.encode("ascii")
#         return True
#     except UnicodeEncodeError:
#         return False

# is_ascii(unidecode(test_str))  # → "Tesutomoderu"
# print(unidecode(test_str))

# COMMAND ----------

# MAGIC %md
# MAGIC # 準備

# COMMAND ----------

# filekey
# ec731fe3-9617-49ab-b0a4-015da52915d4

# e007e369-fe1b-4c5d-a207-340f7ffcf8a2

# COMMAND ----------

import sys

print(sys.version)
print(sys.version_info)

# COMMAND ----------

# %pip install xgboost catboost pycaret optuna optuna-integration[sklearn] boto3
# %restart_python

# COMMAND ----------

import json
import time
import os
from io import BytesIO
import requests
import numpy as np
import pandas as pd
import boto3
import optuna
from pycaret.regression import * 
import mlflow
import mlflow.sklearn
import joblib
import shap
import xgboost
import chardet

from sklearn.model_selection import LeaveOneGroupOut, KFold
from apps_config import workspace_url, aws_access_key_id, region_name, catalog_name,  bucket_name, output_path
# task_id
# schema_name,
# 共有用
schema_name = "ml_app"
# フォントを明示的に指定（例: DejaVu Sans は通常インストール済み）
import matplotlib
matplotlib.rcParams['font.family'] = 'DejaVu Sans'



# aws_secret_access_key, 
endpoint = f"{workspace_url}/api/2.0/preview/scim/v2/Users" # SCIM APIエンドポイント
aws_secret_access_key = dbutils.secrets.get(scope="250804", key = "aws-secret-key")
s3 = boto3.client('s3', 
                  aws_access_key_id=aws_access_key_id, 
                  aws_secret_access_key=aws_secret_access_key, 
                  region_name=region_name)


def encoding_detection(byte_data):
    # BOMチェック
    if byte_data.startswith(b'\xef\xbb\xbf'):
        return 'utf-8-sig'
    elif byte_data.startswith(b'\xff\xfe') or byte_data.startswith(b'\xfe\xff'):
        return 'utf-16'
    elif byte_data.startswith(b'\x00\x00\xfe\xff') or byte_data.startswith(b'\xff\xfe\x00\x00'):
        return 'utf-32'

    # chardetによる判定
    result = chardet.detect(byte_data)
    encoding = result['encoding']
    # if encoding is None:
    #     encoding = "cp932"
    try:
        # asciiはutf-8にフォールバック
        if encoding.lower() == 'ascii':
            encoding = 'utf-8'
        if encoding.lower() == "windows-1252":
            encoding = "cp932"
        if encoding.lower() == "macroman":
            encoding = "cp932"
        # if encoding and encoding.lower() == 'ascii':
        #     encoding = 'utf-8'
        # if encoding and encoding.lower() == "Windows-1252":
        #     encoding = "utf-8"
    except:
        encoding="cp932" # 条件が分からないが、encoding=Noneになることがある

    return encoding


def download_file_from_s3(bucket_name, file_key):
    data = BytesIO()
    s3.download_fileobj(Bucket=bucket_name, Key=file_key, Fileobj=data)
    data.seek(0)
    return data
    
def list_files(bucket_name,dir_name=""):
    res = []
    response = s3.list_objects_v2(Bucket=bucket_name)
    if 'Contents' in response:
        for obj in response['Contents']:
            if obj['Key'].startswith(dir_name):
                res.append(obj['Key'].replace(dir_name, ""))
        return res
    else:
        print("The bucket is empty.")

token = dbutils.secrets.get(scope="250804", key = "token")
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"}

# ジョブパラメータ
dbutils.widgets.text("file_key", "")
dbutils.widgets.text("x_list", "[]")
dbutils.widgets.text("target", "[]")
dbutils.widgets.text("model", "")
dbutils.widgets.text("cv_group", "")

file_key=dbutils.widgets.get("file_key")
x_list_str=dbutils.widgets.get("x_list")
x_list = json.loads(x_list_str)
target_str=dbutils.widgets.get("target")
try:
    target_list = json.loads(target_str)
except:
    target_list  = list(str(target_str)) # 過去実施ではtargetが文字列だったため。将来的に不要
# target=dbutils.widgets.get("target")
model_name=dbutils.widgets.get("model")
cv_group_str=dbutils.widgets.get("cv_group")
cv_group=json.loads(cv_group_str)


from pandas.errors import EmptyDataError, ParserError
data = download_file_from_s3(bucket_name=bucket_name, file_key=file_key)
if data is None:
    print(data)
encoding = encoding_detection(data.getvalue())
print(encoding)

df = pd.read_csv(data,encoding=encoding)

# try:
#     df = pd.read_csv(data, encoding="cp932")
# except (UnicodeDecodeError, EmptyDataError, ParserError) as e:
#     data.seek(0)
#     print(f"cp932で読み込み失敗: {e}")
#     try:
#         df = pd.read_csv(data, encoding="utf-8")
#         print("utf-8で読み込み成功")
#     except Exception as e2:
#         print(f"utf-8でも失敗: {e2}")



# df = pd.read_csv(data,encoding=encoding)
# try:
#     df = pd.read_csv(data,encoding="cp932")
# except:
#     df = pd.read_csv(data,encoding="utf-8")

# hpo_fold_num = 5
cv_fold_num = 5

rng = np.random.default_rng(seed=42)
# fold_strategy_list = ["kfold","stratifiedkfold","groupkfold","timeseries","logo"]
if cv_group == "":
    print("cv_groupが設定されていません")
    # fold_strategy = KFold()
    cv_group = "dummy"
    values = np.tile(np.arange(1, cv_fold_num + 1), len(df) // cv_fold_num + 1)[:len(df)] # 1〜nを均等に繰り返してリストを作成
    rng.shuffle(values) # ランダムにシャッフルして割り当て
    df[cv_group] = values
    df[cv_group] = df[cv_group].apply(lambda x: f"cv{x}")

else:
    print(f"cv_groupは{cv_group}です")
fold_strategy = LeaveOneGroupOut()

mlflow.set_tracking_uri("databricks")
mlflow.set_registry_uri("databricks-uc")
task_id = "250829_cv_dev"
experiment_name = "/Users/shintaro.kumai@nhkspg.co.jp/ml-app/"+task_id
# mlflow.set_experiment(experiment_name)

# ARTIFACT_PATH = f"/dbfs/Volumes/{catalog_name}/{schema_name}/artifacts"
ARTIFACT_PATH = f"dbfs:/Volumes/{catalog_name}/{schema_name}/results"


if mlflow.get_experiment_by_name(experiment_name) is None:
    mlflow.create_experiment(name=experiment_name, artifact_location=ARTIFACT_PATH)
mlflow.set_experiment(experiment_name)

# COMMAND ----------

df

# COMMAND ----------

df

# COMMAND ----------

# baseparamの有無でJOB実行時に実行されるか判定
# notebook実行時のみ、job作成
try:
    output_path = dbutils.widgets.get("output_path")
except:
    # サーバレス
    job_name = "250612_test"
    task_key = "sample_task"
    job_payload = {
        "name":job_name,
        "tasks":[
            {
                "task_key":task_key,
                "notebook_task":{
                    "notebook_path":"/Workspace/Users/shintaro.kumai@nhkspg.co.jp/ml-app/250612_ml_app",
                    "base_parameters":{
                        "output_path":"/Workspace/Users/shintaro.kumai@nhkspg.co.jp/ml-app/result"
                    }
                },
                "compute":{
                    "compute_key":"serverless-compute",
                    "spec":{
                    "kind":"Serverless"
                    }
                },
            }
        ],
        "run_as":{
            "user_name":"shintaro.kumai@nhkspg.co.jp"
        }
        }
    response = requests.post(
        f"{workspace_url}/api/2.1/jobs/create",
        headers=headers,
        json=job_payload
    )
    if response.status_code == 200:
        job_id = response.json()["job_id"]
        print(job_id)
    else:
        print(f"Error: {response.status_code},{response.text}")

# COMMAND ----------

# MAGIC %md
# MAGIC # ML実行

# COMMAND ----------

# MAGIC %md
# MAGIC ## HPO実行

# COMMAND ----------

# df
# x_list
# target
# model_name
# fold_strategy
# cv_group
# ↓
# best_param
def hpo(df,x_list,target,model_name,fold_strategy,cv_group):
    """
    <return>
    best_params:hpoの結果(辞書)
    finalized:finalized実行したモデルインスタンス
    """

    if model_name == "mlp":
        hpo_setup = setup(
            data=df[x_list+[target]], target=target, session_id=123, verbose=False, n_jobs=-1, normalize=True, 
            transformation = False,
            # transformation=True,
            fold_strategy=fold_strategy, fold_groups=df[cv_group], 
            # fold=hpo_fold_num,
            # log_experiment=True,experiment_name= experiment_name,
            )
    else:
        hpo_setup = setup(
            data=df[x_list+[target]], target=target, session_id=123, verbose=False, n_jobs=-1,
            fold_strategy=fold_strategy, fold_groups=df[cv_group], 
            # fold=hpo_fold_num, 
            # log_experiment=True,experiment_name= experiment_name,
            )

    hpo_model = create_model(model_name,verbose=False,)
    try:
        hpo_model = tune_model(hpo_model,n_iter=1,optimize="RMSE",verbose=False,search_library="optuna",search_algorithm="tpe",)
    except Exception as e:
        print(f"[WARN] Optuna TPE failed: {e}")
        print("[INFO] Falling back to default tuning method...")
        hpo_model = tune_model(hpo_model, n_iter=30, optimize="RMSE", verbose=False,search_algorithm="random")


    # except Exception as e:
    #     print(f"Optuna TPE failed: {e}")
    #     hpo_model = tune_model(hpo_model, n_iter=30, optimize="RMSE", verbose=False)

    finalized = finalize_model(hpo_model)
    # evaluate_model(finalized)
    best_params=(hpo_model.get_params())
    print(best_params)
    return best_params, finalized

# COMMAND ----------

# MAGIC %md
# MAGIC ## 検証

# COMMAND ----------

# x_list
# cv_group
# target
# df
# model_name
# **best_param

def cv_predict(df,x_list,target,model_name,best_params,cv_group,shap_values_dict=None):
    result = df[x_list+[cv_group,target]]
    for i, group in enumerate(df[cv_group].unique()): # i使ってない
        test_data=df[df[cv_group]==group][x_list+[target]]

        if model_name == "mlp":
            ml_setup = setup(data=df[~df[cv_group].isin([group])][x_list+[target]],target=target,verbose=False,n_jobs=-1,normalize=True, 
                             transformation = False,
                            #  transformation=True,
                             )
            loaded_model = create_model(model_name, **best_params)
        else:
            ml_setup = setup(data=df[~df[cv_group].isin([group])][x_list+[target]],target=target,verbose=False,n_jobs=-1)
            loaded_model = create_model(model_name, **best_params)
        finalized = finalize_model(loaded_model)

        # SHAP
        if shap_values_dict != None:
            explainer_cv = shap.Explainer(finalized.predict,df[df[cv_group]!=group][x_list])
            shap_values_cv = explainer_cv(df[df[cv_group]==group][x_list])
            shap_values_dict[group] = shap_values_cv

        predictions = predict_model(finalized,test_data,verbose=False)["prediction_label"]
        for idx,value in predictions.items():
            result.at[idx,f"predicted_{target}"]=value
    display(result)
    return result, shap_values_dict

# COMMAND ----------

# MAGIC %md
# MAGIC ## SHAP

# COMMAND ----------

# if model_name == "mlp":
# scaled_data = get_config("X_transformed")
# scaled_data = scaled_data.sort_index().reset_index(drop=True)
# scaled_y = get_config("y_transformed")
# scaled_y = scaled_y.sort_index().reset_index(drop=True)
# scaled_data[cv_group] = df[cv_group]
# scaled_data[target] = scaled_y
# display(scaled_data)

# COMMAND ----------

# # df
# # x_list
# # target
# # 
# best_params,finalized = hpo(df,x_list,target,model_name,fold_strategy,cv_group)
# # explainer = shap.Explainer(finalized.predict,preprocessed_data[~preprocessed_data["処方名"].isin([recipe_])][X])
# explainer_hpo = shap.Explainer(finalized.predict,df[x_list])
# shap_values_hpo = explainer_hpo(df[x_list])
# shap.plots.beeswarm(shap_values_hpo)
# display(shap_values_hpo)


# COMMAND ----------

# shap_df = pd.DataFrame(index=df.index,columns=[x_list+["base_values",cv_group,target,"pred"]])
# shap_df[x_list] = shap_values_hpo.values
# shap_df["base_values"] = shap_values_hpo.base_values
# shap_df[cv_group] = df[cv_group]
# shap_df[target] = df[target]
# shap_df["pred"] = finalized.predict(df[x_list])
# display(shap_df)
# shap_df.plot.scatter(x=target,y="pred")

# COMMAND ----------

# shap_dict = {
#     "shap_values":shap_values_cv.values,
#     "index":df[df[cv_group]==num][x_list].index,
#     "base_values":shap_values_cv.base_values,
#     "data":df[df[cv_group]==num][x_list].values
# }

# COMMAND ----------

#shap.plots.waterfall(shap_values_cv[18])

# COMMAND ----------

# for num in range(cv_fold_num):
#     num = num+1
#     test_data=df[df[cv_group]==num][x_list+[target]]
#     test_setup = setup(data=df[df[cv_group]!=num][x_list+[target]],target=target,verbose=False,n_jobs=-1,
#                 #    normalize=True, 
#                 #    transformation=True,
#                    )
#     # test_data = test_data.sort_index()
#     shap_model = create_model(model_name, **best_params)
#     finalized = finalize_model(shap_model)
#     explainer_cv = shap.Explainer(finalized.predict,df[df[cv_group]!=num][x_list])
#     shap_values_cv = explainer_cv(df[df[cv_group]==num][x_list])
    # shap.plots.beeswarm(shap_values_cv)
    # display(shap_values_cv)

# COMMAND ----------

# MAGIC %md
# MAGIC ## ジョブ実行IDとの紐づけ

# COMMAND ----------


from pyspark.sql.utils import AnalysisException

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
        MERGE INTO ml_app.ml_app.runs AS target
        USING (SELECT '{job_run_id}' AS id, '{run_id}' AS mlflow_id) AS source
        ON target.id = source.id
        WHEN MATCHED THEN
        UPDATE SET target.mlflow_id = source.mlflow_id
    """ 
    # spark.sql(query) # ここでエラーが発生する可能性がある

    max_retries = 10
    retry_delay = 5  # 秒

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

# MAGIC %md
# MAGIC ## mlflowログ

# COMMAND ----------

from pyspark.sql.utils import AnalysisException
import pickle
shap_values_dict = {}
cv_result=df[x_list+[cv_group]]
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
        for i,target in enumerate(target_list):
            shap_values_dict_ = {}
            cv_result_=df[x_list+[cv_group]]

            best_params,finalized = hpo(df,x_list,target,model_name,fold_strategy,cv_group)
            mlflow.sklearn.log_model(finalized,f"trained_models{i}")

            # SHAP
            explainer_hpo = shap.Explainer(finalized.predict,df[x_list]) # mlpは条件分岐が必要?
            shap_valuえｘｐぁいね = explainer_hpo(df[x_list])
            shap_values_dict_["all_data"] = shap_values_hpo

            # shap_result_hpo.to_csv("shap_result1.csv", index=False) # 一時ファイルとして保存
            # mlflow.log_artifact("shap_result_hpo.csv")

            cv_result_, shap_values_dict_ = cv_predict(df,x_list,target,model_name,best_params,cv_group,shap_values_dict_)
            cv_result[target] = cv_result_[target]
            cv_result[f"predicted_{target}"] = cv_result_[f"predicted_{target}"]
            shap_values_dict[target] = shap_values_dict_
        cv_result.to_csv(f"cv_result.csv", index=False) # 一時ファイルとして保存
        mlflow.log_artifact(f"cv_result.csv")


        artifact_path = f"shap_values_dict.pkl"
        with open(artifact_path, "wb") as f:
            pickle.dump(shap_values_dict, f)

        # MLflowにartifactとして保存
        mlflow.log_artifact(artifact_path)
 
        # ARTIFACT_PATH = f"dbfs:/Volumes/{CATALOG}/{SCHEMA}/{VOLUME}"   
    #         # メトリクスの取得
    #         metrics = pull()
            
    #         # 必要なメトリクスを明示的にログ
    #         for metric_name, metric_value in metrics.loc['Mean'].items():
    #             mlflow.log_metric(metric_name, metric_value)
mlflow.end_run()