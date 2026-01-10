# Streamlit ML App 統合分析レポート

**作成日**: 2026-01-09
**目的**: Streamlit実装のML機能をNode.js/Express基盤の既存アプリに統合

---

## 📋 エグゼクティブサマリー

### 現状
- **Database App**: Node.js + Express.js + vis-network（グラフ可視化、データセット管理）✅ 完成
- **ML App (HTML版)**: データセット管理、統計計算、CSV保存 ✅ 完成
- **Streamlit ML App**: 完全なML学習・予測・最適化ワークフロー ✅ 実装済み（Databricks環境）

### 統合戦略
**推奨アプローチ**: **ハイブリッド型統合**
- インターフェース: 既存Node.js/Express（軽量・高速）
- ML処理: Streamlit機能をAPI化またはバックエンドサービス化（複雑なML処理）

---

## 🔍 Streamlit ML Appの機能分析

### 1. 学習・精度検証機能（`250829_学習・検証（開発用）.py`）

#### 実装内容
```python
主な機能:
- データ読込（S3 + 文字コード自動判定）
- ハイパーパラメータ最適化（HPO）
  - ライブラリ: PyCaret + Optuna（TPE）
  - 対応モデル: MLP, CatBoost, LightGBM
- クロスバリデーション（KFold / LeaveOneGroupOut）
- SHAP分析（特徴量寄与度）
- MLflow統合（モデル・結果管理）
```

#### 技術スタック
- **ML**: PyCaret, scikit-learn, XGBoost, CatBoost
- **最適化**: Optuna（TPE, NSGA-II）
- **説明性**: SHAP
- **管理**: MLflow（Databricks統合）
- **データ**: pandas, numpy
- **ストレージ**: AWS S3 + Databricks Unity Catalog

#### コア関数
| 関数名 | 行数 | 機能 | Node.js統合の難易度 |
|--------|------|------|---------------------|
| `hpo()` | 292-334 | ハイパーパラメータ最適化 | 🔴 高（Python依存） |
| `cv_predict()` | 349-376 | CV予測実行 | 🔴 高（PyCaret依存） |
| `encoding_detection()` | 85-114 | 文字コード自動判定 | 🟢 低（既存実装あり） |
| `download_file_from_s3()` | 117-121 | S3ダウンロード | 🟡 中（AWS SDK） |

---

### 2. 予測機能（`250829_予測（開発用）.py`）

#### 実装内容
```python
主な機能:
- 学習済みモデルのロード（MLflow）
- バッチ予測実行
- SHAP値計算（予測根拠の説明）
- 結果のMLflow保存
```

#### Node.js統合の課題
- MLflowからのモデルロード（`mlflow.pyfunc.load_model`）
- PyCaretモデルの実行環境

---

### 3. 最適化機能（`250829_最適化（開発用）.py`）

#### 実装内容
```python
主な機能:
- 多目的最適化（Optuna NSGA-II / TPE）
- パラメータ設定UI（整数/小数/カテゴリ）
- 目的変数設定（最大化/最小化/目標値）
- パレートフロント探索（多目的の場合）
```

#### パラメータ設定例
```python
param_configs = [
    {"name": "quenchTemp", "type": "整数", "low": 850, "high": 950},
    {"name": "temperTemp", "type": "整数", "low": 400, "high": 500}
]

target_param_configs = [
    {"name": "hardness", "type": "最大化"},
    {"name": "toughness", "type": "目標値", "value": 50.0}
]
```

---

### 4. Streamlit UI（`app (16).py`）

#### 主要コンポーネント
| コンポーネント | 行数 | 機能 |
|----------------|------|------|
| `create_run()` | 339-654 | 実行作成ダイアログ（3ステップウィザード） |
| `show_runs()` | 166-311 | 実行一覧・管理 |
| `show_run()` | 738-1003 | 実行結果詳細（グラフ・SHAP） |
| `check_status()` | 81-145 | Databricksジョブステータス監視 |

#### データベーススキーマ（Databricks Unity Catalog）
```sql
-- ユーザー管理
users (name, created_date)

-- プロジェクト管理
projects (id, name, creator, description, created_date, last_updated_date, is_deleted)
project_user (user_name, project_id, privilege_level)

-- タスク管理
tasks (id, project_id, name, description, creator, created_date, last_updated_date, is_deleted)

-- データセット管理
datasets (id, project_id, name, description, created_date, last_updated_date, is_deleted, parent_dataset_id)

-- 実行管理
runs (id, run_type, task_id, name, description, created_date, last_updated_date,
      is_deleted, is_registered, status, dataset_id, x_list, target, mlflow_id)
```

---

## 🔀 統合オプション比較

### オプション A: 完全置換（Streamlitへ移行）
**メリット**:
- ✅ ML機能がすぐ使える
- ✅ PyCaretエコシステム活用
- ✅ SHAP・MLflow統合済み

**デメリット**:
- ❌ Database Appの可視化機能（vis-network）を失う
- ❌ Streamlitの動作が重い（リアクティブ）
- ❌ グラフUIのカスタマイズ性低下
- ❌ 既存の軽量UIを捨てる

**推奨度**: 🔴 **非推奨**（既存資産を失う）

---

### オプション B: 完全統合（Node.js内でPython実行）
**メリット**:
- ✅ 既存UIを維持
- ✅ 1つのアプリで完結

**デメリット**:
- ❌ Node.js ⇄ Python間の複雑な通信
- ❌ デバッグが困難
- ❌ パフォーマンス問題（IPC）
- ❌ 依存関係の複雑化

**推奨度**: 🟡 **条件付き**（小規模プロトタイプのみ）

---

### オプション C: ハイブリッド型（推奨）★
**アーキテクチャ**:
```
┌─────────────────────────────────────┐
│   Node.js/Express (Port 8000)      │
│   - Database App (index.html)      │
│   - ML App (ml-app.html)           │
│   - グラフ可視化                    │
│   - データセット管理                │
└──────────────┬──────────────────────┘
               │ REST API
               ↓
┌─────────────────────────────────────┐
│   Python ML Service (Port 5000)     │
│   - 学習・検証 API                  │
│   - 予測 API                        │
│   - 最適化 API                      │
│   - MLflow統合                      │
└─────────────────────────────────────┘
```

**メリット**:
- ✅ 既存UI/UXを維持（軽量・高速）
- ✅ ML処理は専門サービスに分離
- ✅ 技術スタックの独立性
- ✅ スケーラビリティ（ML処理だけスケールアウト可能）
- ✅ デバッグしやすい

**デメリット**:
- ⚠️ API設計が必要
- ⚠️ 2つのサービス管理

**推奨度**: 🟢 **強く推奨**

---

## 📝 統合実装プラン（オプションC採用）

### Phase 1: Python MLサービス構築

#### 1-1. FlaskベースのML API作成
**新規ファイル**: `ml_service/app.py`

```python
from flask import Flask, request, jsonify
from pycaret.regression import *
import mlflow
import pandas as pd

app = Flask(__name__)

@app.route('/api/ml/train', methods=['POST'])
def train_model():
    """学習・検証API"""
    data = request.json
    # file_key, x_list, target, model_name, cv_group

    # Streamlitコードの hpo() + cv_predict() を呼び出し
    result = {
        "run_id": "...",
        "mlflow_id": "...",
        "cv_result": {...}
    }
    return jsonify(result)

@app.route('/api/ml/predict', methods=['POST'])
def predict():
    """予測API"""
    data = request.json
    # mlflow_id, x_list, input_data

    # 250829_予測.pyの処理
    return jsonify({"predictions": [...]})

@app.route('/api/ml/optimize', methods=['POST'])
def optimize():
    """最適化API"""
    data = request.json
    # mlflow_id, param_configs, target_param_configs

    # 250829_最適化.pyの処理
    return jsonify({"optimization_result": [...]})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

#### 1-2. Streamlit関数のリファクタリング
**タスク**:
- `hpo()`, `cv_predict()` を独立関数化
- Databricks依存の `dbutils` を環境変数・設定ファイルに置換
- S3アクセスを共通モジュール化

---

### Phase 2: Node.js側のAPI呼び出し実装

#### 2-1. ML API クライアント作成
**新規ファイル**: `ml-client.js`

```javascript
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';

async function trainModel(params) {
    const response = await axios.post(`${ML_SERVICE_URL}/api/ml/train`, params);
    return response.data;
}

async function predictModel(params) {
    const response = await axios.post(`${ML_SERVICE_URL}/api/ml/predict`, params);
    return response.data;
}

async function optimizeModel(params) {
    const response = await axios.post(`${ML_SERVICE_URL}/api/ml/optimize`, params);
    return response.data;
}

module.exports = { trainModel, predictModel, optimizeModel };
```

#### 2-2. Express ルート追加
**編集ファイル**: `app.js`

```javascript
const mlClient = require('./ml-client');

// 学習実行エンドポイント
app.post('/api/ml/train', async (req, res) => {
    try {
        const result = await mlClient.trainModel(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 予測エンドポイント
app.post('/api/ml/predict', async (req, res) => {
    try {
        const result = await mlClient.predictModel(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 最適化エンドポイント
app.post('/api/ml/optimize', async (req, res) => {
    try {
        const result = await mlClient.optimizeModel(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

---

### Phase 3: ML App UI拡張

#### 3-1. モデル学習UI追加
**編集ファイル**: `public/ml-app.html`

**追加セクション**: 「モデル管理」タブ

```html
<!-- 新規モデル学習ダイアログ -->
<div id="trainModelDialog" style="display:none;">
    <h3>新規モデル学習</h3>

    <!-- ステップ1: データセット選択 -->
    <select id="trainDatasetSelect"></select>

    <!-- ステップ2: モデル選択 -->
    <select id="trainModelType">
        <option value="catboost">CatBoost（推奨）</option>
        <option value="lightgbm">LightGBM</option>
        <option value="mlp">ニューラルネットワーク</option>
    </select>

    <!-- ステップ3: カラム設定（Drag & Drop） -->
    <div id="columnAssignment">
        <div class="column-bucket" data-type="features">説明変数</div>
        <div class="column-bucket" data-type="target">目的変数</div>
        <div class="column-bucket" data-type="cv_group">CV用グループ</div>
    </div>

    <!-- 実行ボタン -->
    <button onclick="startTraining()">学習開始</button>
</div>

<script>
async function startTraining() {
    const params = {
        dataset_id: document.getElementById('trainDatasetSelect').value,
        model_name: document.getElementById('trainModelType').value,
        x_list: getSelectedColumns('features'),
        target: getSelectedColumns('target'),
        cv_group: getSelectedColumns('cv_group')[0] || ""
    };

    try {
        const response = await fetch('/api/ml/train', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(params)
        });

        const result = await response.json();
        alert(`学習開始: Run ID ${result.run_id}`);

        // ステータス監視開始
        monitorTrainingStatus(result.run_id);
    } catch (error) {
        alert(`エラー: ${error.message}`);
    }
}

function monitorTrainingStatus(runId) {
    const interval = setInterval(async () => {
        const response = await fetch(`/api/ml/status/${runId}`);
        const status = await response.json();

        if (status.state === 'completed') {
            clearInterval(interval);
            alert('学習完了！');
            loadModels(); // モデル一覧を更新
        } else if (status.state === 'failed') {
            clearInterval(interval);
            alert('学習失敗');
        }
    }, 5000); // 5秒ごとにポーリング
}
</script>
```

#### 3-2. 予測実行UI
**追加機能**:
- 学習済みモデル一覧表示
- 予測用データのアップロード
- 予測結果のダウンロード

#### 3-3. 最適化UI
**追加機能**:
- パラメータ範囲設定（Streamlit UIを参考）
- 目的変数の最適化方向設定
- パレート解の可視化（Plotly.js）

---

### Phase 4: データベース連携

#### 4-1. ローカルストレージ → サーバーDB移行
**現状**: LocalStorage（クライアント側）
**Phase 1B**: Databricks Unity Catalog OR SQLite/PostgreSQL

**選択肢**:
1. **Databricks Unity Catalog**（Streamlit版と同じ）
   - メリット: Streamlit資産を活用
   - デメリット: Databricks環境が必要

2. **PostgreSQL**（汎用的）
   - メリット: 汎用性、ローカル開発が簡単
   - デメリット: Streamlitスキーマの移行が必要

**推奨**: Phase 1Bの要件次第だが、**PostgreSQL**が柔軟性高い

#### 4-2. スキーマ設計
Streamlitのスキーマをベースに、Node.js/Express用に最適化:

```sql
-- projects (プロジェクト管理)
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- datasets (データセット管理)
CREATE TABLE datasets (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    name VARCHAR(100) NOT NULL,
    file_path TEXT, -- S3 key or local path
    columns JSONB, -- カラム情報
    row_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- models (学習済みモデル)
CREATE TABLE models (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    dataset_id UUID REFERENCES datasets(id),
    name VARCHAR(100) NOT NULL,
    model_type VARCHAR(50), -- catboost, lightgbm, mlp
    mlflow_run_id VARCHAR(100),
    status VARCHAR(20), -- training, completed, failed
    metrics JSONB, -- RMSE, R2, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- predictions (予測結果)
CREATE TABLE predictions (
    id UUID PRIMARY KEY,
    model_id UUID REFERENCES models(id),
    input_data JSONB,
    output_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🚨 不明点・要確認事項（優先度付き）

### 🔴 高優先度（統合に必須）

#### 1. Databricks環境の利用可否
**質問**:
- Phase 1Bで**Databricks Unity Catalog**を使いますか？
- それとも**別のデータベース**（PostgreSQL等）を使いますか？

**影響**:
- Databricks: Streamlitコードをほぼそのまま活用可能
- 別DB: データベースアクセスを書き換える必要がある

**推奨**: Databricks環境がないなら**PostgreSQL + MLflow（ローカル）**

---

#### 2. MLflowの実行環境
**質問**:
- MLflowは**Databricks管理**ですか？**ローカル**ですか？
- 学習済みモデルの保存先は？

**影響**:
- Databricks MLflow: 既存Streamlitと同じ
- ローカルMLflow: `mlflow.set_tracking_uri("file:///path/to/mlruns")` で対応可能

---

#### 3. S3ストレージの使用
**質問**:
- データセット保存に**AWS S3**を使いますか？
- 認証情報（`aws_access_key_id`, `aws_secret_access_key`）は環境変数で管理しますか？

**影響**:
- S3利用: 既存Streamlitコードをそのまま使える
- ローカルファイル: ファイル保存ロジックを変更

**推奨**: Phase 1Aは**ローカルファイル**、Phase 1Bで**S3またはDatabricks Volumes**

---

### 🟡 中優先度（UX改善）

#### 4. 学習ステータスの監視方法
**質問**:
- 学習中のステータス更新は**ポーリング**（5秒ごとチェック）で良いですか？
- それとも**WebSocket**でリアルタイム更新が必要ですか？

**推奨**: Phase 1Aは**ポーリング**、Phase 2で**WebSocket**

---

#### 5. SHAP値の可視化
**質問**:
- SHAP値の表示は必要ですか？
- 必要な場合、**どのグラフ**が必要ですか？（beeswarm / waterfall / bar）

**影響**:
- SHAP.jsライブラリの検討が必要（Python SHAP → JavaScript変換）

**推奨**: Phase 1Aは**CSV保存のみ**、Phase 2で**可視化**

---

#### 6. Optunaの最適化結果表示
**質問**:
- 最適化結果は**テーブル表示**だけで良いですか？
- **HiPlot**のような対話的可視化が必要ですか？

**推奨**: Phase 1Aは**テーブル + 散布図**、Phase 2で**HiPlot互換UI**

---

### 🟢 低優先度（Phase 2以降）

#### 7. ユーザー管理・権限設定
**質問**:
- プロジェクト単位の**アクセス制御**は必要ですか？
- シングルユーザーで良いですか？

**推奨**: Phase 1Aは**シングルユーザー**、Phase 3で**マルチユーザー対応**

---

#### 8. モデルのバージョン管理
**質問**:
- 同じデータセットで複数回学習した場合、**バージョン管理**が必要ですか？

**推奨**: Phase 1Bで**MLflowのバージョン機能**を活用

---

## 📦 必要な技術スタック追加

### Python側（ML Service）
```bash
pip install flask flask-cors
pip install pycaret catboost lightgbm
pip install optuna shap mlflow
pip install boto3  # S3利用時
pip install psycopg2  # PostgreSQL利用時
```

### Node.js側
```bash
npm install axios  # HTTP client
npm install multer  # ファイルアップロード
npm install pg  # PostgreSQL（DB変更時）
```

---

## 📅 実装スケジュール案

### Sprint 1（1-2週間）: Phase 1完了
- [ ] Python MLサービスの基本構造作成
- [ ] `/api/ml/train` エンドポイント実装
- [ ] Node.js → Python API呼び出し確認
- [ ] ml-app.htmlに「モデル学習」タブ追加

### Sprint 2（1-2週間）: Phase 2完了
- [ ] `/api/ml/predict` エンドポイント実装
- [ ] 予測UI実装
- [ ] ステータス監視機能
- [ ] エラーハンドリング強化

### Sprint 3（1-2週間）: Phase 3完了
- [ ] `/api/ml/optimize` エンドポイント実装
- [ ] 最適化UI実装
- [ ] 結果可視化（Plotly.js）

### Sprint 4（1週間）: Phase 4完了
- [ ] データベース選定・設計
- [ ] LocalStorage → DB移行
- [ ] テスト・ドキュメント整備

---

## 🎯 まとめと推奨アクション

### 今すぐ決めるべきこと（高優先度）
1. ✅ **統合方式**: オプションC（ハイブリッド型）で進めてOKですか？
2. ✅ **Databricks環境**: Phase 1BでDatabricksを使いますか？
3. ✅ **MLflow環境**: Databricks管理 or ローカル？
4. ✅ **ストレージ**: S3 or ローカルファイル？

### 次のステップ
上記4点が決まれば、すぐにPhase 1の実装を開始できます。

**必要なファイル**:
- `ml_service/app.py` (新規作成)
- `ml_service/train.py` (Streamlitコードをリファクタリング)
- `ml-client.js` (新規作成)
- `app.js` (API追加)
- `public/ml-app.html` (UI拡張)

---

## 📎 参考資料

### Streamlit → Flask移行の参考例
- [PyCaret Flask deployment](https://pycaret.gitbook.io/docs/learn-pycaret/official-blog/deploy-pycaret-and-streamlit-app-using-aws)
- [MLflow Model Serving](https://mlflow.org/docs/latest/models.html#deploy-mlflow-models)

### グラフ可視化ライブラリ
- **Plotly.js**: Pythonと同じグラフをJavaScriptで再現可能
- **Chart.js**: シンプルなグラフ向け

---

**作成者**: Claude Code
**レビュー**: 待機中
**ステータス**: 🟡 要確認事項の回答待ち
