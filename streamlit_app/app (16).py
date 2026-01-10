import streamlit as st
st.set_page_config(layout="wide")
import pandas as pd
import numpy as np
from modules import database, utils, log, console, s3, projects, datasets, tasks
import pickle
from modules.config import catalog_name, schema_name, workspace_url, headers
import japanize_matplotlib
# 移行予定
import hiplot as hip
import time
import shap
from streamlit_shap import st_shap
from streamlit_sortables import sort_items
import json
import pytz
from datetime import datetime # create系
import requests
import uuid
import io
import uuid
with st.sidebar:
    utils.set_sidebar()
# from streamlit_extras.stylable_container import stylable_container
# assert os.getenv('DATABRICKS_WAREHOUSE_ID'), "DATABRICKS_WAREHOUSE_ID must be set in app.yaml."
ss = st.session_state
shared_project_id = "f2886371-43d7-4d03-9bdb-3b6edca5aefe"
# import matplotlib.pyplot as plt
# import matplotlib.font_manager as fm

# # 日本語フォントのパスを指定（例：Macの場合）
# # jp_font_path = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"
# # jp_font = fm.FontProperties(fname=jp_font_path)

# # plt.rcParams['font.family'] = jp_font.get_name()

# plt.rcParams['font.family'] = 'IPAPGothic'  # または他の利用可能なフォント名


def run_job(payload):
    endpoint = f"{workspace_url}/api/2.1/jobs/run-now"
    response = requests.post(endpoint, headers=headers,json=payload)
    if response.status_code == 200:
        run_id = response.json()["run_id"]
        st.write(f"job開始(Run ID:{run_id})")
        return run_id
    else:
        st.write(f"Error: {response.status_code},{response.text}")

# パンくずリストを表示する関数
def show_breadcrumbs():
    breadcrumbs = ss.get('breadcrumbs', [])
    if breadcrumbs:
        st.write(" > ".join(breadcrumbs))


# データセット管理かタスク管理を選択する関数
def select_components():
    # st.title(f"{project}")
    with st.container():
        choice_cols = st.columns([1,1])
        with choice_cols[0]:
            if st.button("データセット管理",use_container_width=True):
                ss.selected_component = 'dataset'
                ss.breadcrumbs.append("データセット管理")
                time.sleep(0.5)
                st.rerun()
        with choice_cols[1]:
            if st.button("タスク管理",use_container_width=True):
                ss.selected_component = 'task'
                ss.breadcrumbs.append("Task管理")
                time.sleep(0.5)
                st.rerun()
    if st.button("プロジェクト一覧に戻る",use_container_width=True):
        del ss.selected_project
        del ss.step
        ss.breadcrumbs.pop()
        time.sleep(0.5)
        st.rerun()

def check_status(runs): # ジョブ側に持たせる予定
    MAX_RETRIES = 3
    running_runs = runs[runs["status"].isin(["待機中","実行中"])]["id"]
    if not running_runs.empty:
        for attempt in range(MAX_RETRIES):
            try:
                for running_run in running_runs:
                    status_url = f"{workspace_url}/api/2.1/jobs/runs/get?run_id={running_run}"
                    response = requests.get(status_url,headers=headers)
                    if response.status_code == 200:
                        state = response.json()["state"]["life_cycle_state"]
                        result = response.json()["state"].get("result_state")
                        # st.write(state,result)
                        # st.write(running_run,state,result)
                        if state == "TERMINATED":
                            if result == "SUCCESS":
                                #sql 完了
                                # st.write(f"{running_run} completed successfully")
                                database.sqlQuery(f"""
                                    UPDATE {catalog_name}.{schema_name}.runs
                                    SET status = '完了'
                                    WHERE id = '{running_run}'
                                """)
                                runs[runs["id"]==running_run]["status"] = "完了" #
                            else:
                                #sql 失敗
                                # st.write(f"{running_run} failed")
                                database.sqlQuery(f"""
                                    UPDATE {catalog_name}.{schema_name}.runs
                                    SET status = '失敗'
                                    WHERE id = '{running_run}'
                                """)
                                runs[runs["id"]==running_run]["status"] = "失敗" #
                        elif state in ["RUNNING","TERMINATING"]:
                            #sql 実行中
                            # st.write(f"{running_run} is running")
                            database.sqlQuery(f"""
                                UPDATE {catalog_name}.{schema_name}.runs
                                SET status = '実行中'
                                WHERE id = '{running_run}'
                            """)
                            runs[runs["id"]==running_run]["status"] = "実行中" #
                        elif state == "QUEUED":
                            continue
                        else:
                            #sql 失敗
                            # st.write(f"{running_run} is failed(exception)")
                            database.sqlQuery(f"""
                                UPDATE {catalog_name}.{schema_name}.runs
                                SET status = '失敗'
                                WHERE id = '{running_run}'
                            """)
                            runs[runs["id"]==running_run]["status"] = "失敗" #
                return runs
                # break
                # st.rerun()
            except Exception as e:
                if "DELTA_CONCURRENT_APPEND" in str(e):
                    # print("競合が発生しました。リトライします。")
                    time.sleep(1)
                else:
                    raise e
    else:
        pass
    
def delete_run(run_id):
    # runs/cancelに変更可能
    # 使い分け？
    # MLflowへの影響確認
    database.sqlQuery(f"""
        UPDATE {catalog_name}.{schema_name}.runs
        SET is_deleted = 'true'
        WHERE id = '{run_id}'
    """)
    # sqlだけ実行されてしまう場合がある
    delete_url = f"{workspace_url}/api/2.2/jobs/runs/delete?run_id={run_id}"
    response = requests.post(delete_url,headers=headers)
    if response.status_code == 200:
        st.toast(f"{run_id}を削除しました")
        time.sleep(0.5)
        st.rerun()
    else:
        st.write(f"Error: {response.status_code},{response.text}")

# 選択されたタスクのRUNを表示する関数
def show_runs(project_list,task_list,shared_project_id=None): # ss.selected_project, ss.selected_task
    # st.title(f"Runs for {task_list[0]}")
    get_runs_sql = f"""
    SELECT * FROM {catalog_name}.{schema_name}.runs
    """
    get_datasets_sql = f"""
    SELECT * FROM {catalog_name}.{schema_name}.datasets
    """
    runs = database.sqlQuery(get_runs_sql)
    datasets = database.sqlQuery(get_datasets_sql)
    runs =runs[runs["task_id"] == task_list[1]]
    runs = runs[~runs["is_deleted"]]
    runs = runs[runs["id"] != "None"]
    check_status(runs)
    datasets =datasets[(datasets["project_id"] == project_list[1]) | (datasets["project_id"] == shared_project_id)]
    datasets = datasets[~datasets["is_deleted"]]
    # コンソールバー
    create_cols = st.columns([2,2,1,1],gap="medium",vertical_alignment="bottom")
    with create_cols[0]:
        st.subheader("ラン一覧:")
        # st.write("ラン一覧：")
    with create_cols[1]:
        run_filter = st.text_input("filter")
    with create_cols[2]:
        if "dialog" not in ss:
            if st.button("新規実行",key="dialog_test",use_container_width=True):
                create_run(task_list[1],datasets,runs)
    with create_cols[3]:
        if st.button("更新",use_container_width=True):
            st.rerun()
    # st.write("---")
    # 説明欄
    with st.container(border=True):
        text_cols = st.columns([2,2,3,2,1,2])
        text_list = ["ラン名","タイプ","説明","作成日","進捗","操作"]
        for i in range(len(text_cols)):
            with text_cols[i]:
                html = f"""
                    <div style='text-align: center; margin: 0; padding: 0;'>
                        <h4 style='margin: 0; text-decoration: underline;'>{text_list[i]}</h4>
                    </div>
                    """
                st.components.v1.html(html,height=30)
        if runs.empty:
            st.error("実行されていません")
        else:
            filtered_runs = runs[(runs["name"].str.contains(run_filter)) & (~runs["is_deleted"])]["id"]
            if filtered_runs.any():
                with st.container(border=False,height=450): # 可変の方がいいかも
                    for i,run in enumerate(filtered_runs): # id
                        run_name=runs.loc[runs["id"]==run,"name"].item()
                        # st.write("---")
                        run_cols = st.columns([2,2,3,2,1,2],vertical_alignment="center")
                        with run_cols[0]: # ラン名
                            if runs.loc[runs["id"] == run, "status"].values[0] == "完了":
                                disabled = False
                            else:
                                disabled = True
                            if st.button(run_name,key=f"{i}_{run}_button",use_container_width=True,disabled=disabled):
                                ss.selected_run = [run_name,
                                                   runs.loc[runs["id"]==run,"mlflow_id"].item(),
                                                   runs.loc[runs["id"]==run,"run_type"].item(),
                                                   runs.loc[runs["id"]==run,"x_list"].item(),
                                                   runs.loc[runs["id"]==run,"target"].item(),
                                                   ]
                                ss.breadcrumbs.append(run_name)
                                # ss.selected_run = [run,runs.loc[runs["name"]==run,"id"].item(),runs.loc[runs["name"]==run,"run_type"].item()]
                                # ss.selected_run = run
                                time.sleep(0.5)
                                st.rerun()
                        with run_cols[1]: # 実行タイプ
                            utils.write_html(runs.loc[runs["id"]==run,"run_type"].values[0])
                        with run_cols[2]: # 説明
                            utils.write_html(runs.loc[runs["id"]==run,"description"].values[0])
                        with run_cols[3]: # 実行日
                            datetime_str = runs.loc[runs["id"]==run,"created_date"].values[0]
                            utils.write_html(utils.print_datetime2(datetime_str))
                        with run_cols[4]: # 実行結果
                            utils.write_html(runs.loc[runs["id"]==run,"status"].values[0])
                        with run_cols[5]:
                            action_cols = st.columns([3,2])
                            with action_cols[0]:
                                register_states = runs.loc[runs["id"]==run,"is_registered"].values[0]
                                if (runs.loc[runs["id"] == run, "status"].values[0] == "完了") and (runs.loc[runs["id"]==run,"run_type"].values[0] == "学習・精度検証"):
                                    disabled = False
                                else:
                                    disabled = True


                                if register_states:
                                    if st.button("✅登録済",key=f"{i}_{run}_registered",use_container_width=True,disabled=disabled):
                                        with st.spinner():
                                            database.sqlQuery(f"""
                                                UPDATE {catalog_name}.{schema_name}.runs
                                                SET is_registered = 'false'
                                                WHERE id = '{run}'
                                            """)
                                            # 未実装
                                            # version=1
                                            # unregister_url = f"{workspace_url}/api/2.0/mlflow/model-versions/delete?name={run}&version={version}"
                                            # response = requests.delete(unregister_url,headers=headers)
                                            # if response.status_code == 200:
                                            #     st.success("Model unregistered successfully.")
                                            # else:
                                            #     st.error(f"Error: {response.status_code}")
                                            time.sleep(0.5)

                                        st.rerun()
                                else:
                                    if st.button("未登録",key=f"{i}_{run}_not_registered",use_container_width=True,disabled=disabled):
                                        with st.spinner():
                                            database.sqlQuery(f"""
                                                UPDATE {catalog_name}.{schema_name}.runs
                                                SET is_registered = 'true'
                                                WHERE id = '{run}'  
                                            """)
                                            time.sleep(0.5)
                                            # 未実装
                                            # register_url = f"{workspace_url}/api/2.0/mlflow/model-versions/create"
                                            # source_path = 
                                            # payload = {
                                            #     "name": run,
                                            #     "source":source_path,
                                            #     "run_id": runs.loc[runs["name"]==run,"mlflow_id"].values[0]
                                            # }
                                            # response = requests.post(unregister_url,headers=headers,json=payload)
                                            # if response.status_code == 200:
                                            #     st.success("Model registered successfully.")
                                            # else:
                                            #     st.error(f"Error: {response.status_code}")
                                        st.rerun()
                                # register_model()
                            with action_cols[1]:
                                if st.button("削除",key=f"{i}_{run}_delete",use_container_width=True):
                                    # run_id = runs.loc[runs["id"]==run,"id"].item()
                                    with st.spinner(""):
                                        delete_run(run) # sleep(0.5)こみ
                                    st.rerun()
            else:
                st.error("該当するランはありません")
    if st.button("タスク選択に戻る",use_container_width=True):
        del ss.selected_task
        ss.breadcrumbs.pop()
        time.sleep(0.5)
        st.rerun()

# 初期化

if "step" not in ss:
    ss.step = 1

def next_step():
    if ss.step < 3:
        time.sleep(0.2)
        ss.step += 1

def prev_step():
    if ss.step > 1:
        time.sleep(0.2)
        ss.step -= 1


if "run_type" not in ss:
    ss.run_type = "学習・予測"
if "description" not in ss:
    ss.run_type = ""
if "use_model" not in ss:
    ss.use_model = "catboost"
if "dataset" not in ss:
    ss.use_model = ""



@st.dialog("Create Run",width="large")
def create_run(task_id,datasets,runs):
    # with st.popover("進捗"):
    st.markdown(f"### ステップ {ss.step} / 3")
    st.progress(ss.step / 3)
    # ステップごとのフォーム
    if ss.step == 1:
        ss.run_type = st.selectbox("目的を設定してください", ["学習・精度検証","予測","最適化"])
        # ss.description = st.text_input("説明を入力してください",max_chars=255)
        ss.description = st.text_area("説明を入力してください",max_chars=255)
    elif ss.step == 2:
        if ss.run_type == "学習・精度検証":
            ss.use_model = st.selectbox("モデルを選択してください",
                                        ["mlp","catboost","lightgbm"],
                                        help="mlp:ニューラルネットワークモデル\ncatboost:勾配ブースティングによる回帰モデル（高速・推奨）\nlightgbm:勾配ブースティングによる回帰モデル"
                                        )
            dataset_list =datasets["name"]
            ss.dataset = st.selectbox("データセットを選択してください",dataset_list)
        elif ss.run_type == "予測":
            ss.use_model = st.selectbox("モデルを選択してください",runs[runs["is_registered"]]["name"])
        else: # 最適化
            ss.use_model = st.selectbox("モデルを選択してください",runs[runs["is_registered"]]["name"])
        
                   
    elif ss.step == 3:
        if ss.run_type == "学習・精度検証":
            job_id="1093389830622543"
            # try:
            selected_dataset = [ss.dataset,datasets.loc[datasets["name"]==ss.dataset,"id"].item()]
            csv_data = s3.download_file_from_s3(selected_dataset[1])
            encoding=utils.encoding_detection(csv_data.getvalue())
            df=pd.read_csv(csv_data,encoding=encoding)
            # target = st.selectbox("目的変数",df.columns)
            #
            original_cols = df.columns.to_list()
            fi_cols = []
            cat_cols = []
            for col in original_cols:
                if df[col].dtype.kind in "fi":
                    fi_cols.append(col)
                else:
                    cat_cols.append(col)
            original_items = [
                {'header': '説明変数',  'items': fi_cols},
                {'header': '目的変数', 'items': []},
                {'header': '検証用グループ', 'items': []},
                {'header': '不使用', 'items': cat_cols},
            ]            
            # original_items = [
            #     {'header': '説明変数',  'items': df.columns.to_list()},
            #     {'header': '目的変数', 'items': []},
            #     {'header': '検証用グループ', 'items': []},
            #     {'header': '不使用', 'items': []},
            # ]
            sorted_items = sort_items(original_items, multi_containers=True)
            
            # except:
            #     pass
            df = df.fillna(0) # 暫定処置
            if st.button("実行",key="mltry",use_container_width=True):
                cv_group = sorted_items[2]["items"]
                x_list = sorted_items[0]["items"]
                target = sorted_items[1]["items"]
                if len(cv_group) > 1:
                    st.error("検証用グループは1つまで選択してください")
                elif len(target) == 0:
                    st.error("目的変数を選択してください")
                elif len(target) > 10:
                    st.error("目的変数は10個まで選択してください")
                elif len(x_list) == 0:
                    st.error("説明変数を選択してください")
                elif not all(df[col].dtype.kind in "fi" for col in x_list+target):
                    st.error("説明変数と目的変数は数値型のみ選択してください")
                else:
                    with st.spinner():
                        file_key = selected_dataset[1]
                        # x_list = sorted_items[0]["items"]
                        # target = sorted_items[1]["items"][0]
                        # target = target[0] # テスト
                        if cv_group:
                            cv_group = cv_group[0]
                        else:
                            cv_group = ""
                        current_time=datetime.now(pytz.timezone('Asia/Tokyo')).strftime("%Y-%m-%d %H:%M:%S")
                        prefix=datetime.now(pytz.timezone("Asia/Tokyo")).strftime("%y%m%d%H%M%S")
                        x_list_str = json.dumps(x_list)
                        target_str = json.dumps(target)
                        cv_group_str = json.dumps(cv_group) # 空だとどうなるかテスト
                        payload = {
                            "job_id":job_id,
                            "notebook_params": {
                                "run_id":'{{parent_run_id}}',
                                "file_key":file_key,
                                "x_list":x_list_str,
                                "target":target_str,
                                "model":ss.use_model,
                                "cv_group":cv_group_str
                                }
                            }
                        run_id = run_job(payload)
                        database.sqlQuery(f"""
                            INSERT INTO {catalog_name}.{schema_name}.runs (id, run_type, task_id, name, description, created_date, last_updated_date, is_deleted,is_registered,status,dataset_id,x_list,target)
                            VALUES ('{run_id}', '{ss.run_type}', '{task_id}', '{prefix}_{ss.run_type}','{ss.description}','{current_time}','{current_time}','false','false','待機中','{selected_dataset[1]}','{x_list_str}','{target_str}')         
                        """)
                        ss.step=1
                    st.success("ランを追加しました")
                    time.sleep(1)
                    # ss.uploader_key += 1
                    st.rerun()
        elif ss.run_type == "予測":
            job_id="186329828149324" 
            model_id = runs[runs["name"]==ss.use_model]["id"].item() # runsはフィルタ済みのためss.use_modelの重複はほぼ無い
            # データアップロード
            x_list_str = runs[runs["id"]==model_id]["x_list"].values[0]
            x_list = json.loads(x_list_str)
            # target = runs[runs["id"]==model_id]["target"].item()
            target_str = runs[runs["id"]==model_id]["target"].values[0]

            mlflow_id = runs[runs["id"]==model_id]["mlflow_id"].item()
            # st.write("説明変数",x_list)
            # st.multiselect("説明変数",x_list,default=x_list,key="use_x_list",disabled=True)
            with st.expander("説明変数を表示",expanded=False):
                markdown_text = ""
                for item in x_list:
                    markdown_text += (f"- {item}\n")
                st.markdown(markdown_text)
            uploaded_file = st.file_uploader("予測用データをアップロードしてください", type=["csv","xlsx"], key="file_key")
            if uploaded_file is not None:
                byte_data = uploaded_file.read()
                uploaded_file.seek(0)
                encoding = utils.encoding_detection(byte_data)
                if uploaded_file.name.endswith('.csv'):
                    df = pd.read_csv(uploaded_file,encoding=encoding)
                elif uploaded_file.name.endswith('.xlsx'):
                    df = pd.read_excel(uploaded_file)
                try:
                    df = df[x_list]
                    df = df.fillna(0) # 暫定処置
                    st.write(df)
                    if not all(df[col].dtype.kind in "fi" for col in x_list):
                        st.error("データに数値以外が含まれていないか確認してください")
                        st.stop()
                except:
                    st.error("説明変数のカラム名が一致しません")
                    st.stop()
                if st.button("予測実行",key="pred_try",use_container_width=True):
                    with st.spinner():
                        # file_key = selected_dataset[1]
                        # x_list = sorted_items[0]["items"]
                        # target = sorted_items[1]["items"][0]
                        current_time=datetime.now(pytz.timezone('Asia/Tokyo')).strftime("%Y-%m-%d %H:%M:%S")
                        prefix=datetime.now(pytz.timezone("Asia/Tokyo")).strftime("%y%m%d%H%M%S")
                        x_list_str = json.dumps(x_list,ensure_ascii=True)
                        target = json.loads(target_str)    #test
                        target_str = json.dumps(target,ensure_ascii=True)      #test
                        # 要修正
                        # uuidを生成し、ucもしくはs3にアップロードする
                        # payload["data"]にはuuidを渡す
                        test_dataset_id = str(uuid.uuid4())
                        uploaded_file.seek(0)
                        s3.upload_file_to_s3(uploaded_file,test_dataset_id)
                        payload = {
                            "job_id":job_id,
                            "notebook_params": {
                                "run_id":'{{parent_run_id}}',
                                "x_list":x_list_str,
                                "target":target_str,
                                # "data":df.to_json(orient='records'),
                                "data":test_dataset_id,
                                "mlflow_id":mlflow_id
                                }
                            }
                        # st.write(payload) # debug
                        run_id = run_job(payload)
                        database.sqlQuery(f"""
                            INSERT INTO {catalog_name}.{schema_name}.runs (id, run_type, task_id, name, description, created_date, last_updated_date, is_deleted,is_registered,status,dataset_id,x_list,target)
                            VALUES ('{run_id}', '{ss.run_type}', '{task_id}', '{prefix}_{ss.run_type}','{ss.description}','{current_time}','{current_time}','false','false','待機中','uploaded','{x_list_str}','{target_str}')         
                        """)
                        ss.step=1
                    st.success("ランを追加しました")
                    time.sleep(1)
                    # ss.uploader_key += 1
                    st.rerun()

        else: # 最適化
            job_id="108682031087938" 
            try:
                model_id = runs[runs["name"]==ss.use_model]["id"].item() # runsはフィルタ済みのためss.use_modelの重複はほぼ無い
                x_list_str = runs[runs["id"]==model_id]["x_list"].values[0]
                x_list = json.loads(x_list_str)
                # target = runs[runs["id"]==model_id]["target"].item()
                target_str = runs[runs["id"]==model_id]["target"].values[0]
                try:
                    target_list = json.loads(target_str)
                except:
                    target_list = [str(target_str)]
                # 初期値はデータセットを参考にする
                selected_dataset_id = runs[runs["id"]==model_id]["dataset_id"].item()
                csv_data = s3.download_file_from_s3(selected_dataset_id)

                encoding = utils.encoding_detection(csv_data.getvalue())
                df = pd.read_csv(csv_data,encoding=encoding)

                mlflow_id = runs[runs["id"]==model_id]["mlflow_id"].item()
            except Exception as e: # エラー対策
                st.error((f"エラーが発生しました: {type(e).__name__} - {e}"))
                # st.error("データを読み込めませんでした")
                ss.step=1
                time.sleep(0.5)
                st.rerun()
            target_param_configs = []
            param_configs = []
            st.markdown(f"### 目的変数")
            with st.container(border=True):
                text_cols = st.columns([1,3,1])
                text_list = ["変数名","最適化指標","目標値"]
                for i in range(len(text_cols)):
                    with text_cols[i]:
                        html = f"""
                            <div style='text-align: center; margin: 0; padding: 0;'>
                                <h4 style='margin: 0; text-decoration: underline;'>{text_list[i]}</h4>
                            </div>
                            """
                        st.components.v1.html(html,height=30)
                for target in target_list:
                    y_cols = st.columns([1,3,1],vertical_alignment="bottom")
                    with y_cols[0]:
                        utils.write_html(target)
                    with y_cols[1]:
                        param_type = st.radio("指標", key=f"{target}_criteria",options=["最大化", "最小化", "目標値"],horizontal=True,label_visibility="collapsed")
                    with y_cols[2]:
                        if param_type == "目標値":
                            param_value = st.number_input("目標値", key=f"{target}_value",value=df[target].mean(),label_visibility="collapsed")
                            target_param_configs.append({
                                "name": target,
                                "type": param_type,
                                "value": param_value
                            })
                        else:
                            # param_value = st.number_input("目標値", value=df[target].mean())
                            target_param_configs.append({
                                "name": target,
                                "type": param_type,
                            })
            st.markdown(f"### 説明変数")
            with st.container(border=True):
                text_cols = st.columns([1,2,1,1])
                text_list = ["変数名","データ型","下限","上限"]
                for i in range(len(text_cols)):
                    with text_cols[i]:
                        html = f"""
                            <div style='text-align: center; margin: 0; padding: 0;'>
                                <h4 style='margin: 0; text-decoration: underline;'>{text_list[i]}</h4>
                            </div>
                            """
                        st.components.v1.html(html,height=30)
                for x_col in x_list:
                    x_cols = st.columns([1,2,2],vertical_alignment="bottom")
                    with x_cols[0]:
                        utils.write_html(x_col)
                    with x_cols[1]:
                        param_type = st.radio(f"{x_col} の型", options=["整数", "小数", "カテゴリ"],horizontal=True,label_visibility="collapsed")
                    with x_cols[2]:
                        if param_type == "カテゴリ":
                            choices = st.multiselect(f"{x_col} の選択肢", options=df[x_col].unique().tolist(),label_visibility="collapsed")
                            param_configs.append({
                                "name": x_col,
                                "type": param_type,
                                "choices": choices
                            })
                        else:
                            x_cols2 = st.columns([1,1])
                            with x_cols2[0]:
                                low = st.number_input(f"{x_col} の下限", value=df[x_col].min(),label_visibility="collapsed")
                            with x_cols2[1]:
                                high = st.number_input(f"{x_col} の上限", value=df[x_col].max(),label_visibility="collapsed")
                            param_configs.append({
                                "name": x_col,
                                "type": param_type,
                                "low": low,
                                "high": high
                            })
            if st.button("最適化実行",key="opt_try",use_container_width=True):
                has_none = any(
                    param_dict.get("type") == "カテゴリ" and param_dict.get("choices") == []
                    for param_dict in param_configs
                )
                if has_none:
                    st.error("カテゴリの選択肢を選択してください")
                else:
                    with st.spinner():
                        current_time=datetime.now(pytz.timezone('Asia/Tokyo')).strftime("%Y-%m-%d %H:%M:%S")
                        prefix=datetime.now(pytz.timezone("Asia/Tokyo")).strftime("%y%m%d%H%M%S")
                        x_list_str = json.dumps(x_list)
                        payload = {
                            "job_id":job_id,
                            "notebook_params": {
                                "run_id":'{{parent_run_id}}',
                                "mlflow_id":mlflow_id,
                                "target_param_configs":json.dumps(target_param_configs),
                                "param_configs":json.dumps(param_configs)
                                }
                            }
                        # ↑エラーならjson.dumps(param_configs)
                        run_id = run_job(payload)
                        database.sqlQuery(f"""
                            INSERT INTO {catalog_name}.{schema_name}.runs (id, run_type, task_id, name, description, created_date, last_updated_date, is_deleted,is_registered,status,dataset_id,x_list,target)
                            VALUES ('{run_id}', '{ss.run_type}', '{task_id}', '{prefix}_{ss.run_type}','{ss.description}','{current_time}','{current_time}','false','false','待機中','optimize','{x_list_str}','{target_str}')
                        """)
                        # ↑oprimizeに最適化条件入れてもいい
                        ss.step=1
                    st.success("ランを追加しました")
                    time.sleep(1)
                    # ss.uploader_key += 1
                    st.rerun()

    # ナビゲーションボタン
    col1, col2 = st.columns(2)
    with col1:
        if ss.step > 1:
            st.button("← 戻る", on_click=prev_step,use_container_width=True)
    with col2:
        if ss.step == 1:
            st.button("次へ →", on_click=next_step,use_container_width=True)
        elif ss.step == 2:
            is_disabled1 = False
            is_disabled2 = False
            if ss.run_type == "学習・精度検証":
                # if len(dataset_list) > 0:
                    # is_disabled1 = False
                # else:
                    # is_disabled1 = True
                if len(dataset_list) == 0:
                    is_disabled1 = True
                st.button("次へ →", on_click=next_step,use_container_width=True,disabled=is_disabled1)
            else:
                # if ss.use_model != None:
                #     # is_disabled2 = False
                # else:
                #     is_disabled2 = True
                if ss.use_model == None:
                    is_disabled2 = True
                st.button("次へ →", on_click=next_step,use_container_width=True,disabled=is_disabled2)
    if ss.step == 2:
        if is_disabled1:
            st.error("データセットを登録してください")
        if is_disabled2:
            st.error("学習・精度検証を実行し、モデルを登録してください")
                
        # else:
        #     st.success("すべてのステップが完了しました！")


@st.cache_data
def get_csv_data(selected_project,selected_task,selected_run,file_name):
    volume_path = "/Volumes/ml_app/ml_app_share/results"
    file_path = f"{volume_path}/{selected_run[1]}/artifacts/{file_name}.csv"
    response = requests.get(
        f'{workspace_url}/api/2.0/fs/files{file_path}',
        headers=headers,
    )
    reloaded_data = response.text
    try:
        error_code = json.loads(response.text).get("error_code")
        if error_code == "NOT_FOUND":
            return None
    except:
        buffer = io.StringIO(reloaded_data)
        artifact_df = pd.read_csv(buffer)
        return artifact_df

#shap_values_dict.pkl
@st.cache_data 
def get_pkl_data(selected_project,selected_task,selected_run,file_name):
    volume_path = "/Volumes/ml_app/ml_app_share/results"
    file_path = f"{volume_path}/{selected_run[1]}/artifacts/{file_name}.pkl"
    response = requests.get(
        f'{workspace_url}/api/2.0/fs/files{file_path}',
        headers=headers,
    )
    try: # error_codeを抽出
        error_code = json.loads(response.text).get("error_code")
        if error_code == "NOT_FOUND":
            return None
    except:
        buffer = io.BytesIO(response.content)
        result = pickle.load(buffer)

    # reloaded_data = response.text
    # st.write(response.text)
    # reloaded_data = response.text
    #  #
    # buffer = io.StringIO(reloaded_data) 
    # st.write(pd.read_csv(buffer))
    #  #
    return result
    
import plotly.express as px
import plotly.graph_objects as go
def show_run(selected_project,selected_task,selected_run):
    x_list_str = selected_run[3]
    x_list = json.loads(x_list_str)
    target_str = selected_run[4]
    try:
        target_list = json.loads(target_str)
    except:
        target_list = list(str(selected_run[4]))
    pred_list = ["predicted_" + item for item in target_list]
    # target_idx = target_list.index(target)
    # st.write(ss.selected_run)
    if selected_run[2] == "学習・精度検証":

        # cv_df = get_csv_data(selected_project,selected_task,selected_run,f"cv_result{target_idx}")
        # shap_values_dict = get_pkl_data(selected_project,selected_task,selected_run,f"shap_values_dict{target_idx}") # テスト
        cv_df = get_csv_data(selected_project,selected_task,selected_run,f"cv_result")
        shap_values_dict = get_pkl_data(selected_project,selected_task,selected_run,f"shap_values_dict")
        tab1, tab2, tab3, tab4 = st.tabs(["テーブル","散布図","予測精度","寄与度分析"])
        with tab1:
            st.write(cv_df)
        with tab2:
            # target = selected_run[4]
            cols = x_list+target_list+pred_list
            # cv_df = cv_df[cols]
            # st.write(cols)
            x_axis = st.selectbox("x軸",
                        cols,
                        key="x",
                        index=None,
                        placeholder="x軸を選択してください",
                        label_visibility="collapsed"
                        )
            if x_axis != None:
                fig = px.scatter(
                    cv_df,
                    x=x_axis,
                    # y=cv_df.columns,
                    y=cols,
                    # title="散布図",
                )
                fig.update_layout(
                    autosize=False,
                    plot_bgcolor="white",
                    paper_bgcolor="white",
                    width=600,
                    height=500,
                    margin=dict(l=50, r=50, b=100, t=100, pad=4),
                    xaxis=dict(showline=True, linewidth=2, linecolor='black'),
                    yaxis=dict(showline=True, linewidth=2, linecolor='black')
                    # paper_bgcolor="LightSteelBlue",
                    )
                fig.update_xaxes(showgrid=True, 
                                gridcolor='LightGray', 
                                gridwidth=1,
                                # range=plot_dict[target]["range"],
                                mirror=True,
                                # dtick=plot_dict[target]["grid"]
                                )
                fig.update_yaxes(showgrid=True, 
                                gridcolor='LightGray', 
                                gridwidth=1,
                                # range=plot_dict[target]["range"],
                                mirror=True,
                                # dtick=plot_dict[target]["grid"]
                                )
                st.plotly_chart(fig)
        
        with tab3:
            cv_group=list(set(cv_df.columns)-set(x_list)-set(target_list)-set(pred_list))[0]
            # st.write(cv_group)
            for target in target_list:
                st.markdown(f"### {target}の予測結果")
                graph_cols = st.columns([1,1])
                with graph_cols[0]:
                    fig = go.Figure(
                        layout=go.Layout(
                            width=600,
                            height=500,
                            title=f"y-yプロット",
                            xaxis=dict(title=f"{target}(正解)",showline=True, linewidth=2, linecolor='black'),
                            yaxis=dict(title=f"{target}(予測)",showline=True, linewidth=2, linecolor='black')
                        )
                    )
                    for i, group in enumerate(cv_df[cv_group].unique()):
                        fig.add_trace(go.Scatter(x=cv_df.loc[cv_df[cv_group]==group,target], 
                                                y=cv_df.loc[cv_df[cv_group]==group,f"predicted_{target}"], 
                                                name=str(group),
                                                mode="markers"))
                    range_min = cv_df[[target,f"predicted_{target}"]].min().min()
                    range_max = cv_df[[target,f"predicted_{target}"]].max().max()
                    fig.add_trace(go.Scatter(x=[range_min, range_max], 
                                            y=[range_min, range_max], 
                                            mode='lines', 
                                            name="y=x",
                                            line=dict(color='black', dash='dash')))
                    # fig.update_layout(
                    #     autosize=False,
                    #     plot_bgcolor="white",
                    #     paper_bgcolor="white",
                    #     width=600,
                    #     height=500,
                    #     margin=dict(l=50, r=50, b=100, t=100, pad=4),
                    #     xaxis=dict(title=f"{target}(正解)",showline=True, linewidth=2, linecolor='black'),
                    #     yaxis=dict(title=f"{target}(予測)",showline=True, linewidth=2, linecolor='black')
                    #     # paper_bgcolor="LightSteelBlue",
                    #     )
                    # グリッドの設定
                    fig.update_xaxes(showgrid=True, 
                                    gridcolor='LightGray', 
                                    gridwidth=1,
                                    # range=plot_dict[target]["range"],
                                    mirror=True,
                                    # dtick=plot_dict[target]["grid"]
                                    )
                    fig.update_yaxes(showgrid=True, 
                                    gridcolor='LightGray', 
                                    gridwidth=1,
                                    # range=plot_dict[target]["range"],
                                    mirror=True,
                                    # dtick=plot_dict[target]["grid"]
                                    )
                    st.plotly_chart(fig)

                with graph_cols[1]:
                    rmse_all = np.sqrt(np.mean((cv_df[f"predicted_{target}"] - cv_df[target]) ** 2))
                    # Calculate RMSE for each group
                    group_rmses = cv_df.groupby(cv_group).apply(
                        lambda df: np.sqrt(np.mean((df[f"predicted_{target}"] - df[target]) ** 2))
                    )

                    # Create bar chart
                    fig = go.Figure()

                    # Add bar for overall RMSE
                    fig.add_trace(go.Bar(
                        x=["All Data"],
                        y=[rmse_all],
                        name="All Data"
                    ))
                    # Add bars for each group
                    fig.add_trace(go.Bar(
                        x=group_rmses.index.tolist(),
                        y=group_rmses.values,
                        name="CV-Group別"
                    ))
                    # Update layout
                    fig.update_layout(
                        title=f"二乗平均平方根誤差（RMSE）",
                        xaxis_title="Group",
                        yaxis_title="RMSE",
                        barmode='group',
                        width=600,
                        height=500
                    )
                    st.plotly_chart(fig)
                st.write("---")

        with tab4:
            if shap_values_dict != None:
                selector_cols = st.columns([1,1])
                with selector_cols[0]:
                    shap_target = st.selectbox("ターゲットを選択してください",
                            target_list,
                            key="target",
                            index=0,
                            )
                with selector_cols[1]:
                    shap_data = st.selectbox("SHAPを出力する対象を選択してください",
                                shap_values_dict[shap_target].keys(),
                                key="shap_data",
                                index=0,
                                # label_visibility="collapsed",
                                # placeholder="SHAPを出力する対象を選択してください"
                                )
                if shap_data != None:
                    cols = st.columns([1,1])
                    with cols[0]:
                        st_shap(shap.plots.beeswarm(shap_values_dict[shap_target][shap_data]), height=300)
                    with cols[1]:
                        st_shap(shap.plots.bar(shap_values_dict[shap_target][shap_data]), height=300)
            else:
                st.error("SHAPデータがありません")

            # st.write(shap_values_dict)
    elif selected_run[2] == "予測":
        tab1, tab2 = st.tabs(["テーブル","寄与度分析"])
        prediction_df = get_csv_data(selected_project,selected_task,selected_run,"prediction_result")
        shap_values_dict = get_pkl_data(selected_project,selected_task,selected_run,"shap_values_dict")
        with tab1:
            try:
                st.write(prediction_df)
            except:
                st.error("予測結果がありません")
        with tab2:
            if shap_values_dict != None:
                shap_target = st.selectbox("ターゲットを選択してください",
                        target_list,
                        key="target",
                        index=0,
                        )
                shap_values = shap_values_dict[shap_target]
                shap_values.feature_names = [str(name) for name in shap_values.feature_names]
                st.markdown(f"### 全データ")
                cols = st.columns([1,1])
                with cols[0]:
                    st_shap(shap.plots.beeswarm(shap_values), height=300)
                with cols[1]:
                    st_shap(shap.plots.bar(shap_values), height=300)
                st.markdown(f"### データ別")
                data_num = st.selectbox("対象データのINDEX",options=range(len(shap_values)),index=None,key=f"data_num",placeholder="対象データのINDEX",label_visibility="collapsed")
                # st.write(shap_values.feature_names)
                if data_num != None:
                    st_shap(shap.plots.waterfall(shap_values[data_num]), height=300)
            else:
                st.error("SHAPデータがありません")
    else:
        tab1, tab2, tab3 = st.tabs(["テーブル","HiPlot","散布図",])
        optimization_df = get_csv_data(selected_project,selected_task,selected_run,"optimization_result")
        try:
            modified_x_list = ["params_" + str(item) for item in x_list]
            if len(target_list) == 1:
                modified_target_list = ["value"]
                # opt_cols = ["value"] + modified_x_list + ["number"]
            else:
                modified_target_list = ["values_" + str(item) for item in range(len(target_list))]
            opt_cols = modified_target_list + modified_x_list + ["number"]
            data = optimization_df[opt_cols]
            rename_dict = dict(zip(modified_target_list+["number"],target_list+["num_of_trials"]))
            data = data.rename(columns=rename_dict)
            with tab1:
                st.write(data)
            with tab2:
                exp = hip.Experiment.from_dataframe(data)
                exp.display_data(hip.Displays.XY).update({
                'uid_field': 'uid'
                })
                html_str = exp.to_html()
                st.components.v1.html(html_str, height=1200)
            with tab3:
                if len(target_list) == 1:
                    st.error("目的変数を2つ以上選択する必要があります")
                else:
                    xy_cols=st.columns([1,1])
                    with xy_cols[0]:
                        x_axis=st.selectbox("X軸を選択してください",options=target_list,index=0,key="x_axis")
                    with xy_cols[1]:
                        y_axis=st.selectbox("Y軸を選択してください",options=target_list,index=1,key="y_axis")
                    
                    # 散布図の描画
                    fig = px.scatter(data, x=x_axis, y=y_axis, color=data["num_of_trials"],
                                    title="Scatter Plot with Color Contour",
                                    labels={x_axis: f"{x_axis}", y_axis: f"{y_axis}", "num_of_trials": "num of trials"})

                    st.plotly_chart(fig)

        except:          
            st.error("最適化結果がありません")




    if st.button(f"タスク：{ss.selected_task[0]}に戻る",use_container_width=True):
        del ss.selected_run
        st.session_state.breadcrumbs.pop()
        time.sleep(0.5)
        st.rerun()

def show_username():
    current_user = st.context.headers.get('X-Forwarded-Preferred-Username')
    st.markdown(
        f"""
        <div style="text-align: right;">
            <span style="background-color: transparent; color: green; padding: 5px 10px; border-radius: 10px; border: 2px solid green;">
                ✅ {current_user}
            </span>
        </div>
        """,
        unsafe_allow_html=True
    )
    
    return current_user

def check_user(current_user):
    res = database.sqlQuery(f"""
                    SELECT COUNT(*) as user_exists
                    FROM {catalog_name}.{schema_name}.users
                    WHERE name = '{current_user}'
                """)
    # st.write(res)
    # 結果の確認
    if res["user_exists"].values[0] == 0:
        # st.success(f"{current_user} は存在します。")
        # pass
        database.sqlQuery(f"""
                    INSERT INTO {catalog_name}.{schema_name}.users (name, created_date)
                    VALUES ('{current_user}','{datetime.now(pytz.timezone('Asia/Tokyo')).strftime("%Y-%m-%d %H:%M:%S")}')
                """)
        time.sleep(0.5)
        st.rerun()
    # else:
    #     # st.warning(f"{current_user} は存在しません。")
    #     database.sqlQuery(f"""
    #                 INSERT INTO {catalog_name}.{schema_name}.users (name, created_date)
    #                 VALUES ('{current_user}','{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    #             """)
    #     st.rerun()


# debug
# ss.initialize = True
# ss.selected_project = "0716"
# ss.selected_component = "task"
# ss.selected_task = "0819"

# ページ遷移を制御するメイン関数
def main():
    current_user = show_username()
    # console.show_console()
    # if "initialize" not in ss:
    #     ss.initialize = False
    # database.initialize_tables()
    check_user(current_user)
    if 'selected_project' not in ss:
        if 'breadcrumbs' not in ss:
            ss.breadcrumbs = ["ホーム"]
        show_breadcrumbs()
        log.show_log()
        projects.show_projects(current_user=current_user)
    elif 'selected_component' not in ss:
        show_breadcrumbs()
        select_components()
    elif 'selected_task' not in ss and ss.selected_component == 'task':
        show_breadcrumbs()
        tasks.show_tasks(current_user,ss.selected_project)
    elif 'selected_task' in ss and 'selected_run' not in ss:
        show_breadcrumbs()
        show_runs(ss.selected_project, ss.selected_task,shared_project_id=shared_project_id)
    elif 'selected_dataset' in ss:
        show_breadcrumbs()
        datasets.show_dataset(ss.selected_project, ss.selected_dataset)
    elif 'selected_run' in ss:
        show_breadcrumbs()
        show_run(ss.selected_project,ss.selected_task,ss.selected_run)
    else:
        show_breadcrumbs()
        datasets.show_datasets(ss.selected_project,shared_project_id=shared_project_id)

if __name__ == "__main__":
    main()

