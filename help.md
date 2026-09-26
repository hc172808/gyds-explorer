Usage
Full explorer deployment with web interface:

sudo ./deploy.sh your-domain.com

API and database without the web interface:

sudo ./deploy.sh --no-web your-domain.com

Install only a blockchain node:

sudo ./deploy.sh --node-only --node-type=main
sudo ./deploy.sh --node-only --node-type=full
sudo ./deploy.sh --node-only --node-type=lite
sudo ./deploy.sh --node-only --node-type=rpc
sudo ./deploy.sh --node-only --node-type=validator

RPC node shortcut:

sudo ./deploy.sh --rpc-node

You can also run the node installer directly:

sudo NODE_TYPE=rpc ./node-setup.sh

The RPC node runs a full synchronized node and exposes HTTP RPC on port 8545 and WebSocket RPC on port 8546. It requires the matching genesis.json and a main-node peer/enode for synchronization.

Required for the web explorer
Port	Protocol	Purpose
22	TCP	SSH administration
80	TCP	HTTP website
443	TCP	HTTPS website
Required for blockchain nodes
Port	Protocol	Purpose
30303	TCP + UDP	GYDS peer-to-peer blockchain traffic
Public RPC node only
If you are running --rpc-node or --node-type=rpc, also open:

Port	Protocol	Purpose
8545	TCP	HTTP JSON-RPC
8546	TCP	WebSocket RPC
Example UFW configuration:

sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 30303/tcp
sudo ufw allow 30303/udp

For a public RPC node:

sudo ufw allow 8545/tcp
sudo ufw allow 8546/tcp

Keep these closed externally
These are internal service ports and should not be opened in your cloud/server firewall:

3001 — API server
3002 — feature-gate service
5432 — PostgreSQL
8008 — pgAdmin internal Apache port
6060 — node metrics
If you are deploying the full explorer plus an RPC node, the external ports are:

22, 80, 443, 30303 TCP, 30303 UDP, 8545, 8546

Only expose 8545 and 8546 publicly if wallets or external websites need to access this RPC node. Otherwise, restrict them to trusted IP addresses.

cd /var/www/gyds-explorer
sudo chmod +x check-services.sh update.sh
sudo ./check-services.sh

It checks:

Nginx and website ports 80 and 443
API port 3001
PostgreSQL status
GYDS node service
P2P ports 30303 TCP/UDP
RPC ports 8545 and 8546 for MAIN, FULL, LITE, or RPC nodes
RPC response using eth_chainId
PM2 API status
Pull updates from Git and restart services
cd /var/www/gyds-explorer
sudo ./update.sh

The update script now:

Pulls the latest Git changes.
Temporarily stashes local changes if necessary.
Installs npm dependencies.
Builds the frontend using the correct npm workspace.
Copies the frontend to /var/www/gyds-explorer/dist.
Restarts PM2 services.
Reloads Nginx.
Runs the port and service health check.
Useful options:

sudo ./update.sh --branch main
sudo ./update.sh --skip-deps
sudo ./update.sh --no-restart

Test access from another computer
Replace YOUR_SERVER_IP with your server IP:

nc -vz YOUR_SERVER_IP 80
nc -vz YOUR_SERVER_IP 443
nc -vz YOUR_SERVER_IP 30303

For a public RPC node:

nc -vz YOUR_SERVER_IP 8545
nc -vz YOUR_SERVER_IP 8546

A port can be listening locally but still blocked by your cloud provider firewall, so both the local health check and the external nc test are useful.

The API workflow failure shown by Replit is unrelated to the Ubuntu deployment scripts; the server uses PM2 and Nginx instead.
