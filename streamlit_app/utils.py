import numpy as np
from datetime import datetime
import streamlit as st
import chardet
from pygwalker.api.streamlit import StreamlitRenderer

def set_sidebar():
    st.page_link("app.py", label="MLアプリ",icon=":material/home_app_logo:")
    # st.page_link("pages/00_waxs.py", label="WAXSデータ処理",icon=":material/upload:")
    # st.page_link("pages/00_app2.py", label="MLアプリ",icon=":material/home_app_logo:")
    st.page_link("pages/01_manual.py", label="マニュアル",icon=":material/menu_book:")
    st.page_link("pages/02_form.py", label="報告（不具合・要望）",icon=":material/bug_report:")
    st.page_link("pages/03_update.py", label="アップデート予定",icon=":material/notifications:")

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

    return encoding


def get_pyg_renderer(df) -> "StreamlitRenderer":
    # If you want to use feature of saving chart config, set `spec_io_mode="rw"`
    return StreamlitRenderer(df)
    # return StreamlitRenderer(df, 
    #                          spec="./gw_config.json", 
    #                          spec_io_mode="rw",)

def print_datetime(datetime_str):
    datetime_np = np.datetime64(datetime_str)
    datetime_str = str(datetime_np)
    dt = datetime.strptime(datetime_str, "%Y-%m-%dT%H:%M:%S.%f000") # datetimeオブジェクトに変換
    datetime_str = dt.strftime("%Y年%m月%d日") # 年月日に変換
    st.write(datetime_str)

def print_datetime2(datetime_str):
    datetime_np = np.datetime64(datetime_str)
    datetime_str = str(datetime_np)
    dt = datetime.strptime(datetime_str, "%Y-%m-%dT%H:%M:%S.%f000") # datetimeオブジェクトに変換
    datetime_str = dt.strftime("%Y年%m月%d日") # 年月日に変換
    return datetime_str

def get_current_user():
    # user = spark.sql("SELECT current_user()").collect()[0][0]
    user = sqlQuery("SELECT current_user()")
    return user

def write_html(text_):
    # h5だと太字っぽくなる
    # html = f"""
    #     <div style='text-align: center; margin: 0; padding: 0;'>
    #         <h4 style='margin: 0;'>{text_}</h4>
    #     </div>
    #     """
    
    html = f"""
        <div style='text-align: center; font-weight: normal; font-size: 16px; margin: 0;'>
            {text_}
        </div>
        """
    st.components.v1.html(html,height=30)

st.markdown(
    """
    <style>
    .custom-text {
        font-size: 6px; /* 文字サイズを変更 */
        color: rgba(0, 0, 0, 0); /* 透明な文字色 */
    }
    </style>
    """,
    unsafe_allow_html=True
)