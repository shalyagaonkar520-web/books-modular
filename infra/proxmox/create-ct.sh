#!/usr/bin/env bash
# Run on the Proxmox host shell (as root). Creates an LXC, installs Docker,
# clones the repo and starts the Rooman One stack behind Traefik on port 80.
# TLS and the public name are handled by your existing reverse proxy.
#
#   GIT_URL=https://<token>@github.com/shalya-rooman/roomanone.git \
#   bash create-ct.sh
#
# Optional overrides: CTID HOSTNAME STORAGE TEMPLATE_STORAGE BRIDGE IP GW
# CORES MEMORY DISK PUBLIC_HOST GIT_BRANCH
set -euo pipefail

GIT_URL="${GIT_URL:?set GIT_URL (include a read token if the repo is private)}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PUBLIC_HOST="${PUBLIC_HOST:-roomanone.futureacd.ae}"
CTID="${CTID:-$(pvesh get /cluster/nextid)}"
HOSTNAME="${HOSTNAME_CT:-roomanone}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
IP="${IP:-dhcp}"            # or e.g. 192.168.1.70/24 (then also set GW)
GW="${GW:-}"
CORES="${CORES:-4}"
MEMORY="${MEMORY:-8192}"
DISK="${DISK:-40}"

echo ">> Using CTID=$CTID storage=$STORAGE bridge=$BRIDGE ip=$IP"
pct status "$CTID" >/dev/null 2>&1 && { echo "CT $CTID already exists"; exit 1; }

pveam update >/dev/null
TEMPLATE="$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)"
[ -n "$TEMPLATE" ] || { echo "no debian-12 template found"; exit 1; }
pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE" || pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"

NET="name=eth0,bridge=$BRIDGE,ip=$IP"
[ -n "$GW" ] && NET="$NET,gw=$GW"

pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$HOSTNAME" --cores "$CORES" --memory "$MEMORY" --swap 1024 \
  --rootfs "$STORAGE:$DISK" --net0 "$NET" \
  --features nesting=1,keyctl=1 --unprivileged 1 \
  --onboot 1 --start 1

echo ">> Waiting for network"
for i in $(seq 1 30); do pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1 && break; sleep 2; done

pct exec "$CTID" -- bash -s -- "$GIT_URL" "$GIT_BRANCH" "$PUBLIC_HOST" <<'INNER'
set -euo pipefail
GIT_URL="$1"; GIT_BRANCH="$2"; PUBLIC_HOST="$3"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates git openssl
curl -fsSL https://get.docker.com | sh

git clone --branch "$GIT_BRANCH" "$GIT_URL" /opt/rooman-one
cd /opt/rooman-one/infra/compose

gen() { openssl rand -base64 36 | tr -d '/+=\n' | cut -c1-40; }
if [ ! -f .env ]; then
cat > .env <<ENV
DOMAIN=${PUBLIC_HOST}
CORE_HOST=${PUBLIC_HOST}
BOOKS_HOST=books.${PUBLIC_HOST}
BOOKINGS_HOST=bookings.${PUBLIC_HOST}
PUBLIC_SCHEME=https
COOKIE_SECURE=true
GATEWAY_BIND=0.0.0.0
GATEWAY_PORT=80
BOOKS_DB_PASSWORD=$(gen)
BOOKS_SECRET_KEY=$(gen)
BOOKS_ENVIRONMENT=production
CORE_DB_PASSWORD=$(gen)
CORE_KEY_ENCRYPTION_KEYS=$(openssl rand -base64 32 | tr '+/' '-_')
BOOKINGS_DB_PASSWORD=$(gen)
NATS_PASSWORD=$(gen)
ENV
chmod 600 .env
fi

docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml ps
INNER

echo
echo ">> Done. CT $CTID address:"
pct exec "$CTID" -- hostname -I
echo ">> Point your existing proxy at http://<that IP>:80 (see infra/proxmox/README.md)"
