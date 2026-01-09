import streamlit as st
from modules.config import catalog_name, schema_name
from modules import database, utils
import uuid
import time
import pytz
from datetime import datetime

# プロジェクトリストを表示
@st.fragment
def show_projects(current_user,catalog_name=catalog_name, schema_name=schema_name):
    # st.title("プロジェクト一覧")
    get_project_sql = f"""
    SELECT * FROM {catalog_name}.{schema_name}.projects
    """
    # st.write(current_user)
    # current_user = st.context.headers.get('X-Forwarded-Preferred-Username')
    get_allowed_project_sql = f"""
    SELECT p.*
    FROM {catalog_name}.{schema_name}.projects AS p
    JOIN {catalog_name}.{schema_name}.project_user AS pu
    ON p.id = pu.project_id
    WHERE pu.user_name = '{current_user}'
    """

    # projects = database.sqlQuery(get_project_sql)
    projects = database.sqlQuery(get_allowed_project_sql)

    get_users_sql = f"""
    SELECT name FROM {catalog_name}.{schema_name}.users
    """
    user_list = database.sqlQuery(get_users_sql)
    user_list  = user_list["name"].tolist()
    # st.write(user_list["name"].tolist())

    get_permissions_sql = f"""
    SELECT * FROM {catalog_name}.{schema_name}.project_user
    """
    current_permissions = database.sqlQuery(get_permissions_sql)
    # st.write(current_permissions)
    
    projects = projects[~projects["is_deleted"]] # アクティブなプロジェクトを抽出
    # コンソールバー
    create_cols = st.columns([2,1,1],gap="medium",vertical_alignment="bottom")
    with create_cols[0]:
        # st.markdown('<p class="custom-text">_</p>', unsafe_allow_html=True)
        st.subheader("プロジェクト一覧:")
    with create_cols[1]:
        project_filter = st.text_input("filter")
    with create_cols[2]:
        # st.markdown('<p class="custom-text">_</p>', unsafe_allow_html=True)
        with st.popover("新規作成"):
            create_project(current_user,list(projects["name"])) # アクティブなプロジェクトのみ渡す
    with st.container(border=True):
        with st.container():
            text_cols = st.columns([2,3,2,3])
            text_list = ["プロジェクト名","説明","作成日","操作"]
            for i in range(len(text_cols)):
                with text_cols[i]:
                    html = f"""
                        <div style='text-align: center; margin: 0; padding: 0;'>
                            <h4 style='margin: 0; text-decoration: underline;'>{text_list[i]}</h4>
                        </div>
                        """
                    st.components.v1.html(html,height=30)        
        if projects.empty:
            st.error("プロジェクトがありません")
            st.stop()

        filtered_projects = projects[(projects["name"].str.contains(project_filter)) & (~projects["is_deleted"])]["name"]
        if filtered_projects.any():
            for project in filtered_projects:
                # st.write("---")
                project_cols = st.columns([2,3,2,3])
                with project_cols[0]: # 選択したプロジェクトへ移動
                    if st.button(project,key=f"{project}_button",use_container_width=True):
                        st.session_state.selected_project = [project,projects.loc[projects["name"]==project,"id"].item()]
                        st.session_state.breadcrumbs.append(project)
                        time.sleep(0.5)
                        st.rerun()
                with project_cols[1]: # プロジェクト説明
                    utils.write_html(projects.loc[projects["name"]==project,"description"].values[0])
                with project_cols[2]: # 作成日
                    datetime_str = projects.loc[projects["name"]==project,"created_date"].values[0]
                    utils.write_html(utils.print_datetime2(datetime_str))
                with project_cols[3]: # 操作
                    database.alter_and_delete(table_name="projects",table_df=projects,target_name=project,current_permissions=current_permissions,user_list=user_list)
        else:
            st.error("該当するプロジェクトはありません")

def create_project(current_user,current_projects):
    project_name = st.text_input("プロジェクト名",max_chars=30)
    description = st.text_area("説明",max_chars=255)
    project_id = str(uuid.uuid4()) # 一意のIDを生成
    current_time = datetime.now(pytz.timezone('Asia/Tokyo')).strftime('%Y-%m-%d %H:%M:%S') # 現在の日時を取得
    if st.button("プロジェクトを作成",use_container_width=True):
        if project_name == "":
            st.error("プロジェクト名を入力してください")
        elif project_name in current_projects:
            st.error("同名のプロジェクトが既に存在します")
        else:
            with st.spinner():
                database.sqlQuery(f"""
                    INSERT INTO {catalog_name}.{schema_name}.projects (id, name, description, created_date, last_updated_date, is_deleted,creator)
                    VALUES ('{project_id}', '{project_name}', '{description}', '{current_time}','{current_time}','false','{current_user}')
                """)
                time.sleep(0.5)
                database.sqlQuery(f"""
                    INSERT INTO {catalog_name}.{schema_name}.project_user (project_id,user_name,privilege_level)
                    VALUES ('{project_id}','{current_user}','creator')
                """)
                time.sleep(0.5)
            st.success("プロジェクトを作成しました")
            time.sleep(1)
            st.rerun()
