# R&D実験管理システム

## Phase 1A - サンプルデータ版 + ML App統合

### 概要

材料R&D実験データの可視化・管理・ML連携システム。
サンプルデータを使用したUI検証版で、Database AppとML Appの2つのインターフェースを提供。

---

## 機能一覧

### Database App (`/`)
| 機能 | 状態 | 説明 |
|------|------|------|
| 5層グラフ表示 | ✅ 完成 | vis.jsを使った階層グラフ可視化 |
| ノードクリック→詳細表示 | ✅ 完成 | ノード情報・引張試験結果表示 |
| 層別フィルター | ✅ 完成 | Material/HeatTreatment/Product/TestPiece/Analysis |
| 経路追跡（トレーサビリティ） | ✅ 完成 | 上流・下流トレース機能 |
| **Dataset Export** | ✅ 完成 | **列選択→フラット化→ML App送信** |
| CSV保存 | ✅ 完成 | BOM付きUTF-8（Excel対応） |
| データセット名編集 | ✅ 完成 | プロンプトでカスタム名入力 |
| ノード追加・編集 | 🔜 Phase 3 | - |
| UC接続 | 🔜 Phase 1B | - |

### ML App (`/ml-app.html`)
| 機能 | 状態 | 説明 |
|------|------|------|
| データセット管理 | ✅ 完成 | インポート・一覧・削除 |
| データセット詳細プレビュー | ✅ 完成 | 3タブ表示（データ/統計/カラム） |
| 統計自動計算 | ✅ 完成 | min/max/mean/median（正確な中央値計算） |
| CSV保存 | ✅ 完成 | BOM付きUTF-8（Excel対応） |
| AIチャット統合 | ✅ 完成 | データセット選択→AIに通知 |
| ラン管理 | 🎨 モックアップ | モデル学習・予測タスク管理 |
| モデル管理 | 🔜 実装予定 | - |
| 分析ビュー | 🔜 実装予定 | - |

---

## データ構造

### 5層トレーサビリティフロー
```
素材(Material, 5件)
  ↓ quench/temper conditions
熱処理(HeatTreatment, 8件)
  ↓ combine
製品(Product, 13件)
  ↓ processing
テストピース(TestPiece, 15件)
  ↓ analysis
分析サンプル(AnalysisSample, 5件)
```

### データセットエクスポート例
Database Appで列を選択してML Appに送信すると、5層データが以下のようにフラット化されます：

| product_id | material_steelGrade | material_maker | ht_quenchTemp | ht_temperTemp | tp_avg_hardness | as_avg_hardness |
|------------|---------------------|----------------|---------------|---------------|-----------------|-----------------|
| P001       | SCM435             | A Steel        | 850           | 400           | 45.5            | 46.2            |
| P002       | SCM440             | B Steel        | 900           | 450           | 52.3            | 51.8            |
| ...        | ...                | ...            | ...           | ...           | ...             | ...             |

---

## ローカル実行

```bash
# 依存パッケージをインストール
npm install

# サーバー起動
npm start

# ブラウザでアクセス
# Database App: http://localhost:8000
# ML App:       http://localhost:8000/ml-app.html
```

起動すると以下が表示されます：
```
========================================
R&D Experiment Manager (Sample Data Mode)
Server running on port 8000
Started at: 2026-01-09T...
Data: 5 materials, 15 test pieces
========================================
```

---

## Databricks Apps デプロイ

1. ファイル一式をアップロード
2. `databricks apps deploy <app-name>`

`app.yaml` 設定済み（Phase 1Bでコメントアウト部分を有効化）

---

## ファイル構成

```
database_v1/
├── app.js                  # Expressサーバー + サンプルデータAPI
├── app.yaml                # Databricks Apps設定
├── package.json            # Node.js依存関係
├── README.md               # このファイル
├── archive/                # 古いバージョン（削除済み）
│   ├── ml-app-ui-mockup.html
│   ├── ml-app-with-agent.html
│   └── index2.html
└── public/
    ├── index.html          # Database App（メインUI）
    └── ml-app.html         # ML App（データセット管理・学習）
```

---

## API エンドポイント

| Endpoint | Method | 説明 |
|----------|--------|------|
| `/` | GET | Database App表示 |
| `/ml-app.html` | GET | ML App表示 |
| `/health` | GET | ヘルスチェック |
| `/api/nodes` | GET | グラフデータ（ノード＋エッジ） |
| `/api/layers` | GET | レイヤー定義情報 |
| `/api/stats` | GET | 統計情報 |
| `/api/node/:id` | GET | ノード詳細（引張試験結果含む） |
| `/api/trace/:id?direction=upstream` | GET | 上流トレース |
| `/api/trace/:id?direction=downstream` | GET | 下流トレース |
| `/api/search` | POST | レイヤーフィルター検索 |
| `/api/materials` | GET | 素材一覧 |
| `/api/heat-treatments` | GET | 熱処理一覧 |
| `/api/products` | GET | 材料一覧 |
| `/api/test-pieces` | GET | テストピース一覧 |
| `/api/analysis-samples` | GET | 分析サンプル一覧 |
| `/api/processes` | GET | プロセス一覧 |

---

## 使い方：Database → ML連携

### ステップ1: Database Appでデータを選択
1. http://localhost:8000 を開く
2. 左サイドバーの「Dataset Export」パネルを開く
3. 各層（Material、HeatTreatment等）のチェックボックスで列を選択
4. プレビューでデータを確認

### ステップ2: ML Appに送信
1. 「🚀 ML App」ボタンをクリック
2. データセット名を入力（例: `hardness_prediction_data`）
3. 新しいタブでML Appが開く

### ステップ3: ML Appで確認・使用
1. 右側のAIチャットパネルに「データセットをインポートしました！」と通知
2. 左サイドバーの「データセット」画面で一覧表示
3. 「👁️ プレビュー」で詳細確認
   - **データタブ**: 実際の値を確認（5/10/20/全て選択可能）
   - **統計タブ**: 各列の統計情報（min/max/mean/median）
   - **カラム一覧タブ**: 全カラムの型と概要
4. 「▶️ 使用」でML処理に利用
5. 「CSV保存」でExcel対応CSVダウンロード

---

## 技術スタック

### バックエンド
- **言語**: Node.js (v18+)
- **フレームワーク**: Express.js v4.21.0
- **ポート**: 8000

### フロントエンド
- **Database App**: Vanilla JavaScript + vis-network (v9.1.9)
- **ML App**: Vanilla JavaScript + Tailwind CSS
- **アイコン**: Font Awesome 6.4.0

### データ管理
- **Phase 1A**: LocalStorage（クライアント側）
- **Phase 1B**: Databricks Unity Catalog接続予定

---

## 次のステップ（ロードマップ）

### Phase 1B（もうすぐ）
- [ ] Unity Catalog接続
- [ ] 実データ対応
- [ ] API認証

### Phase 2
- [ ] フィルター強化
- [ ] 比較ビュー
- [ ] グラフからの直接エクスポート

### Phase 3
- [ ] データ登録・編集機能
- [ ] ノード追加UI

### Phase 4
- [ ] ML App: モデル管理画面実装
- [ ] ML App: 分析ビュー実装
- [ ] Streamlit連携
- [ ] MLflow統合

---

## CSV保存について

### Excel対応（BOM付きUTF-8）
両AppのCSV保存機能は、日本語の文字化けを防ぐため**BOM（Byte Order Mark）付きUTF-8**で保存されます。

- ✅ Windows版Excelで正常に開ける
- ✅ Mac版Excelでも正常に開ける
- ✅ Google Sheetsでも正常にインポート可能
- ✅ Pythonのpandas等でも問題なく読み込める（BOMは自動除去）

---

## 開発メモ

### サンプルデータ
- 素材: SCM435, SCM440, SNCM439など5種類
- 熱処理: 焼入れ850-950°C、焼戻し400-450°C
- 引張試験結果: 降伏強度、引張強度、伸び率

### レイヤー定義
```javascript
{
  material:        { level: 0, color: '#22d3ee' }, // Cyan
  heatTreatment:   { level: 1, color: '#f59e0b' }, // Orange
  product:         { level: 2, color: '#10b981' }, // Green
  testPiece:       { level: 3, color: '#a78bfa' }, // Purple
  analysisSample:  { level: 4, color: '#f472b6' }  // Pink
}
```

---

## トラブルシューティング

### ポート8000が既に使用中
```bash
# プロセスを確認
lsof -ti:8000

# プロセスを停止
kill -9 $(lsof -ti:8000)
```

### データセットが表示されない
1. LocalStorageをクリア: `localStorage.clear()` (DevTools Console)
2. ページをリロード

### CSVがExcelで文字化け
- BOM付きUTF-8で保存されているか確認
- Excelで開く際、「データ取得」→「テキストファイルから」で明示的にUTF-8指定

---

## ライセンス

MIT License

## 作者

Materials R&D Team

## 更新履歴

- **2026-01-09**: Dataset Export機能追加、ML App統合、CSV保存改善
- **2025-12**: Phase 1A初回リリース
