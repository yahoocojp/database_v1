from databricks.sdk.core import Config
import pandas as pd
import streamlit as st
from databricks import sql
import os
import time
from modules.config import catalog_name, schema_name, DOMAIN, TOKEN

ss = st.session_state

def sqlQuery(query: str) -> pd.DataFrame:
    cfg = Config() # Pull environment variables for auth
    with sql.connect(
        server_hostname=cfg.host,
        http_path=f"/sql/1.0/warehouses/{os.getenv('DATABRICKS_WAREHOUSE_ID')}",
        credentials_provider=lambda: cfg.authenticate
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query)
            if query.strip().lower().startswith("select"):
                connection.commit()
                return cursor.fetchall_arrow().to_pandas()
            elif query.strip().lower().startswith("create"):
                connection.commit()
                # st.success("テーブルの作成に成功しました")
            else:
                pass
                # return cursor.fetchall_arrow().to_pandas()
                # return pd.DataFrame()

def initialize_tables(catalog_name=catalog_name, schema_name=schema_name):
    # カタログ作成
    if not st.session_state.initialize:
        sqlQuery(f"CREATE CATALOG IF NOT EXISTS {catalog_name}")
        # カタログの権限設定(継承)
        # sqlQuery(f"GRANT ALL PRIVILEGES ON CATALOG {catalog_name} TO `account users`")
        # スキーマ作成(データベース)
        sqlQuery(f"CREATE SCHEMA IF NOT EXISTS {catalog_name}.{schema_name}")

        create_users = f"""
        CREATE TABLE IF NOT EXISTS {catalog_name}.{schema_name}.users (
            name VARCHAR(50) PRIMARY KEY,
            created_date TIMESTAMP NOT NULL
        );
        """
        sqlQuery(create_users)

     

        # グループ単位の共有を想定
        # create_groups = f"""
        # CREATE TABLE IF NOT EXISTS {catalog_name}.{schema_name}.groups (
        #     name VARCHAR(50) PRIMARY KEY,
        #     privilege_level VARCHAR(20) NOT NULL,
        #     description VARCHAR(255),
        #     created_date TIMESTAMP NOT NULL
        # );
        # """
        # sqlQuery(create_groups)

        # create_group_user = f"""
        # CREATE TABLE IF NOT EXISTS {catalog_name}.{schema_name}.groups (
        #     user_name VARCHAR(50) PRIMARY KEY,
        #     group_name VARCHAR(50) PRIMARY KEY,
        #     privilege_level VARCHAR(20) NOT NULL
        # );
        # """
        # sqlQuery(create_group_user)

        create_projects = f"""
        CREATE TABLE IF NOT EXISTS {catalog_name}.{schema_name}.projects (
            id VARCHAR(40) PRIMARY KEY,
            name VARCHAR(30) NOT NULL,
            creator VARCHAR(50) NOT NULL,
            description VARCHAR(255),
            created_date TIMESTAMP NOT NULL,
            last_updated_date TIMESTAMP NOT NULL,
            is_deleted BOOLEAN NOT NULL,
            FOREIGN KEY (creator) REFERENCES {catalog_name}.{schema_name}.users(name)
        );
        """
        sqlQuery(create_projects)

        # user_nameとproject_idの複合主キーだがDatabricksDBでは定義不可
        create_project_user = f"""
        CREATE TABLE IF NOT EXISTS {catalog_name}.{schema_name}.project_user (
            user_name VARCHAR(50) NOT NULL,
            project_id VARCHAR(40) NOT NULL,
            privilege_level VARCHAR(20) NOT NULL,
            FOREIGN KEY (project_id) REFERENCES {catalog_name}.{schema_name}.projects(id),
            FOREIGN KEY (user_name) REFERENCES {catalog_name}.{schema_name}.users(name)
        );
        """
        sqlQuery(create_project_user)   
    
        create_tasks = f"""
        CREATE TABLE IF NOT EXISTS {catalog_name}.{schema_name}.tasks (
            id VARCHAR(40) PRIMARY KEY,
            project_id VARCHAR(40) NOT NULL,
            name VARCHAR(30) NOT NULL,
            description VARCHAR(255),
            creator VARCHAR(50) NOT NULL,
            created_date TIMESTAMP NOT NULL,
            last_updated_date TIMESTAMP NOT NULL,
            is_deleted BOOLEAN NOT NULL,
            FOREIGN KEY (project_id) REFERENCES {catalog_name}.{schema_name}.projects(id)
        );
        """
        # RUNへ移行
        # task_type VARCHAR(20) NOT NULL,
        sqlQuery(create_tasks)
        create_datasets = f"""
        CREATE TABLE IF NOT EXISTS {catalog_name}.{schema_name}.datasets (
            id VARCHAR(40) PRIMARY KEY,
            project_id VARCHAR(40) NOT NULL,
            name VARCHAR(50) NOT NULL,
            description VARCHAR(255),
            created_date TIMESTAMP NOT NULL,
            last_updated_date TIMESTAMP NOT NULL,
            is_deleted BOOLEAN NOT NULL,
            parent_dataset_id VARCHAR(40),
            FOREIGN KEY (project_id) REFERENCES {catalog_name}.{schema_name}.projects(id)
        );
        """
        sqlQuery(create_datasets)
        try:
            alter_datasets = f"""
            ALTER TABLE {catalog_name}.{schema_name}.datasets DROP CONSTRAINT fk_parent_dataset_id;
            """
            sqlQuery(alter_datasets)
        except:
            pass
        
        alter_datasets = f"""
        ALTER TABLE {catalog_name}.{schema_name}.datasets
        ADD CONSTRAINT fk_parent_dataset_id
        FOREIGN KEY (parent_dataset_id)
        REFERENCES {catalog_name}.{schema_name}.datasets(id);
        """
        sqlQuery(alter_datasets)
        
        # dataset_idが必要
        # Run nameどうするか
        # updateは不要
        create_runs = f"""
        CREATE TABLE IF NOT EXISTS {catalog_name}.{schema_name}.runs (
            id VARCHAR(40) PRIMARY KEY,
            run_type VARCHAR(20) NOT NULL,
            task_id VARCHAR(40) NOT NULL,
            name VARCHAR(50) NOT NULL,
            description VARCHAR(255),
            created_date TIMESTAMP NOT NULL,
            last_updated_date TIMESTAMP NOT NULL,
            is_deleted BOOLEAN NOT NULL,
            is_registered BOOLEAN NOT NULL,
            status VARCHAR(20) NOT NULL,
            dataset_id VARCHAR(40) NOT NULL,
            x_list VARCHAR(1000) NOT NULL,
            target VARCHAR(255) NOT NULL,
            mlflow_id VARCHAR(40),
            FOREIGN KEY (task_id) REFERENCES {catalog_name}.{schema_name}.tasks(id),
            FOREIGN KEY (dataset_id) REFERENCES {catalog_name}.{schema_name}.datasets(id)
        );
        """
        sqlQuery(create_runs)
    st.session_state.initialize = True

def alter_and_delete(table_name,table_df,target_name,current_permissions=None,user_list=None):
    if table_name == "projects":
        action_cols = st.columns([1,1,1])
        with action_cols[0]:
            update_target(table_name,table_df,target_name)
        with action_cols[1]:
            delete_target(table_name,table_df,target_name)
        with action_cols[2]:
            if "dialog" not in ss:
                if st.button("権限",key=f"privilege_{target_name}",use_container_width=True):
                    privilege_control(target_name,table_df,current_permissions=current_permissions,user_list=user_list)
    else:
        action_cols = st.columns([1,1])
        with action_cols[0]:
            update_target(table_name,table_df,target_name)
        with action_cols[1]:
            delete_target(table_name,table_df,target_name)

def delete_target(table_name,table_df,target_name):
    with st.popover("削除",use_container_width=True):
        # とりあえず
        if (table_name == "datasets") and (target_name == "サンプルデータ"):
            disabled = True
        else:
            disabled = False
        if st.button("本当に削除しますか？",key=f"{target_name}_delete",use_container_width=True,disabled = disabled):
            target_id = table_df.loc[table_df["name"] == target_name, "id"].values[0]
            with st.spinner():
                sqlQuery(f"""
                    UPDATE {catalog_name}.{schema_name}.{table_name}
                    SET is_deleted = 'true'
                    WHERE id = '{target_id}'
                """)
            st.success("削除しました")
            time.sleep(1)
            st.rerun()

@st.dialog("アクセス権限管理",width="large")
def privilege_control(target_name,table_df,current_permissions,user_list):
    # st.write(table_df)
    # st.write(target_name)
    target_id = table_df.loc[table_df["name"] == target_name, "id"].values[0]
    current_permissions_ = current_permissions[current_permissions["project_id"] == target_id]
    col = st.columns([2,1,1])
    with col[0]:
        st.write("ユーザ名")
    with col[1]:
        st.write("権限")
    with col[2]:
        st.write("操作")
    for i in range(len(current_permissions_)):
        col = st.columns([2,1,1])
        with col[0]:
            st.write(current_permissions_.iloc[i]["user_name"])
        with col[1]:
            st.write(current_permissions_.iloc[i]["privilege_level"])
        with col[2]:
            if current_permissions_.iloc[i]["privilege_level"] == "creator":
                disabled = True
            else:
                disabled = False
            if st.button("削除",key=f"delete_{i}",disabled=disabled,use_container_width=True):
                sqlQuery(f"""
                    DELETE FROM {catalog_name}.{schema_name}.project_user
                    WHERE user_name = '{current_permissions_.iloc[i]["user_name"]}'
                    AND project_id = '{target_id}';
                """)
                st.success("削除しました")
                time.sleep(1)
                st.rerun()
    
    current_user = st.context.headers.get('X-Forwarded-Preferred-Username')
    if current_user.endswith("nhkspg.co.jp"):
        user_list = [item for item in user_list if "macnica" not in item]

    user_list_ = list(set(user_list) - set(current_permissions_["user_name"].values))
    add_users = st.multiselect("新規追加",options=user_list_,key=f"{target_name}")
    if st.button("追加"): # 全ユーザーを足す条件もあると便利そう（project_userかprojectsテーブルに持たせる）
        for user in add_users:
            sqlQuery(f"""
                INSERT INTO {catalog_name}.{schema_name}.project_user (project_id,user_name,privilege_level)
                VALUES ('{target_id}','{user}','user')
            """)
        st.success("追加しました")
        time.sleep(1)
        st.rerun()
    # st.write(user_list)
    # st.write("test")
    # st.rerun()

def update_target(table_name,table_df,target_name):
    with st.popover("編集",use_container_width=True):
        new_description = st.text_area("説明",value=table_df.loc[table_df["name"] == target_name, "description"].values[0],key=f"{target_name}_text")
        # とりあえず
        if (table_name == "datasets") and (target_name == "サンプルデータ"):
            disabled = True
        else:
            disabled = False
        if st.button("更新",key=f"{target_name}_update",use_container_width=True,disabled=disabled):
            target_id = table_df.loc[table_df["name"] == target_name, "id"].values[0]
            with st.spinner():
                sqlQuery(f"""
                    UPDATE {catalog_name}.{schema_name}.{table_name}
                    SET description = '{new_description}'
                    WHERE id = '{target_id}'
                """)
            st.success("更新しました")
            time.sleep(1)
            st.rerun()