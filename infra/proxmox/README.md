# Proxmox LXC for Rooman One

`create-ct.sh` runs on the Proxmox host shell and builds a Debian 12 LXC
(nesting on, for Docker) that runs `infra/compose/docker-compose.yml` with
Traefik listening on port 80. The container's `.env` is generated in-place
with random secrets and lives only at `/opt/rooman-one/infra/compose/.env`.

## Hostnames

| Public name | Service |
|---|---|
| `roomanone.futureacd.ae` | Core (sign-in, `/api`) |
| `books.roomanone.futureacd.ae` | Books |
| `bookings.roomanone.futureacd.ae` | Bookings API |

Create DNS records for each name on your existing proxy's public IP (a
wildcard `*.roomanone.futureacd.ae` also works).

## Existing reverse proxy

Forward each name to `http://<CT-IP>:80` and **preserve the Host header**
(Traefik routes on it). nginx example:

```nginx
server {
    listen 443 ssl http2;
    server_name roomanone.futureacd.ae books.roomanone.futureacd.ae bookings.roomanone.futureacd.ae;
    # ssl_certificate ... (cert must cover all three names)

    location / {
        proxy_pass http://<CT-IP>:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        client_max_body_size 10m;
    }
}
```

Nginx Proxy Manager: one Proxy Host per name, Forward `http` / `<CT-IP>` /
`80`, enable SSL + Force SSL.

## Updating

```bash
pct exec <CTID> -- bash -c 'cd /opt/rooman-one && git pull && cd infra/compose && docker compose up -d --build'
```
