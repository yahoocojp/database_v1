import streamlit as st
from modules.config import catalog_name, schema_name
from modules import database, utils
import pandas as pd
import uuid
import time
import pytz
from datetime import datetime

def show_tasks(current_user,project_list):
    # st.title(f"Tasks for {project_list[0]}")
    get_task_sql = f"""
    SELECT * FROM {catalog_name}.{schema_name}.tasks
    """
    tasks = database.sqlQuery(get_task_sql)
    tasks =tasks[tasks["project_id"] == project_list[1]]
    tasks = tasks[~tasks["is_deleted"]]
    create_cols = st.columns([2,1,1],gap="medium",vertical_alignment="bottom")
    with create_cols[0]:
        # st.markdown('<p class="custom-text">_</p>', unsafe_allow_html=True)
        st.subheader("タスク一覧:")
    with create_cols[1]:
        task_filter = st.text_input("filter")
    with create_cols[2]:
        # st.markdown('<p class="custom-text">_</p>', unsafe_allow_html=True)
        with st.popover("新規作成"):
            create_task(current_user,list(tasks["name"]),project_list[1])
    with st.container(border=True):
        text_cols = st.columns([2,3,2,3])
        text_list = ["タスク名","説明","作成日","操作"]
        for i in range(len(text_cols)):
            with text_cols[i]:
                html = f"""
                    <div style='text-align: center; margin: 0; padding: 0;'>
                        <h4 style='margin: 0; text-decoration: underline;'>{text_list[i]}</h4>
                    </div>
                    """
                st.components.v1.html(html,height=30)
        if tasks.empty:
            st.error("タスクがありません")
        else:
            filtered_tasks = tasks[(tasks["name"].str.contains(task_filter)) & (~tasks["is_deleted"])]["name"]
            if filtered_tasks.any():
                with st.container(border=False,height=450):
                    for task in filtered_tasks:                
                        task_cols = st.columns([2,3,2,3])
                        with task_cols[0]: # タスクに異動
                            if st.button(task,key=f"{task}_button",use_container_width=True):
                                st.session_state.selected_task = [task,tasks.loc[tasks["name"]==task,"id"].item()]
                                st.session_state.breadcrumbs.append(task)
                                time.sleep(0.5)
                                st.rerun()
                        with task_cols[1]: # 説明
                            utils.write_html(tasks.loc[tasks["name"]==task,"description"].values[0])
                            # st.write(tasks.loc[tasks["name"]==task,"description"].values[0])
                        with task_cols[2]: # 作成日
                            datetime_str = tasks.loc[tasks["name"]==task,"created_date"].values[0]
                            utils.write_html(utils.print_datetime2(datetime_str))
                            # utils.print_datetime(datetime_str)
                        with task_cols[3]: # アクション
                            database.alter_and_delete(table_name="tasks",table_df=tasks,target_name=task)
            else:
                st.error("該当するタスクはありません")

    if st.button(f"プロジェクト：{project_list[0]}に戻る",use_container_width=True):
        del st.session_state.selected_component
        st.session_state.breadcrumbs.pop()
        time.sleep(0.5)
        st.rerun()

def create_task(current_user,current_tasks, project_id):
    task_name = st.text_input("タスク名",max_chars=30)
    description = st.text_area("説明",max_chars=255)
    task_id = str(uuid.uuid4()) # 一意のIDを生成
    current_time = datetime.now(pytz.timezone('Asia/Tokyo')).strftime('%Y-%m-%d %H:%M:%S') # 現在の日時を取得
    if st.button("タスクを作成",use_container_width=True):
        if task_name == "":
            st.error("タスク名を入力してください")
        elif task_name in current_tasks:
            st.error("同名のタスクが既に存在します")
        else:
            database.sqlQuery(f"""
                INSERT INTO {catalog_name}.{schema_name}.tasks (id, project_id,name, description, created_date, last_updated_date, is_deleted,creator)
                VALUES ('{task_id}', '{project_id}','{task_name}','{description}', '{current_time}','{current_time}','false','{current_user}')
            """)
            st.success("タスクを作成しました")
            time.sleep(1)
            st.rerun()
