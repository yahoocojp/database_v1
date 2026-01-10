"""
Utility functions for ML service
"""
import chardet
import pandas as pd
import os
from io import BytesIO


def encoding_detection(byte_data):
    """
    文字コード自動判定（Streamlitコードから移植）

    Args:
        byte_data: バイトデータ

    Returns:
        str: エンコーディング名
    """
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

    try:
        # asciiはutf-8にフォールバック
        if encoding and encoding.lower() == 'ascii':
            encoding = 'utf-8'
        if encoding and encoding.lower() == "windows-1252":
            encoding = "cp932"
        if encoding and encoding.lower() == "macroman":
            encoding = "cp932"
    except:
        encoding = "cp932"  # デフォルト

    return encoding


def save_dataframe(df, file_path, encoding='utf-8-sig'):
    """
    DataFrameをCSVとして保存

    Args:
        df: pandas DataFrame
        file_path: 保存先パス
        encoding: エンコーディング
    """
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    df.to_csv(file_path, index=False, encoding=encoding)
    return file_path


def load_dataframe(file_path):
    """
    CSVファイルを読み込み

    Args:
        file_path: ファイルパス

    Returns:
        pandas DataFrame
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    # バイトデータとして読み込んで文字コード判定
    with open(file_path, 'rb') as f:
        byte_data = f.read()

    encoding = encoding_detection(byte_data)
    print(f"[INFO] Detected encoding: {encoding}")

    # DataFrameとして読み込み
    return pd.read_csv(BytesIO(byte_data), encoding=encoding)


def validate_columns(df, x_list, target_list):
    """
    カラムの存在と型をチェック

    Args:
        df: pandas DataFrame
        x_list: 説明変数リスト
        target_list: 目的変数リスト

    Raises:
        ValueError: カラムが存在しない、または数値型でない場合
    """
    # カラム存在チェック
    all_cols = x_list + target_list
    missing_cols = [col for col in all_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing columns: {missing_cols}")

    # 数値型チェック
    non_numeric_cols = [col for col in all_cols if df[col].dtype.kind not in 'fi']
    if non_numeric_cols:
        raise ValueError(f"Non-numeric columns: {non_numeric_cols}")

    return True


def calculate_metrics(y_true, y_pred):
    """
    回帰モデルの評価指標を計算

    Args:
        y_true: 正解値
        y_pred: 予測値

    Returns:
        dict: 評価指標
    """
    import numpy as np
    from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mae = mean_absolute_error(y_true, y_pred)
    r2 = r2_score(y_true, y_pred)

    return {
        'rmse': float(rmse),
        'mae': float(mae),
        'r2': float(r2)
    }
