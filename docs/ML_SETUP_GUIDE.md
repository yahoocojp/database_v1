# ML機能セットアップガイド

## 📦 必要なもの

### Node.js環境
- Node.js 18以上
- npm

### Python環境
- Python 3.9以上
- pip

---

## 🚀 クイックスタート（ローカル開発）

### 1. Node.js依存関係のインストール

```bash
cd /workspaces/database_v1
npm install
```

インストールされるパッケージ:
- express
- socket.io
- socket.io-client
- axios

### 2. Python MLサービスのセットアップ

```bash
cd ml_service

# 仮想環境作成（推奨）
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 依存関係インストール
pip install -r requirements.txt
```

主要なパッケージ:
- Flask + Flask-SocketIO (Web API)
- PyCaret (AutoML)
- CatBoost, LightGBM, XGBoost (MLモデル)
- Optuna (ハイパーパラメータ最適化)
- SHAP (説明性AI)
- MLflow (モデル管理)

### 3. 環境変数設定

```bash
# ローカル開発用
export ML_ENVIRONMENT=local
export ML_DEBUG=true
```

Databricks環境用（Phase 1B以降）:
```bash
export ML_ENVIRONMENT=databricks
export DATABRICKS_TOKEN=your_token
export AWS_SECRET_KEY=your_aws_key
export DATABRICKS_USER=your_email@example.com
```

### 4. サーバー起動

**ターミナル1: Python MLサービス**
```bash
cd ml_service
python app.py
```

起動メッセージ:
```
============================================================
ML Service Starting...
Environment: local
Dataset Path: ./data/datasets
Result Path: ./data/results
MLflow Tracking URI: file:///tmp/mlruns
============================================================
 * Running on http://0.0.0.0:5000
```

**ターミナル2: Node.jsサーバー**
```bash
cd /workspaces/database_v1
npm start
```

起動メッセージ:
```
========================================
R&D Experiment Manager (Sample Data Mode)
Server running on port 8000
Started at: 2026-01-09T...
Data: 5 materials, 15 test pieces
WebSocket: Enabled
ML Service: http://localhost:5000
========================================
```

### 5. ブラウザでアクセス

- **Database App**: http://localhost:8000
- **ML App**: http://localhost:8000/ml-app.html
- **ML Training**: http://localhost:8000/ml-training.html

---

## 🧪 動作確認

### 1. ML Serviceヘルスチェック

```bash
curl http://localhost:5000/health
```

期待される応答:
```json
{
  "status": "healthy",
  "service": "ML Service",
  "environment": "local",
  "mlflow_tracking_uri": "file:///tmp/mlruns"
}
```

### 2. Node.js経由のヘルスチェック

```bash
curl http://localhost:8000/api/ml/health
```

### 3. WebSocket接続テスト

ブラウザのコンソールで:
```javascript
const socket = io();
socket.on('connect', () => console.log('Connected!'));
socket.emit('ping');
socket.on('pong', (data) => console.log('Pong:', data));
```

---

## 📖 使い方

### データセットの準備

1. **Database Appでデータセットを作成**
   - http://localhost:8000 にアクセス
   - 左サイドバーの「Dataset Export」パネルを開く
   - 各層のカラムを選択
   - 「🚀 ML App」ボタンでML Appに送信

2. **CSVファイルから直接インポート**
   - http://localhost:8000/ml-app.html にアクセス
   - 「データセット」タブ
   - 「新規登録」でCSVアップロード

### モデル学習

1. **http://localhost:8000/ml-training.html** にアクセス

2. **ステップ1: データセット選択**
   - ドロップダウンからデータセットを選択
   - データセット情報を確認

3. **ステップ2: モデル設定**
   - CatBoost（推奨）/ LightGBM / ニューラルネットワーク から選択

4. **ステップ3: 変数選択**
   - カラムをドラッグ&ドロップで配置
   - **説明変数（X）**: 予測に使う入力変数
   - **目的変数（Y）**: 予測したい出力変数
   - **CV用グループ**: クロスバリデーション用のグループ分けカラム（任意）

5. **ステップ4: 学習開始**
   - 設定を確認
   - 「学習開始」ボタンをクリック
   - リアルタイムでプログレスバーとログが更新されます

---

## 🔧 トラブルシューティング

### Python MLサービスが起動しない

**エラー: `ModuleNotFoundError: No module named 'flask'`**

解決策:
```bash
cd ml_service
pip install -r requirements.txt
```

**エラー: `Address already in use: 5000`**

解決策:
```bash
# ポート5000を使用しているプロセスを確認
lsof -ti:5000

# プロセスを停止
kill -9 $(lsof -ti:5000)
```

### Node.jsサーバーが起動しない

**エラー: `Cannot find module 'socket.io'`**

解決策:
```bash
npm install
```

**エラー: `EADDRINUSE: address already in use :::8000`**

解決策:
```bash
pkill -f "node app.js"
# または
kill -9 $(lsof -ti:8000)
```

### WebSocket接続エラー

**ブラウザコンソールに `WebSocket connection failed`**

1. Python MLサービスが起動しているか確認
   ```bash
   curl http://localhost:5000/health
   ```

2. Node.jsサーバーが起動しているか確認
   ```bash
   curl http://localhost:8000/health
   ```

3. ブラウザでキャッシュをクリア

### データセットが表示されない

**ML Training画面で「データセットがありません」**

1. ML Appでデータセットをインポート
   - http://localhost:8000/ml-app.html
   - 「データセット」タブ → 「新規登録」

2. LocalStorageを確認（ブラウザDevTools）:
   ```javascript
   localStorage.getItem('mlapp_datasets_all')
   ```

3. LocalStorageをクリア（必要な場合）:
   ```javascript
   localStorage.clear()
   ```

### 学習が開始されない

**「学習開始」ボタンを押してもエラー**

1. ブラウザのコンソールを確認（F12）

2. Python MLサービスのログを確認

3. データセットファイルが存在するか確認:
   ```bash
   ls -la data/datasets/
   ```

4. 数値型カラムのみ選択しているか確認
   - 説明変数・目的変数は数値型（int, float）のみ対応

---

## 📊 データ形式

### データセット要件

- **ファイル形式**: CSV（UTF-8, Shift-JIS対応）
- **カラム**: ヘッダー行必須
- **データ型**: 数値型（int, float）のみ
- **欠損値**: 自動的に0で補完

### サンプルデータ

```csv
material_temp,quench_temp,temper_temp,hardness,tensile_strength
850,850,400,52.3,1850
880,880,450,54.1,1920
950,950,400,51.8,1780
```

---

## 🌐 Databricks環境へのデプロイ（Phase 1B）

### 1. 環境変数設定

Databricks Secretsに以下を登録:
- `DATABRICKS_TOKEN`: Databricks APIトークン
- `AWS_SECRET_KEY`: AWS S3アクセスキー

### 2. Unity Catalogスキーマ作成

```sql
CREATE CATALOG IF NOT EXISTS ml_app;
CREATE SCHEMA IF NOT EXISTS ml_app.ml_app;
```

### 3. app.yamlの設定

```yaml
command: ["python", "ml_service/app.py"]
env:
  - name: ML_ENVIRONMENT
    value: databricks
  - name: DATABRICKS_TOKEN
    value: {{secrets/ml-app/token}}
  - name: AWS_SECRET_KEY
    value: {{secrets/ml-app/aws-key}}
```

### 4. デプロイ

```bash
databricks apps deploy ml-app --file app.yaml
```

---

## 📈 次のステップ

### 実装済み（Phase 1A）
- ✅ データセット管理
- ✅ モデル学習（CatBoost, LightGBM, MLP）
- ✅ クロスバリデーション
- ✅ ハイパーパラメータ最適化（Optuna）
- ✅ WebSocketリアルタイム進捗表示
- ✅ MLflowモデル管理

### 今後実装予定（Phase 1B-2）
- 🔜 予測実行UI
- 🔜 最適化UI
- 🔜 SHAP可視化（beeswarm, waterfall）
- 🔜 モデル一覧・バージョン管理
- 🔜 結果詳細表示（グラフ）
- 🔜 データセット検索機能

---

## 🆘 サポート

問題が発生した場合:

1. **ログを確認**
   - Python MLサービス: ターミナル出力
   - Node.jsサーバー: ターミナル出力
   - ブラウザ: DevTools Console (F12)

2. **GitHub Issueを作成**
   - https://github.com/your-repo/issues

3. **設定ファイルを確認**
   - `ml_service/config.py`
   - `package.json`

---

## 📝 開発メモ

### ディレクトリ構造

```
database_v1/
├── app.js                      # Node.js Express + WebSocket
├── package.json
├── public/
│   ├── index.html              # Database App
│   ├── ml-app.html             # ML App（データセット管理）
│   ├── ml-training.html        # ML Training UI（新規）
│   └── ml-training.js          # Training UI JavaScript
├── lib/
│   └── ml-client.js            # ML Service APIクライアント
├── ml_service/                 # Python MLサービス
│   ├── app.py                  # Flask API
│   ├── config.py               # 設定
│   ├── requirements.txt
│   └── core/
│       ├── train.py            # 学習ロジック
│       ├── predict.py          # 予測ロジック
│       ├── optimize.py         # 最適化ロジック
│       └── utils.py            # ユーティリティ
└── data/                       # ローカルデータ（POC用）
    ├── datasets/               # データセット保存先
    └── results/                # 学習結果保存先
```

### API エンドポイント

| Endpoint | Method | 説明 |
|----------|--------|------|
| `/api/ml/health` | GET | ML Service健康チェック |
| `/api/ml/train` | POST | 学習開始 |
| `/api/ml/predict` | POST | 予測実行 |
| `/api/ml/optimize` | POST | 最適化実行 |
| `/api/ml/status/:runId` | GET | ステータス取得 |

### WebSocketイベント

| イベント | 方向 | 説明 |
|---------|------|------|
| `training_progress` | Server→Client | 学習進捗通知 |
| `training_complete` | Server→Client | 学習完了通知 |
| `training_error` | Server→Client | 学習エラー通知 |
| `ping` | Client→Server | 接続確認 |
| `pong` | Server→Client | 接続応答 |

---

**作成日**: 2026-01-09
**バージョン**: 1.0.0
**環境**: Phase 1A（ローカルPOC）
