import streamlit as st

def show_log():
    with st.container(border=True, height=250):
        tab_info, tab_log, tab_bug = st.tabs(["お知らせ", "ログ","不具合情報"])
        with tab_info:
            st.markdown("""
                        機械学習ツールの展開に向けて、テスト版を公開しました。不具合や改善すべき点がございましたら報告フォームよりご連絡ください。（2025/8/22）\n
                        - 動作が不安定な場合は、ブラウザを更新するか時間を空けてお試しください。
                        - 更新しても進捗が「待機中」から「実行中」に遷移しない場合、処理が集中している可能性があります。少し時間を空けてご確認ください。
                        """)
        with tab_log:
            st.write("(未実装)")
        with tab_bug:
            st.write("不具合情報")