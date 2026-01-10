        // ========================================
        // Configuration
        // ========================================
        var layerConfig = {
            material: { name: 'Material', color: '#22d3ee', fields: ['id', 'steelGrade', 'maker', 'shape', 'dimension', 'note'] },
            heatTreatment: { name: 'Heat', color: '#f59e0b', fields: ['id', 'quenchMethod', 'quenchTemp', 'quenchTime', 'quenchCool', 'temperMethod', 'temperTemp', 'temperTime', 'note'] },
            product: { name: 'Product', color: '#10b981', fields: ['id', 'materialId', 'heatTreatId', 'createdAt', 'stock', 'note'] },
            testPiece: { name: 'TP', color: '#a78bfa', fields: ['id', 'productId', 'processId', 'status', 'stamp', 'note'] },
            analysisSample: { name: 'Analysis', color: '#f472b6', fields: ['id', 'testPieceId', 'productId', 'hardness', 'note'] }
        };

        var network = null;
        var nodesData = null;
        var edgesData = null;
        var allNodes = [];
        var allEdges = [];
        var rawData = {};
        var currentFilter = 'all';
        var selectedNode = null;
        var traceModeActive = false;
        var compareModeActive = false;
        var compareList = [];
        var tableDrawerOpen = false;
        var currentTableLayer = 'material';
        var pastedData = null;
        var columnMapping = {};
        var currentLayoutIndex = 0;
        var layouts = ['LR', 'TB', 'RL'];
        var orphanHighlightActive = false;

        // ========================================
        // Initialization
        // ========================================
        function init() {
            showLoading(true);
            renderFilters();
            renderLegend();
            renderLayerJump();
            loadData();
            setupPasteArea();
            setupMinimap();
        }

        function loadData() {
            fetch('/api/nodes')
                .then(function(res) { return res.json(); })
                .then(function(data) {
                    allNodes = data.nodes || [];
                    allEdges = data.edges || [];
                    loadRawData();
                })
                .catch(function(err) {
                    showLoading(false);
                    showToast('Error: ' + err.message, 'error');
                });
        }

        function loadRawData() {
            Promise.all([
                fetch('/api/materials').then(function(r) { return r.json(); }),
                fetch('/api/heat-treatments').then(function(r) { return r.json(); }),
                fetch('/api/products').then(function(r) { return r.json(); }),
                fetch('/api/test-pieces').then(function(r) { return r.json(); }),
                fetch('/api/analysis-samples').then(function(r) { return r.json(); })
            ]).then(function(results) {
                rawData.material = results[0];
                rawData.heatTreatment = results[1];
                rawData.product = results[2];
                rawData.testPiece = results[3];
                rawData.analysisSample = results[4];
                renderStats();
                buildGraph();
                renderDatasetColumnSelector();
                updateDatasetPreview();
                showLoading(false);
                showToast(allNodes.length + ' nodes loaded', 'success');
            });
        }

        // ========================================
        // Stats & Filters
        // ========================================
        function renderStats() {
            var grid = document.getElementById('statsGrid');
            var counts = {};
            Object.keys(layerConfig).forEach(function(k) { counts[k] = 0; });
            allNodes.forEach(function(n) { counts[n.layerId]++; });
            var html = '';
            Object.keys(layerConfig).forEach(function(key) {
                var cfg = layerConfig[key];
                var active = currentFilter === key ? ' active' : '';
                html += '<div class="stat-card' + active + '" style="--stat-color:' + cfg.color + ';" onclick="filterLayer(\'' + key + '\')">';
                html += '<div class="stat-value" style="color:' + cfg.color + ';">' + counts[key] + '</div>';
                html += '<div class="stat-label">' + cfg.name + '</div></div>';
            });
            grid.innerHTML = html;
        }

        function renderFilters() {
            var container = document.getElementById('layerFilters');
            var html = '<button class="filter-btn active" onclick="filterLayer(\'all\', this)">All</button>';
            Object.keys(layerConfig).forEach(function(key) {
                var cfg = layerConfig[key];
                html += '<button class="filter-btn" onclick="filterLayer(\'' + key + '\', this)">';
                html += '<span class="dot" style="background:' + cfg.color + ';"></span>' + cfg.name + '</button>';
            });
            container.innerHTML = html;
        }

        function renderLegend() {
            var container = document.getElementById('layerLegend');
            var html = '';
            Object.keys(layerConfig).forEach(function(key) {
                var cfg = layerConfig[key];
                html += '<div class="legend-item" onclick="filterLayer(\'' + key + '\')">';
                html += '<span class="legend-dot" style="background:' + cfg.color + ';"></span>' + cfg.name + '</div>';
            });
            container.innerHTML = html;
        }

        function renderLayerJump() {
            var container = document.getElementById('layerJump');
            var html = '';
            Object.keys(layerConfig).forEach(function(key) {
                var cfg = layerConfig[key];
                html += '<button class="layer-jump-btn" style="border-left:3px solid ' + cfg.color + ';" onclick="jumpToLayer(\'' + key + '\')">' + cfg.name + '</button>';
            });
            container.innerHTML = html;
        }

        function filterLayer(layerId, btn) {
            currentFilter = layerId;
            document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
            if (btn) btn.classList.add('active');
            if (!nodesData) return;
            nodesData.forEach(function(node) {
                var visible = layerId === 'all' || node.layerId === layerId;
                nodesData.update({ id: node.id, hidden: !visible });
            });
            renderStats();
            updateMinimap();
        }

        function jumpToLayer(layerId) {
            var layerNodes = [];
            nodesData.forEach(function(node) {
                if (node.layerId === layerId) layerNodes.push(node.id);
            });
            if (layerNodes.length > 0) {
                network.fit({ nodes: layerNodes, animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
            }
        }

        // ========================================
        // Graph - Enhanced
        // ========================================
        function buildGraph() {
            var container = document.getElementById('graph');
            
            // Improved node styling
            var visNodes = allNodes.map(function(n) {
                return {
                    id: n.id,
                    label: n.label,
                    level: n.level,
                    layerId: n.layerId,
                    color: {
                        background: n.color,
                        border: n.color,
                        highlight: { background: '#ffffff', border: n.color },
                        hover: { background: lightenColor(n.color, 20), border: n.color }
                    },
                    font: { color: '#1a1a25', size: 12, face: 'Inter', bold: true },
                    shape: 'box',
                    borderWidth: 2,
                    borderWidthSelected: 4,
                    margin: { top: 10, bottom: 10, left: 12, right: 12 },
                    shadow: { enabled: true, color: 'rgba(0,0,0,0.3)', size: 6, x: 2, y: 2 },
                    _data: n
                };
            });

            var visEdges = allEdges.map(function(e, i) {
                return {
                    id: 'e' + i,
                    from: e.from,
                    to: e.to,
                    color: { color: '#4a4a5a', highlight: '#6366f1', hover: '#6366f1' },
                    width: 2,
                    arrows: { to: { enabled: true, scaleFactor: 0.5, type: 'arrow' } },
                    smooth: { type: 'cubicBezier', roundness: 0.4 }
                };
            });

            nodesData = new vis.DataSet(visNodes);
            edgesData = new vis.DataSet(visEdges);

            var options = {
                layout: {
                    hierarchical: {
                        enabled: true,
                        direction: layouts[currentLayoutIndex],
                        sortMethod: 'directed',
                        levelSeparation: 120,
                        nodeSpacing: 40,
                        treeSpacing: 60,
                        blockShifting: true,
                        edgeMinimization: true,
                        parentCentralization: true
                    }
                },
                physics: { enabled: false },
                interaction: {
                    hover: true,
                    multiselect: true,
                    navigationButtons: false,
                    keyboard: { enabled: true, speed: { x: 10, y: 10, zoom: 0.02 } },
                    zoomView: true,
                    dragView: true
                },
                nodes: {
                    scaling: { min: 10, max: 30 }
                }
            };

            network = new vis.Network(container, { nodes: nodesData, edges: edgesData }, options);

            network.on('click', handleNodeClick);
            network.on('selectNode', updateSelectionInfo);
            network.on('deselectNode', updateSelectionInfo);
            network.on('zoom', updateZoomDisplay);
            network.on('dragEnd', updateMinimap);
            network.on('zoom', updateMinimap);

            network.once('afterDrawing', function() {
                network.fit({ animation: { duration: 500 } });
                updateMinimap();
            });
        }

        function handleNodeClick(params) {
            if (params.nodes.length > 0) {
                var nodeId = params.nodes[0];
                var node = nodesData.get(nodeId);
                selectedNode = node;
                if (compareModeActive) {
                    toggleCompareItem(nodeId, node);
                } else {
                    showDetail(node);
                    if (traceModeActive) highlightTrace(nodeId);
                }
            } else {
                if (!compareModeActive) {
                    hideDetail();
                    selectedNode = null;
                }
                if (traceModeActive) clearHighlight();
            }
            updateMinimap();
        }

        function updateSelectionInfo() {
            var selected = network.getSelectedNodes();
            var info = document.getElementById('selectionInfo');
            if (compareModeActive && compareList.length > 0) {
                info.textContent = compareList.length + ' selected for compare';
            } else if (selected.length > 0) {
                info.textContent = selected.length + ' selected';
            } else {
                info.textContent = '';
            }
        }

        // ========================================
        // Zoom Controls
        // ========================================
        function zoomIn() {
            var scale = network.getScale();
            network.moveTo({ scale: scale * 1.3, animation: { duration: 200 } });
        }

        function zoomOut() {
            var scale = network.getScale();
            network.moveTo({ scale: scale / 1.3, animation: { duration: 200 } });
        }

        function updateZoomDisplay() {
            var scale = network.getScale();
            var percent = Math.round(scale * 100);
            document.getElementById('zoomLevel').textContent = percent + '%';
            document.getElementById('zoomDisplay').textContent = percent + '%';
            updateMinimap();
        }

        // ========================================
        // Minimap
        // ========================================
        function setupMinimap() {
            var canvas = document.getElementById('minimapCanvas');
            canvas.width = 220;
            canvas.height = 150;
        }

        function updateMinimap() {
            if (!network || !nodesData) return;
            
            var canvas = document.getElementById('minimapCanvas');
            var ctx = canvas.getContext('2d');
            var viewport = document.getElementById('minimapViewport');
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#1a1a25';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            var positions = network.getPositions();
            var nodeIds = Object.keys(positions);
            if (nodeIds.length === 0) return;

            // Calculate bounds
            var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            nodeIds.forEach(function(id) {
                var pos = positions[id];
                if (pos.x < minX) minX = pos.x;
                if (pos.x > maxX) maxX = pos.x;
                if (pos.y < minY) minY = pos.y;
                if (pos.y > maxY) maxY = pos.y;
            });

            var padding = 20;
            var rangeX = maxX - minX + padding * 2;
            var rangeY = maxY - minY + padding * 2;
            var scaleX = canvas.width / rangeX;
            var scaleY = canvas.height / rangeY;
            var scale = Math.min(scaleX, scaleY);

            // Draw nodes
            nodeIds.forEach(function(id) {
                var node = nodesData.get(id);
                if (!node || node.hidden) return;
                var pos = positions[id];
                var x = (pos.x - minX + padding) * scale;
                var y = (pos.y - minY + padding) * scale;
                ctx.fillStyle = node.color.background || '#6366f1';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            });

            // Draw viewport indicator
            var viewPos = network.getViewPosition();
            var viewScale = network.getScale();
            var graphContainer = document.getElementById('graph');
            var viewWidth = graphContainer.clientWidth / viewScale;
            var viewHeight = graphContainer.clientHeight / viewScale;

            var vpX = (viewPos.x - viewWidth/2 - minX + padding) * scale;
            var vpY = (viewPos.y - viewHeight/2 - minY + padding) * scale;
            var vpW = viewWidth * scale;
            var vpH = viewHeight * scale;

            viewport.style.left = Math.max(0, vpX) + 'px';
            viewport.style.top = Math.max(0, vpY + 16) + 'px';
            viewport.style.width = Math.min(vpW, canvas.width) + 'px';
            viewport.style.height = Math.min(vpH, canvas.height - 16) + 'px';
        }

        // ========================================
        // Layout Cycling
        // ========================================
        function cycleLayout() {
            currentLayoutIndex = (currentLayoutIndex + 1) % layouts.length;
            var direction = layouts[currentLayoutIndex];
            var directionNames = { 'LR': 'Left to Right', 'TB': 'Top to Bottom', 'RL': 'Right to Left' };
            
            network.setOptions({
                layout: {
                    hierarchical: {
                        direction: direction
                    }
                }
            });
            
            setTimeout(function() {
                network.fit({ animation: { duration: 500 } });
                updateMinimap();
            }, 100);
            
            showToast('Layout: ' + directionNames[direction], 'info');
        }

        // ========================================
        // Orphan Highlighting
        // ========================================
        function toggleOrphanHighlight() {
            orphanHighlightActive = !orphanHighlightActive;
            
            if (orphanHighlightActive) {
                var connectedNodes = new Set();
                allEdges.forEach(function(e) {
                    connectedNodes.add(e.from);
                    connectedNodes.add(e.to);
                });
                
                var orphanCount = 0;
                nodesData.forEach(function(node) {
                    var isOrphan = !connectedNodes.has(node.id);
                    if (isOrphan) {
                        orphanCount++;
                        nodesData.update({
                            id: node.id,
                            borderWidth: 4,
                            shapeProperties: { borderDashes: [5, 5] }
                        });
                    }
                });
                showToast(orphanCount + ' orphan nodes highlighted', 'warning');
            } else {
                nodesData.forEach(function(node) {
                    nodesData.update({
                        id: node.id,
                        borderWidth: 2,
                        shapeProperties: { borderDashes: false }
                    });
                });
                showToast('Orphan highlight off', 'info');
            }
        }

        // ========================================
        // Detail Panel
        // ========================================
        function showDetail(node) {
            var panel = document.getElementById('detailPanel');
            var data = node._data;
            var cfg = layerConfig[data.layerId];
            document.getElementById('detailBadge').textContent = cfg.name;
            document.getElementById('detailBadge').style.background = cfg.color;
            document.getElementById('detailId').textContent = data.id;
            var props = data.properties || {};
            var html = '<div class="detail-section"><div class="detail-section-title">Properties</div>';
            Object.keys(props).forEach(function(key) {
                if (key === 'processInfo' || key === 'tensileTest') return;
                var val = props[key];
                if (val === '' || val === null || val === undefined) val = '-';
                html += '<div class="detail-row"><span class="detail-key">' + key + '</span><span class="detail-value">' + val + '</span></div>';
            });
            html += '</div>';
            if (props.processInfo) {
                html += '<div class="detail-section"><div class="detail-section-title">Process</div>';
                Object.keys(props.processInfo).forEach(function(key) {
                    html += '<div class="detail-row"><span class="detail-key">' + key + '</span><span class="detail-value">' + (props.processInfo[key] || '-') + '</span></div>';
                });
                html += '</div>';
            }
            document.getElementById('detailBody').innerHTML = html;
            panel.classList.add('active');
        }

        function hideDetail() { document.getElementById('detailPanel').classList.remove('active'); }

        // ========================================
        // Trace Mode - Improved
        // ========================================
        function toggleTraceMode() {
            traceModeActive = !traceModeActive;
            document.getElementById('btnTrace').classList.toggle('active', traceModeActive);
            if (!traceModeActive) clearHighlight();
            showToast('Trace: ' + (traceModeActive ? 'ON' : 'OFF'), 'info');
        }

        function showTrace() {
            if (!selectedNode) return;
            traceModeActive = true;
            document.getElementById('btnTrace').classList.add('active');
            highlightTrace(selectedNode.id);
        }

        function highlightTrace(nodeId) {
            fetch('/api/trace/' + nodeId)
                .then(function(res) { return res.json(); })
                .then(function(trace) {
                    var traceIds = {};
                    traceIds[nodeId] = true;
                    (trace.upstream || []).forEach(function(n) { traceIds[n.id] = true; });
                    (trace.downstream || []).forEach(function(n) { traceIds[n.id] = true; });
                    
                    var traceCount = Object.keys(traceIds).length;
                    
                    nodesData.forEach(function(node) {
                        var inTrace = traceIds[node.id];
                        nodesData.update({
                            id: node.id,
                            opacity: inTrace ? 1 : 0.15,
                            borderWidth: inTrace ? 4 : 1,
                            font: { color: inTrace ? '#1a1a25' : '#64748b', size: 12, face: 'Inter', bold: true }
                        });
                    });
                    edgesData.forEach(function(edge) {
                        var inTrace = traceIds[edge.from] && traceIds[edge.to];
                        edgesData.update({
                            id: edge.id,
                            color: { color: inTrace ? '#6366f1' : '#1a1a25' },
                            width: inTrace ? 3 : 1
                        });
                    });
                    updateMinimap();
                    showToast('Trace: ' + traceCount + ' related nodes', 'info');
                });
        }

        // ========================================
        // Isolate Mode - Hide non-related nodes
        // ========================================
        var isolateModeActive = false;

        function isolateSelected() {
            // Toggle off if already active
            if (isolateModeActive) {
                clearIsolate();
                showToast('Isolate mode: OFF', 'info');
                return;
            }

            if (!selectedNode) {
                showToast('Select a node first', 'warning');
                return;
            }

            var nodeId = selectedNode.id;
            
            fetch('/api/trace/' + nodeId)
                .then(function(res) { return res.json(); })
                .then(function(trace) {
                    var traceIds = {};
                    traceIds[nodeId] = true;
                    (trace.upstream || []).forEach(function(n) { traceIds[n.id] = true; });
                    (trace.downstream || []).forEach(function(n) { traceIds[n.id] = true; });
                    
                    var visibleCount = Object.keys(traceIds).length;
                    var hiddenCount = 0;
                    
                    // Hide non-related nodes
                    nodesData.forEach(function(node) {
                        var inTrace = traceIds[node.id];
                        if (!inTrace) hiddenCount++;
                        nodesData.update({
                            id: node.id,
                            hidden: !inTrace
                        });
                    });
                    
                    // Update edges visibility
                    edgesData.forEach(function(edge) {
                        var visible = traceIds[edge.from] && traceIds[edge.to];
                        edgesData.update({
                            id: edge.id,
                            hidden: !visible
                        });
                    });
                    
                    isolateModeActive = true;
                    document.getElementById('btnIsolate').classList.add('active');
                    
                    // Fit to visible nodes
                    var visibleNodes = [];
                    nodesData.forEach(function(node) {
                        if (!node.hidden) visibleNodes.push(node.id);
                    });
                    if (visibleNodes.length > 0) {
                        network.fit({ nodes: visibleNodes, animation: { duration: 500 } });
                    }
                    
                    updateMinimap();
                    showToast('Isolated: ' + visibleCount + ' nodes shown, ' + hiddenCount + ' hidden', 'success');
                });
        }

        function clearIsolate() {
            isolateModeActive = false;
            document.getElementById('btnIsolate').classList.remove('active');
            
            // Show all nodes
            nodesData.forEach(function(node) {
                nodesData.update({ id: node.id, hidden: false });
            });
            edgesData.forEach(function(edge) {
                edgesData.update({ id: edge.id, hidden: false });
            });
            
            updateMinimap();
        }

        function clearHighlight() {
            if (!nodesData) return;
            nodesData.forEach(function(node) {
                var cfg = layerConfig[node.layerId] || {};
                nodesData.update({
                    id: node.id,
                    opacity: 1,
                    borderWidth: 2,
                    font: { color: '#1a1a25', size: 12, face: 'Inter', bold: true }
                });
            });
            edgesData.forEach(function(edge) {
                edgesData.update({ id: edge.id, color: { color: '#4a4a5a' }, width: 2 });
            });
            updateMinimap();
        }

        // ========================================
        // Compare Mode
        // ========================================
        function toggleCompareMode() {
            compareModeActive = !compareModeActive;
            document.getElementById('btnCompare').classList.toggle('active', compareModeActive);
            if (compareModeActive) {
                compareList = [];
                hideDetail();
                showToast('Compare mode: Click nodes to select', 'info');
            } else {
                closeCompare();
            }
            updateSelectionInfo();
        }

        function toggleCompareItem(nodeId, node) {
            var idx = compareList.findIndex(function(c) { return c.id === nodeId; });
            if (idx >= 0) {
                compareList.splice(idx, 1);
            } else if (compareList.length < 2) {
                compareList.push({ id: nodeId, data: node._data });
            } else {
                showToast('Max 2 items for compare', 'warning');
                return;
            }
            updateComparePanel();
            updateSelectionInfo();
        }

        function updateComparePanel() {
            document.getElementById('compareCount').textContent = compareList.length;
            if (compareList.length === 2) {
                document.getElementById('comparePanel').classList.add('active');
                renderCompare();
            } else {
                document.getElementById('comparePanel').classList.remove('active');
            }
        }

        function renderCompare() {
            var body = document.getElementById('compareBody');
            var a = compareList[0].data;
            var b = compareList[1].data;
            var propsA = a.properties || {};
            var propsB = b.properties || {};
            var allKeys = Object.keys(propsA).concat(Object.keys(propsB)).filter(function(k, i, arr) { return arr.indexOf(k) === i && k !== 'processInfo' && k !== 'tensileTest'; });
            var html = '<div class="compare-grid">';
            html += '<div class="compare-row"><div class="compare-label">ID</div><div class="compare-value">' + a.id + '</div><div class="compare-value">' + b.id + '</div></div>';
            allKeys.forEach(function(key) {
                var valA = propsA[key] !== undefined ? propsA[key] : '-';
                var valB = propsB[key] !== undefined ? propsB[key] : '-';
                var diff = valA !== valB ? ' diff' : '';
                html += '<div class="compare-row"><div class="compare-label">' + key + '</div><div class="compare-value' + diff + '">' + valA + '</div><div class="compare-value' + diff + '">' + valB + '</div></div>';
            });
            html += '</div>';
            body.innerHTML = html;
        }

        function closeCompare() {
            compareModeActive = false;
            compareList = [];
            document.getElementById('btnCompare').classList.remove('active');
            document.getElementById('comparePanel').classList.remove('active');
            updateSelectionInfo();
        }

        // ========================================
        // Table Drawer
        // ========================================
        function toggleTableDrawer() {
            tableDrawerOpen = !tableDrawerOpen;
            document.getElementById('tableDrawer').classList.toggle('active', tableDrawerOpen);
            if (tableDrawerOpen) {
                renderDrawerTabs();
                renderTable(currentTableLayer);
            }
        }

        function renderDrawerTabs() {
            var container = document.getElementById('drawerTabs');
            var html = '';
            Object.keys(layerConfig).forEach(function(key) {
                var cfg = layerConfig[key];
                var active = currentTableLayer === key ? ' active' : '';
                html += '<button class="drawer-tab' + active + '" onclick="switchTable(\'' + key + '\')">' + cfg.name + '</button>';
            });
            container.innerHTML = html;
        }

        function switchTable(layer) {
            currentTableLayer = layer;
            renderDrawerTabs();
            renderTable(layer);
        }

        function renderTable(layer) {
            var body = document.getElementById('drawerBody');
            var data = rawData[layer] || [];
            if (data.length === 0) {
                body.innerHTML = '<p style="color:var(--text-muted);font-size:0.8em;">No data</p>';
                return;
            }
            var keys = Object.keys(data[0]).filter(function(k) { return k !== 'processInfo' && k !== 'tensileTest'; });
            var html = '<table class="data-table"><thead><tr>';
            keys.forEach(function(k) { html += '<th>' + k + '</th>'; });
            html += '</tr></thead><tbody>';
            data.forEach(function(row) {
                html += '<tr onclick="selectNodeById(\'' + row.id + '\')">';
                keys.forEach(function(k) { html += '<td>' + (row[k] !== undefined ? row[k] : '-') + '</td>'; });
                html += '</tr>';
            });
            html += '</tbody></table>';
            body.innerHTML = html;
        }

        function selectNodeById(id) {
            var node = nodesData.get(id);
            if (node) {
                network.selectNodes([id]);
                network.focus(id, { scale: 1.5, animation: { duration: 300 } });
                selectedNode = node;
                showDetail(node);
                updateMinimap();
            }
        }

        // ========================================
        // Add/Edit/Paste Modals (same as before)
        // ========================================
        function openAddModal() {
            document.getElementById('addModal').classList.add('active');
            updateAddForm();
        }
        function closeAddModal() { document.getElementById('addModal').classList.remove('active'); }

        function updateAddForm() {
            var layer = document.getElementById('addLayerType').value;
            var cfg = layerConfig[layer];
            var fields = cfg.fields || [];
            var html = '';
            fields.forEach(function(field) {
                html += '<div class="form-group"><label class="form-label">' + field + '</label>';
                if (field === 'id') {
                    html += '<input type="text" class="form-input" id="add_' + field + '" placeholder="Auto-generated if empty">';
                } else if (field === 'note') {
                    html += '<textarea class="form-textarea" id="add_' + field + '" rows="2"></textarea>';
                } else if (field === 'materialId') {
                    html += '<select class="form-select" id="add_' + field + '">' + getOptionsFor('material') + '</select>';
                } else if (field === 'heatTreatId') {
                    html += '<select class="form-select" id="add_' + field + '">' + getOptionsFor('heatTreatment') + '</select>';
                } else if (field === 'productId') {
                    html += '<select class="form-select" id="add_' + field + '">' + getOptionsFor('product') + '</select>';
                } else {
                    html += '<input type="text" class="form-input" id="add_' + field + '">';
                }
                html += '</div>';
            });
            document.getElementById('addFormFields').innerHTML = html;
        }

        function getOptionsFor(layer) {
            var data = rawData[layer] || [];
            var html = '<option value="">-- Select --</option>';
            data.forEach(function(item) { html += '<option value="' + item.id + '">' + item.id + '</option>'; });
            return html;
        }

        function submitAddNode() {
            var layer = document.getElementById('addLayerType').value;
            var cfg = layerConfig[layer];
            var fields = cfg.fields || [];
            var newData = {};
            fields.forEach(function(field) {
                var el = document.getElementById('add_' + field);
                if (el) newData[field] = el.value;
            });
            if (!newData.id) newData.id = layer.charAt(0).toUpperCase() + Date.now().toString().slice(-6);
            if (!rawData[layer]) rawData[layer] = [];
            rawData[layer].push(newData);
            var nodeLabel = newData.id;
            if (newData.steelGrade) nodeLabel = newData.steelGrade + '\n' + (newData.maker || '');
            if (newData.quenchMethod) nodeLabel = newData.quenchMethod + ' ' + newData.quenchTemp + 'C';
            var newNode = { id: newData.id, layerId: layer, level: Object.keys(layerConfig).indexOf(layer), label: nodeLabel, color: cfg.color, properties: newData };
            allNodes.push(newNode);
            nodesData.add({
                id: newData.id, label: nodeLabel, level: newNode.level, layerId: layer,
                color: { background: cfg.color, border: cfg.color, highlight: { background: '#ffffff', border: cfg.color } },
                font: { color: '#1a1a25', size: 12, bold: true }, shape: 'box', borderWidth: 2, margin: { top: 10, bottom: 10, left: 12, right: 12 }, shadow: true, _data: newNode
            });
            if (newData.materialId) edgesData.add({ from: newData.materialId, to: newData.id, color: { color: '#4a4a5a' }, width: 2, arrows: { to: { enabled: true, scaleFactor: 0.5 } } });
            if (newData.heatTreatId) edgesData.add({ from: newData.heatTreatId, to: newData.id, color: { color: '#4a4a5a' }, width: 2, arrows: { to: { enabled: true, scaleFactor: 0.5 } } });
            if (newData.productId) edgesData.add({ from: newData.productId, to: newData.id, color: { color: '#4a4a5a' }, width: 2, arrows: { to: { enabled: true, scaleFactor: 0.5 } } });
            renderStats();
            closeAddModal();
            updateMinimap();
            showToast('Node added: ' + newData.id, 'success');
        }

        function editNode() {
            if (!selectedNode) return;
            var data = selectedNode._data;
            var layer = data.layerId;
            var props = data.properties || {};
            document.getElementById('editNodeId').textContent = data.id;
            var cfg = layerConfig[layer];
            var fields = cfg ? cfg.fields : Object.keys(props);
            var html = '';
            fields.forEach(function(field) {
                var val = props[field] !== undefined ? props[field] : '';
                html += '<div class="form-group"><label class="form-label">' + field + '</label>';
                if (field === 'id') {
                    html += '<input type="text" class="form-input" id="edit_' + field + '" value="' + val + '" readonly style="opacity:0.6;">';
                } else if (field === 'note') {
                    html += '<textarea class="form-textarea" id="edit_' + field + '" rows="2">' + val + '</textarea>';
                } else {
                    html += '<input type="text" class="form-input" id="edit_' + field + '" value="' + val + '">';
                }
                html += '</div>';
            });
            document.getElementById('editFormFields').innerHTML = html;
            document.getElementById('editModal').classList.add('active');
        }

        function closeEditModal() { document.getElementById('editModal').classList.remove('active'); }

        function submitEditNode() {
            if (!selectedNode) return;
            var data = selectedNode._data;
            var layer = data.layerId;
            var props = data.properties || {};
            var cfg = layerConfig[layer];
            var fields = cfg ? cfg.fields : Object.keys(props);
            fields.forEach(function(field) {
                var el = document.getElementById('edit_' + field);
                if (el && field !== 'id') props[field] = el.value;
            });
            var arr = rawData[layer] || [];
            var idx = arr.findIndex(function(r) { return r.id === data.id; });
            if (idx >= 0) arr[idx] = props;
            var nodeLabel = data.id;
            if (props.steelGrade) nodeLabel = props.steelGrade + '\n' + (props.maker || '');
            if (props.quenchMethod) nodeLabel = props.quenchMethod + ' ' + props.quenchTemp + 'C';
            nodesData.update({ id: data.id, label: nodeLabel });
            closeEditModal();
            showDetail(selectedNode);
            showToast('Node updated: ' + data.id, 'success');
        }

        function openPasteModal() {
            document.getElementById('pasteModal').classList.add('active');
            document.getElementById('pasteInput').value = '';
            document.getElementById('mappingSection').style.display = 'none';
            document.getElementById('pasteSubmitBtn').disabled = true;
            pastedData = null;
        }

        function closePasteModal() { document.getElementById('pasteModal').classList.remove('active'); }

        function setupPasteArea() {
            var area = document.getElementById('pasteArea');
            area.addEventListener('dragover', function(e) { e.preventDefault(); area.classList.add('dragover'); });
            area.addEventListener('dragleave', function() { area.classList.remove('dragover'); });
            area.addEventListener('drop', function(e) {
                e.preventDefault();
                area.classList.remove('dragover');
                var file = e.dataTransfer.files[0];
                if (file) {
                    var reader = new FileReader();
                    reader.onload = function(ev) { processPastedText(ev.target.result); };
                    reader.readAsText(file);
                }
            });
        }

        function handlePaste(e) { processPastedText(e.clipboardData.getData('text')); }

        function processPastedText(text) {
            if (!text || !text.trim()) return;
            var lines = text.trim().split('\n');
            if (lines.length < 2) { showToast('Need header + data rows', 'warning'); return; }
            var delimiter = text.indexOf('\t') >= 0 ? '\t' : ',';
            var headers = lines[0].split(delimiter).map(function(h) { return h.trim(); });
            var rows = [];
            for (var i = 1; i < lines.length; i++) {
                var cols = lines[i].split(delimiter).map(function(c) { return c.trim(); });
                if (cols.length === headers.length) {
                    var row = {};
                    headers.forEach(function(h, idx) { row[h] = cols[idx]; });
                    rows.push(row);
                }
            }
            if (rows.length === 0) { showToast('No valid data rows', 'warning'); return; }
            pastedData = { headers: headers, rows: rows };
            showMappingUI();
        }

        function showMappingUI() {
            var layer = document.getElementById('pasteLayerType').value;
            var cfg = layerConfig[layer];
            var dbFields = cfg.fields || [];
            var excelHeaders = pastedData.headers;
            var container = document.getElementById('mappingContainer');
            var html = '';
            dbFields.forEach(function(dbField) {
                var guessedMatch = '';
                excelHeaders.forEach(function(h) { if (h.toLowerCase() === dbField.toLowerCase()) guessedMatch = h; });
                html += '<div class="mapping-row"><select class="form-select mapping-select" data-dbfield="' + dbField + '"><option value="">-- Skip --</option>';
                excelHeaders.forEach(function(h) { html += '<option value="' + h + '"' + (h === guessedMatch ? ' selected' : '') + '>' + h + '</option>'; });
                html += '</select><span class="mapping-arrow">-></span><span style="font-size:0.75em;font-weight:500;">' + dbField + '</span></div>';
            });
            container.innerHTML = html;
            var preview = document.getElementById('previewTable');
            var previewHtml = '<table><thead><tr>';
            excelHeaders.forEach(function(h) { previewHtml += '<th>' + h + '</th>'; });
            previewHtml += '</tr></thead><tbody>';
            pastedData.rows.slice(0, 3).forEach(function(row) {
                previewHtml += '<tr>';
                excelHeaders.forEach(function(h) { previewHtml += '<td>' + (row[h] || '') + '</td>'; });
                previewHtml += '</tr>';
            });
            if (pastedData.rows.length > 3) previewHtml += '<tr><td colspan="' + excelHeaders.length + '" style="text-align:center;color:var(--text-muted);">... ' + (pastedData.rows.length - 3) + ' more</td></tr>';
            previewHtml += '</tbody></table>';
            preview.innerHTML = previewHtml;
            document.getElementById('mappingSection').style.display = 'block';
            document.getElementById('pasteSubmitBtn').disabled = false;
        }

        function submitPasteData() {
            if (!pastedData) return;
            var layer = document.getElementById('pasteLayerType').value;
            var cfg = layerConfig[layer];
            var selects = document.querySelectorAll('.mapping-select');
            var mapping = {};
            selects.forEach(function(sel) { var dbField = sel.getAttribute('data-dbfield'); var excelCol = sel.value; if (excelCol) mapping[dbField] = excelCol; });
            var addedCount = 0;
            pastedData.rows.forEach(function(row) {
                var newData = {};
                Object.keys(mapping).forEach(function(dbField) { newData[dbField] = row[mapping[dbField]] || ''; });
                if (!newData.id) newData.id = layer.charAt(0).toUpperCase() + Date.now().toString().slice(-6) + addedCount;
                if (!rawData[layer]) rawData[layer] = [];
                rawData[layer].push(newData);
                var nodeLabel = newData.id;
                if (newData.steelGrade) nodeLabel = newData.steelGrade + '\n' + (newData.maker || '');
                if (newData.quenchMethod) nodeLabel = newData.quenchMethod + ' ' + newData.quenchTemp + 'C';
                var newNode = { id: newData.id, layerId: layer, level: Object.keys(layerConfig).indexOf(layer), label: nodeLabel, color: cfg.color, properties: newData };
                allNodes.push(newNode);
                nodesData.add({
                    id: newData.id, label: nodeLabel, level: newNode.level, layerId: layer,
                    color: { background: cfg.color, border: cfg.color }, font: { color: '#1a1a25', size: 12, bold: true },
                    shape: 'box', borderWidth: 2, margin: { top: 10, bottom: 10, left: 12, right: 12 }, shadow: true, _data: newNode
                });
                addedCount++;
            });
            renderStats();
            closePasteModal();
            updateMinimap();
            showToast(addedCount + ' nodes imported', 'success');
        }

        // ========================================
        // Export
        // ========================================
        function exportData() {
            var data = { nodes: allNodes, edges: allEdges, rawData: rawData };
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'experiment-data.json';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Data exported', 'success');
        }

        // ========================================
        // Dataset Export (Flat Table)
        // ========================================
        var datasetColumnConfig = {
            material: { enabled: true, columns: { steelGrade: true, maker: true, shape: false, dimension: false } },
            heatTreatment: { enabled: true, columns: { quenchMethod: true, quenchTemp: true, temperTemp: true, quenchCool: false, temperMethod: false } },
            product: { enabled: true, columns: { id: true, createdAt: true, stock: false } },
            testPiece: { enabled: true, columns: { processId: false, status: false } },
            analysisSample: { enabled: true, columns: { hardness: true } }
        };
        var datasetExpandedSections = {};

        function renderDatasetColumnSelector() {
            var container = document.getElementById('datasetColumnSelector');
            if (!container || !rawData) return;

            var html = '';
            var layerColors = { material: '#22d3ee', heatTreatment: '#f59e0b', product: '#10b981', testPiece: '#a78bfa', analysisSample: '#f472b6' };
            var layerNames = { material: 'Material', heatTreatment: 'Heat Treatment', product: 'Product', testPiece: 'Test Piece', analysisSample: 'Analysis' };

            Object.keys(datasetColumnConfig).forEach(function(layer) {
                var cfg = datasetColumnConfig[layer];
                var expanded = datasetExpandedSections[layer];
                var sampleData = rawData[layer] && rawData[layer][0] ? rawData[layer][0] : {};
                // Show all columns except foreign key IDs (materialId, heatTreatId, productId, testPieceId)
                var excludeKeys = ['materialId', 'heatTreatId', 'productId', 'testPieceId', 'processId'];
                var columns = Object.keys(sampleData).filter(function(k) {
                    return excludeKeys.indexOf(k) === -1 && (k !== 'id' || layer === 'product');
                });

                html += '<div class="dataset-section">';
                html += '<div class="dataset-section-header" onclick="toggleDatasetSection(\'' + layer + '\')">';
                html += '<div class="dataset-section-title"><span class="layer-dot" style="background:' + layerColors[layer] + '"></span>' + layerNames[layer] + '</div>';
                html += '<span class="dataset-section-toggle">' + (expanded ? '▼' : '▶') + '</span>';
                html += '</div>';
                html += '<div class="dataset-columns ' + (expanded ? 'expanded' : '') + '" id="dataset-cols-' + layer + '">';

                columns.forEach(function(col) {
                    var checked = cfg.columns[col] !== false;
                    html += '<div class="dataset-column-item">';
                    html += '<input type="checkbox" id="dscol-' + layer + '-' + col + '" ' + (checked ? 'checked' : '') + ' onchange="updateDatasetColumn(\'' + layer + '\', \'' + col + '\', this.checked)">';
                    html += '<label for="dscol-' + layer + '-' + col + '">' + col + '</label>';
                    html += '</div>';
                });

                html += '</div></div>';
            });

            container.innerHTML = html;
        }

        function toggleDatasetSection(layer) {
            datasetExpandedSections[layer] = !datasetExpandedSections[layer];
            var el = document.getElementById('dataset-cols-' + layer);
            if (el) el.classList.toggle('expanded', datasetExpandedSections[layer]);
            var header = el ? el.previousElementSibling : null;
            if (header) {
                var toggle = header.querySelector('.dataset-section-toggle');
                if (toggle) toggle.textContent = datasetExpandedSections[layer] ? '▼' : '▶';
            }
        }

        function updateDatasetColumn(layer, col, enabled) {
            if (!datasetColumnConfig[layer]) return;
            datasetColumnConfig[layer].columns[col] = enabled;
            updateDatasetPreview();
        }

        function buildFlatDataset() {
            if (!rawData || !rawData.product) return [];

            var dataset = [];
            var products = rawData.product || [];
            var materials = rawData.material || [];
            var heatTreatments = rawData.heatTreatment || [];
            var testPieces = rawData.testPiece || [];
            var analysisSamples = rawData.analysisSample || [];

            // Helper to check if column is enabled (true if not explicitly false)
            function isColumnEnabled(layer, col) {
                var cfg = datasetColumnConfig[layer];
                if (!cfg || !cfg.enabled) return false;
                return cfg.columns[col] !== false;
            }

            // Get all columns from sample data for each layer
            function getLayerColumns(layer) {
                var sample = rawData[layer] && rawData[layer][0] ? rawData[layer][0] : {};
                var excludeKeys = ['materialId', 'heatTreatId', 'productId', 'testPieceId', 'processId'];
                return Object.keys(sample).filter(function(k) {
                    return excludeKeys.indexOf(k) === -1 && (k !== 'id' || layer === 'product');
                });
            }

            products.forEach(function(product) {
                var row = {};

                // Product columns
                getLayerColumns('product').forEach(function(col) {
                    if (isColumnEnabled('product', col) && product[col] !== undefined) {
                        row['product_' + col] = product[col];
                    }
                });

                // Material columns (join by materialId)
                var material = materials.find(function(m) { return m.id === product.materialId; });
                if (material) {
                    getLayerColumns('material').forEach(function(col) {
                        if (isColumnEnabled('material', col) && material[col] !== undefined) {
                            row['material_' + col] = material[col];
                        }
                    });
                }

                // HeatTreatment columns (join by heatTreatId)
                var ht = heatTreatments.find(function(h) { return h.id === product.heatTreatId; });
                if (ht) {
                    getLayerColumns('heatTreatment').forEach(function(col) {
                        if (isColumnEnabled('heatTreatment', col) && ht[col] !== undefined) {
                            row['ht_' + col] = ht[col];
                        }
                    });
                }

                // TestPiece columns (aggregate)
                var productTPs = testPieces.filter(function(tp) { return tp.productId === product.id; });
                if (productTPs.length > 0) {
                    getLayerColumns('testPiece').forEach(function(col) {
                        if (isColumnEnabled('testPiece', col)) {
                            var values = productTPs.map(function(tp) { return tp[col]; }).filter(function(v) { return v !== undefined; });
                            if (values.length > 0) {
                                if (typeof values[0] === 'number') {
                                    var avg = values.reduce(function(a, b) { return a + b; }, 0) / values.length;
                                    row['tp_avg_' + col] = Math.round(avg * 100) / 100;
                                } else {
                                    row['tp_' + col] = values.join(', ');
                                }
                            }
                        }
                    });
                }

                // AnalysisSample columns (aggregate)
                var productAnalysis = analysisSamples.filter(function(as) {
                    return as.productId === product.id || productTPs.some(function(tp) { return tp.id === as.testPieceId; });
                });
                if (productAnalysis.length > 0) {
                    getLayerColumns('analysisSample').forEach(function(col) {
                        if (isColumnEnabled('analysisSample', col)) {
                            var values = productAnalysis.map(function(as) { return as[col]; }).filter(function(v) { return v !== undefined; });
                            if (values.length > 0) {
                                if (typeof values[0] === 'number') {
                                    var avg = values.reduce(function(a, b) { return a + b; }, 0) / values.length;
                                    row['as_avg_' + col] = Math.round(avg * 100) / 100;
                                } else {
                                    row['as_' + col] = values.join(', ');
                                }
                            }
                        }
                    });
                }

                dataset.push(row);
            });

            return dataset;
        }

        function updateDatasetPreview() {
            var preview = document.getElementById('datasetPreview');
            if (!preview) return;

            var dataset = buildFlatDataset();
            if (dataset.length === 0) {
                preview.textContent = 'No data available';
                return;
            }

            var columns = Object.keys(dataset[0]);
            var html = '<div style="overflow-x:auto;"><table style="font-size:0.6em;border-collapse:collapse;width:100%;">';
            html += '<tr>' + columns.map(function(c) { return '<th style="padding:2px 4px;border-bottom:1px solid #333;text-align:left;white-space:nowrap;">' + c + '</th>'; }).join('') + '</tr>';

            dataset.slice(0, 3).forEach(function(row) {
                html += '<tr>' + columns.map(function(c) { return '<td style="padding:2px 4px;white-space:nowrap;">' + (row[c] !== undefined ? row[c] : '-') + '</td>'; }).join('') + '</tr>';
            });

            if (dataset.length > 3) {
                html += '<tr><td colspan="' + columns.length + '" style="padding:4px;color:#666;">... and ' + (dataset.length - 3) + ' more rows</td></tr>';
            }
            html += '</table></div>';
            html += '<div style="margin-top:4px;">' + dataset.length + ' rows × ' + columns.length + ' columns</div>';

            preview.innerHTML = html;
        }

        function exportDatasetCSV() {
            var dataset = buildFlatDataset();
            if (dataset.length === 0) {
                showToast('No data to export', 'warning');
                return;
            }

            var columns = Object.keys(dataset[0]);
            var csv = columns.join(',') + '\n';
            dataset.forEach(function(row) {
                csv += columns.map(function(c) {
                    var val = row[c] !== undefined ? row[c] : '';
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
            a.download = 'dataset_' + new Date().toISOString().slice(0,10) + '.csv';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Dataset exported as CSV (Excel対応 UTF-8 with BOM)', 'success');
        }

        /**
         * ML Appへ移動（データセット管理画面）
         * 同一ウィンドウで遷移（Phase 1B Router対応）
         */
        function openMLApp() {
            if (window.router) {
                window.router.navigate('ml-app#datasets');
            } else {
                // Fallback: same window navigation
                window.location.href = '/ml-app.html#datasets';
            }
            showToast('ML Appへ移動します', 'info');
        }

        /**
         * ML Training（学習開始）へデータを引き継ぐ
         * 同一ウィンドウで遷移（Phase 1B対応）
         */
        function sendToMLTraining() {
            var dataset = buildFlatDataset();
            if (dataset.length === 0) {
                showToast('データが選択されていません', 'warning');
                return;
            }

            // データセット名入力
            var defaultName = 'experiment_dataset_' + new Date().toISOString().slice(0,10).replace(/-/g, '');
            var datasetName = prompt('データセット名を入力してください:', defaultName);

            // キャンセル
            if (datasetName === null) return;

            // 空の場合はデフォルト名
            if (datasetName.trim() === '') {
                datasetName = defaultName;
            }

            // 一時データとしてLocalStorageに保存
            var exportData = {
                id: 'temp_' + Date.now(), // 一時ID
                name: datasetName.trim(),
                createdAt: new Date().toISOString(),
                rows: dataset.length,
                columns: Object.keys(dataset[0]),
                data: dataset,
                isTemporary: true // 一時データフラグ
            };

            // ML Appのデータセット一覧にも追加（重複防止のためIDチェック）
            var storedDatasets = localStorage.getItem('mlapp_datasets_all');
            var datasets = [];
            try {
                datasets = storedDatasets ? JSON.parse(storedDatasets) : [];
            } catch (e) {
                console.error('Failed to parse datasets from localStorage:', e);
                datasets = [];
            }

            // 同名のデータセットが既に存在する場合は上書き確認
            var existingIndex = datasets.findIndex(function(d) {
                return d.name === exportData.name && !d.isTemporary;
            });

            if (existingIndex >= 0) {
                var overwrite = confirm('同名のデータセット「' + exportData.name + '」が既に存在します。\n\n「OK」= 新しい名前で追加\n「キャンセル」= 既存データを使用');
                if (!overwrite) {
                    // 既存データを使用
                    exportData = datasets[existingIndex];
                } else {
                    // 新しい名前を生成
                    exportData.name = exportData.name + '_' + Date.now();
                }
            }

            // データセット一覧に追加
            if (existingIndex < 0 || !datasets[existingIndex].isTemporary) {
                datasets.push(exportData);
                localStorage.setItem('mlapp_datasets_all', JSON.stringify(datasets));
            }

            // ML App用に一時データをセット（モーダルで使用）
            localStorage.setItem('mlapp_temp_dataset', JSON.stringify(exportData));
            // ML学習モーダルを自動的に開くフラグ
            localStorage.setItem('mlapp_open_training', 'true');

            showToast('データセット準備完了: ' + dataset.length + '行', 'success');

            // ML Appページへ遷移（同一ウィンドウ）
            if (window.router) {
                window.router.navigate('ml-app#training');
            } else {
                window.location.href = '/ml-app.html#training';
            }
        }

        /**
         * 旧関数（互換性のため残す）- ML Appへデータを渡す
         * @deprecated Use sendToMLTraining() instead
         */
        function sendToMLApp() {
            // 旧動作: ML Appへデータを渡して開く
            sendToMLTraining();
        }

        /**
         * Phase 1B: 選択されたノードのデータでML学習を開始
         * グラフビューから直接ML学習に遷移
         */
        function sendSelectedToML() {
            var selectedNodes = network.getSelectedNodes();
            if (selectedNodes.length === 0) {
                showToast('ノードが選択されていません', 'warning');
                return;
            }

            // 選択ノードのデータを収集
            var nodeData = [];
            selectedNodes.forEach(function(nodeId) {
                var node = nodesData.get(nodeId);
                if (node && node.data) {
                    nodeData.push(node.data);
                }
            });

            if (nodeData.length === 0) {
                // サンプルデータを使用
                showToast('選択ノードにデータがありません。サンプルデータを使用します。', 'info');

                // 全ノードからサンプルデータを生成
                var allNodes = nodesData.get();
                allNodes.forEach(function(node) {
                    if (node.data) {
                        nodeData.push(node.data);
                    }
                });

                if (nodeData.length === 0) {
                    showToast('利用可能なデータがありません', 'error');
                    return;
                }
            }

            // データセットを作成
            var defaultName = 'graph_selection_' + new Date().toISOString().slice(0,10).replace(/-/g, '');
            var datasetName = prompt('データセット名を入力してください:', defaultName);

            if (datasetName === null) return;
            if (datasetName.trim() === '') datasetName = defaultName;

            // データセットオブジェクトを作成
            var exportData = {
                id: 'graph_' + Date.now(),
                name: datasetName.trim(),
                createdAt: new Date().toISOString(),
                rows: nodeData.length,
                columns: nodeData.length > 0 ? Object.keys(nodeData[0]) : [],
                data: nodeData,
                source: 'graph_selection',
                sourceNodes: selectedNodes
            };

            // LocalStorageに保存
            var storedDatasets = localStorage.getItem('mlapp_datasets_all');
            var datasets = [];
            try {
                datasets = storedDatasets ? JSON.parse(storedDatasets) : [];
            } catch (e) {
                console.error('Failed to parse datasets from localStorage:', e);
                datasets = [];
            }
            datasets.push(exportData);
            localStorage.setItem('mlapp_datasets_all', JSON.stringify(datasets));

            // 学習用にセット
            localStorage.setItem('mlapp_temp_dataset', JSON.stringify(exportData));
            localStorage.setItem('mlapp_open_training', 'true');

            showToast('データセット作成: ' + nodeData.length + '件のデータ', 'success');

            // ML Appへ遷移
            if (window.router) {
                window.router.navigate('ml-app#training');
            } else {
                window.location.href = '/ml-app.html#training';
            }
        }

        // ========================================
        // Phase 1B: Theme Toggle
        // ========================================
        function toggleTheme() {
            console.log('[Theme] Toggle called, themeManager:', !!window.themeManager);
            if (window.themeManager) {
                window.themeManager.toggle();
                updateThemeIcon();
                showToast('テーマを切り替えました', 'info');
            } else {
                // Fallback: manual theme toggle
                var currentTheme = localStorage.getItem('theme') || 'dark';
                var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                localStorage.setItem('theme', newTheme);
                applyThemeManually(newTheme);
                updateThemeIcon();
                showToast('テーマを切り替えました: ' + newTheme, 'info');
            }
        }

        function applyThemeManually(theme) {
            var root = document.documentElement;
            if (theme === 'light') {
                root.style.setProperty('--bg-primary', '#f8fafc');
                root.style.setProperty('--bg-secondary', '#ffffff');
                root.style.setProperty('--bg-tertiary', '#f1f5f9');
                root.style.setProperty('--bg-card', '#ffffff');
                root.style.setProperty('--bg-hover', '#e2e8f0');
                root.style.setProperty('--text-primary', '#1e293b');
                root.style.setProperty('--text-secondary', '#475569');
                root.style.setProperty('--text-muted', '#94a3b8');
                root.style.setProperty('--border-color', '#e2e8f0');
                root.style.setProperty('--border-light', '#cbd5e1');
            } else {
                root.style.setProperty('--bg-primary', '#0a0a0f');
                root.style.setProperty('--bg-secondary', '#12121a');
                root.style.setProperty('--bg-tertiary', '#1a1a25');
                root.style.setProperty('--bg-card', '#1e1e2a');
                root.style.setProperty('--bg-hover', '#252535');
                root.style.setProperty('--text-primary', '#f1f5f9');
                root.style.setProperty('--text-secondary', '#94a3b8');
                root.style.setProperty('--text-muted', '#64748b');
                root.style.setProperty('--border-color', '#2a2a3a');
                root.style.setProperty('--border-light', '#3a3a4a');
            }
            document.body.setAttribute('data-theme', theme);
        }

        function updateThemeIcon() {
            var icon = document.getElementById('themeIcon');
            var btn = document.getElementById('themeToggleBtn');
            if (icon) {
                var theme = 'dark';
                if (window.themeManager) {
                    theme = window.themeManager.getEffectiveTheme();
                } else {
                    theme = localStorage.getItem('theme') || 'dark';
                }
                icon.className = 'fas ' + (theme === 'dark' ? 'fa-moon' : 'fa-sun');
                // Adjust button/icon color for light mode visibility
                if (btn) {
                    if (theme === 'light') {
                        btn.style.background = 'rgba(0,0,0,0.1)';
                        btn.style.borderColor = 'rgba(0,0,0,0.2)';
                        icon.style.color = '#1e293b';
                    } else {
                        btn.style.background = 'rgba(255,255,255,0.15)';
                        btn.style.borderColor = 'rgba(255,255,255,0.2)';
                        icon.style.color = 'white';
                    }
                }
                console.log('[Theme] Icon updated to:', theme);
            }
        }

        // Update icon on page load
        document.addEventListener('DOMContentLoaded', function() {
            // Wait a bit for theme manager to initialize
            setTimeout(function() {
                updateThemeIcon();
                // Apply saved theme
                var savedTheme = localStorage.getItem('theme') || 'dark';
                if (!window.themeManager) {
                    applyThemeManually(savedTheme);
                }
            }, 100);
        });

        // ========================================
        // Utilities
        // ========================================
        function fitGraph() {
            if (network) {
                network.fit({ animation: { duration: 500 } });
                setTimeout(updateMinimap, 600);
            }
        }

        function resetView() {
            currentFilter = 'all';
            traceModeActive = false;
            compareModeActive = false;
            compareList = [];
            orphanHighlightActive = false;
            isolateModeActive = false;
            document.getElementById('btnTrace').classList.remove('active');
            document.getElementById('btnCompare').classList.remove('active');
            document.getElementById('btnIsolate').classList.remove('active');
            document.getElementById('comparePanel').classList.remove('active');
            
            // Show all nodes and reset styles
            nodesData.forEach(function(node) {
                var cfg = layerConfig[node.layerId] || {};
                nodesData.update({
                    id: node.id,
                    hidden: false,
                    opacity: 1,
                    borderWidth: 2,
                    font: { color: '#1a1a25', size: 12, face: 'Inter', bold: true }
                });
            });
            edgesData.forEach(function(edge) {
                edgesData.update({
                    id: edge.id,
                    hidden: false,
                    color: { color: '#4a4a5a' },
                    width: 2
                });
            });
            
            filterLayer('all');
            fitGraph();
            updateSelectionInfo();
        }

        function showLoading(show) { document.getElementById('loadingOverlay').classList.toggle('active', show); }

        // HTML escape function to prevent XSS
        function escapeHtml(text) {
            if (text === null || text === undefined) return '';
            var div = document.createElement('div');
            div.textContent = String(text);
            return div.innerHTML;
        }

        function showToast(text, type) {
            var toast = document.getElementById('toast');
            toast.className = 'toast ' + (type || 'info');
            document.getElementById('toastText').textContent = text;
            toast.classList.add('show');
            setTimeout(function() { toast.classList.remove('show'); }, 3000);
        }

        function lightenColor(hex, percent) {
            var num = parseInt(hex.replace('#', ''), 16);
            var amt = Math.round(2.55 * percent);
            var R = Math.min(255, (num >> 16) + amt);
            var G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
            var B = Math.min(255, (num & 0x0000FF) + amt);
            return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
        }

        document.addEventListener('DOMContentLoaded', init);
