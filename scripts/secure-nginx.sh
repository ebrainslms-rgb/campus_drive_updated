#!/usr/bin/env bash
# EcoBrains LMS — harden the host Nginx (Debian/Ubuntu).
#
# Applies Mozilla-style TLS, security headers, rate limits on login,
# hidden-file denial, and optional Let's Encrypt certificates.
#
# Usage:
#   sudo ./scripts/secure-nginx.sh              # snippets + hardened site + reload
#   sudo ./scripts/secure-nginx.sh apply
#   sudo ./scripts/secure-nginx.sh write-site   # used by vps.sh deploy (no extra apt)
#   sudo ./scripts/secure-nginx.sh tls          # Let's Encrypt + HTTPS redirect
#   sudo ./scripts/secure-nginx.sh status       # headers / TLS / cert check
#   sudo ./scripts/secure-nginx.sh --dry-run    # print planned actions
#
# Requires: nginx already installed (sudo ./scripts/vps.sh setup --with-nginx)
# TLS needs a real domain in SERVER_NAME and CERTBOT_EMAIL in .env.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

NGINX_SITE_NAME="${NGINX_SITE_NAME:-ecobrains-lms}"
NGINX_SITE_PATH="/etc/nginx/sites-available/${NGINX_SITE_NAME}"
NGINX_SITE_ENABLED="/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
SECURITY_CONF="/etc/nginx/conf.d/00-security.conf"
HEADERS_SNIPPET="/etc/nginx/snippets/security-headers.conf"
SSL_SNIPPET="/etc/nginx/snippets/ssl-params.conf"
PROXY_SNIPPET="/etc/nginx/snippets/proxy-params.conf"
SITE_TUNE_SNIPPET="/etc/nginx/snippets/site-tuning.conf"
DHPARAM_FILE="/etc/nginx/dhparam.pem"
RENEW_HOOK="/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"

DRY_RUN=false

log_info()  { echo "[INFO]  $*"; }
log_warn()  { echo "[WARN]  $*"; }
log_error() { echo "[ERROR] $*" >&2; }

require_root() {
  if [[ "${DRY_RUN}" == true ]]; then
    return 0
  fi
  if [[ "${EUID}" -ne 0 ]]; then
    log_error "Run with sudo: sudo $0 $*"
    exit 1
  fi
}

require_command() {
  if [[ "${DRY_RUN}" == true ]]; then
    return 0
  fi
  if ! command -v "$1" >/dev/null 2>&1; then
    log_error "Required command not found: $1"
    exit 1
  fi
}

load_env() {
  if [[ -f "${ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a
  else
    log_warn "No ${ENV_FILE} — using defaults. Copy .env.example to .env for production values."
  fi
  SERVER_NAME="${SERVER_NAME:-_}"
  WEB_ROOT="${WEB_ROOT:-/var/www/ecobrains-lms}"
  BACKEND_PORT="${BACKEND_PORT:-8080}"
  CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
}

tls_cert_dir() {
  echo "/etc/letsencrypt/live/${SERVER_NAME}"
}

tls_ready() {
  local dir
  dir="$(tls_cert_dir)"
  [[ "${SERVER_NAME}" != "_" && -f "${dir}/fullchain.pem" && -f "${dir}/privkey.pem" ]]
}

server_name_is_public() {
  local name="${SERVER_NAME}"
  [[ -n "${name}" && "${name}" != "_" ]] || return 1
  # Reject raw IPv4 — Let's Encrypt needs a DNS name.
  [[ "${name}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && return 1
  return 0
}

write_file() {
  local dest="$1"
  local content="$2"
  if [[ "${DRY_RUN}" == true ]]; then
    log_info "[dry-run] would write ${dest}"
    return 0
  fi
  mkdir -p "$(dirname "${dest}")"
  printf '%s' "${content}" > "${dest}"
  chmod 644 "${dest}"
  log_info "Wrote ${dest}"
}

backup_site() {
  if [[ "${DRY_RUN}" == true ]]; then
    return 0
  fi
  if [[ -f "${NGINX_SITE_PATH}" ]]; then
    local bak="${NGINX_SITE_PATH}.bak.$(date +%Y%m%d%H%M%S)"
    cp -a "${NGINX_SITE_PATH}" "${bak}"
    log_info "Backed up existing site to ${bak}"
  fi
}

# ── Snippets (http / server context) ───────────────────────────────────────

security_conf_content() {
  # Only directives that MUST live in http {}. gzip / keepalive / server_tokens
  # already appear in Debian/Ubuntu nginx.conf — repeating them here is [emerg].
  cat <<'EOF'
# Written by scripts/secure-nginx.sh — http-context only (zones + maps).

# Per-IP throttles. Rates are generous because a whole lab often shares one
# public NAT IP. Tight enough to slow password stuffing, not exam auto-save.
limit_req_zone $binary_remote_addr zone=login:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=api:10m rate=50r/s;
limit_conn_zone $binary_remote_addr zone=perip:10m;
limit_req_status 429;
limit_conn_status 429;

map $request_method $bad_method {
    default 1;
    GET     0;
    HEAD    0;
    POST    0;
    PUT     0;
    PATCH   0;
    DELETE  0;
    OPTIONS 0;
}
EOF
}

site_tune_snippet_content() {
  cat <<'EOF'
# Written by scripts/secure-nginx.sh — include inside server {}.
# Server context overrides nginx.conf without duplicating http-level directives.

server_tokens off;

client_max_body_size 15M;
client_body_buffer_size 16k;
client_header_buffer_size 1k;
large_client_header_buffers 4 16k;

client_body_timeout 60s;
client_header_timeout 15s;
send_timeout 60s;
keepalive_timeout 30s;
keepalive_requests 100;

reset_timedout_connection on;

# Gzip static text. API locations set gzip off (BREACH).
gzip on;
gzip_disable "msie6";
gzip_vary on;
gzip_proxied off;
gzip_comp_level 5;
gzip_min_length 256;
gzip_types
    text/plain
    text/css
    text/xml
    application/javascript
    application/x-javascript
    image/svg+xml
    font/woff2;
EOF
}

headers_snippet_content() {
  local hsts=""
  # HSTS is ignored by browsers over HTTP; emit it here (not on the server
  # block) because location-level add_header does not inherit from server.
  if tls_ready; then
    hsts='add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;'
  fi
  cat <<EOF
# Written by scripts/secure-nginx.sh — include inside server / location.

add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "0" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'" always;
${hsts}
EOF
}

ssl_snippet_content() {
  cat <<EOF
# Mozilla Intermediate TLS — written by scripts/secure-nginx.sh

ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;

ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;

ssl_dhparam ${DHPARAM_FILE};

ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;
EOF
  if [[ -f "/etc/letsencrypt/live/${SERVER_NAME}/chain.pem" ]]; then
    echo "ssl_trusted_certificate /etc/letsencrypt/live/${SERVER_NAME}/chain.pem;"
  fi
}

proxy_snippet_content() {
  cat <<'EOF'
# Written by scripts/secure-nginx.sh — reverse-proxy to Spring Boot.

proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header Connection "";
proxy_hide_header X-Powered-By;
proxy_hide_header Server;
include snippets/security-headers.conf;
proxy_connect_timeout 60s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
proxy_buffering on;
proxy_buffer_size 16k;
proxy_buffers 8 16k;
client_max_body_size 15M;
gzip off;
EOF
}

common_locations() {
  # Shared location blocks. Caller already escaped nothing; we emit nginx vars
  # with \$ so the outer heredoc (unquoted delimiter in write_site_config) expands
  # shell vars but not nginx vars.
  cat <<'LOC'
    if ($bad_method) {
        return 405;
    }

    location ^~ /.well-known/acme-challenge/ {
        root __WEB_ROOT__;
        default_type "text/plain";
        allow all;
        auth_basic off;
        try_files $uri =404;
    }

    location = /api/admin/auth/login {
        limit_req zone=login burst=40 nodelay;
        limit_conn perip 50;
        include snippets/proxy-params.conf;
        proxy_pass http://127.0.0.1:__BACKEND_PORT__/api/admin/auth/login;
    }

    location = /api/student/auth/login {
        limit_req zone=login burst=40 nodelay;
        limit_conn perip 50;
        include snippets/proxy-params.conf;
        proxy_pass http://127.0.0.1:__BACKEND_PORT__/api/student/auth/login;
    }

    location = /api/student/auth/register {
        limit_req zone=login burst=20 nodelay;
        limit_conn perip 50;
        include snippets/proxy-params.conf;
        proxy_pass http://127.0.0.1:__BACKEND_PORT__/api/student/auth/register;
    }

    location /api/ {
        limit_req zone=api burst=100 nodelay;
        limit_conn perip 200;
        include snippets/proxy-params.conf;
        proxy_pass http://127.0.0.1:__BACKEND_PORT__/api/;
    }

    # Do not match /.well-known (ACME). A bare /\. regex returns 403 on challenges.
    location ~ /\.(?!well-known) {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \.(?:env|git|gitignore|bak|old|sql|swp|dist)$ {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \.(?:js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|ico|webp)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
        include snippets/security-headers.conf;
        try_files $uri =404;
    }

    location / {
        include snippets/security-headers.conf;
        try_files $uri $uri/ /index.html;
    }
LOC
}

http_server_block() {
  cat <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_NAME};

    include snippets/site-tuning.conf;

    root ${WEB_ROOT};
    index index.html;

$(common_locations | sed "s|__BACKEND_PORT__|${BACKEND_PORT}|g; s|__WEB_ROOT__|${WEB_ROOT}|g")
}
EOF
}

https_redirect_block() {
  cat <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    location ^~ /.well-known/acme-challenge/ {
        root ${WEB_ROOT};
        default_type "text/plain";
        allow all;
        auth_basic off;
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF
}

https_server_block() {
  local cert_dir
  cert_dir="$(tls_cert_dir)"
  cat <<EOF
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${SERVER_NAME};

    ssl_certificate     ${cert_dir}/fullchain.pem;
    ssl_certificate_key ${cert_dir}/privkey.pem;
    include snippets/ssl-params.conf;
    include snippets/site-tuning.conf;

    root ${WEB_ROOT};
    index index.html;

$(common_locations | sed "s|__BACKEND_PORT__|${BACKEND_PORT}|g; s|__WEB_ROOT__|${WEB_ROOT}|g")
}
EOF
}

write_snippets() {
  write_file "${SECURITY_CONF}" "$(security_conf_content)"
  write_file "${SITE_TUNE_SNIPPET}" "$(site_tune_snippet_content)"
  write_file "${HEADERS_SNIPPET}" "$(headers_snippet_content)"
  write_file "${PROXY_SNIPPET}" "$(proxy_snippet_content)"

  if tls_ready; then
    write_file "${SSL_SNIPPET}" "$(ssl_snippet_content)"
  fi
}

ensure_dhparam() {
  if [[ -f "${DHPARAM_FILE}" ]]; then
    return 0
  fi
  if [[ "${DRY_RUN}" == true ]]; then
    log_info "[dry-run] would generate ${DHPARAM_FILE}"
    return 0
  fi
  log_info "Generating 2048-bit DH parameters (one-time, ~10–40s) ..."
  openssl dhparam -out "${DHPARAM_FILE}" 2048
  chmod 644 "${DHPARAM_FILE}"
}

write_site_config() {
  local mode="${1:-auto}"
  backup_site
  local body
  if [[ "${mode}" == "http" ]] || ! tls_ready; then
    body="$(http_server_block)"
  else
    ensure_dhparam
    write_file "${SSL_SNIPPET}" "$(ssl_snippet_content)"
    body="$(https_redirect_block)
$(https_server_block)"
  fi

  if [[ "${DRY_RUN}" == true ]]; then
    log_info "[dry-run] would write ${NGINX_SITE_PATH}"
    echo "----- site config -----"
    echo "${body}"
    echo "----- end -----"
    return 0
  fi

  mkdir -p /etc/nginx/snippets /etc/nginx/conf.d "${WEB_ROOT}"
  printf '%s\n' "${body}" > "${NGINX_SITE_PATH}"
  chmod 644 "${NGINX_SITE_PATH}"
  ln -sf "${NGINX_SITE_PATH}" "${NGINX_SITE_ENABLED}"
  rm -f /etc/nginx/sites-enabled/default
  log_info "Wrote ${NGINX_SITE_PATH}"
}

test_and_reload() {
  if [[ "${DRY_RUN}" == true ]]; then
    log_info "[dry-run] would run nginx -t && systemctl reload nginx"
    return 0
  fi
  nginx -t
  systemctl reload nginx
  log_info "Nginx reloaded."
}

lock_down_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    log_warn "ufw not installed — skip firewall."
    return 0
  fi
  if [[ "${DRY_RUN}" == true ]]; then
    log_info "[dry-run] would ufw allow OpenSSH/80/443 and deny 8080 from public"
    return 0
  fi
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  # Backend must stay loopback-only; ignore error if the rule already exists.
  ufw deny "${BACKEND_PORT}/tcp" >/dev/null 2>&1 || true
  ufw --force enable
  log_info "UFW: 80/443 open, ${BACKEND_PORT} denied from public, SSH allowed."
}

# ── Commands ───────────────────────────────────────────────────────────────

cmd_apply() {
  require_root
  require_command nginx
  load_env
  log_info "Hardening Nginx for ${SERVER_NAME} (web root ${WEB_ROOT})"
  write_snippets
  write_site_config
  lock_down_firewall
  test_and_reload
  if tls_ready; then
    log_info "HTTPS is active for ${SERVER_NAME}."
  else
    log_info "HTTP hardening applied. Enable TLS with: sudo $0 tls"
  fi
}

cmd_write_site() {
  require_root
  require_command nginx
  load_env
  write_snippets
  write_site_config
  test_and_reload
}

disable_extra_nginx_sites() {
  local f base
  mkdir -p /etc/nginx/sites-enabled
  shopt -s nullglob
  for f in /etc/nginx/sites-enabled/*; do
    base="$(basename "${f}")"
    if [[ "${base}" != "${NGINX_SITE_NAME}" ]]; then
      log_warn "Disabling extra site ${f} (it can redirect ACME to HTTPS)."
      rm -f "${f}"
    fi
  done
  shopt -u nullglob
}

prepare_acme_webroot() {
  mkdir -p "${WEB_ROOT}/.well-known/acme-challenge"
  # nginx worker (www-data) must traverse these dirs; 750 + wrong owner → 403.
  chmod 755 "${WEB_ROOT}" "${WEB_ROOT}/.well-known" "${WEB_ROOT}/.well-known/acme-challenge"
  printf 'ok\n' > "${WEB_ROOT}/.well-known/acme-challenge/ping"
  chmod 644 "${WEB_ROOT}/.well-known/acme-challenge/ping"
}

assert_acme_http() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
    -H "Host: ${SERVER_NAME}" \
    "http://127.0.0.1/.well-known/acme-challenge/ping" || echo fail)"
  if [[ "${code}" != "200" ]]; then
    log_error "Local ACME ping returned HTTP ${code} (want 200)."
    log_error "Fix Nginx (dotfile deny / extra vhost) before calling Let's Encrypt."
    exit 1
  fi
  log_info "Local ACME ping: HTTP 200"

  if command -v ss >/dev/null 2>&1 && ss -tlnp 2>/dev/null | grep -qE ':443\s'; then
    log_warn "Port 443 is still listening. Let's Encrypt secondary validation follows HTTPS and can get 403."
    log_warn "Turn off Cloudflare proxy (grey cloud) and any 'Always Use HTTPS' until the cert exists."
  fi

  log_info "DNS for ${SERVER_NAME}: $(getent ahostsv4 "${SERVER_NAME}" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  log_info "This VPS IPs: $(hostname -I)"
  log_info "Those two lists must match (one A record, no extra host, Cloudflare DNS-only)."
}

cmd_tls() {
  require_root
  require_command nginx
  load_env

  if ! server_name_is_public; then
    log_error "SERVER_NAME must be a public DNS name (got '${SERVER_NAME}')."
    log_error "Set SERVER_NAME=lms.example.com in .env, point DNS A/AAAA here, then re-run."
    exit 1
  fi
  if [[ -z "${CERTBOT_EMAIL}" || "${CERTBOT_EMAIL}" == *change-me* || "${CERTBOT_EMAIL}" == *example.com ]]; then
    log_error "Set CERTBOT_EMAIL in .env to a real mailbox (Let's Encrypt TOS)."
    exit 1
  fi

  if [[ "${DRY_RUN}" == true ]]; then
    log_info "[dry-run] would install certbot and issue a cert for ${SERVER_NAME}"
    return 0
  fi

  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y certbot openssl

  # HTTP-01 must succeed on port 80 with NO HTTPS redirect / 403 on /.well-known.
  lock_down_firewall
  disable_extra_nginx_sites
  write_snippets
  write_site_config http
  prepare_acme_webroot
  test_and_reload
  assert_acme_http

  log_info "Requesting Let's Encrypt certificate for ${SERVER_NAME} (webroot, HTTP-01) ..."
  log_info "Port 80 must be open on UFW and on the VPS provider firewall (Contabo/etc)."
  certbot certonly \
    --webroot \
    -w "${WEB_ROOT}" \
    -d "${SERVER_NAME}" \
    --preferred-challenges http \
    --non-interactive \
    --agree-tos \
    -m "${CERTBOT_EMAIL}" \
    --keep-until-expiring

  ensure_dhparam
  write_snippets
  write_site_config auto

  mkdir -p "$(dirname "${RENEW_HOOK}")"
  cat > "${RENEW_HOOK}" <<'HOOK'
#!/bin/sh
nginx -t && systemctl reload nginx
HOOK
  chmod 755 "${RENEW_HOOK}"

  test_and_reload
  log_info "TLS enabled. Renewal hook: ${RENEW_HOOK}"
  log_info "Update CORS_ALLOWED_ORIGINS to https://${SERVER_NAME} and redeploy the backend."
}

cmd_status() {
  load_env
  echo "Nginx security status"
  echo "  SERVER_NAME : ${SERVER_NAME}"
  echo "  WEB_ROOT    : ${WEB_ROOT}"
  echo "  site file   : ${NGINX_SITE_PATH}"
  echo

  if command -v nginx >/dev/null 2>&1; then
    systemctl is-active nginx >/dev/null 2>&1 && echo "  nginx: active" || echo "  nginx: inactive"
    nginx -t 2>&1 | sed 's/^/  /' || true
  else
    echo "  nginx: not installed"
    return 0
  fi
  echo

  [[ -f "${SECURITY_CONF}" ]] && echo "  global harden : present (${SECURITY_CONF})" || echo "  global harden : missing"
  [[ -f "${HEADERS_SNIPPET}" ]] && echo "  headers       : present" || echo "  headers       : missing"
  tls_ready && echo "  TLS cert      : present ($(tls_cert_dir))" || echo "  TLS cert      : not installed"
  echo

  local url scheme
  if tls_ready; then
    scheme="https"
    url="https://${SERVER_NAME}/"
  else
    scheme="http"
    url="http://127.0.0.1/"
  fi

  if command -v curl >/dev/null 2>&1; then
    echo "  Response headers (${url}):"
    curl -fsSI --max-time 8 "${url}" 2>/dev/null | sed 's/^/    /' || echo "    (could not fetch ${url})"
    echo
    echo "  Expected: X-Frame-Options, X-Content-Type-Options, Content-Security-Policy"
    if [[ "${scheme}" == "https" ]]; then
      echo "  Expected: Strict-Transport-Security, TLS 1.2+"
      echo
      echo "  Certificate:"
      echo | openssl s_client -servername "${SERVER_NAME}" -connect "${SERVER_NAME}:443" 2>/dev/null \
        | openssl x509 -noout -issuer -dates -ext subjectAltName 2>/dev/null \
        | sed 's/^/    /' || echo "    (could not read certificate)"
    fi
  fi
}

show_help() {
  cat <<EOF
EcoBrains LMS — Nginx hardening

Usage: $0 [command] [options]

Commands:
  apply         Write security snippets + site config, lock UFW, reload (default)
  write-site    Same site writer used by vps.sh deploy (snippets + site + reload)
  tls           Issue Let's Encrypt cert and switch the site to HTTPS
  status        Show config presence, headers, and certificate dates
  help          This message

Options:
  --dry-run     Print actions without writing files

.env keys used:
  SERVER_NAME        DNS name (required for tls). "_" = any host, HTTP only
  WEB_ROOT           Frontend document root (default /var/www/ecobrains-lms)
  BACKEND_PORT       Spring Boot port (default 8080)
  CERTBOT_EMAIL      Required for tls

Typical flow:
  sudo ./scripts/vps.sh setup --with-nginx
  sudo ./scripts/vps.sh deploy --with-nginx
  sudo ./scripts/secure-nginx.sh
  # after DNS A record points at this VPS, and ports 80+443 are open
  # on BOTH ufw AND the provider firewall (Contabo panel):
  sudo ./scripts/secure-nginx.sh tls

Do not run: certbot --nginx
(that redirects the ACME challenge to HTTPS before port 443 is listening).
EOF
}

main() {
  local cmd="apply"
  local -a args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run) DRY_RUN=true; shift ;;
      apply|write-site|tls|status|help|-h|--help)
        cmd="$1"
        shift
        args+=("$@")
        break
        ;;
      *)
        cmd="$1"
        shift
        args+=("$@")
        break
        ;;
    esac
  done
  case "${cmd}" in
    apply)      cmd_apply ;;
    write-site) cmd_write_site ;;
    tls)        cmd_tls ;;
    status)     cmd_status ;;
    help|-h|--help) show_help ;;
    *) log_error "Unknown command: ${cmd}"; show_help; exit 1 ;;
  esac
}

main "$@"

