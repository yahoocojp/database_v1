/**
 * R&D Experiment Manager - Express Server
 * Phase 1A: Sample Data Version
 */

var express = require('express');
var path = require('path');

// Sample Data (ASCII compatible keys)
var sampleData = {
    materials: [
        { id: "M001", steelGrade: "SCM435", maker: "A Steel", shape: "Round Bar", dimension: "D50", note: "" },
        { id: "M002", steelGrade: "SCM440", maker: "B Steel", shape: "Round Bar", dimension: "D60", note: "" },
        { id: "M003", steelGrade: "SNCM439", maker: "A Steel", shape: "Round Bar", dimension: "D45", note: "" },
        { id: "M004", steelGrade: "SCM435", maker: "C Metal", shape: "Plate", dimension: "t25", note: "Test" },
        { id: "M005", steelGrade: "SCM440", maker: "A Steel", shape: "Round Bar", dimension: "D55", note: "" }
    ],
    heatTreatments: [
        { id: "H001", quenchMethod: "FH", quenchTemp: 850, quenchTime: 3600, quenchCool: "Oil", temperMethod: "FH", temperTemp: 400, temperTime: 120, note: "" },
        { id: "H002", quenchMethod: "FH", quenchTemp: 880, quenchTime: 3600, quenchCool: "Oil", temperMethod: "FH", temperTemp: 450, temperTime: 120, note: "" },
        { id: "H003", quenchMethod: "IH", quenchTemp: 950, quenchTime: 30, quenchCool: "Water", temperMethod: "FH", temperTemp: 400, temperTime: 60, note: "" },
        { id: "H004", quenchMethod: "IH", quenchTemp: 980, quenchTime: 25, quenchCool: "Water", temperMethod: "IH", temperTemp: 380, temperTime: 30, note: "IH Temper" },
        { id: "H005", quenchMethod: "FH", quenchTemp: 860, quenchTime: 4200, quenchCool: "Oil", temperMethod: "FH", temperTemp: 500, temperTime: 180, note: "High Temp" },
        { id: "H006", quenchMethod: "FH", quenchTemp: 850, quenchTime: 3600, quenchCool: "Oil", temperMethod: "FH", temperTemp: 350, temperTime: 90, note: "Low Temp" },
        { id: "H007", quenchMethod: "IH", quenchTemp: 920, quenchTime: 45, quenchCool: "Oil", temperMethod: "FH", temperTemp: 420, temperTime: 100, note: "" },
        { id: "H008", quenchMethod: "FH", quenchTemp: 870, quenchTime: 3000, quenchCool: "Oil", temperMethod: "FH", temperTemp: 480, temperTime: 150, note: "" }
    ],
    products: [
        { id: "Z001", materialId: "M001", heatTreatId: "H001", createdAt: "2025/11/01", stock: "Yes", note: "" },
        { id: "Z002", materialId: "M001", heatTreatId: "H002", createdAt: "2025/11/05", stock: "Yes", note: "" },
        { id: "Z003", materialId: "M001", heatTreatId: "H003", createdAt: "2025/11/08", stock: "No", note: "IH" },
        { id: "Z004", materialId: "M002", heatTreatId: "H001", createdAt: "2025/11/10", stock: "Yes", note: "SharedHT" },
        { id: "Z005", materialId: "M002", heatTreatId: "H004", createdAt: "2025/11/12", stock: "Yes", note: "" },
        { id: "Z006", materialId: "M003", heatTreatId: "H005", createdAt: "2025/11/15", stock: "Yes", note: "" },
        { id: "Z007", materialId: "M003", heatTreatId: "H006", createdAt: "2025/11/18", stock: "No", note: "" },
        { id: "Z008", materialId: "M004", heatTreatId: "H007", createdAt: "2025/11/20", stock: "Yes", note: "Plate" },
        { id: "Z009", materialId: "M005", heatTreatId: "H008", createdAt: "2025/11/25", stock: "Yes", note: "" },
        { id: "Z010", materialId: "M001", heatTreatId: "H004", createdAt: "2025/12/01", stock: "Yes", note: "Add" },
        { id: "Z011", materialId: "M003", heatTreatId: "H001", createdAt: "2025/12/05", stock: "Yes", note: "SharedHT" },
        { id: "Z012", materialId: "M004", heatTreatId: "H002", createdAt: "2025/12/08", stock: "Yes", note: "SharedHT" },
        { id: "Z013", materialId: "M005", heatTreatId: "H001", createdAt: "2025/12/10", stock: "No", note: "SharedHT" }
    ],
    processes: [
        { id: "K001", category: "Tensile", standard: "JIS Z2241 14A", note: "" },
        { id: "K002", category: "Charpy", standard: "JIS Z2242 V-notch", note: "" },
        { id: "K003", category: "Hardness", standard: "D10 x t5", note: "" },
        { id: "K004", category: "Microscopy", standard: "10x10xt5", note: "Embedding" }
    ],
    testPieces: [
        { id: "TP001", productId: "Z001", processId: "K001", status: "Done", stamp: "A-001", note: "" },
        { id: "TP002", productId: "Z001", processId: "K002", status: "Done", stamp: "A-002", note: "" },
        { id: "TP003", productId: "Z002", processId: "K001", status: "Done", stamp: "A-003", note: "" },
        { id: "TP004", productId: "Z003", processId: "K001", status: "Testing", stamp: "A-004", note: "" },
        { id: "TP005", productId: "Z003", processId: "K002", status: "Testing", stamp: "A-005", note: "" },
        { id: "TP006", productId: "Z004", processId: "K001", status: "Done", stamp: "B-001", note: "" },
        { id: "TP007", productId: "Z004", processId: "K003", status: "Done", stamp: "B-002", note: "" },
        { id: "TP008", productId: "Z005", processId: "K001", status: "Processing", stamp: "B-003", note: "" },
        { id: "TP009", productId: "Z006", processId: "K001", status: "Done", stamp: "C-001", note: "" },
        { id: "TP010", productId: "Z006", processId: "K002", status: "Done", stamp: "C-002", note: "" },
        { id: "TP011", productId: "Z007", processId: "K004", status: "Done", stamp: "C-003", note: "Micro" },
        { id: "TP012", productId: "Z008", processId: "K001", status: "Planned", stamp: "D-001", note: "" },
        { id: "TP013", productId: "Z009", processId: "K001", status: "Planned", stamp: "E-001", note: "" },
        { id: "TP014", productId: "Z010", processId: "K001", status: "Processing", stamp: "A-010", note: "" },
        { id: "TP015", productId: "Z010", processId: "K002", status: "Planned", stamp: "A-011", note: "" }
    ],
    analysisSamples: [
        { id: "AS001", testPieceId: "TP001", productId: "Z001", hardness: 52.3, note: "" },
        { id: "AS002", testPieceId: "TP003", productId: "Z002", hardness: 54.1, note: "" },
        { id: "AS003", testPieceId: "TP006", productId: "Z004", hardness: 51.8, note: "" },
        { id: "AS004", testPieceId: "TP009", productId: "Z006", hardness: 48.5, note: "High Temp" },
        { id: "AS005", testPieceId: "TP011", productId: "Z007", hardness: 55.2, note: "" }
    ],
    tensileTests: [
        { testPieceId: "TP001", tensileStrength: 1850, yieldStrength: 1650, reduction: 45 },
        { testPieceId: "TP003", tensileStrength: 1920, yieldStrength: 1720, reduction: 42 },
        { testPieceId: "TP006", tensileStrength: 1780, yieldStrength: 1580, reduction: 48 },
        { testPieceId: "TP009", tensileStrength: 1650, yieldStrength: 1450, reduction: 52 }
    ]
};

// Layer definitions
var layers = {
    material: { level: 0, color: '#22d3ee', icon: 'M', name: 'Material' },
    heatTreatment: { level: 1, color: '#f59e0b', icon: 'H', name: 'Heat Treatment' },
    product: { level: 2, color: '#10b981', icon: 'P', name: 'Product' },
    testPiece: { level: 3, color: '#a78bfa', icon: 'T', name: 'Test Piece' },
    analysisSample: { level: 4, color: '#f472b6', icon: 'A', name: 'Analysis' }
};

/**
 * Build graph data
 */
function buildGraphData() {
    var nodes = [];
    var edges = [];

    // Material nodes
    sampleData.materials.forEach(function(m) {
        nodes.push({
            id: m.id,
            layerId: 'material',
            level: layers.material.level,
            label: m.steelGrade + '\n' + m.maker,
            color: layers.material.color,
            properties: m
        });
    });

    // Heat treatment nodes
    sampleData.heatTreatments.forEach(function(h) {
        nodes.push({
            id: h.id,
            layerId: 'heatTreatment',
            level: layers.heatTreatment.level,
            label: h.quenchMethod + ' ' + h.quenchTemp + 'C\nTemper ' + h.temperTemp + 'C',
            color: layers.heatTreatment.color,
            properties: h
        });
    });

    // Product nodes + edges
    sampleData.products.forEach(function(p) {
        nodes.push({
            id: p.id,
            layerId: 'product',
            level: layers.product.level,
            label: p.id + '\n' + p.createdAt,
            color: layers.product.color,
            properties: p
        });

        edges.push({ from: p.materialId, to: p.id });
        edges.push({ from: p.heatTreatId, to: p.id });
    });

    // Test piece nodes + edges
    sampleData.testPieces.forEach(function(tp) {
        var process = sampleData.processes.find(function(k) { return k.id === tp.processId; });
        nodes.push({
            id: tp.id,
            layerId: 'testPiece',
            level: layers.testPiece.level,
            label: tp.id + '\n' + (process ? process.category : ''),
            color: layers.testPiece.color,
            properties: Object.assign({}, tp, { processInfo: process })
        });

        edges.push({ from: tp.productId, to: tp.id });
    });

    // Analysis sample nodes + edges
    sampleData.analysisSamples.forEach(function(as) {
        nodes.push({
            id: as.id,
            layerId: 'analysisSample',
            level: layers.analysisSample.level,
            label: as.id + '\nHRC ' + as.hardness,
            color: layers.analysisSample.color,
            properties: as
        });

        edges.push({ from: as.testPieceId, to: as.id });
    });

    return { nodes: nodes, edges: edges, layers: layers };
}

// ========================================
// Express Setup
// ========================================

var app = express();
var PORT = process.env.PORT || 8000;

// Static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Root route
app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================================
// API Endpoints
// ========================================

// Health check
app.get('/health', function(req, res) {
    res.json({ 
        status: 'ok', 
        mode: 'sample-data',
        timestamp: new Date().toISOString()
    });
});

// Graph data
app.get('/api/nodes', function(req, res) {
    var graphData = buildGraphData();
    res.json(graphData);
});

// Layer info
app.get('/api/layers', function(req, res) {
    res.json(layers);
});

// Statistics
app.get('/api/stats', function(req, res) {
    res.json({
        materials: sampleData.materials.length,
        heatTreatments: sampleData.heatTreatments.length,
        products: sampleData.products.length,
        testPieces: sampleData.testPieces.length,
        analysisSamples: sampleData.analysisSamples.length
    });
});

// Individual data endpoints
app.get('/api/materials', function(req, res) { res.json(sampleData.materials); });
app.get('/api/heat-treatments', function(req, res) { res.json(sampleData.heatTreatments); });
app.get('/api/products', function(req, res) { res.json(sampleData.products); });
app.get('/api/test-pieces', function(req, res) { res.json(sampleData.testPieces); });
app.get('/api/analysis-samples', function(req, res) { res.json(sampleData.analysisSamples); });
app.get('/api/processes', function(req, res) { res.json(sampleData.processes); });

// Node detail
app.get('/api/node/:id', function(req, res) {
    var id = req.params.id;
    var found;
    
    found = sampleData.materials.find(function(m) { return m.id === id; });
    if (found) return res.json({ type: 'material', data: found });
    
    found = sampleData.heatTreatments.find(function(h) { return h.id === id; });
    if (found) return res.json({ type: 'heatTreatment', data: found });
    
    found = sampleData.products.find(function(p) { return p.id === id; });
    if (found) return res.json({ type: 'product', data: found });
    
    found = sampleData.testPieces.find(function(tp) { return tp.id === id; });
    if (found) {
        var process = sampleData.processes.find(function(k) { return k.id === found.processId; });
        var tensile = sampleData.tensileTests.find(function(t) { return t.testPieceId === id; });
        return res.json({ 
            type: 'testPiece', 
            data: Object.assign({}, found, { processInfo: process, tensileTest: tensile })
        });
    }
    
    found = sampleData.analysisSamples.find(function(as) { return as.id === id; });
    if (found) return res.json({ type: 'analysisSample', data: found });
    
    res.status(404).json({ error: 'Node not found' });
});

// Traceability (upstream/downstream) - Full layer support
app.get('/api/trace/:id', function(req, res) {
    var id = req.params.id;
    var visited = {};
    var upstream = [];
    var downstream = [];
    
    // Helper: find node type
    function getNodeType(nodeId) {
        if (sampleData.materials.find(function(m) { return m.id === nodeId; })) return 'material';
        if (sampleData.heatTreatments.find(function(h) { return h.id === nodeId; })) return 'heatTreatment';
        if (sampleData.products.find(function(p) { return p.id === nodeId; })) return 'product';
        if (sampleData.testPieces.find(function(tp) { return tp.id === nodeId; })) return 'testPiece';
        if (sampleData.analysisSamples.find(function(as) { return as.id === nodeId; })) return 'analysisSample';
        return null;
    }
    
    // Recursive upstream trace
    function traceUpstream(nodeId) {
        if (visited[nodeId]) return;
        visited[nodeId] = true;
        
        var nodeType = getNodeType(nodeId);
        
        if (nodeType === 'analysisSample') {
            var as = sampleData.analysisSamples.find(function(a) { return a.id === nodeId; });
            if (as && as.testPieceId) {
                upstream.push({ type: 'testPiece', id: as.testPieceId });
                traceUpstream(as.testPieceId);
            }
        }
        else if (nodeType === 'testPiece') {
            var tp = sampleData.testPieces.find(function(t) { return t.id === nodeId; });
            if (tp && tp.productId) {
                upstream.push({ type: 'product', id: tp.productId });
                traceUpstream(tp.productId);
            }
        }
        else if (nodeType === 'product') {
            var p = sampleData.products.find(function(pr) { return pr.id === nodeId; });
            if (p) {
                if (p.materialId) {
                    upstream.push({ type: 'material', id: p.materialId });
                }
                if (p.heatTreatId) {
                    upstream.push({ type: 'heatTreatment', id: p.heatTreatId });
                }
            }
        }
    }
    
    // Recursive downstream trace
    function traceDownstream(nodeId) {
        if (visited[nodeId]) return;
        visited[nodeId] = true;
        
        var nodeType = getNodeType(nodeId);
        
        if (nodeType === 'material') {
            // Find all products using this material
            sampleData.products.forEach(function(p) {
                if (p.materialId === nodeId) {
                    downstream.push({ type: 'product', id: p.id });
                    // Also add the heat treatment used
                    if (p.heatTreatId && !visited[p.heatTreatId]) {
                        downstream.push({ type: 'heatTreatment', id: p.heatTreatId });
                    }
                    traceDownstream(p.id);
                }
            });
        }
        else if (nodeType === 'heatTreatment') {
            // Find all products using this heat treatment
            sampleData.products.forEach(function(p) {
                if (p.heatTreatId === nodeId) {
                    downstream.push({ type: 'product', id: p.id });
                    // Also add the material used
                    if (p.materialId && !visited[p.materialId]) {
                        downstream.push({ type: 'material', id: p.materialId });
                    }
                    traceDownstream(p.id);
                }
            });
        }
        else if (nodeType === 'product') {
            // Find all test pieces from this product
            sampleData.testPieces.forEach(function(tp) {
                if (tp.productId === nodeId) {
                    downstream.push({ type: 'testPiece', id: tp.id });
                    traceDownstream(tp.id);
                }
            });
        }
        else if (nodeType === 'testPiece') {
            // Find all analysis samples from this test piece
            sampleData.analysisSamples.forEach(function(as) {
                if (as.testPieceId === nodeId) {
                    downstream.push({ type: 'analysisSample', id: as.id });
                }
            });
        }
    }
    
    // Start tracing
    visited = {};
    traceUpstream(id);
    
    visited = {};
    visited[id] = true; // Don't include starting node
    traceDownstream(id);
    
    // Remove duplicates
    var seen = {};
    upstream = upstream.filter(function(item) {
        var key = item.id;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
    
    seen = {};
    downstream = downstream.filter(function(item) {
        var key = item.id;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
    
    res.json({ upstream: upstream, downstream: downstream });
});

// Search filter
app.post('/api/search', function(req, res) {
    var layer = req.body.layer;
    var filters = req.body.filters;
    var results = [];
    
    switch (layer) {
        case 'material':
            results = sampleData.materials.filter(function(m) {
                if (filters.steelGrade && m.steelGrade.indexOf(filters.steelGrade) === -1) return false;
                if (filters.maker && m.maker.indexOf(filters.maker) === -1) return false;
                return true;
            });
            break;
        case 'heatTreatment':
            results = sampleData.heatTreatments.filter(function(h) {
                if (filters.method && h.quenchMethod !== filters.method) return false;
                return true;
            });
            break;
        default:
            results = [];
    }
    
    res.json(results);
});

// Start server
app.listen(PORT, function() {
    console.log('========================================');
    console.log('R&D Experiment Manager (Sample Data Mode)');
    console.log('Server running on port ' + PORT);
    console.log('Started at: ' + new Date().toISOString());
    console.log('Data: ' + sampleData.materials.length + ' materials, ' + sampleData.testPieces.length + ' test pieces');
    console.log('========================================');
});
