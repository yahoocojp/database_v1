"""
ML Service Configuration
Databricks環境設定（apps_config.pyを参考）
"""
import os

# Databricks設定
WORKSPACE_URL = "https://dbc-9c716f92-8f62.cloud.databricks.com"
CATALOG_NAME = "ml_app"
SCHEMA_NAME = "ml_app"

# AWS S3設定（本番用 - 環境変数から取得）
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
REGION_NAME = os.getenv("AWS_REGION", "us-east-1")
BUCKET_NAME = os.getenv("AWS_BUCKET_NAME", "250529-test")

# Databricks Secretsから取得（環境変数経由）
def get_databricks_token():
    """環境変数からDatabricksトークンを取得"""
    token = os.getenv("DATABRICKS_TOKEN")
    if not token:
        print("[WARN] DATABRICKS_TOKEN not set. Using mock mode.")
    return token

def get_aws_secret_key():
    """AWS認証情報を取得"""
    secret_key = os.getenv("AWS_SECRET_KEY")
    if not secret_key:
        print("[WARN] AWS_SECRET_KEY not set.")
    return secret_key

def get_aws_credentials():
    """AWS認証情報を辞書で返す"""
    return {
        'aws_access_key_id': AWS_ACCESS_KEY_ID,
        'aws_secret_access_key': get_aws_secret_key(),
        'region_name': REGION_NAME
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
    """環境に応じたデータセットパスを返す"""
    return LOCAL_DATASET_PATH if ENVIRONMENT == "local" else DATABRICKS_DATASET_PATH

def get_result_path():
    """環境に応じた結果保存パスを返す"""
    return LOCAL_RESULT_PATH if ENVIRONMENT == "local" else DATABRICKS_RESULT_PATH

def is_databricks_environment():
    """Databricks環境かどうか判定"""
    return ENVIRONMENT == "databricks"

def get_current_user():
    """現在のユーザー名取得"""
    # POC: デフォルトユーザー
    # 本番: Databricks認証から取得
    user = os.getenv("DATABRICKS_USER", "default_user")
    return user

# データベース接続設定
def get_databricks_connection_params():
    """Databricks SQL接続パラメータ"""
    return {
        'server_hostname': WORKSPACE_URL.replace('https://', ''),
        'http_path': os.getenv('DATABRICKS_HTTP_PATH', '/sql/1.0/warehouses/default'),
        'access_token': get_databricks_token()
    }

# デバッグモード
DEBUG = os.getenv("ML_DEBUG", "true").lower() == "true"

# ログ設定
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
