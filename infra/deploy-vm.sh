#!/usr/bin/env bash
# HomeHelp backend — one-shot deploy on a fresh Ubuntu 22.04/24.04 VM (x86 or ARM).
# Result: the whole microservices stack runs under docker compose, reachable at
#   http://<this-vm-public-ip>:8080   (the API gateway)
#
# Usage on the VM (as a sudo-capable user):
#   git clone <repo> HomeHelp && cd HomeHelp/infra
#   cp .env.example .env && nano .env      # fill in the real secrets (Razorpay keys, etc.)
#   bash deploy-vm.sh
#
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

echo "==> 1/5 Installing Docker + compose (if missing)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi
sudo systemctl enable --now docker

echo "==> 2/5 Checking config (infra/.env)"
if [ ! -f .env ]; then
  echo "!! infra/.env missing. Run: cp .env.example .env && nano .env  (add Razorpay/Google keys)"; exit 1
fi

echo "==> 3/5 Opening firewall for the gateway (8080)"
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp   || true
  sudo ufw allow 8080/tcp || true
  yes | sudo ufw enable    || true
fi
# NOTE: on Oracle Cloud / AWS / GCP you ALSO must open 8080 in the cloud "Security List"/
# "Security Group" — the OS firewall alone is not enough.

echo "==> 4/5 Building + starting the stack (this takes a few minutes the first time)"
# The prod override adds restart:unless-stopped to every container so the stack survives
# crashes and reboots (Docker's service is enabled, so it comes back up on boot).
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo "==> 5/5 Waiting for the gateway to answer"
for i in $(seq 1 30); do
  if curl -fsS http://localhost:8080/health >/dev/null 2>&1; then break; fi
  sleep 3
done

IP="$(curl -fsS https://api.ipify.org 2>/dev/null || echo '<your-vm-public-ip>')"
echo
echo "======================================================================"
echo " HomeHelp backend is up."
echo "   Local health : http://localhost:8080/health"
echo "   PUBLIC API    : http://$IP:8080"
echo
echo " Next: set this in app-config.json (repo root) and push to Baji:"
echo '   { "apiBase": "http://'"$IP"':8080" }'
echo
echo " Then the customer & worker apps use this PERMANENT URL — no more tunnels."
echo " (Make sure port 8080 is open in your cloud provider's security group too.)"
echo "======================================================================"
