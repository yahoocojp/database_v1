#!/bin/bash
# Start both Node.js and Python ML services

echo "Starting services..."

# Kill existing processes
pkill -f "node app.js" 2>/dev/null
pkill -f "python.*ml_service/app.py" 2>/dev/null
sleep 1

# Start Python ML Service
echo "Starting Python ML Service on port 5000..."
cd /workspaces/database_v1/ml_service
python app.py &
ML_PID=$!
cd /workspaces/database_v1

# Wait for ML service to start
sleep 3

# Start Node.js
echo "Starting Node.js on port 8000..."
node app.js &
NODE_PID=$!

echo ""
echo "========================================"
echo "Services started:"
echo "  Node.js (port 8000): PID $NODE_PID"
echo "  Python ML (port 5000): PID $ML_PID"
echo ""
echo "To stop: pkill -f 'node app.js'; pkill -f 'python.*app.py'"
echo "========================================"

# Wait for both
wait
