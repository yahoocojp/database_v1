/**
 * ML Training UI JavaScript
 * WebSocket対応の学習インターフェース
 */

// グローバル変数
let currentStep = 1;
let datasets = [];
let selectedDataset = null;
let datasetColumns = [];
let socket = null;
let currentRunId = null;

// WebSocket接続（Phase 1A++ WebSocket Manager使用）
function connectWebSocket() {
    // WebSocket Managerを使用してシングルトン接続
    socket = window.wsManager.connect();

    // 接続イベント
    window.wsManager.on('connect', () => {
        console.log('[WebSocket] Connected');
        if (typeof addLog === 'function') {
            addLog('WebSocket接続完了');
        }
        Toast.success('WebSocket接続完了');
    });

    // 切断イベント
    window.wsManager.on('disconnect', (reason) => {
        console.log('[WebSocket] Disconnected', reason);
        Toast.warning('WebSocket切断されました');
    });

    // 学習進捗
    window.wsManager.on('training_progress', (data) => {
        console.log('[Training Progress]', data);
        if (typeof updateProgress === 'function') {
            updateProgress(data.progress, data.message);
        }
        if (typeof addLog === 'function') {
            addLog(data.message, data.progress);
        }
    });

    // 学習完了
    window.wsManager.on('training_complete', (data) => {
        console.log('[Training Complete]', data);
        if (typeof handleTrainingComplete === 'function') {
            handleTrainingComplete(data);
        }
    });

    // 学習エラー
    window.wsManager.on('training_error', (data) => {
        console.error('[Training Error]', data);
        if (typeof handleTrainingError === 'function') {
            handleTrainingError(data);
        }
    });
}

// 初期化
async function initialize() {
    connectWebSocket();
    await loadDatasets();

    // Check for auto-load parameter
    const urlParams = new URLSearchParams(window.location.search);
    const shouldAutoLoad = urlParams.get('autoload') === 'true';

    // Auto-load temporary dataset if requested
    if (shouldAutoLoad) {
        const tempDatasetStr = localStorage.getItem('mlapp_temp_dataset');
        if (tempDatasetStr) {
            try {
                const tempDataset = JSON.parse(tempDatasetStr);

                // Pre-select the dataset
                const select = document.getElementById('datasetSelect');
                select.value = tempDataset.id;

                // Trigger the change event to display dataset info
                const event = new Event('change');
                select.dispatchEvent(event);

                // Show success message in notification area
                const notification = document.getElementById('autoLoadNotification');
                const message = document.getElementById('autoLoadMessage');
                message.textContent = `データセット「${tempDataset.name}」を自動読み込みしました。設定を確認して次のステップへ進んでください。`;
                notification.style.display = 'block';

                // Clear temporary dataset from localStorage
                localStorage.removeItem('mlapp_temp_dataset');

            } catch (error) {
                console.error('Failed to load temporary dataset:', error);

                // Show error message in notification area
                const notification = document.getElementById('autoLoadNotification');
                const message = document.getElementById('autoLoadMessage');
                notification.className = 'alert alert-danger';
                notification.style.display = 'block';
                message.textContent = 'データセットの自動読み込みに失敗しました';
            }
        }
    }
}

// データセット読み込み
async function loadDatasets() {
    try {
        // LocalStorageからデータセットを取得
        const storedDatasets = localStorage.getItem('mlapp_datasets_all');
        if (storedDatasets) {
            datasets = JSON.parse(storedDatasets);
        } else {
            datasets = [];
        }

        const select = document.getElementById('datasetSelect');
        select.innerHTML = '<option value="">データセットを選択してください</option>';

        datasets.forEach(dataset => {
            const option = document.createElement('option');
            option.value = dataset.id;
            option.textContent = dataset.name;
            select.appendChild(option);
        });

        if (datasets.length === 0) {
            select.innerHTML = '<option value="">データセットがありません。先にデータをインポートしてください。</option>';
        }

        // データセット選択イベント
        select.onchange = handleDatasetSelect;

    } catch (error) {
        await ErrorHandler.handle(new DataError('データセット読み込みエラー: ' + error.message), {
            action: 'loadDatasets',
            error: error.message
        });
    }
}

// データセット選択ハンドラ
function handleDatasetSelect(event) {
    const datasetId = event.target.value;
    if (!datasetId) {
        document.getElementById('datasetInfo').style.display = 'none';
        selectedDataset = null;
        return;
    }

    selectedDataset = datasets.find(d => d.id === datasetId);
    if (!selectedDataset) return;

    // データセット情報表示
    const infoDiv = document.getElementById('datasetInfo');
    const detailsDiv = document.getElementById('datasetDetails');

    detailsDiv.innerHTML = `
        <div><strong>データセット名:</strong> ${selectedDataset.name}</div>
        <div><strong>行数:</strong> ${selectedDataset.data.length}行</div>
        <div><strong>列数:</strong> ${Object.keys(selectedDataset.data[0] || {}).length}列</div>
    `;

    infoDiv.style.display = 'block';

    // カラム情報を保存
    if (selectedDataset.data.length > 0) {
        datasetColumns = Object.keys(selectedDataset.data[0]);
    }
}

// ウィザードステップ管理
function nextStep() {
    // バリデーション
    if (currentStep === 1) {
        if (!selectedDataset) {
            alert('データセットを選択してください');
            return;
        }
    }

    if (currentStep === 2) {
        // モデル選択確認（必須）
        const modelSelect = document.getElementById('modelSelect');
        if (!modelSelect.value) {
            alert('モデルを選択してください');
            return;
        }
    }

    if (currentStep === 3) {
        // 変数選択確認
        const features = getSelectedColumns('features');
        const targets = getSelectedColumns('target');

        if (features.length === 0) {
            alert('説明変数を1つ以上選択してください');
            return;
        }

        if (targets.length === 0) {
            alert('目的変数を1つ以上選択してください');
            return;
        }

        // Step 4の確認画面を更新
        updateConfirmation();
    }

    // ステップ進行
    if (currentStep < 4) {
        currentStep++;
        updateWizardUI();
    }
}

function previousStep() {
    if (currentStep > 1) {
        currentStep--;
        updateWizardUI();
    }
}

function updateWizardUI() {
    // ステップ表示切り替え
    document.querySelectorAll('.wizard-step').forEach(step => {
        const stepNum = parseInt(step.dataset.step);
        step.classList.remove('active', 'completed');

        if (stepNum === currentStep) {
            step.classList.add('active');
        } else if (stepNum < currentStep) {
            step.classList.add('completed');
        }
    });

    document.querySelectorAll('.form-section').forEach(section => {
        section.classList.remove('active');
    });

    const activeSection = document.querySelector(`.form-section[data-step="${currentStep}"]`);
    if (activeSection) {
        activeSection.classList.add('active');
    }

    // ボタン表示制御
    document.getElementById('prevBtn').style.display = currentStep > 1 ? 'block' : 'none';
    document.getElementById('nextBtn').style.display = currentStep < 4 ? 'block' : 'none';
    document.getElementById('trainBtn').style.display = currentStep === 4 ? 'block' : 'none';

    // Step 3でカラム選択UIを初期化
    if (currentStep === 3) {
        initializeColumnSelector();
    }
}

// カラム選択UI初期化
function initializeColumnSelector() {
    if (datasetColumns.length === 0) return;

    // 未使用バケットに全カラムを配置
    const unusedBucket = document.querySelector('#unusedBucket .bucket-items');
    unusedBucket.innerHTML = '';

    datasetColumns.forEach(col => {
        const item = createColumnItem(col);
        unusedBucket.appendChild(item);
    });
}

function createColumnItem(columnName) {
    const div = document.createElement('div');
    div.className = 'column-item';
    div.draggable = true;
    div.dataset.column = columnName;
    div.textContent = columnName;

    // ドラッグイベント
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragend', handleDragEnd);

    return div;
}

let draggedItem = null;

function handleDragStart(e) {
    draggedItem = e.target;
    e.target.classList.add('dragging');
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

// バケットにドロップイベントを設定
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.column-bucket').forEach(bucket => {
        bucket.addEventListener('dragover', (e) => {
            e.preventDefault();
            bucket.style.background = '#e3f2fd';
        });

        bucket.addEventListener('dragleave', (e) => {
            bucket.style.background = '#f8f9fa';
        });

        bucket.addEventListener('drop', (e) => {
            e.preventDefault();
            bucket.style.background = '#f8f9fa';

            if (draggedItem) {
                const bucketItems = bucket.querySelector('.bucket-items');
                bucketItems.appendChild(draggedItem);
            }
        });
    });
});

function getSelectedColumns(bucketType) {
    const bucket = document.querySelector(`[data-type="${bucketType}"] .bucket-items`);
    if (!bucket) return [];

    const items = bucket.querySelectorAll('.column-item');
    return Array.from(items).map(item => item.dataset.column);
}

// 確認画面更新
function updateConfirmation() {
    const features = getSelectedColumns('features');
    const targets = getSelectedColumns('target');
    const cvGroup = getSelectedColumns('cv_group');
    const modelName = document.getElementById('modelSelect').value;

    const confirmDiv = document.getElementById('confirmationDetails');
    confirmDiv.innerHTML = `
        <div class="alert alert-info">
            <h4><i class="fas fa-database"></i> データセット</h4>
            <p>${selectedDataset.name} (${selectedDataset.data.length}行)</p>
        </div>

        <div class="alert alert-info">
            <h4><i class="fas fa-robot"></i> モデル</h4>
            <p>${getModelDisplayName(modelName)}</p>
        </div>

        <div class="alert alert-info">
            <h4><i class="fas fa-th-list"></i> 説明変数（${features.length}個）</h4>
            <p>${features.join(', ')}</p>
        </div>

        <div class="alert alert-info">
            <h4><i class="fas fa-bullseye"></i> 目的変数（${targets.length}個）</h4>
            <p>${targets.join(', ')}</p>
        </div>

        ${cvGroup.length > 0 ? `
        <div class="alert alert-info">
            <h4><i class="fas fa-layer-group"></i> CV用グループ</h4>
            <p>${cvGroup[0]}</p>
        </div>
        ` : ''}

        <div class="alert alert-success">
            <strong><i class="fas fa-check"></i> 準備完了！</strong>
            「学習開始」ボタンをクリックして学習を開始してください。
        </div>
    `;
}

function getModelDisplayName(modelName) {
    const names = {
        'catboost': 'CatBoost（推奨・高速・高精度）',
        'lightgbm': 'LightGBM（軽量・高速）',
        'mlp': 'ニューラルネットワーク（複雑なパターン向け）'
    };
    return names[modelName] || modelName;
}

// 学習開始
async function startTraining() {
    const features = getSelectedColumns('features');
    const targets = getSelectedColumns('target');
    const cvGroup = getSelectedColumns('cv_group');
    const modelName = document.getElementById('modelSelect').value;

    if (features.length === 0 || targets.length === 0) {
        Toast.warning('説明変数と目的変数を選択してください');
        return;
    }

    // モーダル表示
    showTrainingDialog();

    // データセットをCSVとしてローカルに保存
    const datasetId = await saveDatasetLocally(selectedDataset);

    try {
        const params = {
            dataset_id: datasetId,
            model_name: modelName,
            x_list: features,
            target: targets,
            cv_group: cvGroup.length > 0 ? cvGroup[0] : ''
        };

        const response = await ErrorHandler.fetchWithErrorHandling(
            '/api/ml/train',
            {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(params)
            },
            {
                action: 'startTraining',
                datasetId: datasetId,
                modelName: modelName
            }
        );

        const result = await response.json();

        currentRunId = result.run_id;
        addLog(`学習開始: Run ID ${result.run_id}`);
        Toast.success('学習を開始しました');

    } catch (error) {
        await ErrorHandler.handle(error, {
            action: 'startTraining',
            datasetId: datasetId,
            modelName: modelName
        });
        closeTrainingDialog();
    }
}

async function saveDatasetLocally(dataset) {
    // データセットをCSV形式に変換してサーバーに送信
    // POC: datasetIdとしてdataset.idを使用
    // 実際には/data/datasetsにCSVを保存する必要がある

    // TODO: サーバー側でデータセット保存APIを実装
    return dataset.id;
}

// プログレスバー更新
function updateProgress(progress, message) {
    const progressBar = document.getElementById('trainingProgress');
    const progressText = document.getElementById('progressText');

    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
}

// ログ追加
function addLog(message, progress = null) {
    const logContainer = document.getElementById('trainingLog');
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';

    const timestamp = new Date().toLocaleTimeString();
    const progressStr = progress !== null ? `[${progress}%]` : '';

    logEntry.innerHTML = `
        <span class="log-timestamp">${timestamp}</span>
        <span class="log-message">${progressStr} ${message}</span>
    `;

    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 学習完了ハンドラ
function handleTrainingComplete(data) {
    addLog('学習完了！');
    updateProgress(100, '完了');

    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-check-circle" style="color:#10b981;"></i> 学習完了！';

    // 結果サマリー表示
    const resultSummary = document.getElementById('resultSummary');
    const metricsContainer = document.getElementById('metricsContainer');

    if (data.result && data.result.targets) {
        let metricsHTML = '';
        for (const [target, metrics] of Object.entries(data.result.targets)) {
            metricsHTML += `
                <div class="metric-item">
                    <span class="metric-label">${target} - RMSE:</span>
                    <span class="metric-value">${metrics.rmse.toFixed(4)}</span>
                </div>
                <div class="metric-item">
                    <span class="metric-label">${target} - R²:</span>
                    <span class="metric-value">${metrics.r2.toFixed(4)}</span>
                </div>
            `;
        }
        metricsContainer.innerHTML = metricsHTML;
    }

    resultSummary.style.display = 'block';
    document.getElementById('viewResultBtn').style.display = 'block';
}

// 学習エラーハンドラ
function handleTrainingError(data) {
    addLog(`エラー: ${data.error}`);
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-exclamation-circle" style="color:#dc3545;"></i> 学習失敗';
    alert(`学習失敗: ${data.error}`);
}

// ダイアログ表示/非表示
function showTrainingDialog() {
    document.getElementById('trainingModal').classList.add('show');
    document.getElementById('trainingLog').innerHTML = '';
    document.getElementById('resultSummary').style.display = 'none';
    document.getElementById('viewResultBtn').style.display = 'none';
    updateProgress(0, '待機中...');
}

function closeTrainingDialog() {
    document.getElementById('trainingModal').classList.remove('show');
}

function viewResults() {
    // TODO: 結果詳細画面への遷移
    alert('結果詳細画面は今後実装予定です');
}

// ページ読み込み時に初期化
window.addEventListener('DOMContentLoaded', initialize);
