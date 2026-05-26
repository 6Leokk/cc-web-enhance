#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO_URL="https://github.com/6Leokk/cc-web-enhance.git"
DEFAULT_BRANCH="main"
DEFAULT_INSTALL_DIR="/opt/cc-web-enhance"
GITHUB_PROXY_BASE="https://gh-proxy.com/"

REPO_URL="${CC_WEB_REPO_URL:-$DEFAULT_REPO_URL}"
BRANCH="${CC_WEB_BRANCH:-$DEFAULT_BRANCH}"
INSTALL_DIR="${CC_WEB_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
START_AFTER_INSTALL=0
WITH_FRP=0
NO_RESET=0

usage() {
  cat <<'EOF'
Usage: install-cn.sh [options]

Options:
  --start                 Start cc-web after installation
  --with-frp              Download and generate built-in frp config during setup
  --no-reset              Keep existing node_modules and frp download cache
  --branch <name>         Git branch to install, default: main
  --repo <url>            Git repository URL
  --install-dir <path>    Installation directory, default: /opt/cc-web-enhance
  -h, --help              Show this help

Environment overrides:
  CC_WEB_INSTALL_DIR      Installation directory
  CC_WEB_BRANCH           Git branch
  CC_WEB_REPO_URL         Git repository URL
EOF
}

need_value() {
  local option="$1"
  local value="${2:-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    echo "[install-cn] $option requires a value" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --start)
      START_AFTER_INSTALL=1
      shift
      ;;
    --with-frp)
      WITH_FRP=1
      shift
      ;;
    --no-reset)
      NO_RESET=1
      shift
      ;;
    --branch)
      need_value "$1" "${2:-}"
      BRANCH="$2"
      shift 2
      ;;
    --branch=*)
      BRANCH="${1#--branch=}"
      shift
      ;;
    --repo)
      need_value "$1" "${2:-}"
      REPO_URL="$2"
      shift 2
      ;;
    --repo=*)
      REPO_URL="${1#--repo=}"
      shift
      ;;
    --install-dir)
      need_value "$1" "${2:-}"
      INSTALL_DIR="$2"
      shift 2
      ;;
    --install-dir=*)
      INSTALL_DIR="${1#--install-dir=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[install-cn] Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[install-cn] Missing required command: $command_name" >&2
    echo "[install-cn] Install Node.js >= 18, npm, and git first, then rerun this script." >&2
    exit 1
  fi
}

require_node_version() {
  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [[ "$major" -lt 18 ]]; then
    echo "[install-cn] Node.js >= 18 is required. Current version: $(node -v)" >&2
    exit 1
  fi
}

ensure_install_parent() {
  local parent
  parent="$(dirname "$INSTALL_DIR")"
  if [[ ! -d "$parent" ]]; then
    mkdir -p "$parent" 2>/dev/null || {
      echo "[install-cn] Cannot create parent directory: $parent" >&2
      echo "[install-cn] Rerun as a user with permission or set CC_WEB_INSTALL_DIR=/path/to/cc-web-enhance." >&2
      exit 1
    }
  fi
}

proxy_git_url() {
  local url="$1"
  if [[ "$url" == https://github.com/* ]]; then
    echo "${GITHUB_PROXY_BASE}${url}"
  else
    echo "$url"
  fi
}

try_git() {
  git "$@" 2>/dev/null
}

install_or_update_repo() {
  local proxy_repo proxy_insteadof

  proxy_repo="$(proxy_git_url "$REPO_URL")"
  proxy_insteadof="url.${GITHUB_PROXY_BASE}https://github.com/.insteadOf=https://github.com/"

  if [[ ! -e "$INSTALL_DIR" ]]; then
    echo "[install-cn] Cloning $REPO_URL#$BRANCH into $INSTALL_DIR"

    if ! try_git clone --branch "$BRANCH" "$proxy_repo" "$INSTALL_DIR"; then
      echo "[install-cn] Proxy clone failed, cleaning up partial directory..."
      rm -rf "$INSTALL_DIR"
      echo "[install-cn] Retrying direct..."
      if ! try_git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"; then
        echo "[install-cn] Git clone failed both via proxy and direct. Check your network." >&2
        exit 1
      fi
    fi

    git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL"
    return
  fi

  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    echo "[install-cn] Refusing to use $INSTALL_DIR because it is not a git checkout." >&2
    echo "[install-cn] Choose another directory with CC_WEB_INSTALL_DIR or move the existing path aside." >&2
    exit 1
  fi

  echo "[install-cn] Updating existing checkout in $INSTALL_DIR"
  git -C "$INSTALL_DIR" remote set-url origin "$REPO_URL"

  echo "[install-cn] Git fetch (via proxy)..."
  if ! try_git -C "$INSTALL_DIR" -c "$proxy_insteadof" fetch origin "$BRANCH"; then
    echo "[install-cn] Proxy fetch failed, retrying direct..."
    if ! try_git -C "$INSTALL_DIR" fetch origin "$BRANCH"; then
      echo "[install-cn] Git fetch failed both via proxy and direct. Check your network." >&2
      exit 1
    fi
  fi

  if git -C "$INSTALL_DIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git -C "$INSTALL_DIR" checkout "$BRANCH"
  else
    git -C "$INSTALL_DIR" checkout --track "origin/$BRANCH"
  fi

  echo "[install-cn] Git pull --ff-only (via proxy)..."
  if ! try_git -C "$INSTALL_DIR" -c "$proxy_insteadof" pull --ff-only origin "$BRANCH"; then
    echo "[install-cn] Proxy pull failed, retrying direct..."
    if ! try_git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"; then
      echo "[install-cn] Branch diverged from remote (likely rebase). Resetting to match origin..."
      git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
    fi
  fi
}

prepare_env_file() {
  if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    if [[ -f "$INSTALL_DIR/.env.example" ]]; then
      cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
      echo "[install-cn] Created .env from .env.example"
    else
      echo "[install-cn] Warning: .env.example not found; skipping .env creation"
    fi
  else
    echo "[install-cn] Keeping existing .env"
  fi
}

run_deploy() {
  local args=(--no-reset)
  if [[ "$WITH_FRP" -eq 1 ]]; then
    args+=(--with-frp)
  fi
  if [[ "$START_AFTER_INSTALL" -eq 1 ]]; then
    args+=(--start)
  fi

  echo "[install-cn] Running mainland deployment preset"
  (cd "$INSTALL_DIR" && bash scripts/deploy/linux-cn.sh "${args[@]}")
}

main() {
  require_command git
  require_command node
  require_command npm
  require_node_version
  ensure_install_parent
  install_or_update_repo
  prepare_env_file
  run_deploy

  if [[ "$START_AFTER_INSTALL" -ne 1 ]]; then
    echo
    echo "[install-cn] Installed to: $INSTALL_DIR"
    echo "[install-cn] Start later with:"
    echo "  cd $INSTALL_DIR && npm start"
  fi
}

main
