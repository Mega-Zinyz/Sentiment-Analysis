#!/usr/bin/env bash
# setup-firewall.sh
# Run once on the VPS as root to configure UFW.
# MySQL (3306) and Redis (6379) are NOT opened — they run inside Docker's
# internal network and must NOT be reachable from the internet.

set -euo pipefail

echo "=== Setting up UFW firewall ==="

# Reset to a clean state
ufw --force reset

# Default policies: block all inbound, allow all outbound
ufw default deny incoming
ufw default allow outgoing

# SSH — allow from anywhere (Fail2Ban will throttle brute-force)
ufw allow 22/tcp comment 'SSH'

# HTTP / HTTPS — public web traffic
ufw allow 80/tcp  comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Backend API port — only if you need direct external access (e.g. during dev).
# In production, traffic goes through nginx (443), so you can comment this out.
# ufw allow 5000/tcp comment 'Backend API (disable in production)'

# Docker daemon manages its own iptables rules for container-to-container traffic
# on the internal bridge network, so we do NOT open 3306 or 6379 here.
# If you ever need temporary direct DB access from a specific trusted IP:
#   ufw allow from <YOUR_IP> to any port 3306

# Enable and show status
ufw --force enable
ufw status verbose

echo ""
echo "=== Firewall setup complete ==="
echo "Ports open: 22 (SSH), 80 (HTTP), 443 (HTTPS)"
echo "Ports blocked from internet: 3306 (MySQL), 6379 (Redis), 5000 (Backend)"
