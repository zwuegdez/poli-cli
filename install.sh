#!/usr/bin/env bash
# ==============================================================================
# Poli-CLI Installer
# Install via:
#   curl -fsSL https://poliai.qzz.io/poli-cli/install.sh | sh
#   or: curl https://poliai.qzz.io/poli-cli/install.sh | sh
# ==============================================================================

set -e

RESET="\033[0m"
BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
MAGENTA="\033[35m"
DIM="\033[2m"

INSTALL_DIR="${POLI_INSTALL_DIR:-$HOME/.poli-cli}"
REPO_URL="https://github.com/zwuegdez/poli-cli.git"
BIN_NAME="poli"

echo ""
echo -e "${BOLD}${CYAN}╭────────────────────────────────────────────────────────╮${RESET}"
echo -e "${BOLD}${CYAN}│${RESET}  ${BOLD}${CYAN}✦ POLI${RESET}${BOLD}${MAGENTA}-CLI${RESET} ${DIM}Installer (poliai.qzz.io)${RESET}               ${BOLD}${CYAN}│${RESET}"
echo -e "${BOLD}${CYAN}│${RESET}  ${DIM}Next-generation Agentic AI Coding CLI (command: poli) ${RESET}${BOLD}${CYAN}│${RESET}"
echo -e "${BOLD}${CYAN}╰────────────────────────────────────────────────────────╯${RESET}"
echo ""

# 1. Check prerequisites
echo -e "${CYAN}•${RESET} Checking system dependencies..."

if ! command -v git >/dev/null 2>&1; then
  echo -e "${RED}✖ Error: 'git' is not installed. Please install git first.${RESET}"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}✖ Error: 'node' (Node.js) is not installed.${RESET}"
  echo -e "  Please install Node.js 18+ from https://nodejs.org or run:"
  echo -e "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${YELLOW}⚠ Warning: Node.js version $(node -v) detected. Node.js 18+ is recommended.${RESET}"
fi

echo -e "${GREEN}✔${RESET} Git and Node.js ($(node -v)) detected."

# 2. Clone or update repository
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${CYAN}•${RESET} Existing installation found at ${DIM}$INSTALL_DIR${RESET}. Updating..."
  cd "$INSTALL_DIR"
  git fetch --quiet origin main || true
  git reset --quiet --hard origin/main || true
else
  echo -e "${CYAN}•${RESET} Cloning poli-cli into ${DIM}$INSTALL_DIR${RESET}..."
  mkdir -p "$INSTALL_DIR"
  git clone --quiet --depth 1 "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo -e "${CYAN}•${RESET} Installing runtime dependencies..."
npm install --omit=dev --silent

chmod +x bin/poli.js

# 3. Create global symlinks (poli and poli-cli)
echo -e "${CYAN}•${RESET} Configuring binary symlinks..."

TARGET_DIR="/usr/local/bin"

if [ -w "$TARGET_DIR" ]; then
  ln -sf "$INSTALL_DIR/bin/poli.js" "$TARGET_DIR/poli"
  ln -sf "$INSTALL_DIR/bin/poli.js" "$TARGET_DIR/poli-cli"
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  sudo ln -sf "$INSTALL_DIR/bin/poli.js" "$TARGET_DIR/poli"
  sudo ln -sf "$INSTALL_DIR/bin/poli.js" "$TARGET_DIR/poli-cli"
else
  # Fallback to ~/.local/bin
  TARGET_DIR="$HOME/.local/bin"
  mkdir -p "$TARGET_DIR"
  ln -sf "$INSTALL_DIR/bin/poli.js" "$TARGET_DIR/poli"
  ln -sf "$INSTALL_DIR/bin/poli.js" "$TARGET_DIR/poli-cli"

  # Ensure ~/.local/bin is in PATH
  if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    SHELL_PROFILE=""
    if [ -f "$HOME/.bashrc" ]; then
      SHELL_PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
      SHELL_PROFILE="$HOME/.zshrc"
    elif [ -f "$HOME/.profile" ]; then
      SHELL_PROFILE="$HOME/.profile"
    fi

    if [ -n "$SHELL_PROFILE" ]; then
      echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_PROFILE"
      echo -e "${DIM}Added $TARGET_DIR to PATH in $SHELL_PROFILE${RESET}"
    fi
    export PATH="$HOME/.local/bin:$PATH"
  fi
fi

echo -e "${GREEN}✔${RESET} Symlinked binary to ${BOLD}$TARGET_DIR/poli${RESET} and ${BOLD}$TARGET_DIR/poli-cli${RESET}"

# 4. Verify installation
echo ""
if command -v poli >/dev/null 2>&1; then
  INSTALLED_VER=$(poli --version 2>/dev/null || echo "1.0.0")
  echo -e "${GREEN}✔ Installation successful!${RESET} ${BOLD}${INSTALLED_VER}${RESET}"
else
  echo -e "${GREEN}✔ Installation complete!${RESET}"
  echo -e "${YELLOW}Note: You may need to reload your terminal or run: export PATH=\"$TARGET_DIR:\$PATH\"${RESET}"
fi

echo ""
echo -e "${BOLD}${CYAN}Getting Started:${RESET}"
echo -e "  ${BOLD}poli${RESET}                      Launch interactive AI coding session"
echo -e "  ${BOLD}poli \"your task\"${RESET}         Execute a one-shot coding task"
echo -e "  ${BOLD}poli status${RESET}               Verify connection and model status"
echo -e "  ${BOLD}poli models${RESET}               List available LLM models"
echo ""
echo -e "${DIM}Installed at: $INSTALL_DIR${RESET}"
echo ""
