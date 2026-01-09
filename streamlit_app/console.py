import streamlit as st
import boto3
from io import BytesIO
from modules import database
from modules.config import catalog_name, schema_name, bucket_name, aws_access_key_id, aws_secret_access_key, region_name

s3 = boto3.client('s3', 
                  aws_access_key_id=aws_access_key_id, 
                  aws_secret_access_key=aws_secret_access_key, 
                  region_name=region_name)

def drop_table(catalog_name=catalog_name, schema_name=schema_name):
    with st.popover("テーブルを削除",use_container_width=True):
        table_name = st.text_input("テーブル名")
        if st.button("削除"):
            database.sqlQuery(f"""
                DROP TABLE IF EXISTS {catalog_name}.{schema_name}.{table_name};
                """)
            st.success(f"{table_name}を削除しました")

def upload_image():
    with st.popover("画像をアップロード",use_container_width=True):
        uploaded_file = st.file_uploader("ファイルを選択して下さい",key="upload_image")
        if uploaded_file is not None:
            file_name = st.text_input("ファイル名",max_chars=10,key="file_name")
            if st.button("アップロード",key="selected"):
                if file_name != "":
                    s3.upload_fileobj(uploaded_file, bucket_name, f"test/{file_name}")
                    st.success("ファイルをアップロードしました")
                else:
                    st.error("ファイル名を入力してください")

# def 

def show_uploader():
    with st.popover("アップロード",use_container_width=True):
        upload_dir = "/Volumes/catalog_beta/schema_beta/volume_beta/Themes/AI0/dataset/"
        uploaded_file = st.file_uploader("ファイルを選択して下さい",key="upload_to_volume")
        if uploaded_file is not None:
            file_name = st.text_input("ファイル名",max_chars=10,key="upload_file_name")
            file_path = upload_dir+file_name+".csv"
            if st.button("アップロード",key="selected"):
                if file_name != "":
                    # Upload the file using requests.put
                    response = requests.put(
                        f'https://{DOMAIN}/api/2.0/fs/files{file_path}',
                        headers={'Authorization': f'Bearer {TOKEN}'},
                        data=uploaded_file
                    )
                if response.status_code == 204:
                    st.success("ファイルをアップロードしました")
                    response = requests.get(
                        f'https://{DOMAIN}/api/2.0/fs/files{file_path}',
                        headers={'Authorization': f'Bearer {TOKEN}'},
                    )
                    reloaded_data = response.text
                    buffer = io.StringIO(reloaded_data)
                    st.write(pd.read_csv(buffer))
                else:
                    st.error("ファイル名を入力してください")

def show_image():
    with st.popover("画像を表示",use_container_width=True):
        file_name = st.text_input("ファイル名",max_chars=10)
        if file_name != "":
            data = BytesIO()
            s3.download_fileobj(Bucket=bucket_name, Key=f"test/{file_name}", Fileobj=data)
            data.seek(0)
            st.image(data)


def show_console():
    console_cols = st.columns([1,1,1,1])
    with console_cols[0]:
        drop_table()
    with console_cols[1]:
        upload_image()
    with console_cols[2]:
        show_image()
    with console_cols[3]:
        show_uploader()
