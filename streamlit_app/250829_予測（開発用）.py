# Databricks notebook source
# !pip install pycaret catboost

# COMMAND ----------

from pyspark.sql.utils import AnalysisException
import time
import mlflow
import mlflow.sklearn
import chardet
import boto3
from io import BytesIO
from apps_config import workspace_url, aws_access_key_id, region_name, catalog_name,  bucket_name, output_path
# task_id
# schema_name,
schema_name="ml_app"
aws_secret_access_key = dbutils.secrets.get(scope="250804", key = "aws-secret-key")
s3 = boto3.client('s3', 
                  aws_access_key_id=aws_access_key_id, 
                  aws_secret_access_key=aws_secret_access_key, 
                  region_name=region_name)
def download_file_from_s3(bucket_name, file_key):
    data = BytesIO()
    s3.download_fileobj(Bucket=bucket_name, Key=file_key, Fileobj=data)
    data.seek(0)
    return data

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

# COMMAND ----------

mlflow.set_tracking_uri("databricks")
mlflow.set_registry_uri("databricks-uc")
# task_id = "250808_test5"
task_id = "250829_pred_dev"
experiment_name = "/Users/shintaro.kumai@nhkspg.co.jp/ml-app/"+task_id
# mlflow.set_experiment(experiment_name)

# ARTIFACT_PATH = f"/dbfs/Volumes/{catalog_name}/{schema_name}/artifacts"
ARTIFACT_PATH = f"dbfs:/Volumes/{catalog_name}/{schema_name}/results"


if mlflow.get_experiment_by_name(experiment_name) is None:
    mlflow.create_experiment(name=experiment_name, artifact_location=ARTIFACT_PATH)
mlflow.set_experiment(experiment_name)

# COMMAND ----------

import mlflow 
import pycaret
import catboost
import json
import pickle
import shap
import pandas as pd
dbutils.widgets.text('mlflow_id', '')
logged_model = dbutils.widgets.get('mlflow_id')
dbutils.widgets.text('x_list', '[]')
x_list_str = dbutils.widgets.get('x_list')
x_list = json.loads(x_list_str)
print(logged_model)
# target=dbutils.widgets.get("target")

dbutils.widgets.text("data", "")
# ↓ ascii対応
file_path = dbutils.widgets.get("data")
data = download_file_from_s3(bucket_name, file_path)
encoding = encoding_detection(data.getvalue())
print(encoding)
df = pd.read_csv(data,encoding=encoding)
df = df[x_list].fillna(0)
# input_json = dbutils.widgets.get("data") # パラメータ取得
# df = pd.read_json(input_json, orient='records') # JSONをDataFrameに変換
# ↑

dbutils.widgets.text("target", "[]")
target_str=dbutils.widgets.get("target")
target_list = json.loads(target_str)
# logged_model = 'runs:/030ae01a31c1496c80ff8267123e871f/test_model'
result = df.copy(deep=True)
shap_values_dict = {}
for i, target in enumerate(target_list):
    loaded_model = mlflow.pyfunc.load_model(f'runs:/{logged_model}/trained_models{i}') # PyFuncModelとしてモデルをロード
    # input_data = pd.read_csv(f"/Workspace/Users/shintaro.kumai@nhkspg.co.jp/ml-app/250718_test.csv")
    # SHAP
    explainer = shap.Explainer(loaded_model.predict,df) # mlpは条件分岐が必要?
    shap_values = explainer(df)
    shap_values_dict[target]=shap_values
    result[f"predcted_{target}"] = loaded_model.predict(df)

with mlflow.start_run():
    # PyCaretの内部で開始されたMLflowランを取得
    active_run = mlflow.active_run()
    # 結果保存
    if active_run is not None:
        run_id = active_run.info.run_id
        print("run_id",run_id)
        id_registration(run_id)
        volume_path = f"/Volumes/{catalog_name}/{schema_name}/results"
        dbutils.fs.mkdirs(f"{volume_path}/{run_id}")
        result.to_csv("prediction_result.csv", index=False) # 一時ファイルとして保存
        mlflow.log_artifact("prediction_result.csv")
        # SHAP保存
        artifact_path = "shap_values_dict.pkl"
        with open(artifact_path, "wb") as f:
            pickle.dump(shap_values_dict, f)
        # MLflowにartifactとして保存
        mlflow.log_artifact(artifact_path)
mlflow.end_run()