# R&D実験管理システム

## Phase 1A - サンプルデータ版

### 概要

材料R&D実験データの可視化・管理システム。
サンプルデータを使用したUI検証版。

### 機能

| 機能 | 状態 |
|------|------|
| 5層グラフ表示 | ✅ |
| ノードクリック→詳細表示 | ✅ |
| 層別フィルター | ✅ |
| 経路追跡（トレーサビリティ） | ✅ |
| ノード追加・編集 | Phase 3 |
| UC接続 | Phase 1B |

### データ構造

```
素材(5) → 熱処理(8) → 材料(10) → TP(15) → 分析サンプル(5)
```

### ローカル実行

```bash
npm install
npm start
# http://localhost:8000
```

### Databricks Apps デプロイ

1. ファイル一式をアップロード
2. `databricks apps deploy <app-name>`

### ファイル構成

```
experiment-manager/
├── app.js           # Expressサーバー + サンプルデータ
├── app.yaml         # Databricks Apps設定
├── package.json     # 依存関係
├── README.md        # このファイル
├── data/
│   └── sample-data.js  # サンプルデータ定義
└── public/
    └── index.html   # UI（vis.js）
```

### API エンドポイント

| Endpoint | Method | 説明 |
|----------|--------|------|
| `/health` | GET | ヘルスチェック |
| `/api/nodes` | GET | グラフデータ（ノード＋エッジ） |
| `/api/stats` | GET | 統計情報 |
| `/api/node/:id` | GET | ノード詳細 |
| `/api/trace/:id` | GET | 上流/下流トレース |
| `/api/materials` | GET | 素材一覧 |
| `/api/heat-treatments` | GET | 熱処理一覧 |
| `/api/products` | GET | 材料一覧 |
| `/api/test-pieces` | GET | TP一覧 |
| `/api/analysis-samples` | GET | 分析サンプル一覧 |

### 次のステップ

- [ ] Phase 1B: UC接続（実データ）
- [ ] Phase 2: フィルター強化、比較ビュー
- [ ] Phase 3: データ登録・編集機能
- [ ] Phase 4: Streamlit連携
