import streamlit as st
from modules.config import catalog_name, schema_name
from modules import database, utils, s3
import pandas as pd
import uuid
import time
import pytz
from datetime import datetime
import os
import boto3

def add_unique_filename(filename,existing_filenames):
    name, ext = os.path.splitext(filename)
    new_filename = filename
    i = 1
    while new_filename in existing_filenames:
        new_filename = f"{name}({i}){ext}"
        i += 1
    return new_filename

def show_dataset(project_list,dataset_list): # st.session_state.selected_project, st.session_state.selected_dataset
    st.title(f"{dataset_list[0]}")
    csv_data = s3.download_file_from_s3(dataset_list[1])
    df = pd.read_csv(csv_data)
    renderer=utils.get_pyg_renderer(df=df)
    renderer.explorer()
    if st.button(f"{project_list[0]}のデータセット一覧に戻る"):
        del st.session_state.selected_dataset
        st.session_state.breadcrumbs.pop()
        st.rerun()

# 選択されたプロジェクトのデータセットを表示する関数
def show_datasets(project_list,shared_project_id=None):
    # st.title(f"Datasets for {project_list[0]}")
    get_dataset_sql = f"""
    SELECT * FROM {catalog_name}.{schema_name}.datasets
    """
    datasets = database.sqlQuery(get_dataset_sql)
    datasets =datasets[(datasets["project_id"] == project_list[1]) | (datasets["project_id"] == shared_project_id)]
    datasets = datasets[~datasets["is_deleted"]]
    create_cols = st.columns([2,1,1],gap="medium",vertical_alignment="bottom")
    with create_cols[0]:
        # st.markdown('<p class="custom-text">_</p>', unsafe_allow_html=True)
        st.subheader("データセット一覧:")
    with create_cols[1]:
        dataset_filter = st.text_input("filter")
    with create_cols[2]:
        # st.markdown('<p class="custom-text">_</p>', unsafe_allow_html=True)
        with st.popover("新規登録"):
            upload_dataset(list(datasets["name"]),project_list[1])
    with st.container(border=True):
        text_cols = st.columns([2,3,2,3])
        text_list = ["データセット名","説明","作成日","操作"]
        for i in range(len(text_cols)):
            with text_cols[i]:
                html = f"""
                    <div style='text-align: center; margin: 0; padding: 0;'>
                        <h4 style='margin: 0; text-decoration: underline;'>{text_list[i]}</h4>
                    </div>
                    """
                st.components.v1.html(html,height=30)

        if datasets.empty:
            st.error("データセットがありません")
        else:
            filtered_datasets = datasets[(datasets["name"].str.contains(dataset_filter)) & (~datasets["is_deleted"])]["name"]
            if filtered_datasets.any():
                with st.container(border=False,height=450):
                    for dataset in filtered_datasets:                
                        dataset_cols = st.columns([2,3,2,3])
                        with dataset_cols[0]:
                            if st.button(dataset,key=f"{dataset}_button",use_container_width=True):
                                st.session_state.selected_dataset = [dataset,datasets.loc[datasets["name"]==dataset,"id"].item()]
                                st.session_state.breadcrumbs.append(dataset)
                                st.rerun()
                        with dataset_cols[1]: # 説明
                            # st.write(datasets.loc[datasets["name"]==dataset,"description"].values[0])
                            utils.write_html(datasets.loc[datasets["name"]==dataset,"description"].values[0])
                        with dataset_cols[2]: # 登録日
                            datetime_str = datasets.loc[datasets["name"]==dataset,"created_date"].values[0]
                            utils.write_html(utils.print_datetime2(datetime_str))
                        with dataset_cols[3]: # 操作
                            database.alter_and_delete(table_name="datasets",table_df=datasets,target_name=dataset)
            else:
                st.error("該当するデータセットはありません")

    if st.button(f"プロジェクト：{project_list[0]}に戻る",use_container_width=True):
        del st.session_state.selected_component
        st.session_state.breadcrumbs.pop()
        time.sleep(0.5)
        st.rerun()

def upload_dataset(current_datasets,project_id):
    if "uploader_key" not in st.session_state:
        st.session_state.uploader_key = 0
    uploaded_file = st.file_uploader("csvファイルを選択して下さい",key=st.session_state.uploader_key)
    if uploaded_file is not None:
        df = pd.DataFrame([])
        dataset_name,_=os.path.splitext(uploaded_file.name)
        dataset_name = add_unique_filename(dataset_name,current_datasets)
        dataset_id = str(uuid.uuid4())
        current_time = datetime.now(pytz.timezone('Asia/Tokyo')).strftime('%Y-%m-%d %H:%M:%S')
        byte_data = uploaded_file.read()
        uploaded_file.seek(0)
        encoding = utils.encoding_detection(byte_data)
        st.write(f"{encoding}で読み込んでいます。")
        # df = pd.read_csv(uploaded_file,encoding=encoding)
        try:
            # encoding="utf-8"
            df = pd.read_csv(uploaded_file,encoding=encoding)
        except:
            st.error("データを確認してください。ヘッダーが読み込めないか、使用できない文字が含まれています。(文字コードはcp932、utf-8のみ対応)")
            # カラム名にはローマ字,数字,ハイフン(-),アンダーバー(_)のみ使用できます
        if not df.empty:
            if st.button("アップロード",key="selected",use_container_width=True):
                s3.upload_file_to_s3(uploaded_file,dataset_id)
                database.sqlQuery(f"""
                    INSERT INTO {catalog_name}.{schema_name}.datasets (id, project_id,name,  description, created_date, last_updated_date, is_deleted,parent_dataset_id)
                    VALUES ('{dataset_id}', '{project_id}','{dataset_name}', '', '{current_time}','{current_time}','false',NULL)         
                """)
                st.success("アップロードしました")
                time.sleep(0.5)
                st.session_state.uploader_key += 1
                st.rerun()
            else:
                st.write(df)
        else:
            st.button("アップロード",key="not_selected2",disabled=True)
    else:
        st.button("アップロード",key="not_selected",disabled=True)
