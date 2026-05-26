#!/usr/bin/env bash
# cc-web-enhance install-cn.sh v2
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
RECONFIGURE=0
NGROK_TOKEN="${NGROK_AUTHTOKEN:-}"
NGROK_DOMAIN="${NGROK_DOMAIN:-}"
NGROK_BASIC_AUTH="${NGROK_BASIC_AUTH:-}"
CC_PASSWORD="${CC_WEB_PASSWORD:-}"

usage() {
  cat <<'EOF'
Usage: install-cn.sh [options]

Options:
  --start                 Start cc-web after installation
  --with-frp              Download and generate built-in frp config during setup
  --token <token>         ngrok authtoken (implies ngrok access mode)
  --domain <domain>       ngrok reserved domain (optional)
  --basic-auth <user:pass> ngrok basic auth (optional)
  --password <pw>         cc-web login password (empty = auto-generate)
  --reconfigure           Force re-running the setup wizard
  --no-reset              Keep existing node_modules and frp download cache
  --branch <name>         Git branch to install, default: main
  --repo <url>            Git repository URL
  --install-dir <path>    Installation directory, default: /opt/cc-web-enhance
  -h, --help              Show this help

Environment overrides:
  CC_WEB_INSTALL_DIR      Installation directory
  CC_WEB_BRANCH           Git branch
  CC_WEB_REPO_URL         Git repository URL
  NGROK_AUTHTOKEN         ngrok authtoken (alternative to --token)
  NGROK_DOMAIN            ngrok domain (alternative to --domain)
  NGROK_BASIC_AUTH        ngrok basic auth (alternative to --basic-auth)
  CC_WEB_PASSWORD         cc-web login password (alternative to --password)
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
    --reconfigure)
      RECONFIGURE=1
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
    --token)
      need_value "$1" "${2:-}"
      NGROK_TOKEN="$2"
      shift 2
      ;;
    --token=*)
      NGROK_TOKEN="${1#--token=}"
      shift
      ;;
    --domain)
      need_value "$1" "${2:-}"
      NGROK_DOMAIN="$2"
      shift 2
      ;;
    --domain=*)
      NGROK_DOMAIN="${1#--domain=}"
      shift
      ;;
    --basic-auth)
      need_value "$1" "${2:-}"
      NGROK_BASIC_AUTH="$2"
      shift 2
      ;;
    --basic-auth=*)
      NGROK_BASIC_AUTH="${1#--basic-auth=}"
      shift
      ;;
    --password)
      need_value "$1" "${2:-}"
      CC_PASSWORD="$2"
      shift 2
      ;;
    --password=*)
      CC_PASSWORD="${1#--password=}"
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
      echo "[install-cn] Branch diverged from remote or has local changes that prevent a fast-forward update." >&2
      echo "[install-cn] Please resolve the checkout manually, or reinstall into a fresh directory." >&2
      exit 1
    fi
  fi
}

prepare_env_file() {
  local env_path="$INSTALL_DIR/.env"
  if [[ ! -f "$env_path" ]]; then
    if [[ -f "$INSTALL_DIR/.env.example" ]]; then
      cp "$INSTALL_DIR/.env.example" "$env_path"
      echo "[install-cn] Created .env from .env.example"
    else
      echo "[install-cn] Warning: .env.example not found; skipping .env creation"
    fi
  else
    echo "[install-cn] Keeping existing .env"
  fi

  # Inject ngrok config if --token was provided
  if [[ -n "$NGROK_TOKEN" ]]; then
    echo "[install-cn] Configuring ngrok access mode"
    set_env_value "$env_path" CC_WEB_ACCESS_MODE ngrok
    set_env_value "$env_path" CC_WEB_HOST 127.0.0.1
    set_env_value "$env_path" NGROK_AUTHTOKEN "$NGROK_TOKEN"
    [[ -n "$NGROK_DOMAIN" ]] && set_env_value "$env_path" NGROK_DOMAIN "$NGROK_DOMAIN"
    [[ -n "$NGROK_BASIC_AUTH" ]] && set_env_value "$env_path" NGROK_BASIC_AUTH "$NGROK_BASIC_AUTH"
    set_env_value "$env_path" NGROK_AUTO_START 1
  fi

  # Inject password if provided (empty = auto-generate by server)
  if [[ -n "$CC_PASSWORD" ]]; then
    echo "[install-cn] Setting cc-web login password"
    set_env_value "$env_path" CC_WEB_PASSWORD "$CC_PASSWORD"
  fi
}

# Set or update a KEY=VALUE line in an env file (idempotent).
# Uses pure bash, no sed — works on both Linux and macOS.
set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    local temp_file
    temp_file="$(mktemp)"
    while IFS='' read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^"${key}"=.* ]]; then
        echo "${key}=${value}"
      else
        echo "$line"
      fi
    done < "$file" > "$temp_file"
    mv "$temp_file" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

run_deploy() {
  local args=(--no-reset)
  if [[ "$RECONFIGURE" -eq 1 ]]; then
    args+=(--reconfigure)
  fi
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
