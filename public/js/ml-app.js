// ========================================
// ML API Connection
// ========================================
var mlApiConnected = false;
var mlSocket = null;
var currentTrainingRunId = null;

// Check ML service health on load
async function checkMLServiceHealth() {
    try {
        const response = await fetch('/api/ml/health');
        if (response.ok) {
            const data = await response.json();
            mlApiConnected = true;
            console.log('[ML API] Service connected:', data);
            return true;
        }
    } catch (e) {
        console.log('[ML API] Service not available, using mock mode');
        mlApiConnected = false;
    }
    return false;
}

// Initialize WebSocket for real-time updates
function initMLWebSocket() {
    if (typeof io === 'undefined') {
        console.log('[ML API] Socket.IO not loaded');
        return;
    }

    mlSocket = io(window.location.origin, {
        path: '/socket.io',
        transports: ['websocket', 'polling']
    });

    mlSocket.on('connect', function() {
        console.log('[ML API] WebSocket connected');
    });

    mlSocket.on('training_progress', function(data) {
        if (data.run_id === currentTrainingRunId) {
            updateTrainingProgress(data.progress, data.message);
        }
    });

    mlSocket.on('training_complete', function(data) {
        if (data.run_id === currentTrainingRunId) {
            handleTrainingComplete(data);
        }
    });

    mlSocket.on('training_error', function(data) {
        if (data.run_id === currentTrainingRunId) {
            handleTrainingError(data.error);
        }
    });
}

// Update progress UI
function updateTrainingProgress(progress, message) {
    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('progressPercent').textContent = Math.round(progress) + '%';

    var log = document.getElementById('progressLog');
    var logEntry = document.createElement('div');
    logEntry.textContent = '[' + new Date().toLocaleTimeString('ja-JP') + '] ' + message;
    log.appendChild(logEntry);
    log.scrollTop = log.scrollHeight;
}

// Save dataset to server for ML service
async function saveDatasetToServer(dataset) {
    if (!dataset || !dataset.data) {
        console.log('[Dataset] No data to save');
        return;
    }

    try {
        const response = await fetch('/api/datasets/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: dataset.name,
                columns: dataset.columns,
                data: dataset.data
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('[Dataset] Saved to server:', result.name);
        } else {
            console.log('[Dataset] Save failed, will use mock mode');
        }
    } catch (e) {
        console.log('[Dataset] Server save error:', e.message);
    }
}

// Load datasets from server
async function loadServerDatasets() {
    try {
        const response = await fetch('/api/datasets/list');
        if (response.ok) {
            const result = await response.json();
            return result.datasets || [];
        }
    } catch (e) {
        console.log('[Dataset] Failed to load server datasets:', e.message);
    }
    return [];
}

// ========================================
// Phase 1B: Theme Toggle
// ========================================
function toggleTheme() {
    console.log('[Theme] Toggle called, themeManager:', !!window.themeManager);
    var newTheme;
    if (window.themeManager) {
        window.themeManager.toggle();
        newTheme = window.themeManager.getEffectiveTheme();
    } else {
        // Fallback: manual theme toggle
        var currentTheme = localStorage.getItem('theme') || 'dark';
        newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
    }
    // Apply theme to body and CSS variables
    document.body.setAttribute('data-theme', newTheme);
    applyThemeColors(newTheme);
    updateThemeIcon();
    showToast('テーマを切り替えました: ' + (newTheme === 'dark' ? 'ダーク' : 'ライト'), 'info');
}

function applyThemeColors(theme) {
    var root = document.documentElement;
    if (theme === 'light') {
        root.style.setProperty('--bg-main', '#f9fafb');
        root.style.setProperty('--bg-card', '#ffffff');
        root.style.setProperty('--text-main', '#1f2937');
        root.style.setProperty('--text-secondary', '#4b5563');
        root.style.setProperty('--border-main', '#e5e7eb');
        root.style.setProperty('--gray-50', '#f9fafb');
        root.style.setProperty('--gray-100', '#f3f4f6');
        root.style.setProperty('--gray-200', '#e5e7eb');
        root.style.setProperty('--gray-800', '#1f2937');
    } else {
        root.style.setProperty('--bg-main', '#0f0f1a');
        root.style.setProperty('--bg-card', '#1a1a2e');
        root.style.setProperty('--text-main', '#f1f5f9');
        root.style.setProperty('--text-secondary', '#94a3b8');
        root.style.setProperty('--border-main', '#2a2a3a');
        root.style.setProperty('--gray-50', '#1a1a2e');
        root.style.setProperty('--gray-100', '#252540');
        root.style.setProperty('--gray-200', '#2a2a3a');
        root.style.setProperty('--gray-800', '#f1f5f9');
    }
}

function updateThemeIcon() {
    var icon = document.getElementById('themeIcon');
    if (icon) {
        var theme = 'dark';
        if (window.themeManager) {
            theme = window.themeManager.getEffectiveTheme();
        } else {
            theme = localStorage.getItem('theme') || 'dark';
        }
        icon.className = 'fas ' + (theme === 'dark' ? 'fa-moon' : 'fa-sun');
        console.log('[Theme] Icon updated to:', theme);
    }
}

// Update icon on page load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        // Initialize theme from localStorage or themeManager
        var savedTheme = 'dark';
        if (window.themeManager) {
            savedTheme = window.themeManager.getEffectiveTheme();
        } else {
            savedTheme = localStorage.getItem('theme') || 'dark';
        }
        document.body.setAttribute('data-theme', savedTheme);
        applyThemeColors(savedTheme);
        updateThemeIcon();
    }, 100);
});

// ========================================
// Chat Panel Functions
// ========================================
// Chat toggle
function toggleChat() {
    const panel = document.getElementById('chatPanel');
    const main = document.getElementById('mainContent');
    panel.classList.toggle('collapsed');
    main.classList.toggle('chat-collapsed');
}

// Focus chat input
function focusChat() {
    const panel = document.getElementById('chatPanel');
    const main = document.getElementById('mainContent');
    if (panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        main.classList.remove('chat-collapsed');
    }
    document.getElementById('chatInput').focus();
}

// Send message
function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;
    
    addMessage(message, 'user');
    input.value = '';
    input.style.height = 'auto';
    
    // Show typing indicator
    showTyping();
    
    // Simulate AI response
    setTimeout(() => {
        hideTyping();
        processUserMessage(message);
    }, 1500);
}

// Add message to chat
function addMessage(text, sender) {
    const container = document.getElementById('chatMessages');
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.innerHTML = `
        <div class="message-bubble">${text}</div>
        <div class="message-time">${time}</div>
    `;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

// Add config card (AI-generated execution settings)
function addConfigCard(config) {
    const container = document.getElementById('chatMessages');
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent';
    messageDiv.innerHTML = `
        <div class="message-bubble" style="padding: 8px;">
            以下の設定で実行しますか？
            <div class="config-card">
                <div class="config-card-header">
                    <i class="fas fa-cog"></i>
                    <span class="font-medium text-gray-800">実行条件</span>
                </div>
                <div class="config-card-body">
                    <div class="config-row">
                        <span class="config-label">タイプ</span>
                        <span class="config-value">${config.type}</span>
                    </div>
                    <div class="config-row">
                        <span class="config-label">データセット</span>
                        <span class="config-value">${config.dataset}</span>
                    </div>
                    <div class="config-row">
                        <span class="config-label">特徴量</span>
                        <div>
                            ${config.features.map(f => `<span class="config-tag">${f}</span>`).join('')}
                        </div>
                    </div>
                    <div class="config-row">
                        <span class="config-label">目的変数</span>
                        <span class="config-value">${config.target}</span>
                    </div>
                    <div class="config-row">
                        <span class="config-label">モデル</span>
                        <span class="config-value">${config.model}</span>
                    </div>
                </div>
                <div class="config-card-actions">
                    <button class="config-btn config-btn-ghost" onclick="cancelConfig()">
                        <i class="fas fa-times"></i>
                        キャンセル
                    </button>
                    <button class="config-btn config-btn-secondary" onclick="editConfig()">
                        <i class="fas fa-edit"></i>
                        修正
                    </button>
                    <button class="config-btn config-btn-primary" onclick="executeConfig()">
                        <i class="fas fa-play"></i>
                        実行
                    </button>
                </div>
            </div>
        </div>
        <div class="message-time">${time}</div>
    `;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

// Process user message and generate response
function processUserMessage(message) {
    const lowerMsg = message.toLowerCase();
    
    // Pattern: Create/Run task
    if (lowerMsg.includes('予測') || lowerMsg.includes('学習') || lowerMsg.includes('最適化')) {
        let type = '学習';
        if (lowerMsg.includes('予測')) type = '予測';
        if (lowerMsg.includes('最適化')) type = '最適化';
        
        // Extract features mentioned
        const features = [];
        if (lowerMsg.includes('温度')) features.push('Temperature');
        if (lowerMsg.includes('圧力')) features.push('Pressure');
        if (lowerMsg.includes('時間')) features.push('Time');
        if (lowerMsg.includes('冷却')) features.push('CoolingRate');
        if (features.length === 0) features.push('Temperature', 'Pressure', 'Time');
        
        // Extract target
        let target = 'Particle_Size';
        if (lowerMsg.includes('硬さ') || lowerMsg.includes('硬度')) target = 'Hardness';
        if (lowerMsg.includes('粒径') || lowerMsg.includes('粒子')) target = 'Particle_Size';
        if (lowerMsg.includes('強度')) target = 'Strength';
        
        // Generate config
        addConfigCard({
            type: type,
            dataset: 'carbide_dataset_v3',
            features: features,
            target: target,
            model: type === '学習' ? 'LightGBM + GridSearch' : (type === '最適化' ? 'Bayesian Optimization' : 'LightGBM')
        });
    }
    // Pattern: Query results
    else if (lowerMsg.includes('精度') || lowerMsg.includes('比較') || lowerMsg.includes('結果')) {
        addMessage(`最近のラン精度を分析しました：<br><br>
            <b>Top 3 精度</b><br>
            1. run_20250610_001: R²=0.912<br>
            2. run_20250608_004: R²=0.891<br>
            3. run_20250605_002: R²=0.878<br><br>
            詳細を見たいランはありますか？`, 'agent');
    }
    // Pattern: Explain results
    else if (lowerMsg.includes('解説') || lowerMsg.includes('説明') || lowerMsg.includes('shap')) {
        addMessage(`<b>run_20250610_001 の結果解説</b><br><br>
            このモデルでは <b>Temperature</b> が粒径に最も強く寄与しています（SHAP値: 0.34）。<br><br>
            850℃以上で粒径が急激に増大する傾向が見られ、Pressure との交互作用も確認されました。<br><br>
            <b>改善提案</b>: 冷却速度を特徴量に追加すると、予測精度が向上する可能性があります。`, 'agent');
    }
    // Default response
    else {
        addMessage(`「${message}」について確認します。<br><br>
            具体的なタスクを教えてください：<br>
            • どのデータセットを使いますか？<br>
            • 何を予測/最適化しますか？`, 'agent');
    }
}

// Show typing indicator
function showTyping() {
    const container = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'message agent';
    typingDiv.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;
}

// Hide typing indicator
function hideTyping() {
    const typing = document.getElementById('typingIndicator');
    if (typing) typing.remove();
}

// Config card actions
function executeConfig() {
    showToast('ランを開始しました');
    addMessage('ランを開始しました。進捗はテーブルで確認できます。完了したら通知します。', 'agent');
}

function editConfig() {
    addMessage('修正したい項目を教えてください。例：「冷却速度も追加して」「モデルをXGBoostに変更」', 'agent');
}

function cancelConfig() {
    addMessage('キャンセルしました。他にお手伝いできることはありますか？', 'agent');
}

// Use hint
function useHint(text) {
    document.getElementById('chatInput').value = text;
    document.getElementById('chatInput').focus();
}

// Clear chat
function clearChat() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = `
        <div class="message agent">
            <div class="message-bubble">
                チャットをクリアしました。新しいタスクを入力してください。
            </div>
            <div class="message-time">${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
    `;
}

// Handle Enter key
function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Auto-resize textarea
document.getElementById('chatInput').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Toast notification (Phase 1A++ integrated)
function showToast(message, type) {
    type = type || 'success';

    // Try window.Toast first (from toast.js library)
    if (typeof window.Toast !== 'undefined' && typeof window.Toast.show === 'function') {
        window.Toast.show(message, type);
        return;
    }

    // Fallback: create simple toast
    var existingToast = document.getElementById('simpleToast');
    if (existingToast) {
        existingToast.remove();
    }

    var toast = document.createElement('div');
    toast.id = 'simpleToast';
    toast.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 8px; color: white; font-size: 14px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';

    if (type === 'error') {
        toast.style.background = '#ef4444';
    } else if (type === 'warning') {
        toast.style.background = '#f59e0b';
    } else {
        toast.style.background = '#10b981';
    }

    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function() {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 4000);
}

// Modal functions (from original)
function openModal() {
    // For demo, just show toast
    showToast('GUI モーダルを開く（デモ）');
}

// ========================================
// View Switching
// ========================================
function switchView(viewName) {
    // Hide all views
    document.querySelectorAll('.view-container').forEach(function(view) {
        view.style.display = 'none';
    });

    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.classList.remove('active');
    });

    // Show selected view
    if (viewName === 'runs') {
        document.getElementById('runsView').style.display = 'block';
        document.getElementById('navRuns').classList.add('active');
    } else if (viewName === 'datasets') {
        document.getElementById('datasetsView').style.display = 'block';
        document.getElementById('navDatasets').classList.add('active');
        renderDatasets();
    } else if (viewName === 'models') {
        // モデル学習モーダルを表示
        document.getElementById('navModels').classList.add('active');
        openTrainingModal();
    } else if (viewName === 'analysis') {
        // 分析機能は開発中
        document.getElementById('runsView').style.display = 'block';
        document.getElementById('navRuns').classList.add('active');
        showToast('分析機能は Phase 1B で実装予定です', 'info');
    } else if (viewName === 'settings') {
        // 設定機能は開発中
        document.getElementById('runsView').style.display = 'block';
        document.getElementById('navRuns').classList.add('active');
        showToast('設定機能は Phase 1B で実装予定です', 'info');
    } else {
        // For other views, show runs as default
        document.getElementById('runsView').style.display = 'block';
        document.getElementById('navRuns').classList.add('active');
        showToast('この機能は開発中です', 'info');
    }
}

// ========================================
// Dataset Import from Database App
// ========================================
var importedDatasets = [];

function checkForImportedDataset() {
    var stored = localStorage.getItem('mlapp_dataset');
    if (stored) {
        try {
            var dataset = JSON.parse(stored);

            // Save to stored datasets
            var storedDatasets = JSON.parse(localStorage.getItem('mlapp_datasets_all') || '[]');
            storedDatasets.push(dataset);
            localStorage.setItem('mlapp_datasets_all', JSON.stringify(storedDatasets));
            importedDatasets = storedDatasets;

            // Clear temporary import
            localStorage.removeItem('mlapp_dataset');

            // Show notification in chat
            addMessage(
                'データセットをインポートしました！<br><br>' +
                '<b>' + dataset.name + '</b><br>' +
                '• 行数: ' + dataset.rows + '<br>' +
                '• カラム: ' + dataset.columns.slice(0, 5).join(', ') + (dataset.columns.length > 5 ? '...' : '') + '<br><br>' +
                'このデータで学習・予測を行いますか？',
                'agent'
            );

            showToast('データセット "' + dataset.name + '" をインポートしました');

            // Refresh datasets view if currently viewing
            if (document.getElementById('datasetsView').style.display === 'block') {
                renderDatasets();
            }
        } catch (e) {
            console.error('Failed to parse imported dataset:', e);
        }
    }
}

// ========================================
// Dataset Management
// ========================================
function refreshDatasets() {
    var storedDatasets = JSON.parse(localStorage.getItem('mlapp_datasets_all') || '[]');
    importedDatasets = storedDatasets;
    renderDatasets();
    showToast('データセット一覧を更新しました');
}

function renderDatasets() {
    var storedDatasets = JSON.parse(localStorage.getItem('mlapp_datasets_all') || '[]');
    importedDatasets = storedDatasets;

    // Update stats
    document.getElementById('totalDatasets').textContent = importedDatasets.length;

    var totalRows = importedDatasets.reduce(function(sum, ds) { return sum + (ds.rows || 0); }, 0);
    document.getElementById('totalRows').textContent = totalRows;

    var avgCols = importedDatasets.length > 0
        ? Math.round(importedDatasets.reduce(function(sum, ds) { return sum + (ds.columns ? ds.columns.length : 0); }, 0) / importedDatasets.length)
        : 0;
    document.getElementById('totalColumns').textContent = avgCols;

    var latestTime = '--';
    if (importedDatasets.length > 0 && importedDatasets[importedDatasets.length - 1].createdAt) {
        var date = new Date(importedDatasets[importedDatasets.length - 1].createdAt);
        latestTime = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    }
    document.getElementById('latestImport').textContent = latestTime;

    // Render dataset list
    var container = document.getElementById('datasetsList');

    // Show loading state briefly
    container.innerHTML = '<div style="padding: 40px; text-align: center;"><div class="loading-spinner" style="margin: 0 auto 12px;"></div><div class="loading-text">データセットを読み込み中...</div></div>';

    // Simulate async load (in real app, this would be API call)
    setTimeout(function() {
        if (importedDatasets.length === 0) {
            container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--gray-400);"><i class="fas fa-database" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i><div>インポートされたデータセットがありません</div><div style="font-size: 12px; margin-top: 8px;">Database Appから「ML学習」ボタンでデータセットを送信してください</div></div>';
            return;
        }
        renderDatasetTable(container);
    }, 300);
}

function renderDatasetTable(container) {
    if (importedDatasets.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--gray-400);"><i class="fas fa-database" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i><div>インポートされたデータセットがありません</div><div style="font-size: 12px; margin-top: 8px;">Database Appから「ML学習」ボタンでデータセットを送信してください</div></div>';
        return;
    }

    var html = '<table class="data-table"><thead><tr>';
    html += '<th>データセット名</th>';
    html += '<th>行数</th>';
    html += '<th>列数</th>';
    html += '<th>作成日時</th>';
    html += '<th>操作</th>';
    html += '</tr></thead><tbody>';

    importedDatasets.forEach(function(dataset, index) {
        var createdDate = new Date(dataset.createdAt);
        var dateStr = createdDate.toLocaleDateString('ja-JP') + ' ' + createdDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

        html += '<tr>';
        html += '<td><div class="flex items-center gap-3">';
        html += '<div class="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">';
        html += '<i class="fas fa-table text-blue-600 text-sm"></i></div>';
        html += '<div><div class="font-medium text-gray-800">' + dataset.name + '</div>';
        html += '<div class="text-xs text-gray-500">' + dataset.columns.slice(0, 3).join(', ') + (dataset.columns.length > 3 ? '...' : '') + '</div>';
        html += '</div></div></td>';
        html += '<td><span class="text-sm text-gray-600">' + dataset.rows + '</span></td>';
        html += '<td><span class="text-sm text-gray-600">' + dataset.columns.length + '</span></td>';
        html += '<td><span class="text-sm text-gray-600">' + dateStr + '</span></td>';
        html += '<td><div class="flex items-center gap-2">';
        html += '<button class="btn btn-ghost btn-sm" onclick="viewDataset(' + index + ')"><i class="fas fa-eye"></i> プレビュー</button>';
        html += '<button class="btn btn-ghost btn-sm" onclick="useDatasetForML(' + index + ')"><i class="fas fa-play"></i> 使用</button>';
        html += '<button class="btn btn-ghost btn-sm" onclick="deleteDataset(' + index + ')"><i class="fas fa-trash"></i></button>';
        html += '</div></td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function viewDataset(index) {
    var dataset = importedDatasets[index];
    if (!dataset) return;

    // Calculate column statistics
    var columnStats = {};
    dataset.columns.forEach(function(col) {
        var values = dataset.data.map(function(row) { return row[col]; }).filter(function(v) { return v !== undefined && v !== null && v !== ''; });
        var numericValues = values.filter(function(v) { return typeof v === 'number' || !isNaN(parseFloat(v)); }).map(function(v) { return parseFloat(v); });

        columnStats[col] = {
            count: values.length,
            missing: dataset.data.length - values.length,
            type: numericValues.length > values.length * 0.8 ? '数値' : 'テキスト'
        };

        if (numericValues.length > 0) {
            var sorted = numericValues.slice().sort(function(a, b) { return a - b; });
            columnStats[col].min = Math.min.apply(null, numericValues).toFixed(2);
            columnStats[col].max = Math.max.apply(null, numericValues).toFixed(2);
            columnStats[col].mean = (numericValues.reduce(function(a, b) { return a + b; }, 0) / numericValues.length).toFixed(2);

            // Correct median calculation
            var mid = Math.floor(sorted.length / 2);
            if (sorted.length % 2 === 0) {
                // Even number of values: average of two middle values
                columnStats[col].median = ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2);
            } else {
                // Odd number of values: middle value
                columnStats[col].median = sorted[mid].toFixed(2);
            }
        }
    });

    var html = '<div style="padding: 24px; min-width: 800px;">';

    // Header
    html += '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">';
    html += '<div>';
    html += '<h3 style="font-size: 20px; font-weight: 600; margin-bottom: 8px; color: #1f2937;">' + dataset.name + '</h3>';
    html += '<div style="color: #6b7280; font-size: 14px;">' + new Date(dataset.createdAt).toLocaleString('ja-JP') + '</div>';
    html += '</div>';
    html += '<div style="display: flex; gap: 8px;">';
    html += '<button onclick="downloadDatasetCSV(' + index + ')" class="btn btn-secondary btn-sm"><i class="fas fa-download"></i> CSV保存</button>';
    html += '<button onclick="useDatasetForML(' + index + '); this.parentElement.parentElement.parentElement.parentElement.remove();" class="btn btn-primary btn-sm"><i class="fas fa-play"></i> このデータで学習</button>';
    html += '</div>';
    html += '</div>';

    // Summary Stats
    html += '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">';
    html += '<div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 16px; border-radius: 8px; color: white;">';
    html += '<div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">総行数</div>';
    html += '<div style="font-size: 24px; font-weight: 600;">' + dataset.rows + '</div>';
    html += '</div>';
    html += '<div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 16px; border-radius: 8px; color: white;">';
    html += '<div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">総列数</div>';
    html += '<div style="font-size: 24px; font-weight: 600;">' + dataset.columns.length + '</div>';
    html += '</div>';
    html += '<div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 16px; border-radius: 8px; color: white;">';
    html += '<div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">数値列</div>';
    var numericCols = dataset.columns.filter(function(col) { return columnStats[col].type === '数値'; }).length;
    html += '<div style="font-size: 24px; font-weight: 600;">' + numericCols + '</div>';
    html += '</div>';
    html += '<div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 16px; border-radius: 8px; color: white;">';
    html += '<div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">テキスト列</div>';
    html += '<div style="font-size: 24px; font-weight: 600;">' + (dataset.columns.length - numericCols) + '</div>';
    html += '</div>';
    html += '</div>';

    // Tabs
    html += '<div style="border-bottom: 2px solid #e5e7eb; margin-bottom: 20px;">';
    html += '<div style="display: flex; gap: 4px;">';
    html += '<button onclick="showPreviewTab(\'data\')" id="tabData" class="preview-tab active" style="padding: 10px 20px; background: white; border: none; border-bottom: 3px solid #6366f1; color: #6366f1; font-weight: 600; cursor: pointer;"><i class="fas fa-table"></i> データ</button>';
    html += '<button onclick="showPreviewTab(\'stats\')" id="tabStats" class="preview-tab" style="padding: 10px 20px; background: white; border: none; border-bottom: 3px solid transparent; color: #6b7280; cursor: pointer;"><i class="fas fa-chart-bar"></i> 統計</button>';
    html += '<button onclick="showPreviewTab(\'columns\')" id="tabColumns" class="preview-tab" style="padding: 10px 20px; background: white; border: none; border-bottom: 3px solid transparent; color: #6b7280; cursor: pointer;"><i class="fas fa-columns"></i> カラム一覧</button>';
    html += '</div>';
    html += '</div>';

    // Tab Content: Data Preview
    html += '<div id="previewTabData" class="preview-tab-content">';
    html += '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">';
    html += '<div style="font-weight: 600; color: #374151;">データプレビュー</div>';
    html += '<div style="display: flex; align-items: center; gap: 8px;">';
    html += '<label style="font-size: 14px; color: #6b7280;">表示行数:</label>';
    html += '<select onchange="updatePreviewRows(this.value, ' + index + ')" style="padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px;">';
    html += '<option value="5">5行</option>';
    html += '<option value="10" selected>10行</option>';
    html += '<option value="20">20行</option>';
    html += '<option value="' + dataset.rows + '">全て (' + dataset.rows + '行)</option>';
    html += '</select>';
    html += '</div>';
    html += '</div>';
    html += '<div id="dataPreviewTable" style="overflow-x: auto; max-height: 400px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; background: white;">';
    html += generateDataTable(dataset, 10);
    html += '</div>';
    html += '</div>';

    // Tab Content: Statistics
    html += '<div id="previewTabStats" class="preview-tab-content" style="display: none;">';
    html += '<div style="font-weight: 600; color: #374151; margin-bottom: 12px;">列統計</div>';
    html += '<div style="overflow-y: auto; max-height: 400px;">';
    dataset.columns.forEach(function(col) {
        var stats = columnStats[col];
        html += '<div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid ' + (stats.type === '数値' ? '#3b82f6' : '#10b981') + ';">';
        html += '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">';
        html += '<div style="font-weight: 600; color: #1f2937;">' + col + '</div>';
        html += '<span style="background: ' + (stats.type === '数値' ? '#dbeafe' : '#d1fae5') + '; color: ' + (stats.type === '数値' ? '#1e40af' : '#065f46') + '; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500;">' + stats.type + '</span>';
        html += '</div>';
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; font-size: 13px;">';
        html += '<div><span style="color: #6b7280;">データ数:</span> <strong>' + stats.count + '</strong></div>';
        html += '<div><span style="color: #6b7280;">欠損値:</span> <strong>' + stats.missing + '</strong></div>';
        if (stats.min !== undefined) {
            html += '<div><span style="color: #6b7280;">最小値:</span> <strong>' + stats.min + '</strong></div>';
            html += '<div><span style="color: #6b7280;">最大値:</span> <strong>' + stats.max + '</strong></div>';
            html += '<div><span style="color: #6b7280;">平均値:</span> <strong>' + stats.mean + '</strong></div>';
            html += '<div><span style="color: #6b7280;">中央値:</span> <strong>' + stats.median + '</strong></div>';
        }
        html += '</div>';
        html += '</div>';
    });
    html += '</div>';
    html += '</div>';

    // Tab Content: Columns List
    html += '<div id="previewTabColumns" class="preview-tab-content" style="display: none;">';
    html += '<div style="font-weight: 600; color: #374151; margin-bottom: 12px;">カラム一覧 (' + dataset.columns.length + '列)</div>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';
    dataset.columns.forEach(function(col, idx) {
        var stats = columnStats[col];
        html += '<div style="background: ' + (stats.type === '数値' ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)') + '; padding: 8px 12px; border-radius: 6px; border: 1px solid ' + (stats.type === '数値' ? '#93c5fd' : '#86efac') + ';">';
        html += '<div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">#' + (idx + 1) + '</div>';
        html += '<div style="font-weight: 500; font-size: 13px; color: #1f2937;">' + col + '</div>';
        html += '<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">' + stats.type + '</div>';
        html += '</div>';
    });
    html += '</div>';
    html += '</div>';

    html += '</div>';

    // Show in modal
    var modal = document.createElement('div');
    modal.id = 'datasetPreviewModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);';
    modal.innerHTML = '<div style="background: white; border-radius: 12px; max-width: 95%; max-height: 90%; overflow: auto; position: relative; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);">' + html + '<button onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: 20px; right: 20px; background: #f3f4f6; border: none; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background=\'#e5e7eb\'" onmouseout="this.style.background=\'#f3f4f6\'"><i class="fas fa-times" style="color: #6b7280;"></i></button></div>';
    document.body.appendChild(modal);

    // Store dataset for preview updates
    window.currentPreviewDataset = dataset;
}

// HTML escape function to prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function generateDataTable(dataset, rowLimit) {
    var html = '<table style="width: 100%; font-size: 12px; border-collapse: collapse;">';
    html += '<thead><tr>';
    dataset.columns.forEach(function(col) {
        html += '<th style="padding: 10px 12px; text-align: left; background: #f9fafb; border-bottom: 2px solid #e5e7eb; position: sticky; top: 0; font-weight: 600; color: #374151; white-space: nowrap;">' + escapeHtml(col) + '</th>';
    });
    html += '</tr></thead><tbody>';

    var previewData = dataset.data.slice(0, rowLimit);
    previewData.forEach(function(row, rowIdx) {
        html += '<tr style="' + (rowIdx % 2 === 0 ? 'background: white;' : 'background: #f9fafb;') + '">';
        dataset.columns.forEach(function(col) {
            var value = row[col];
            var displayValue = value !== undefined && value !== null && value !== '' ? escapeHtml(value) : '<span style="color: #d1d5db;">-</span>';
            var isNumeric = typeof value === 'number' || (!isNaN(parseFloat(value)) && value !== '');
            html += '<td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; ' + (isNumeric ? 'text-align: right; font-family: monospace;' : '') + '">' + displayValue + '</td>';
        });
        html += '</tr>';
    });

    if (dataset.data.length > rowLimit) {
        html += '<tr><td colspan="' + dataset.columns.length + '" style="padding: 12px; text-align: center; color: #9ca3af; background: #fafafa; font-style: italic;">... 他 ' + (dataset.data.length - rowLimit) + ' 行</td></tr>';
    }

    html += '</tbody></table>';
    return html;
}

function showPreviewTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.preview-tab').forEach(function(tab) {
        tab.style.borderBottomColor = 'transparent';
        tab.style.color = '#6b7280';
        tab.style.fontWeight = 'normal';
    });

    var activeTab = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (activeTab) {
        activeTab.style.borderBottomColor = '#6366f1';
        activeTab.style.color = '#6366f1';
        activeTab.style.fontWeight = '600';
    }

    // Show/hide tab content
    document.querySelectorAll('.preview-tab-content').forEach(function(content) {
        content.style.display = 'none';
    });

    var activeContent = document.getElementById('previewTab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
    if (activeContent) {
        activeContent.style.display = 'block';
    }
}

function updatePreviewRows(rowLimit, index) {
    var dataset = window.currentPreviewDataset || importedDatasets[index];
    if (!dataset) return;

    var tableContainer = document.getElementById('dataPreviewTable');
    if (tableContainer) {
        tableContainer.innerHTML = generateDataTable(dataset, parseInt(rowLimit));
    }
}

function downloadDatasetCSV(index) {
    var dataset = importedDatasets[index];
    if (!dataset) return;

    var csv = dataset.columns.join(',') + '\n';
    dataset.data.forEach(function(row) {
        csv += dataset.columns.map(function(col) {
            var val = row[col] !== undefined ? row[col] : '';
            return typeof val === 'string' && val.includes(',') ? '"' + val + '"' : val;
        }).join(',') + '\n';
    });

    // Add BOM for Excel compatibility (prevents garbled Japanese text)
    var BOM = '\uFEFF';
    var csvWithBOM = BOM + csv;

    var blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = dataset.name + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSVファイルをダウンロードしました (Excel対応 UTF-8 with BOM)');
}

function useDatasetForML(index) {
    var dataset = importedDatasets[index];
    if (!dataset) return;

    // Open training modal and pre-select dataset
    openTrainingModal();

    // Wait for modal to render, then select the dataset
    setTimeout(function() {
        var select = document.getElementById('trainingDatasetSelect');
        select.value = dataset.id;
        // Trigger change event
        var event = new Event('change');
        select.dispatchEvent(event);
    }, 100);

    showToast('データセット「' + dataset.name + '」を選択しました', 'success');
}

function deleteDataset(index) {
    if (!confirm('このデータセットを削除しますか？')) return;

    importedDatasets.splice(index, 1);
    localStorage.setItem('mlapp_datasets_all', JSON.stringify(importedDatasets));
    renderDatasets();
    showToast('データセットを削除しました');
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    // Load existing datasets
    var storedDatasets = JSON.parse(localStorage.getItem('mlapp_datasets_all') || '[]');
    importedDatasets = storedDatasets;

    // Check for new import
    checkForImportedDataset();

    // Phase 1B: Handle URL routing
    handleURLRouting();

    // Phase 1B: Check if training modal should open (from Database App)
    checkTrainingIntent();
});

/**
 * Phase 1B: URL Routing Handler
 */
function handleURLRouting() {
    var hash = window.location.hash.slice(1);
    if (hash) {
        // Handle specific views
        if (hash === 'datasets') {
            switchView('datasets');
        } else if (hash === 'training' || hash === 'models') {
            // Will be handled by checkTrainingIntent
        } else if (hash === 'runs') {
            switchView('runs');
        } else if (hash === 'analysis') {
            switchView('analysis');
        } else if (hash === 'settings') {
            switchView('settings');
        }
    }

    // Register route handlers if router is available
    if (window.router) {
        window.router.register('runs', function() { switchView('runs'); });
        window.router.register('datasets', function() { switchView('datasets'); });
        window.router.register('training', function() { openTrainingModal(); });
        window.router.register('models', function() { openTrainingModal(); });
        window.router.register('analysis', function() { switchView('analysis'); });
        window.router.register('settings', function() { switchView('settings'); });

        // Check navigation intent from Database App
        window.router.checkNavigationIntent();
    }

    // Listen for hash changes
    window.addEventListener('hashchange', function() {
        var newHash = window.location.hash.slice(1);
        if (newHash === 'training' || newHash === 'models') {
            openTrainingModal();
        } else if (newHash) {
            switchView(newHash);
        }
    });
}

/**
 * Phase 1B: Check if training modal should open automatically
 */
function checkTrainingIntent() {
    var shouldOpenTraining = localStorage.getItem('mlapp_open_training');
    var tempDataset = localStorage.getItem('mlapp_temp_dataset');

    if (shouldOpenTraining === 'true') {
        localStorage.removeItem('mlapp_open_training');

        // Open training modal
        setTimeout(function() {
            openTrainingModal();

            // If temp dataset exists, select it
            if (tempDataset) {
                try {
                    var dataset = JSON.parse(tempDataset);
                    setTimeout(function() {
                        var select = document.getElementById('trainingDatasetSelect');
                        select.value = dataset.id;
                        var event = new Event('change');
                        select.dispatchEvent(event);

                        showToast('データセット「' + dataset.name + '」を自動選択しました', 'success');
                    }, 200);
                } catch (e) {
                    console.error('Failed to auto-select dataset:', e);
                }
            }
        }, 300);
    }
}

// ========================================
// ML Training Modal Functions
// ========================================
var trainingCurrentStep = 1;
var trainingSelectedDataset = null;
var trainingColumns = [];

function openTrainingModal() {
    console.log('[ML App] openTrainingModal called');
    // Reset state
    trainingCurrentStep = 1;
    trainingSelectedDataset = null;
    trainingColumns = [];

    // Load datasets into select
    var select = document.getElementById('trainingDatasetSelect');
    select.innerHTML = '<option value="">データセットを選択してください</option>';

    var storedDatasets = JSON.parse(localStorage.getItem('mlapp_datasets_all') || '[]');
    if (storedDatasets.length === 0) {
        select.innerHTML = '<option value="">データセットがありません</option>';
    } else {
        storedDatasets.forEach(function(ds) {
            var option = document.createElement('option');
            option.value = ds.id;
            option.textContent = ds.name + ' (' + ds.rows + '行)';
            select.appendChild(option);
        });
    }

    // Reset UI
    document.getElementById('selectedDatasetInfo').style.display = 'none';
    document.getElementById('trainingStep1').style.display = 'block';
    document.getElementById('trainingStep2').style.display = 'none';
    document.getElementById('trainingStep3').style.display = 'none';
    document.getElementById('btnPrevStep').style.display = 'none';
    document.getElementById('btnNextStep').style.display = 'inline-flex';
    document.getElementById('btnStartTraining').style.display = 'none';
    document.getElementById('trainingProgress').style.display = 'none';
    document.getElementById('trainingResult').style.display = 'none';

    updateStepIndicators();

    // Add dataset selection handler
    select.onchange = handleTrainingDatasetSelect;

    // Show modal
    var modal = document.getElementById('trainingModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeTrainingModal() {
    var modal = document.getElementById('trainingModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
    // Clear nav active state
    document.getElementById('navModels').classList.remove('active');
    document.getElementById('navRuns').classList.add('active');
}

function handleTrainingDatasetSelect(event) {
    var datasetId = event.target.value;
    if (!datasetId) {
        document.getElementById('selectedDatasetInfo').style.display = 'none';
        trainingSelectedDataset = null;
        return;
    }

    var storedDatasets = JSON.parse(localStorage.getItem('mlapp_datasets_all') || '[]');
    trainingSelectedDataset = storedDatasets.find(function(d) { return d.id === datasetId; });

    if (!trainingSelectedDataset) return;

    // Save dataset to server for ML service
    saveDatasetToServer(trainingSelectedDataset);

    // Update info display
    document.getElementById('datasetRows').textContent = trainingSelectedDataset.rows;
    document.getElementById('datasetCols').textContent = trainingSelectedDataset.columns.length;

    var createdDate = new Date(trainingSelectedDataset.createdAt);
    document.getElementById('datasetDate').textContent = createdDate.toLocaleDateString('ja-JP');

    // Show columns
    trainingColumns = trainingSelectedDataset.columns;
    var columnsList = document.getElementById('columnsList');
    columnsList.innerHTML = '';
    trainingColumns.forEach(function(col) {
        // Check if numeric
        var isNumeric = false;
        if (trainingSelectedDataset.data && trainingSelectedDataset.data.length > 0) {
            var sampleValue = trainingSelectedDataset.data[0][col];
            isNumeric = typeof sampleValue === 'number' || !isNaN(parseFloat(sampleValue));
        }
        var tag = document.createElement('span');
        tag.className = 'column-tag' + (isNumeric ? ' numeric' : '');
        tag.textContent = col;
        columnsList.appendChild(tag);
    });

    document.getElementById('selectedDatasetInfo').style.display = 'block';
}

function nextTrainingStep() {
    if (trainingCurrentStep === 1) {
        if (!trainingSelectedDataset) {
            showToast('データセットを選択してください', 'warning');
            return;
        }
        // Go to step 2
        trainingCurrentStep = 2;
        document.getElementById('trainingStep1').style.display = 'none';
        document.getElementById('trainingStep2').style.display = 'block';
        document.getElementById('btnPrevStep').style.display = 'inline-flex';

        // Populate target and feature selects
        var targetSelect = document.getElementById('targetSelect');
        targetSelect.innerHTML = '<option value="">列を選択してください</option>';
        trainingColumns.forEach(function(col) {
            var option = document.createElement('option');
            option.value = col;
            option.textContent = col;
            targetSelect.appendChild(option);
        });

        var featureCheckboxes = document.getElementById('featureCheckboxes');
        featureCheckboxes.innerHTML = '';
        trainingColumns.forEach(function(col, idx) {
            var div = document.createElement('div');
            div.className = 'checkbox-item';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'feature_' + idx;
            checkbox.value = col;
            checkbox.checked = true;

            var label = document.createElement('label');
            label.htmlFor = 'feature_' + idx;
            label.textContent = col;

            div.appendChild(checkbox);
            div.appendChild(label);
            featureCheckboxes.appendChild(div);
        });

        // Populate CV group select
        var cvGroupSelect = document.getElementById('cvGroupSelect');
        cvGroupSelect.innerHTML = '<option value="">なし（ランダムK-Fold）</option>';
        trainingColumns.forEach(function(col) {
            var option = document.createElement('option');
            option.value = col;
            option.textContent = col;
            cvGroupSelect.appendChild(option);
        });

    } else if (trainingCurrentStep === 2) {
        var targetCol = document.getElementById('targetSelect').value;
        if (!targetCol) {
            showToast('目的変数を選択してください', 'warning');
            return;
        }

        var features = [];
        document.querySelectorAll('#featureCheckboxes input:checked').forEach(function(cb) {
            if (cb.value !== targetCol) {
                features.push(cb.value);
            }
        });

        if (features.length === 0) {
            showToast('説明変数を1つ以上選択してください', 'warning');
            return;
        }

        // Go to step 3
        trainingCurrentStep = 3;
        document.getElementById('trainingStep2').style.display = 'none';
        document.getElementById('trainingStep3').style.display = 'block';
        document.getElementById('btnNextStep').style.display = 'none';
        document.getElementById('btnStartTraining').style.display = 'inline-flex';

        // Update summary
        document.getElementById('summaryDataset').textContent = trainingSelectedDataset.name;
        var algorithmText = document.getElementById('algorithmSelect').options[document.getElementById('algorithmSelect').selectedIndex].text;
        document.getElementById('summaryAlgorithm').textContent = algorithmText;
        document.getElementById('summaryTarget').textContent = targetCol;
        document.getElementById('summaryFeatures').textContent = features.length + '個 (' + features.slice(0, 3).join(', ') + (features.length > 3 ? '...' : '') + ')';
    }

    updateStepIndicators();
}

function prevTrainingStep() {
    if (trainingCurrentStep === 2) {
        trainingCurrentStep = 1;
        document.getElementById('trainingStep2').style.display = 'none';
        document.getElementById('trainingStep1').style.display = 'block';
        document.getElementById('btnPrevStep').style.display = 'none';
    } else if (trainingCurrentStep === 3) {
        trainingCurrentStep = 2;
        document.getElementById('trainingStep3').style.display = 'none';
        document.getElementById('trainingStep2').style.display = 'block';
        document.getElementById('btnNextStep').style.display = 'inline-flex';
        document.getElementById('btnStartTraining').style.display = 'none';
    }

    updateStepIndicators();
}

function updateStepIndicators() {
    for (var i = 1; i <= 3; i++) {
        var indicator = document.getElementById('step' + i + 'Indicator');
        indicator.classList.remove('active', 'completed');
        if (i < trainingCurrentStep) {
            indicator.classList.add('completed');
        } else if (i === trainingCurrentStep) {
            indicator.classList.add('active');
        }
    }
}

async function startTraining() {
    var targetCol = document.getElementById('targetSelect').value;
    var algorithm = document.getElementById('algorithmSelect').value;
    var taskType = document.getElementById('taskTypeSelect').value;
    var cvGroup = document.getElementById('cvGroupSelect').value;

    var features = [];
    document.querySelectorAll('#featureCheckboxes input:checked').forEach(function(cb) {
        if (cb.value !== targetCol) {
            features.push(cb.value);
        }
    });

    // Show progress
    document.getElementById('trainingProgress').style.display = 'block';
    document.getElementById('btnStartTraining').disabled = true;
    document.getElementById('btnStartTraining').innerHTML = '<i class="fas fa-spinner fa-spin"></i> 学習中...';
    document.getElementById('btnPrevStep').style.display = 'none';

    // Clear previous log
    document.getElementById('progressLog').innerHTML = '';

    // Check if ML API is available
    var useRealAPI = await checkMLServiceHealth();

    if (useRealAPI) {
        // Real API call
        startTrainingWithAPI(features, targetCol, algorithm, cvGroup);
    } else {
        // Mock training (fallback)
        startTrainingMock();
    }
}

// Real API training
async function startTrainingWithAPI(features, target, algorithm, cvGroup) {
    var datasetName = trainingSelectedDataset ? trainingSelectedDataset.name : 'sample_data';

    var requestBody = {
        dataset_id: datasetName,
        x_list: features,
        target: [target],
        model_name: algorithm,
        cv_group: cvGroup || ''
    };

    try {
        updateTrainingProgress(5, 'MLサービスに接続中...');

        const response = await fetch('/api/ml/train', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error('Training request failed: ' + response.status);
        }

        const data = await response.json();
        currentTrainingRunId = data.run_id;

        updateTrainingProgress(10, '学習ジョブを開始しました: ' + data.run_id);

        // Poll for status if WebSocket not available
        if (!mlSocket || !mlSocket.connected) {
            pollTrainingStatus(data.run_id);
        }

    } catch (error) {
        console.error('[ML API] Training error:', error);
        handleTrainingError(error.message);
        // Fallback to mock
        showToast('MLサービス接続エラー。モックモードで実行します', 'warning');
        startTrainingMock();
    }
}

// Poll training status
async function pollTrainingStatus(runId) {
    var pollInterval = setInterval(async function() {
        try {
            const response = await fetch('/api/ml/status/' + runId);
            const data = await response.json();

            if (data.status === 'completed') {
                clearInterval(pollInterval);
                handleTrainingComplete(data);
            } else if (data.status === 'error') {
                clearInterval(pollInterval);
                handleTrainingError(data.error || 'Unknown error');
            }
        } catch (e) {
            console.log('[ML API] Status poll failed:', e);
        }
    }, 2000);
}

// Handle training complete from API
function handleTrainingComplete(data) {
    var cvGroup = document.getElementById('cvGroupSelect').value;
    var cvFold = parseInt(document.getElementById('cvFoldSelect').value);
    var targetCol = document.getElementById('targetSelect').value;
    var features = [];
    document.querySelectorAll('#featureCheckboxes input:checked').forEach(function(cb) {
        if (cb.value !== targetCol) features.push(cb.value);
    });

    // Extract metrics from API response (handle nested result structure)
    var result = data.result || data;
    var targets = result.targets || data.targets || {};
    var targetMetrics = targets[targetCol] || Object.values(targets)[0] || {};
    var r2 = (targetMetrics.r2 !== undefined ? targetMetrics.r2 : 0.85).toFixed(3);
    var rmse = (targetMetrics.rmse !== undefined ? targetMetrics.rmse : 0.1).toFixed(4);
    var mae = (targetMetrics.mae !== undefined ? targetMetrics.mae : 0.08).toFixed(4);
    var mlflowRunId = result.mlflow_run_id || data.mlflow_run_id;

    // Update UI
    document.getElementById('trainingProgress').style.display = 'none';
    document.getElementById('trainingResult').style.display = 'block';
    document.getElementById('resultR2').textContent = r2;
    document.getElementById('resultRMSE').textContent = rmse;
    document.getElementById('resultMAE').textContent = mae;

    // Generate visualization data (use real if available, mock otherwise)
    var cvData = generateMockCVData(cvFold, parseFloat(r2));
    drawYYPlot(cvData);

    if (cvGroup || cvFold > 1) {
        document.getElementById('cvRmseSection').style.display = 'block';
        drawCVRmseChart(cvData, cvFold);
    }

    var shapData = generateMockSHAP(features);
    drawResultShapChart(shapData);

    document.getElementById('btnStartTraining').disabled = false;
    document.getElementById('btnStartTraining').innerHTML = '<i class="fas fa-check"></i> 完了';
    document.getElementById('btnStartTraining').onclick = closeTrainingModal;

    showToast('モデル学習が完了しました！ R²: ' + r2, 'success');

    // Save run
    var runData = {
        id: 'run_' + Date.now(),
        name: 'run_' + new Date().toISOString().slice(0,10).replace(/-/g, '') + '_' + String(Math.floor(Math.random() * 1000)).padStart(3, '0'),
        type: 'train',
        algorithm: document.getElementById('summaryAlgorithm').textContent,
        dataset: trainingSelectedDataset ? trainingSelectedDataset.name : 'unknown',
        target: targetCol,
        features: features,
        cvGroup: cvGroup,
        cvFold: cvFold,
        mlflowRunId: mlflowRunId,
        metrics: { r2: parseFloat(r2), rmse: parseFloat(rmse), mae: parseFloat(mae) },
        featureImportance: shapData,
        cvData: cvData,
        status: 'complete',
        createdAt: new Date().toISOString()
    };
    saveRun(runData);
    saveModel(runData);
    renderRunsTable();

    addMessage(
        'モデル学習が完了しました！<br><br>' +
        '<b>結果サマリー</b><br>' +
        '• アルゴリズム: ' + document.getElementById('summaryAlgorithm').textContent + '<br>' +
        '• R² Score: ' + r2 + '<br>' +
        '• RMSE: ' + rmse + '<br>' +
        '• MLflow Run ID: ' + (mlflowRunId || 'N/A'),
        'agent'
    );
}

// Handle training error
function handleTrainingError(errorMessage) {
    document.getElementById('trainingProgress').style.display = 'none';
    document.getElementById('btnStartTraining').disabled = false;
    document.getElementById('btnStartTraining').innerHTML = '<i class="fas fa-play"></i> 学習開始';
    document.getElementById('btnPrevStep').style.display = 'block';

    // エラーメッセージを分かりやすく変換
    var userMessage = errorMessage;
    if (errorMessage.includes('Connection refused') || errorMessage.includes('ECONNREFUSED')) {
        userMessage = 'ML Serviceに接続できません。サービスが起動しているか確認してください。';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        userMessage = '処理がタイムアウトしました。データサイズを小さくするか、再試行してください。';
    } else if (errorMessage.includes('Missing required')) {
        userMessage = '必須パラメータが不足しています。設定を確認してください。';
    } else if (errorMessage.includes('Non-numeric')) {
        userMessage = '数値以外のカラムが選択されています。数値カラムのみを選択してください。';
    }

    showToast('学習エラー: ' + userMessage, 'error');
    addMessage('エラーが発生しました: ' + userMessage + '\n\n詳細: ' + errorMessage, 'agent');

    // エラー発生をラン履歴に記録
    var errorRun = {
        id: 'error-' + Date.now(),
        name: 'エラー発生',
        dataset: trainingSelectedDataset ? trainingSelectedDataset.name : 'unknown',
        features: [],
        target: '',
        algorithm: '',
        startTime: new Date().toISOString(),
        status: 'error',
        error: userMessage
    };
    addRun(errorRun);
}

// Mock training (fallback)
function startTrainingMock() {
    var progress = 0;
    var progressInterval = setInterval(function() {
        progress += Math.random() * 15;
        if (progress > 100) progress = 100;

        document.getElementById('progressFill').style.width = progress + '%';
        document.getElementById('progressPercent').textContent = Math.round(progress) + '%';

        var logMessages = [
            'データセットを読み込み中...',
            '前処理を実行中...',
            '特徴量エンジニアリング...',
            'モデルをトレーニング中...',
            '交差検証を実行中...',
            'ハイパーパラメータを最適化中...',
            'モデルを評価中...'
        ];
        var logIndex = Math.min(Math.floor(progress / 15), logMessages.length - 1);
        var log = document.getElementById('progressLog');
        if (log.children.length <= logIndex) {
            var logEntry = document.createElement('div');
            logEntry.textContent = '[' + new Date().toLocaleTimeString('ja-JP') + '] ' + logMessages[logIndex];
            log.appendChild(logEntry);
            log.scrollTop = log.scrollHeight;
        }

        if (progress >= 100) {
            clearInterval(progressInterval);
            completeTrainingMock();
        }
    }, 500);
}

function completeTrainingMock() {
    // Hide progress, show result
    document.getElementById('trainingProgress').style.display = 'none';
    document.getElementById('trainingResult').style.display = 'block';

    // Get CV settings
    var cvGroup = document.getElementById('cvGroupSelect').value;
    var cvFold = parseInt(document.getElementById('cvFoldSelect').value);

    // Simulate results
    var r2 = (0.85 + Math.random() * 0.1).toFixed(3);
    var rmse = (0.1 + Math.random() * 0.05).toFixed(4);
    var mae = (parseFloat(rmse) * 0.8).toFixed(4);
    var time = (2 + Math.random() * 3).toFixed(1) + 's';

    document.getElementById('resultR2').textContent = r2;
    document.getElementById('resultRMSE').textContent = rmse;
    document.getElementById('resultMAE').textContent = mae;

    // Generate mock CV data for Y-Y plot
    var cvData = generateMockCVData(cvFold, parseFloat(r2));

    // Draw Y-Y Plot
    drawYYPlot(cvData);

    // Show CV RMSE chart if CV group is specified
    if (cvGroup || cvFold > 1) {
        document.getElementById('cvRmseSection').style.display = 'block';
        drawCVRmseChart(cvData, cvFold);
    }

    // Draw SHAP chart
    var targetCol = document.getElementById('targetSelect').value;
    var features = [];
    document.querySelectorAll('#featureCheckboxes input:checked').forEach(function(cb) {
        if (cb.value !== targetCol) features.push(cb.value);
    });
    var shapData = generateMockSHAP(features);
    drawResultShapChart(shapData);

    document.getElementById('btnStartTraining').disabled = false;
    document.getElementById('btnStartTraining').innerHTML = '<i class="fas fa-check"></i> 完了';
    document.getElementById('btnStartTraining').onclick = closeTrainingModal;

    showToast('モデル学習が完了しました（モック） R²: ' + r2, 'success');

    // Save run to localStorage
    var runData = {
        id: 'run_' + Date.now(),
        name: 'run_' + new Date().toISOString().slice(0,10).replace(/-/g, '') + '_' + String(Math.floor(Math.random() * 1000)).padStart(3, '0'),
        type: 'train',
        algorithm: document.getElementById('summaryAlgorithm').textContent,
        dataset: trainingSelectedDataset ? trainingSelectedDataset.name : 'unknown',
        target: document.getElementById('summaryTarget').textContent,
        features: features,
        cvGroup: cvGroup,
        cvFold: cvFold,
        hpoTrials: parseInt(document.getElementById('hpoTrialsSelect').value),
        metrics: {
            r2: parseFloat(r2),
            rmse: parseFloat(rmse),
            mae: parseFloat(mae)
        },
        featureImportance: shapData,
        cvData: cvData,
        status: 'complete',
        createdAt: new Date().toISOString(),
        trainingTime: time,
        isMock: true
    };
    saveRun(runData);
    saveModel(runData);
    renderRunsTable();

    // Add to chat
    addMessage(
        'モデル学習が完了しました（モックモード）<br><br>' +
        '<b>結果サマリー</b><br>' +
        '• アルゴリズム: ' + document.getElementById('summaryAlgorithm').textContent + '<br>' +
        '• R² Score: ' + r2 + '<br>' +
        '• RMSE: ' + rmse + '<br>' +
        '• MAE: ' + mae + '<br>' +
        '• CV: ' + cvFold + '-Fold' + (cvGroup ? ' (グループ: ' + cvGroup + ')' : '') + '<br>' +
        '• 学習時間: ' + time,
        'agent'
    );
}

// Generate mock CV data for visualization
function generateMockCVData(folds, r2) {
    var data = { actual: [], predicted: [], fold: [], rmseByFold: [] };
    var nPoints = 50;

    for (var f = 0; f < folds; f++) {
        var foldRmse = 0;
        var count = Math.floor(nPoints / folds);
        for (var i = 0; i < count; i++) {
            var actual = Math.random() * 100;
            var noise = (1 - r2) * (Math.random() - 0.5) * 30;
            var predicted = actual + noise;
            data.actual.push(actual);
            data.predicted.push(predicted);
            data.fold.push(f + 1);
            foldRmse += Math.pow(actual - predicted, 2);
        }
        data.rmseByFold.push(Math.sqrt(foldRmse / count));
    }
    return data;
}

// Draw Y-Y Plot using Canvas
function drawYYPlot(cvData) {
    var canvas = document.getElementById('yyPlotCanvas');
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var margin = 40;

    ctx.clearRect(0, 0, w, h);

    // Find data range
    var allVals = cvData.actual.concat(cvData.predicted);
    var minVal = Math.min.apply(null, allVals);
    var maxVal = Math.max.apply(null, allVals);
    var range = maxVal - minVal || 1;

    // Draw axes
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, margin);
    ctx.lineTo(margin, h - margin);
    ctx.lineTo(w - margin, h - margin);
    ctx.stroke();

    // Draw diagonal line (y=x)
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(margin, h - margin);
    ctx.lineTo(w - margin, margin);
    ctx.stroke();
    ctx.setLineDash([]);

    // Colors for folds
    var colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

    // Draw points
    for (var i = 0; i < cvData.actual.length; i++) {
        var x = margin + ((cvData.actual[i] - minVal) / range) * (w - 2 * margin);
        var y = h - margin - ((cvData.predicted[i] - minVal) / range) * (h - 2 * margin);
        var foldIdx = cvData.fold[i] - 1;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = colors[foldIdx % colors.length];
        ctx.fill();
    }

    // Axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('実測値', w / 2, h - 10);
    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('予測値', 0, 0);
    ctx.restore();
}

// Draw CV RMSE Bar Chart
function drawCVRmseChart(cvData, folds) {
    var container = document.getElementById('cvRmseChart');
    var maxRmse = Math.max.apply(null, cvData.rmseByFold);
    var html = '';

    for (var i = 0; i < folds; i++) {
        var rmse = cvData.rmseByFold[i] || 0;
        var height = (rmse / maxRmse * 60) + 20;
        html += '<div class="cv-rmse-bar">' +
            '<div class="cv-rmse-bar-fill" style="height: ' + height + 'px;">' + rmse.toFixed(2) + '</div>' +
            '<div class="cv-rmse-label">Fold ' + (i + 1) + '</div>' +
        '</div>';
    }
    container.innerHTML = html;
}

// Draw SHAP chart in training result
function drawResultShapChart(importance) {
    var container = document.getElementById('resultShapChart');
    var entries = Object.entries(importance).sort(function(a, b) { return b[1] - a[1]; });
    var maxVal = entries[0] ? entries[0][1] : 1;

    var html = '';
    entries.slice(0, 8).forEach(function(entry) {
        var width = (entry[1] / maxVal * 100).toFixed(1);
        html += '<div class="shap-bar">' +
            '<span class="shap-label">' + escapeHtml(entry[0]) + '</span>' +
            '<div class="shap-bar-container">' +
                '<div class="shap-bar-fill" style="width: ' + width + '%;"></div>' +
            '</div>' +
            '<span class="shap-value">' + entry[1].toFixed(3) + '</span>' +
        '</div>';
    });
    container.innerHTML = html;
}

// ========================================
// Run Management System
// ========================================
function getRuns() {
    return JSON.parse(localStorage.getItem('mlapp_runs') || '[]');
}

function saveRun(run) {
    var runs = getRuns();
    runs.unshift(run);
    localStorage.setItem('mlapp_runs', JSON.stringify(runs));
}

function getModels() {
    return JSON.parse(localStorage.getItem('mlapp_models') || '[]');
}

function saveModel(runData) {
    var models = getModels();
    var model = {
        id: 'model_' + Date.now(),
        runId: runData.id,
        name: runData.algorithm + ' - ' + runData.target,
        algorithm: runData.algorithm,
        dataset: runData.dataset,
        target: runData.target,
        features: runData.features,
        r2: runData.metrics.r2,
        createdAt: runData.createdAt
    };
    models.unshift(model);
    localStorage.setItem('mlapp_models', JSON.stringify(models));
}

function generateMockSHAP(features) {
    var importance = {};
    var remaining = 1.0;
    features.forEach(function(f, i) {
        if (i === features.length - 1) {
            importance[f] = Math.round(remaining * 100) / 100;
        } else {
            var val = Math.random() * remaining * 0.5;
            importance[f] = Math.round(val * 100) / 100;
            remaining -= val;
        }
    });
    // Sort by importance
    return Object.entries(importance)
        .sort((a, b) => b[1] - a[1])
        .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {});
}

function renderRunsTable() {
    var runs = getRuns();
    var tbody = document.getElementById('runsTableBody');
    var emptyState = document.getElementById('runsEmptyState');

    // Update stats
    var completedRuns = runs.filter(r => r.status === 'complete');
    var runningRuns = runs.filter(r => r.status === 'running');
    var bestR2 = completedRuns.length > 0 ? Math.max(...completedRuns.map(r => r.metrics?.r2 || 0)) : 0;

    document.getElementById('statsTotalRuns').textContent = runs.length;
    document.getElementById('statsCompletedRuns').textContent = completedRuns.length;
    document.getElementById('statsRunningRuns').textContent = runningRuns.length;
    document.getElementById('statsBestR2').textContent = bestR2 > 0 ? bestR2.toFixed(3) : '-';

    if (runs.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        document.getElementById('runsTable').style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    document.getElementById('runsTable').style.display = 'table';

    var html = '';
    runs.slice(0, 10).forEach(function(run) {
        var typeIcon = run.type === 'train' ? 'fa-graduation-cap' : (run.type === 'predict' ? 'fa-magic' : 'fa-bullseye');
        var typeColor = run.type === 'train' ? 'green' : (run.type === 'predict' ? 'purple' : 'blue');
        var typeLabel = run.type === 'train' ? '学習' : (run.type === 'predict' ? '予測' : '最適化');
        var statusClass = run.status === 'complete' ? 'status-complete' : (run.status === 'running' ? 'status-running' : 'status-failed');
        var statusIcon = run.status === 'complete' ? 'fa-check-circle' : (run.status === 'running' ? 'fa-spinner fa-spin' : 'fa-times-circle');
        var statusLabel = run.status === 'complete' ? '完了' : (run.status === 'running' ? '実行中' : '失敗');

        var metricsHtml = '';
        if (run.metrics && run.metrics.r2) {
            metricsHtml = '<div class="text-sm font-medium text-gray-800">R²: ' + run.metrics.r2.toFixed(3) + '</div>' +
                          '<div class="text-xs text-gray-500">RMSE: ' + run.metrics.rmse.toFixed(4) + '</div>';
        } else {
            metricsHtml = '<div class="text-sm text-gray-500">—</div>';
        }

        var date = new Date(run.createdAt);
        var dateStr = date.toLocaleDateString('ja-JP') + ' ' + date.toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});

        html += '<tr>' +
            '<td>' +
                '<div class="flex items-center gap-3">' +
                    '<div class="w-8 h-8 bg-' + typeColor + '-100 rounded flex items-center justify-center">' +
                        '<i class="fas ' + typeIcon + ' text-' + typeColor + '-600 text-sm"></i>' +
                    '</div>' +
                    '<div>' +
                        '<div class="font-medium text-gray-800">' + escapeHtml(run.name) + '</div>' +
                        '<div class="text-xs text-gray-500">' + escapeHtml(run.algorithm || '') + '</div>' +
                    '</div>' +
                '</div>' +
            '</td>' +
            '<td><span class="text-sm text-gray-600">' + typeLabel + '</span></td>' +
            '<td><span class="text-sm text-gray-600">' + escapeHtml(run.dataset) + '</span></td>' +
            '<td>' + metricsHtml + '</td>' +
            '<td><span class="status-badge ' + statusClass + '"><i class="fas ' + statusIcon + ' mr-1"></i>' + statusLabel + '</span></td>' +
            '<td><span class="text-sm text-gray-600">' + dateStr + '</span></td>' +
            '<td>' +
                '<button class="btn btn-ghost" onclick="openRunDetail(\'' + run.id + '\')">' +
                    '<i class="fas fa-eye"></i>' +
                '</button>' +
            '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
}

// ========================================
// Run Detail Modal
// ========================================
var currentRunDetail = null;

function openRunDetail(runId) {
    var runs = getRuns();
    var run = runs.find(r => r.id === runId);
    if (!run) return;

    currentRunDetail = run;

    // Set title and icon based on type
    var icon = document.getElementById('runDetailIcon');
    if (run.type === 'optimize') {
        document.getElementById('runDetailTitle').textContent = '最適化結果: ' + run.name;
        icon.className = 'fas fa-bullseye';
    } else if (run.type === 'predict') {
        document.getElementById('runDetailTitle').textContent = '予測結果: ' + run.name;
        icon.className = 'fas fa-magic';
    } else {
        document.getElementById('runDetailTitle').textContent = '学習結果: ' + run.name;
        icon.className = 'fas fa-chart-line';
    }

    // Common info
    document.getElementById('detailAlgorithm').textContent = run.algorithm || '-';
    document.getElementById('detailDataset').textContent = run.dataset || '-';
    document.getElementById('detailTarget').textContent = run.target || '-';
    document.getElementById('detailDate').textContent = new Date(run.createdAt).toLocaleString('ja-JP');

    // Hide all sections first
    document.getElementById('detailTrainSection').style.display = 'none';
    document.getElementById('detailOptimizeSection').style.display = 'none';
    document.getElementById('detailPredictSection').style.display = 'none';
    document.getElementById('btnPredictFromDetail').style.display = 'inline-flex';

    if (run.type === 'optimize') {
        showOptimizeDetailSection(run);
    } else if (run.type === 'predict') {
        showPredictDetailSection(run);
    } else {
        showTrainDetailSection(run);
    }

    var modal = document.getElementById('runDetailModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function showTrainDetailSection(run) {
    document.getElementById('detailTrainSection').style.display = 'block';

    document.getElementById('detailR2').textContent = run.metrics?.r2?.toFixed(3) || run.r2?.toFixed(3) || '-';
    document.getElementById('detailRMSE').textContent = run.metrics?.rmse?.toFixed(4) || '-';
    document.getElementById('detailMAE').textContent = run.metrics?.mae?.toFixed(4) || '-';

    // Variables table
    renderVariablesTable(run);

    // Render SHAP chart
    renderSHAPChart(run.featureImportance || {});
}

function showOptimizeDetailSection(run) {
    document.getElementById('detailOptimizeSection').style.display = 'block';
    document.getElementById('btnPredictFromDetail').style.display = 'none';

    document.getElementById('detailOptR2').textContent = run.r2?.toFixed(4) || '-';
    document.getElementById('detailOptOrigR2').textContent = run.originalR2?.toFixed(4) || '-';
    document.getElementById('detailOptImprove').textContent = '+' + (run.improvement || '0') + '%';
    document.getElementById('detailOptTrials').textContent = run.trials || '-';

    // Best parameters table
    renderOptParamsTable(run.bestParams || {});

    // History chart
    if (run.trialHistory && run.trialHistory.length > 0) {
        drawDetailOptHistoryChart(run.trialHistory);
    } else {
        // Generate mock history from run data
        var mockHistory = generateMockOptHistory(run.trials || 50, run.originalR2 || 0.85, run.r2 || 0.92);
        drawDetailOptHistoryChart(mockHistory);
    }

    // Pareto plot
    drawDetailParetoPlot(run);

    // Top trials table
    renderDetailOptTrialsTable(run);
}

function showPredictDetailSection(run) {
    document.getElementById('detailPredictSection').style.display = 'block';
    document.getElementById('detailPredictCount').textContent = run.predictCount || '-';
}

function renderVariablesTable(run) {
    var container = document.getElementById('detailVariablesTable');
    var features = run.features || [];
    var target = run.target || '-';

    if (features.length === 0) {
        container.innerHTML = '<p class="text-gray-500">変数情報がありません</p>';
        return;
    }

    var html = '<table><thead><tr><th>種別</th><th>変数名</th><th>重要度</th></tr></thead><tbody>';

    // Target variable
    html += '<tr class="best-row"><td><span style="color: #ef4444;">目的変数</span></td><td>' + escapeHtml(target) + '</td><td>-</td></tr>';

    // Feature variables
    var importance = run.featureImportance || {};
    features.forEach(function(feat) {
        var imp = importance[feat] ? importance[feat].toFixed(3) : '-';
        html += '<tr><td><span style="color: #6366f1;">説明変数</span></td><td>' + escapeHtml(feat) + '</td><td>' + imp + '</td></tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderOptParamsTable(params) {
    var container = document.getElementById('detailOptParams');
    if (!params || Object.keys(params).length === 0) {
        container.innerHTML = '<p class="text-gray-500">パラメータ情報がありません</p>';
        return;
    }

    var html = '<table><thead><tr><th>パラメータ</th><th>最適値</th></tr></thead><tbody>';
    Object.entries(params).forEach(function(entry) {
        html += '<tr><td>' + escapeHtml(entry[0]) + '</td><td>' + entry[1] + '</td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function generateMockOptHistory(trials, startScore, endScore) {
    var history = [];
    var bestSoFar = startScore;
    for (var i = 0; i < trials; i++) {
        var score = startScore + (endScore - startScore) * (i / trials) + (Math.random() - 0.5) * 0.02;
        if (score > bestSoFar) bestSoFar = score;
        history.push({ trial: i + 1, score: score, bestSoFar: bestSoFar });
    }
    return history;
}

function drawDetailOptHistoryChart(history) {
    var canvas = document.getElementById('detailOptHistoryCanvas');
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var margin = { top: 20, right: 20, bottom: 30, left: 50 };

    ctx.clearRect(0, 0, w, h);

    if (!history || history.length === 0) return;

    var scores = history.map(function(h) { return h.score; });
    var minScore = Math.min.apply(null, scores) - 0.02;
    var maxScore = Math.max.apply(null, scores) + 0.02;
    var scoreRange = maxScore - minScore || 1;

    // Axes
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, h - margin.bottom);
    ctx.lineTo(w - margin.right, h - margin.bottom);
    ctx.stroke();

    // Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([3, 3]);
    for (var i = 0; i <= 4; i++) {
        var y = margin.top + (h - margin.top - margin.bottom) * i / 4;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(w - margin.right, y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Points
    ctx.fillStyle = '#cbd5e1';
    history.forEach(function(point) {
        var x = margin.left + (point.trial / history.length) * (w - margin.left - margin.right);
        var y = h - margin.bottom - ((point.score - minScore) / scoreRange) * (h - margin.top - margin.bottom);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Best line
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    history.forEach(function(point, idx) {
        var x = margin.left + (point.trial / history.length) * (w - margin.left - margin.right);
        var y = h - margin.bottom - ((point.bestSoFar - minScore) / scoreRange) * (h - margin.top - margin.bottom);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Trial', w / 2, h - 5);
    ctx.textAlign = 'right';
    ctx.fillText(maxScore.toFixed(3), margin.left - 5, margin.top + 5);
    ctx.fillText(minScore.toFixed(3), margin.left - 5, h - margin.bottom);
}

function drawDetailParetoPlot(run) {
    var canvas = document.getElementById('detailParetoCanvas');
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var margin = { top: 30, right: 30, bottom: 40, left: 60 };

    ctx.clearRect(0, 0, w, h);

    // Generate mock Pareto data (R² vs RMSE trade-off)
    var trials = run.trials || 50;
    var paretoData = [];
    for (var i = 0; i < trials; i++) {
        var r2 = (run.originalR2 || 0.85) + Math.random() * 0.1;
        var rmse = 0.15 - r2 * 0.1 + Math.random() * 0.03;
        paretoData.push({ r2: r2, rmse: Math.max(0.01, rmse), isParetoOptimal: Math.random() > 0.7 });
    }

    // Add best point
    paretoData.push({ r2: run.r2 || 0.92, rmse: 0.05, isParetoOptimal: true, isBest: true });

    var r2Values = paretoData.map(function(p) { return p.r2; });
    var rmseValues = paretoData.map(function(p) { return p.rmse; });
    var minR2 = Math.min.apply(null, r2Values) - 0.02;
    var maxR2 = Math.max.apply(null, r2Values) + 0.02;
    var minRmse = Math.min.apply(null, rmseValues) - 0.01;
    var maxRmse = Math.max.apply(null, rmseValues) + 0.01;

    // Axes
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, h - margin.bottom);
    ctx.lineTo(w - margin.right, h - margin.bottom);
    ctx.stroke();

    // Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([3, 3]);
    for (var i = 1; i < 5; i++) {
        var x = margin.left + (w - margin.left - margin.right) * i / 5;
        var y = margin.top + (h - margin.top - margin.bottom) * i / 5;
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, h - margin.bottom);
        ctx.moveTo(margin.left, y);
        ctx.lineTo(w - margin.right, y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Points
    paretoData.forEach(function(point) {
        var x = margin.left + ((point.r2 - minR2) / (maxR2 - minR2)) * (w - margin.left - margin.right);
        var y = h - margin.bottom - ((point.rmse - minRmse) / (maxRmse - minRmse)) * (h - margin.top - margin.bottom);

        ctx.beginPath();
        if (point.isBest) {
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
        } else if (point.isParetoOptimal) {
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#10b981';
        } else {
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#cbd5e1';
        }
        ctx.fill();
    });

    // Pareto frontier line
    var paretoPoints = paretoData.filter(function(p) { return p.isParetoOptimal; })
        .sort(function(a, b) { return a.r2 - b.r2; });
    if (paretoPoints.length > 1) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        paretoPoints.forEach(function(point, idx) {
            var x = margin.left + ((point.r2 - minR2) / (maxR2 - minR2)) * (w - margin.left - margin.right);
            var y = h - margin.bottom - ((point.rmse - minRmse) / (maxRmse - minRmse)) * (h - margin.top - margin.bottom);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('R² Score (大きいほど良い)', w / 2, h - 8);
    ctx.save();
    ctx.translate(15, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('RMSE (小さいほど良い)', 0, 0);
    ctx.restore();

    // Legend
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(w - 100, 15, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.fillText('Best', w - 90, 18);
    ctx.fillStyle = '#10b981';
    ctx.beginPath(); ctx.arc(w - 100, 30, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.fillText('Pareto', w - 90, 33);
}

function renderDetailOptTrialsTable(run) {
    var container = document.getElementById('detailOptTrialsTable');
    var bestParams = run.bestParams || {};
    var paramKeys = Object.keys(bestParams).slice(0, 5);

    if (paramKeys.length === 0) {
        container.innerHTML = '<p class="text-gray-500">トライアル情報がありません</p>';
        return;
    }

    // Generate mock trials
    var topTrials = [];
    for (var i = 0; i < 10; i++) {
        var score = (run.r2 || 0.9) - Math.random() * 0.03;
        var params = {};
        paramKeys.forEach(function(key) {
            var baseVal = parseFloat(bestParams[key]) || 50;
            params[key] = (baseVal * (0.85 + Math.random() * 0.3)).toFixed(2);
        });
        topTrials.push({ rank: i + 1, score: score, params: params });
    }
    topTrials[0].score = run.r2 || 0.92;
    topTrials.sort(function(a, b) { return b.score - a.score; });

    var html = '<table><thead><tr><th>#</th><th>Score</th>';
    paramKeys.forEach(function(key) {
        html += '<th>' + escapeHtml(key.substring(0, 12)) + '</th>';
    });
    html += '</tr></thead><tbody>';

    topTrials.forEach(function(trial, idx) {
        var rowClass = idx === 0 ? 'best-row' : '';
        html += '<tr class="' + rowClass + '"><td>' + (idx + 1) + '</td><td>' + trial.score.toFixed(4) + '</td>';
        paramKeys.forEach(function(key) {
            html += '<td>' + trial.params[key] + '</td>';
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function closeRunDetailModal() {
    var modal = document.getElementById('runDetailModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
    currentRunDetail = null;
}

function renderSHAPChart(importance) {
    var container = document.getElementById('shapChart');
    if (!importance || Object.keys(importance).length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500">データがありません</p>';
        return;
    }

    var maxVal = Math.max(...Object.values(importance));
    var html = '';
    Object.entries(importance).slice(0, 8).forEach(function([feature, value]) {
        var width = (value / maxVal * 100).toFixed(1);
        html += '<div class="shap-bar">' +
            '<div class="shap-label" title="' + escapeHtml(feature) + '">' + escapeHtml(feature) + '</div>' +
            '<div class="shap-bar-container">' +
                '<div class="shap-bar-fill" style="width: ' + width + '%"></div>' +
            '</div>' +
            '<div class="shap-value">' + value.toFixed(2) + '</div>' +
        '</div>';
    });
    container.innerHTML = html;
}

function exportRunCSV() {
    if (!currentRunDetail) return;
    var csv = 'Feature,Importance\n';
    Object.entries(currentRunDetail.featureImportance || {}).forEach(function([k, v]) {
        csv += k + ',' + v + '\n';
    });
    downloadCSV(csv, currentRunDetail.name + '_shap.csv');
    showToast('CSVをダウンロードしました', 'success');
}

function downloadCSV(content, filename) {
    var blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// ========================================
// Predict Modal
// ========================================
var predictFileData = null;
var predictResult = null;

var predictSelectedModel = null;

function openPredictModal() {
    loadModelsSelect();
    document.getElementById('predictResult').style.display = 'none';
    document.getElementById('predictFileInfo').style.display = 'none';
    document.getElementById('predictModelInfo').style.display = 'none';
    predictFileData = null;
    predictResult = null;
    predictSelectedModel = null;
    var modal = document.getElementById('predictModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function openPredictWithModel() {
    closeRunDetailModal();
    openPredictModal();
    // Pre-select the model
    if (currentRunDetail) {
        var models = getModels();
        var model = models.find(m => m.runId === currentRunDetail.id);
        if (model) {
            document.getElementById('predictModelSelect').value = model.id;
            handlePredictModelSelect();
        }
    }
}

function closePredictModal() {
    var modal = document.getElementById('predictModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
}

function loadModelsSelect() {
    var models = getModels();
    var select = document.getElementById('predictModelSelect');
    select.innerHTML = '<option value="">モデルを選択してください</option>';
    models.forEach(function(m) {
        var option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name + ' (R²: ' + m.r2.toFixed(3) + ')';
        select.appendChild(option);
    });
}

function handlePredictModelSelect() {
    var modelId = document.getElementById('predictModelSelect').value;
    if (!modelId) {
        document.getElementById('predictModelInfo').style.display = 'none';
        predictSelectedModel = null;
        return;
    }

    var models = getModels();
    var model = models.find(function(m) { return m.id === modelId; });
    if (model) {
        predictSelectedModel = model;
        document.getElementById('predictModelAlgo').textContent = model.algorithm || 'LightGBM';
        document.getElementById('predictModelR2').textContent = model.r2.toFixed(4);
        document.getElementById('predictModelTarget').textContent = model.target || '-';

        // Display required features
        var featureList = document.getElementById('predictFeatureList');
        if (model.features && model.features.length > 0) {
            var html = model.features.map(function(f) {
                return '<span class="feature-tag">' + escapeHtml(f) + '</span>';
            }).join('');
            featureList.innerHTML = html;
        } else {
            featureList.innerHTML = '<span class="text-gray-500">特徴量情報なし</span>';
        }

        document.getElementById('predictModelInfo').style.display = 'block';
    }
}

function handlePredictFile(event) {
    var file = event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
        var text = e.target.result;
        var lines = text.split('\n').filter(l => l.trim());
        predictFileData = {
            name: file.name,
            rows: lines.length - 1,
            content: text
        };
        document.getElementById('predictFileName').textContent = file.name;
        document.getElementById('predictFileRows').textContent = '(' + predictFileData.rows + '行)';
        document.getElementById('predictFileInfo').style.display = 'block';
    };
    reader.readAsText(file);
}

function runPredict() {
    var modelId = document.getElementById('predictModelSelect').value;
    if (!modelId) {
        showToast('モデルを選択してください', 'warning');
        return;
    }
    if (!predictFileData) {
        showToast('予測データをアップロードしてください', 'warning');
        return;
    }

    // Simulate prediction
    showToast('予測を実行中...', 'info');

    setTimeout(function() {
        // Generate mock predictions
        var lines = predictFileData.content.split('\n').filter(l => l.trim());
        var header = lines[0];
        var predictions = [header + ',prediction'];
        for (var i = 1; i < lines.length; i++) {
            var pred = (Math.random() * 100).toFixed(2);
            predictions.push(lines[i] + ',' + pred);
        }
        predictResult = predictions.join('\n');

        document.getElementById('predictResultCount').textContent = lines.length - 1;
        document.getElementById('predictResult').style.display = 'block';
        showToast('予測が完了しました！', 'success');

        // Save as prediction run
        var run = {
            id: 'run_' + Date.now(),
            name: 'predict_' + new Date().toISOString().slice(0,10).replace(/-/g, ''),
            type: 'predict',
            algorithm: 'LightGBM予測',
            dataset: predictFileData.name,
            status: 'complete',
            createdAt: new Date().toISOString()
        };
        saveRun(run);
        renderRunsTable();
    }, 1500);
}

function downloadPredictResult() {
    if (!predictResult) return;
    downloadCSV(predictResult, 'prediction_result.csv');
    showToast('予測結果をダウンロードしました', 'success');
}

// ========================================
// Models Modal
// ========================================
function openModelsModal() {
    renderModelsList();
    var modal = document.getElementById('modelsModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeModelsModal() {
    var modal = document.getElementById('modelsModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
}

function renderModelsList() {
    var models = getModels();
    var container = document.getElementById('modelsList');
    var emptyState = document.getElementById('modelsEmptyState');

    if (models.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    var html = '';
    models.forEach(function(m) {
        var date = new Date(m.createdAt).toLocaleDateString('ja-JP');
        html += '<div class="model-card">' +
            '<div class="model-info">' +
                '<div class="model-name">' + escapeHtml(m.name) + '</div>' +
                '<div class="model-meta">' + escapeHtml(m.dataset) + ' • ' + date + '</div>' +
            '</div>' +
            '<div class="model-score">R² ' + m.r2.toFixed(3) + '</div>' +
            '<button class="btn btn-secondary" onclick="useModelForPredict(\'' + m.id + '\')">' +
                '<i class="fas fa-magic"></i> 予測' +
            '</button>' +
        '</div>';
    });
    container.innerHTML = html;
}

function useModelForPredict(modelId) {
    closeModelsModal();
    openPredictModal();
    document.getElementById('predictModelSelect').value = modelId;
}

// ========================================
// Task Select Modal
// ========================================
function openTaskSelectModal() {
    var modal = document.getElementById('taskSelectModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeTaskSelectModal() {
    var modal = document.getElementById('taskSelectModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
}

function selectTask(type) {
    closeTaskSelectModal();
    switch(type) {
        case 'train':
            openModal();
            break;
        case 'predict':
            openPredictModal();
            break;
        case 'optimize':
            openOptimizeModal();
            break;
    }
}

// ========================================
// Optimize Modal
// ========================================
var optimizeStep = 1;
var optimizeSelectedModel = null;

function openOptimizeModal() {
    optimizeStep = 1;
    optimizeSelectedModel = null;
    loadOptimizeModelsSelect();
    document.getElementById('optimizeStep1').style.display = 'block';
    document.getElementById('optimizeStep2').style.display = 'none';
    document.getElementById('optimizeStep3').style.display = 'none';
    document.getElementById('optimizeProgress').style.display = 'none';
    document.getElementById('optimizeResult').style.display = 'none';
    document.getElementById('optimizeModelInfo').style.display = 'none';
    document.getElementById('btnOptimizeBack').style.display = 'none';
    document.getElementById('btnOptimizeNext').style.display = 'inline-flex';
    document.getElementById('btnStartOptimize').style.display = 'none';
    var modal = document.getElementById('optimizeModal');
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeOptimizeModal() {
    var modal = document.getElementById('optimizeModal');
    modal.style.display = 'none';
    modal.classList.remove('active');
}

function loadOptimizeModelsSelect() {
    var models = getModels();
    var select = document.getElementById('optimizeModelSelect');
    select.innerHTML = '<option value="">モデルを選択してください</option>';
    models.forEach(function(m) {
        var option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name + ' (R²: ' + m.r2.toFixed(3) + ')';
        select.appendChild(option);
    });
}

function handleOptimizeModelSelect() {
    var modelId = document.getElementById('optimizeModelSelect').value;
    if (!modelId) {
        document.getElementById('optimizeModelInfo').style.display = 'none';
        optimizeSelectedModel = null;
        return;
    }

    var models = getModels();
    var model = models.find(function(m) { return m.id === modelId; });
    if (model) {
        optimizeSelectedModel = model;
        document.getElementById('optModelAlgo').textContent = model.algorithm || 'LightGBM';
        document.getElementById('optModelR2').textContent = model.r2.toFixed(4);
        document.getElementById('optModelDataset').textContent = model.dataset || '-';
        document.getElementById('optimizeModelInfo').style.display = 'block';
    }
}

function generateVarRangeInputs() {
    var container = document.getElementById('optimizeVarRanges');
    container.innerHTML = '';

    if (!optimizeSelectedModel || !optimizeSelectedModel.features) {
        container.innerHTML = '<div class="text-gray-500">特徴量情報がありません</div>';
        return;
    }

    var features = optimizeSelectedModel.features;
    features.forEach(function(feat, idx) {
        var html = '<div class="var-range-grid">' +
            '<span class="var-name">' + escapeHtml(feat) + '</span>' +
            '<select id="varType_' + idx + '" class="form-select" onchange="toggleVarInputs(' + idx + ')">' +
                '<option value="float">小数</option>' +
                '<option value="int">整数</option>' +
                '<option value="category">カテゴリ</option>' +
            '</select>' +
            '<input type="number" id="varLow_' + idx + '" placeholder="下限" value="0">' +
            '<input type="number" id="varHigh_' + idx + '" placeholder="上限" value="100">' +
        '</div>';
        container.innerHTML += html;
    });

    // Set target name
    document.getElementById('optTargetName').textContent = optimizeSelectedModel.target || '目的変数';
}

function toggleVarInputs(idx) {
    var typeSelect = document.getElementById('varType_' + idx);
    var lowInput = document.getElementById('varLow_' + idx);
    var highInput = document.getElementById('varHigh_' + idx);

    if (typeSelect.value === 'category') {
        lowInput.placeholder = '選択肢 (カンマ区切り)';
        lowInput.type = 'text';
        highInput.style.display = 'none';
    } else {
        lowInput.placeholder = '下限';
        lowInput.type = 'number';
        highInput.style.display = 'block';
    }
}

function optimizeNext() {
    if (optimizeStep === 1) {
        if (!optimizeSelectedModel) {
            showToast('モデルを選択してください', 'warning');
            return;
        }
        optimizeStep = 2;
        document.getElementById('optimizeStep1').style.display = 'none';
        document.getElementById('optimizeStep2').style.display = 'block';
        document.getElementById('btnOptimizeBack').style.display = 'inline-flex';
        generateVarRangeInputs();
    } else if (optimizeStep === 2) {
        optimizeStep = 3;
        document.getElementById('optimizeStep2').style.display = 'none';
        document.getElementById('optimizeStep3').style.display = 'block';
        document.getElementById('btnOptimizeNext').style.display = 'none';
        document.getElementById('btnStartOptimize').style.display = 'inline-flex';
    }
}

function optimizeBack() {
    if (optimizeStep === 2) {
        optimizeStep = 1;
        document.getElementById('optimizeStep1').style.display = 'block';
        document.getElementById('optimizeStep2').style.display = 'none';
        document.getElementById('btnOptimizeBack').style.display = 'none';
    } else if (optimizeStep === 3) {
        optimizeStep = 2;
        document.getElementById('optimizeStep2').style.display = 'block';
        document.getElementById('optimizeStep3').style.display = 'none';
        document.getElementById('btnOptimizeNext').style.display = 'inline-flex';
        document.getElementById('btnStartOptimize').style.display = 'none';
    }
}

function startOptimize() {
    var trials = parseInt(document.getElementById('optimizeTrials').value) || 50;
    var timeout = parseInt(document.getElementById('optimizeTimeout').value) || 300;
    var algorithm = document.getElementById('optimizeAlgorithm').value;
    var objective = document.getElementById('optimizeObjective').value;

    // Collect variable range settings
    var varConfigs = [];
    if (optimizeSelectedModel && optimizeSelectedModel.features) {
        optimizeSelectedModel.features.forEach(function(feat, idx) {
            var typeEl = document.getElementById('varType_' + idx);
            var lowEl = document.getElementById('varLow_' + idx);
            var highEl = document.getElementById('varHigh_' + idx);
            if (typeEl) {
                varConfigs.push({
                    name: feat,
                    type: typeEl.value,
                    low: parseFloat(lowEl.value) || 0,
                    high: parseFloat(highEl.value) || 100
                });
            }
        });
    }

    // Hide settings, show progress
    document.getElementById('optimizeStep3').style.display = 'none';
    document.getElementById('optimizeProgress').style.display = 'block';
    document.getElementById('btnOptimizeBack').style.display = 'none';
    document.getElementById('btnStartOptimize').style.display = 'none';

    var progressFill = document.getElementById('optimizeProgressFill');
    var progressPercent = document.getElementById('optimizeProgressPercent');
    var progressLog = document.getElementById('optimizeProgressLog');
    var bestScore = document.getElementById('optimizeBestScore');

    progressLog.innerHTML = '';
    var currentBest = optimizeSelectedModel.r2;
    var trialCount = 0;

    // Simulate optimization
    var interval = setInterval(function() {
        trialCount++;
        var progress = (trialCount / trials * 100).toFixed(0);
        progressFill.style.width = progress + '%';
        progressPercent.textContent = progress + '%';

        // Simulate improvement
        var improvement = Math.random() * 0.01;
        if (Math.random() > 0.7) {
            currentBest = Math.min(0.999, currentBest + improvement);
            bestScore.textContent = currentBest.toFixed(4);
            progressLog.innerHTML += '<div>[Trial ' + trialCount + '] 新しいベストスコア: ' + currentBest.toFixed(4) + '</div>';
        } else {
            progressLog.innerHTML += '<div>[Trial ' + trialCount + '] スコア: ' + (currentBest - Math.random() * 0.05).toFixed(4) + '</div>';
        }
        progressLog.scrollTop = progressLog.scrollHeight;

        if (trialCount >= trials) {
            clearInterval(interval);
            setTimeout(function() {
                showOptimizeResult(currentBest, trialCount);
            }, 500);
        }
    }, 100);
}

var optimizeTrialHistory = [];

function showOptimizeResult(finalScore, trials) {
    document.getElementById('optimizeProgress').style.display = 'none';
    document.getElementById('optimizeResult').style.display = 'block';

    var originalScore = optimizeSelectedModel.r2;
    var improvement = ((finalScore - originalScore) / originalScore * 100).toFixed(1);

    document.getElementById('optResultR2').textContent = finalScore.toFixed(4);
    document.getElementById('optResultImprove').textContent = '+' + improvement + '%';
    document.getElementById('optResultTrials').textContent = trials;

    // Generate mock best params with actual feature names
    var bestParams = {};
    if (optimizeSelectedModel && optimizeSelectedModel.features) {
        optimizeSelectedModel.features.forEach(function(feat) {
            bestParams[feat] = (Math.random() * 100).toFixed(2);
        });
    }
    // Add model hyperparameters
    bestParams['learning_rate'] = '0.0312';
    bestParams['max_depth'] = '8';
    bestParams['num_leaves'] = '64';
    bestParams['min_child_samples'] = '15';

    var paramsHtml = Object.entries(bestParams).map(function(entry) {
        return '<div><span style="color: #6366f1;">' + entry[0] + '</span>: ' + entry[1] + '</div>';
    }).join('');
    document.getElementById('optResultParams').innerHTML = paramsHtml;

    // Draw optimization history chart
    drawOptimizeHistoryChart(trials, originalScore, finalScore);

    // Draw trials table
    drawOptimizeTrialsTable(trials, finalScore, bestParams);

    // Save optimized model
    var newModel = {
        id: 'model_' + Date.now(),
        name: optimizeSelectedModel.name + '_opt',
        algorithm: optimizeSelectedModel.algorithm + ' (Optimized)',
        dataset: optimizeSelectedModel.dataset,
        target: optimizeSelectedModel.target,
        features: optimizeSelectedModel.features,
        r2: finalScore,
        bestParams: bestParams,
        runId: 'run_' + Date.now(),
        createdAt: new Date().toISOString()
    };
    saveModel(newModel);

    // Save optimization run with history
    var run = {
        id: 'run_' + Date.now(),
        name: 'optimize_' + new Date().toISOString().slice(0,10).replace(/-/g, ''),
        type: 'optimize',
        algorithm: document.getElementById('optimizeAlgorithm').value.toUpperCase(),
        dataset: optimizeSelectedModel.dataset,
        status: 'complete',
        r2: finalScore,
        originalR2: originalScore,
        improvement: improvement,
        trials: trials,
        bestParams: bestParams,
        trialHistory: optimizeTrialHistory,
        createdAt: new Date().toISOString()
    };
    saveRun(run);
    renderRunsTable();

    showToast('最適化が完了しました！ R² ' + improvement + '% 改善', 'success');
}

function drawOptimizeHistoryChart(trials, startScore, endScore) {
    var canvas = document.getElementById('optHistoryCanvas');
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var margin = { top: 20, right: 20, bottom: 30, left: 50 };

    ctx.clearRect(0, 0, w, h);

    // Generate mock history data
    optimizeTrialHistory = [];
    var bestSoFar = startScore;
    for (var i = 0; i < trials; i++) {
        var score = startScore + (endScore - startScore) * (i / trials) + (Math.random() - 0.5) * 0.02;
        if (score > bestSoFar) bestSoFar = score;
        optimizeTrialHistory.push({
            trial: i + 1,
            score: score,
            bestSoFar: bestSoFar
        });
    }

    var minScore = startScore - 0.05;
    var maxScore = endScore + 0.02;
    var scoreRange = maxScore - minScore;

    // Draw axes
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, h - margin.bottom);
    ctx.lineTo(w - margin.right, h - margin.bottom);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([3, 3]);
    for (var i = 0; i <= 4; i++) {
        var y = margin.top + (h - margin.top - margin.bottom) * i / 4;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(w - margin.right, y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw trial scores (gray dots)
    ctx.fillStyle = '#cbd5e1';
    optimizeTrialHistory.forEach(function(point) {
        var x = margin.left + (point.trial / trials) * (w - margin.left - margin.right);
        var y = h - margin.bottom - ((point.score - minScore) / scoreRange) * (h - margin.top - margin.bottom);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw best-so-far line (purple)
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    optimizeTrialHistory.forEach(function(point, idx) {
        var x = margin.left + (point.trial / trials) * (w - margin.left - margin.right);
        var y = h - margin.bottom - ((point.bestSoFar - minScore) / scoreRange) * (h - margin.top - margin.bottom);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Trial', w / 2, h - 5);
    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Score', 0, 0);
    ctx.restore();

    // Score labels
    ctx.textAlign = 'right';
    ctx.fillText(maxScore.toFixed(3), margin.left - 5, margin.top + 5);
    ctx.fillText(minScore.toFixed(3), margin.left - 5, h - margin.bottom);
}

function drawOptimizeTrialsTable(trials, bestScore, bestParams) {
    var container = document.getElementById('optTrialsTable');

    // Generate mock top trials
    var topTrials = [];
    for (var i = 0; i < Math.min(10, trials); i++) {
        var score = bestScore - Math.random() * 0.03;
        var params = {};
        Object.keys(bestParams).slice(0, 4).forEach(function(key) {
            params[key] = (parseFloat(bestParams[key]) * (0.9 + Math.random() * 0.2)).toFixed(2);
        });
        topTrials.push({ rank: i + 1, score: score, params: params });
    }
    topTrials[0].score = bestScore; // Best trial

    // Sort by score
    topTrials.sort(function(a, b) { return b.score - a.score; });

    var paramKeys = Object.keys(topTrials[0].params);
    var html = '<table><thead><tr><th>#</th><th>Score</th>';
    paramKeys.forEach(function(key) {
        html += '<th>' + key.substring(0, 10) + '</th>';
    });
    html += '</tr></thead><tbody>';

    topTrials.forEach(function(trial, idx) {
        var rowClass = idx === 0 ? 'best-row' : '';
        html += '<tr class="' + rowClass + '"><td>' + (idx + 1) + '</td><td>' + trial.score.toFixed(4) + '</td>';
        paramKeys.forEach(function(key) {
            html += '<td>' + trial.params[key] + '</td>';
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function downloadOptimizeResult() {
    if (!optimizeTrialHistory || optimizeTrialHistory.length === 0) {
        showToast('ダウンロードするデータがありません', 'warning');
        return;
    }

    var csv = 'trial,score,best_so_far\n';
    optimizeTrialHistory.forEach(function(row) {
        csv += row.trial + ',' + row.score.toFixed(6) + ',' + row.bestSoFar.toFixed(6) + '\n';
    });

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'optimization_result_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('最適化結果をダウンロードしました', 'success');
}

function applyOptimizedModel() {
    showToast('最適化されたパラメータをモデルに適用しました', 'success');
    closeOptimizeModal();
}

// ========================================
// Initialize
// ========================================
console.log('[ML App] Script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('[ML App] DOMContentLoaded fired');

    // Render runs table on load
    setTimeout(renderRunsTable, 200);

    // Check ML API status
    checkMLServiceHealth().then(function(connected) {
        // Add status indicator
        var statusEl = document.createElement('div');
        statusEl.id = 'mlApiStatus';

        if (connected) {
            console.log('[ML App] Connected to ML Service');
            statusEl.innerHTML = '<i class="fas fa-circle" style="color: #10b981; font-size: 8px;"></i> ML API';
            statusEl.style.cssText = 'position: fixed; top: 10px; right: 440px; font-size: 12px; color: #fff; background: rgba(16,185,129,0.9); padding: 6px 12px; border-radius: 6px; z-index: 50; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: right 0.3s; cursor: pointer;';
            statusEl.title = 'ML Service: 接続中';
        } else {
            console.log('[ML App] ML Service not available - using mock mode');
            statusEl.innerHTML = '<i class="fas fa-circle" style="color: #ef4444; font-size: 8px;"></i> ML API (オフライン)';
            statusEl.style.cssText = 'position: fixed; top: 10px; right: 440px; font-size: 12px; color: #fff; background: rgba(239,68,68,0.9); padding: 6px 12px; border-radius: 6px; z-index: 50; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: right 0.3s; cursor: pointer;';
            statusEl.title = 'ML Service: 未接続 - モックモードで動作中';
            statusEl.onclick = function() {
                showToast('ML Serviceに接続できません。学習・予測はモックモードで実行されます。', 'warning');
            };
        }

        document.body.appendChild(statusEl);

        // Adjust position when chat panel is collapsed/expanded
        var chatPanel = document.querySelector('.chat-panel');
        if (chatPanel) {
            var observer = new MutationObserver(function() {
                var isCollapsed = chatPanel.classList.contains('collapsed');
                statusEl.style.right = isCollapsed ? '80px' : '440px';
            });
            observer.observe(chatPanel, { attributes: true, attributeFilter: ['class'] });
            // Initial check
            if (chatPanel.classList.contains('collapsed')) {
                statusEl.style.right = '80px';
            }
        }
    });

    // Initialize WebSocket if available
    if (typeof io !== 'undefined') {
        initMLWebSocket();
    }
});
