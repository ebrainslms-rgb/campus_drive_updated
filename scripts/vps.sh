#!/usr/bin/env bash
# EcoBrains LMS — standalone VPS deploy script (no Docker).
#
# Usage:
#   chmod +x scripts/vps.sh
#   sudo ./scripts/vps.sh setup          # one-time: install JDK, Maven, Node, MySQL
#   cp .env.example .env && nano .env
#   sudo ./scripts/vps.sh setup-db       # create MySQL database + user
#   sudo ./scripts/vps.sh deploy         # backend only (default)
#   sudo ./scripts/vps.sh deploy --with-nginx   # backend + nginx + frontend
#   sudo ./scripts/secure-nginx.sh               # harden nginx (headers, rate limits)
#   sudo ./scripts/secure-nginx.sh tls           # Let's Encrypt HTTPS (needs DNS)
#   sudo ./scripts/vps.sh update         # git pull + rebuild + restart
#   sudo ./scripts/vps.sh restart|stop|status|logs
#
#   ./scripts/vps.sh build [all|frontend|backend]   # build only (no sudo)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"
BACKEND_ENV_FILE="${PROJECT_ROOT}/backend.env"

SERVICE_NAME="${SERVICE_NAME:-ecobrains-lms-backend}"
WEB_ROOT="${WEB_ROOT:-/var/www/ecobrains-lms}"
BACKEND_PORT="${BACKEND_PORT:-8080}"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-ecobrains-lms}"
NGINX_SITE_PATH="/etc/nginx/sites-available/${NGINX_SITE_NAME}"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"

REQUIRED_ENV_VARS=(
  MYSQL_DATABASE MYSQL_USER MYSQL_PASSWORD
  ADMIN_USERNAME ADMIN_PASSWORD ADMIN_URL_KEY
  JWT_SECRET CORS_ALLOWED_ORIGINS
)

# ── Logging ────────────────────────────────────────────────────────────────

log_info()  { echo "[INFO]  $*"; }
log_warn()  { echo "[WARN]  $*"; }
log_error() { echo "[ERROR] $*" >&2; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    log_error "Run with sudo: sudo $0 $*"
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Required command not found: $1"
    exit 1
  fi
}

require_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    log_error "Missing ${ENV_FILE} — copy .env.example to .env first."
    exit 1
  fi
}

load_env() {
  require_env_file
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
  MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
  MYSQL_PORT="${MYSQL_PORT:-3306}"
  MYSQL_DATABASE="${MYSQL_DATABASE:-ecobrains_lms}"
  SERVER_NAME="${SERVER_NAME:-_}"
  WEB_ROOT="${WEB_ROOT:-/var/www/ecobrains-lms}"
  BACKEND_PORT="${BACKEND_PORT:-8080}"
  USE_NGINX="${USE_NGINX:-false}"
}

is_truthy() {
  case "${1,,}" in
    true|yes|1|on) return 0 ;;
    *) return 1 ;;
  esac
}

use_nginx_enabled() {
  is_truthy "${USE_NGINX:-false}"
}

# Parse --with-nginx / --no-nginx; returns remaining args via nameref.
parse_nginx_flags() {
  local -n _out=$1
  shift
  _out=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --with-nginx) USE_NGINX=true; shift ;;
      --no-nginx)   USE_NGINX=false; shift ;;
      *) _out+=("$1"); shift ;;
    esac
  done
}

validate_jwt_secret() {
  local secret="$1"
  secret="${secret//$'\r'/}"
  secret="${secret//$'\n'/}"
  secret="${secret// /}"

  if [[ "${secret}" == *change-me* ]] || [[ "${secret}" == *CHANGE* ]] || [[ "${secret}" == *your-* ]]; then
    log_error "JWT_SECRET is still a placeholder."
    log_error "Generate a valid key: openssl rand -base64 48"
    log_error "Then set JWT_SECRET in .env and redeploy."
    exit 1
  fi

  if [[ "${secret}" =~ [^A-Za-z0-9+/=] ]]; then
    log_error "JWT_SECRET must be valid Base64 (only A-Z, a-z, 0-9, +, /, =)."
    log_error "Hyphens and other characters are not allowed."
    log_error "Generate one with: openssl rand -base64 48"
    exit 1
  fi

  require_command openssl
  # openssl rand -base64 48 is exactly 64 chars. Without -A / a newline,
  # openssl base64 -d treats that block as incomplete and decodes 0 bytes.
  local decoded_len
  decoded_len="$(printf '%s\n' "${secret}" | openssl base64 -d -A 2>/dev/null | wc -c | tr -d '[:space:]')"
  if [[ -z "${decoded_len}" || "${decoded_len}" -lt 32 ]]; then
    log_error "JWT_SECRET must decode to at least 32 bytes (HS256 requirement)."
    log_error "Generate one with: openssl rand -base64 48"
    log_error "Put it on one line in .env, no spaces: JWT_SECRET=<paste>"
    exit 1
  fi
}

validate_env_vars() {
  load_env
  local missing=()
  for var in "${REQUIRED_ENV_VARS[@]}"; do
    [[ -z "${!var:-}" ]] && missing+=("${var}")
  done
  if ((${#missing[@]} > 0)); then
    log_error "Missing or empty in .env: ${missing[*]}"
    exit 1
  fi
  validate_jwt_secret "${JWT_SECRET}"
}

print_header() { log_info "Project root: ${PROJECT_ROOT}"; }

# ── Build ──────────────────────────────────────────────────────────────────

cmd_build() {
  local target="${1:-all}"
  print_header
  build_backend() {
    require_command mvn
    require_command java
    log_info "Building backend JAR ..."
    mvn -f "${PROJECT_ROOT}/backend/pom.xml" clean package -DskipTests
  }
  build_frontend() {
    require_command npm
    log_info "Building frontend ..."
    npm ci --prefix "${PROJECT_ROOT}/frontend"
    npm run build --prefix "${PROJECT_ROOT}/frontend"
  }
  case "${target}" in
    all)     build_backend; build_frontend ;;
    backend) build_backend ;;
    frontend) build_frontend ;;
    *) log_error "Unknown target: ${target}"; show_help; exit 1 ;;
  esac
  log_info "Build finished."
}

# ── Config writers ─────────────────────────────────────────────────────────

write_backend_env() {
  load_env
  local db_url="${SPRING_DATASOURCE_URL:-jdbc:mysql://${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}?useSSL=false&serverTimezone=Asia/Kolkata&allowPublicKeyRetrieval=true}"
  cat > "${BACKEND_ENV_FILE}" <<EOF
TZ=Asia/Kolkata
SERVER_PORT=${BACKEND_PORT}
SPRING_DATASOURCE_URL=${db_url}
SPRING_DATASOURCE_USERNAME=${SPRING_DATASOURCE_USERNAME:-${MYSQL_USER}}
SPRING_DATASOURCE_PASSWORD=${SPRING_DATASOURCE_PASSWORD:-${MYSQL_PASSWORD}}
SPRING_JPA_PROPERTIES_HIBERNATE_JDBC_TIME_ZONE=Asia/Kolkata
SPRING_JACKSON_TIME_ZONE=Asia/Kolkata
APP_ADMIN_USERNAME=${ADMIN_USERNAME}
APP_ADMIN_PASSWORD=${ADMIN_PASSWORD}
APP_ADMIN_URL_KEY=${ADMIN_URL_KEY}
APP_JWT_SECRET=${JWT_SECRET}
APP_CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}
EOF
  chmod 600 "${BACKEND_ENV_FILE}"
  log_info "Wrote ${BACKEND_ENV_FILE}"
}

install_systemd_service() {
  local run_user="${DEPLOY_USER:-${SUDO_USER:-root}}"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=EcoBrains LMS Backend (Spring Boot)
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=${run_user}
Group=${run_user}
WorkingDirectory=${PROJECT_ROOT}/backend
EnvironmentFile=${BACKEND_ENV_FILE}
ExecStart=/usr/bin/java -Duser.timezone=Asia/Kolkata -jar ${PROJECT_ROOT}/backend/target/lms-backend.jar
SuccessExitStatus=143
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ecobrains-lms-backend

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  log_info "Installed systemd service: ${SERVICE_NAME}"
}

install_nginx_site() {
  require_command nginx
  local hardener="${SCRIPT_DIR}/secure-nginx.sh"
  if [[ -f "${hardener}" ]]; then
    log_info "Writing Nginx site via scripts/secure-nginx.sh ..."
    bash "${hardener}" write-site
    return
  fi
  log_warn "scripts/secure-nginx.sh missing — installing a minimal HTTP site."
  cat > "${NGINX_SITE_PATH}" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT}/api/;
        proxy_http_version 1.1;
        client_max_body_size 15M;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF
  ln -sf "${NGINX_SITE_PATH}" "${NGINX_SITE_ENABLED}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  log_info "Installed Nginx site: ${NGINX_SITE_NAME}"
}

publish_frontend() {
  require_command rsync
  local owner="${DEPLOY_USER:-${SUDO_USER:-root}}"
  mkdir -p "${WEB_ROOT}"
  rsync -a --delete "${PROJECT_ROOT}/frontend/dist/" "${WEB_ROOT}/"
  chown -R "${owner}:${owner}" "${WEB_ROOT}"
  log_info "Published frontend to ${WEB_ROOT}"
}

wait_for_backend() {
  local url="http://127.0.0.1:${BACKEND_PORT}/api/admin/courses/public"
  log_info "Waiting for backend ..."
  for i in $(seq 1 60); do
    curl -fsS "${url}" >/dev/null 2>&1 && { log_info "Backend ready."; return 0; }
    sleep 5
  done
  log_error "Backend not ready."
  journalctl -u "${SERVICE_NAME}" -n 80 --no-pager || true
  return 1
}

wait_for_frontend() {
  local url="${1:-http://127.0.0.1/}"
  log_info "Waiting for frontend at ${url} ..."
  for i in $(seq 1 30); do
    curl -fsS "${url}" >/dev/null 2>&1 && { log_info "Frontend ready."; return 0; }
    sleep 2
  done
  log_error "Frontend not ready."
  return 1
}

deploy_nginx_stack() {
  install_nginx_site
  publish_frontend
  wait_for_frontend "http://127.0.0.1/"
}

reload_nginx_if_enabled() {
  use_nginx_enabled || return 0
  command -v nginx >/dev/null 2>&1 || { log_warn "Nginx not installed; skipping reload."; return 0; }
  nginx -t
  systemctl reload nginx
}

# ── Commands ───────────────────────────────────────────────────────────────

cmd_setup() {
  require_root
  print_header
  local deploy_user="${SUDO_USER:-root}"
  [[ "${deploy_user}" == "root" ]] && log_warn "Consider: sudo -u <user> $0 setup"

  apt-get update -y
  apt-get install -y ca-certificates curl git gnupg lsb-release ufw rsync
  apt-get install -y openjdk-21-jdk maven

  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi

  local with_nginx=false
  for arg in "$@"; do
    [[ "${arg}" == "--with-nginx" ]] && with_nginx=true
  done

  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y mysql-server
  systemctl enable --now mysql

  if [[ "${with_nginx}" == true ]]; then
    apt-get install -y nginx
    systemctl enable --now nginx
    ufw allow 80/tcp
    ufw allow 443/tcp
    mkdir -p "${WEB_ROOT}"
    [[ "${deploy_user}" != "root" ]] && chown -R "${deploy_user}:${deploy_user}" "${WEB_ROOT}"
  fi

  ufw allow OpenSSH
  ufw --force enable

  log_info "Setup complete. Next: cp .env.example .env && sudo $0 setup-db && sudo $0 deploy"
  [[ "${with_nginx}" == false ]] && log_info "Nginx was skipped. Use: sudo $0 setup --with-nginx  or  sudo $0 deploy --with-nginx"
}

mysql_ping() {
  mysql "$@" -e "SELECT 1" >/dev/null 2>&1
}

cmd_setup_db() {
  require_root
  print_header
  validate_env_vars
  require_command mysql

  if ! systemctl is-active --quiet mysql 2>/dev/null \
     && ! systemctl is-active --quiet mariadb 2>/dev/null \
     && ! systemctl is-active --quiet mysqld 2>/dev/null; then
    log_warn "MySQL/MariaDB is not running — trying to start it ..."
    systemctl start mysql 2>/dev/null || systemctl start mariadb 2>/dev/null || true
  fi

  local -a mysql_admin=()
  if mysql_ping --protocol=socket -uroot; then
    mysql_admin=(mysql --protocol=socket -uroot)
  elif mysql_ping -uroot; then
    mysql_admin=(mysql -uroot)
  elif [[ -n "${MYSQL_ROOT_PASSWORD:-}" ]] && mysql_ping -uroot -p"${MYSQL_ROOT_PASSWORD}"; then
    mysql_admin=(mysql -uroot -p"${MYSQL_ROOT_PASSWORD}")
  else
    log_error "Cannot log in as MySQL root (socket auth failed)."
    log_error "This is the MySQL server admin password, not MYSQL_PASSWORD (app user)."
    log_error "Set a root password, then put it in .env as MYSQL_ROOT_PASSWORD:"
    log_error "  sudo mysql"
    log_error "  ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'choose-a-strong-password';"
    log_error "  FLUSH PRIVILEGES;"
    log_error "If sudo mysql also fails, reset root from the VPS provider panel or:"
    log_error "  sudo journalctl -u mysql -n 30 --no-pager"
    exit 1
  fi

  log_info "Creating database and user ..."
  "${mysql_admin[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
ALTER USER '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
  log_info "Database '${MYSQL_DATABASE}' ready."
}

cmd_deploy() {
  require_root
  print_header
  validate_env_vars
  local -a extra=()
  parse_nginx_flags extra "$@"
  export DEPLOY_USER="${SUDO_USER:-root}"

  cmd_build all
  write_backend_env
  install_systemd_service

  if use_nginx_enabled; then
    log_info "Nginx enabled — configuring site and publishing frontend ..."
    deploy_nginx_stack
  else
    log_info "Nginx disabled — deploying backend only (USE_NGINX=false)."
  fi

  systemctl restart "${SERVICE_NAME}"
  wait_for_backend

  systemctl status "${SERVICE_NAME}" --no-pager -l || true
  echo
  if use_nginx_enabled; then
    log_info "Deployed. Student: http://<vps-ip>/  Admin: http://<vps-ip>/${ADMIN_URL_KEY}/admin"
  else
    log_info "Backend deployed on port ${BACKEND_PORT}."
    log_info "Enable Nginx: set USE_NGINX=true in .env or run: sudo $0 deploy --with-nginx"
  fi
}

cmd_update() {
  require_root
  print_header
  validate_env_vars
  export DEPLOY_USER="${SUDO_USER:-root}"

  local -a args=()
  parse_nginx_flags args "$@"

  local target="all" pull=true
  for arg in "${args[@]}"; do
    case "${arg}" in
      all|frontend|backend) target="${arg}" ;;
      --no-pull) pull=false ;;
      *) log_error "Unknown: ${arg}"; show_help; exit 1 ;;
    esac
  done

  [[ "${pull}" == true ]] && { log_info "git pull ..."; git -C "${PROJECT_ROOT}" pull --ff-only; }
  cmd_build "${target}"
  write_backend_env

  case "${target}" in
    all|backend) systemctl restart "${SERVICE_NAME}"; wait_for_backend ;;
  esac
  case "${target}" in
    all|frontend)
      if use_nginx_enabled; then
        publish_frontend
        reload_nginx_if_enabled
        wait_for_frontend "http://127.0.0.1/"
      elif [[ "${target}" == "frontend" ]]; then
        log_warn "Frontend built but not published (USE_NGINX=false). Run with --with-nginx to publish."
      fi
      ;;
  esac
  log_info "Update finished."
}

cmd_restart() {
  require_root
  print_header
  load_env 2>/dev/null || true
  local -a extra=()
  parse_nginx_flags extra "$@"

  systemctl restart "${SERVICE_NAME}"
  reload_nginx_if_enabled
  systemctl status "${SERVICE_NAME}" --no-pager -l || true
}

cmd_stop() {
  require_root
  print_header
  systemctl stop "${SERVICE_NAME}"
  log_info "Backend stopped."
}

cmd_status() {
  print_header
  load_env 2>/dev/null || true
  echo
  for svc in "${SERVICE_NAME}" nginx mysql; do
    systemctl is-active "${svc}" >/dev/null 2>&1 && echo "  ${svc}: active" || echo "  ${svc}: inactive"
  done
  echo
  if use_nginx_enabled; then
    curl -fsS -o /dev/null "http://127.0.0.1/" 2>/dev/null \
      && echo "  frontend (nginx :80): OK" || echo "  frontend (nginx :80): FAIL"
  else
    echo "  frontend (nginx): skipped (USE_NGINX=false)"
  fi
  curl -fsS -o /dev/null "http://127.0.0.1:${BACKEND_PORT}/api/admin/courses/public" 2>/dev/null \
    && echo "  backend (:${BACKEND_PORT}): OK" || echo "  backend (:${BACKEND_PORT}): FAIL"
}

cmd_logs() {
  local target="backend" follow=false lines=100
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -f|--follow) follow=true; shift ;;
      --tail=*) lines="${1#*=}"; shift ;;
      backend|nginx) target="$1"; shift ;;
      *) log_error "Unknown: $1"; show_help; exit 1 ;;
    esac
  done
  print_header
  if [[ "${target}" == "backend" ]]; then
    [[ "${follow}" == true ]] \
      && journalctl -u "${SERVICE_NAME}" -n "${lines}" -f \
      || journalctl -u "${SERVICE_NAME}" -n "${lines}" --no-pager
  else
    [[ "${follow}" == true ]] \
      && tail -n "${lines}" -f /var/log/nginx/access.log /var/log/nginx/error.log \
      || tail -n "${lines}" /var/log/nginx/access.log /var/log/nginx/error.log
  fi
}

show_help() {
  cat <<EOF
EcoBrains LMS — VPS deployment (standalone, no Docker)

Usage: $0 <command> [options]

Commands:
  setup              Install JDK 21, Maven, Node 20, MySQL (sudo)
                     Options: --with-nginx (also install Nginx)
  setup-db           Create MySQL database and user from .env (sudo)
  deploy             Build and start backend via systemd (sudo)
                     Options: --with-nginx | --no-nginx
                     Or set USE_NGINX=true in .env
  build [target]     Build only: all | frontend | backend
  update [target]    git pull + rebuild + restart (sudo)
                     Options: --no-pull, --with-nginx, --no-nginx
  restart            Restart backend; reload nginx if enabled (sudo)
  stop               Stop backend (sudo)
  status             Service status + health checks
  logs [target]      View logs: backend (default) | nginx
                     Options: -f, --tail=N

Harden Nginx (TLS, headers, rate limits):
  sudo ./scripts/secure-nginx.sh
  sudo ./scripts/secure-nginx.sh tls     # after SERVER_NAME DNS + CERTBOT_EMAIL

First-time VPS setup (backend only):
  sudo $0 setup
  cp .env.example .env && nano .env
  sudo $0 setup-db
  sudo $0 deploy

With Nginx reverse proxy:
  sudo $0 setup --with-nginx
  cp .env.example .env   # set USE_NGINX=true
  sudo $0 setup-db
  sudo $0 deploy --with-nginx
EOF
}

# ── Main ───────────────────────────────────────────────────────────────────

main() {
  local cmd="${1:-help}"
  shift || true
  case "${cmd}" in
    setup)     cmd_setup "$@" ;;
    setup-db)  cmd_setup_db "$@" ;;
    build)     cmd_build "$@" ;;
    deploy)    cmd_deploy "$@" ;;
    update)    cmd_update "$@" ;;
    restart)   cmd_restart "$@" ;;
    stop)      cmd_stop "$@" ;;
    status)    cmd_status "$@" ;;
    logs)      cmd_logs "$@" ;;
    help|-h|--help) show_help ;;
    *) log_error "Unknown command: ${cmd}"; show_help; exit 1 ;;
  esac
}

main "$@"

