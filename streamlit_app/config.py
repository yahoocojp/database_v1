import os
catalog_name = "ml_app"
schema_name = "ml_app_share"
bucket_name = '250529-test'
DOMAIN = "dbc-9c716f92-8f62.cloud.databricks.com"
aws_access_key_id = "AKIASHBNSOPDAI6BV5ID"
region_name = 'us-east-1'  # 例: 'us-west-2'
workspace_url="https://dbc-9c716f92-8f62.cloud.databricks.com"
TOKEN = os.getenv("SECRET_TOKEN")
headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
    }
aws_secret_access_key = os.getenv("AWS_SECRET_KEY")