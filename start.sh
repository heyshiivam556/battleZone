#!/usr/bin/env bash
# BattleZone 🎮 — Unix/Mac/Linux Launcher

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}${BOLD}"
echo "  ██████╗  █████╗ ████████╗████████╗██╗     ███████╗███████╗ ██████╗ ███╗   ██╗███████╗"
echo "  ██╔══██╗██╔══██╗╚══██╔══╝╚══██╔══╝██║     ██╔════╝╚══███╔╝██╔═══██╗████╗  ██║██╔════╝"
echo "  ██████╔╝███████║   ██║      ██║   ██║     █████╗    ███╔╝ ██║   ██║██╔██╗ ██║█████╗  "
echo "  ██╔══██╗██╔══██║   ██║      ██║   ██║     ██╔══╝   ███╔╝  ██║   ██║██║╚██╗██║██╔══╝  "
echo "  ██████╔╝██║  ██║   ██║      ██║   ███████╗███████╗███████╗╚██████╔╝██║ ╚████║███████╗"
echo "  ╚═════╝ ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚══════╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Cross-platform 2D Multiplayer Top-Down Shooter${NC}"
echo "  ================================================"
echo ""

# Get script directory (works even if called from elsewhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check Node.js
if ! command -v node &>/dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed or not in PATH.${NC}"
    echo "  Install from https://nodejs.org/ and try again."
    exit 1
fi

echo -e "${GREEN}[1/2] Starting game server on http://localhost:3001 ...${NC}"

# Start server in background
(
    cd "$SCRIPT_DIR/server"
    npm install --silent
    node index.js
) &
SERVER_PID=$!

echo "  Server PID: $SERVER_PID"

# Wait briefly for the server to initialize
sleep 2

echo -e "${GREEN}[2/2] Opening game client ...${NC}"
echo ""

CLIENT_PATH="$SCRIPT_DIR/client/index.html"

# Try to serve with npx serve if available, otherwise open file directly
if command -v npx &>/dev/null; then
    echo -e "${YELLOW}  Serving client on http://localhost:8080 (PWA mode)${NC}"
    echo ""
    echo "  ============================================================"
    echo "   BattleZone is launching!"
    echo ""
    echo "   Server : http://localhost:3001"
    echo "   Client : http://localhost:8080"
    echo ""
    echo "   Open http://localhost:8080 in your browser to play."
    echo "   Share your 4-letter room code with friends!"
    echo "  ============================================================"
    echo ""
    # Open browser in background, then serve
    sleep 1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "http://localhost:8080" &
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open "http://localhost:8080" &>/dev/null &
    fi
    npx serve "$SCRIPT_DIR/client" -p 8080
else
    # Fallback: open file directly
    echo -e "${YELLOW}  Opening client/index.html directly in browser${NC}"
    echo "  (Install npx for full PWA support: npm install -g npx)"
    echo ""
    echo "  ============================================================"
    echo "   BattleZone is launching!"
    echo ""
    echo "   Server : http://localhost:3001"
    echo "   Client : $CLIENT_PATH"
    echo ""
    echo "   Share your 4-letter room code with friends!"
    echo "  ============================================================"
    echo ""

    if [[ "$OSTYPE" == "darwin"* ]]; then
        open "$CLIENT_PATH"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        xdg-open "$CLIENT_PATH" &>/dev/null &
    else
        echo "  Please open $CLIENT_PATH manually in your browser."
    fi

    # Keep script alive so server keeps running
    echo "  Press Ctrl+C to stop the server."
    wait $SERVER_PID
fi
