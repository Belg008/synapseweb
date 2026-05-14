#!/usr/bin/env bash
set -euo pipefail

# Setup script for SynapseWeb (install system venv support, create virtualenv, install deps)
# Run with sudo from the synapseweb directory: 
#   chmod +x setup.sh && sudo ./setup.sh

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is not installed. Install Python 3 and retry." >&2
  exit 1
fi

# Install python3-venv if missing (Debian/Ubuntu)
if ! python3 -m venv --help >/dev/null 2>&1; then
  echo "python3-venv seems missing. Installing system package..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y python3-venv
fi

# Create virtualenv
cd "$(dirname "$0")"
if [ -d "venv" ]; then
  echo "Using existing venv/ directory"
else
  python3 -m venv venv
fi

# Activate and install Python packages
. ./venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install fastapi "uvicorn[standard]"

cat <<'EOF'

Setup complete.
Start the server with:
  ./venv/bin/uvicorn synapseweb.api_server:app --host 0.0.0.0 --port 8765

If you want it to run in background, use screen, tmux or a systemd service.
EOF
