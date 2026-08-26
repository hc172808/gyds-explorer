# GYDS Explorer server setup

This guide covers a clean Ubuntu 22.04 server running the explorer, its optional
API/indexer services, and a GYDS node. The deployment keeps the existing npm
workspace layout and uses Nginx for the browser UI.

## 1. What listens on each port

| Port | Service | Public? |
| --- | --- | --- |
| 80/tcp | Nginx explorer UI | Yes |
| 8080/tcp | Nginx direct UI alias (default) | Yes, optional |
| 443/tcp | Nginx HTTPS, when a domain/SSL is configured | Yes |
| 3001/tcp | API | No; Nginx proxies `/api/` locally |
| 3002/tcp | Feature-gate service, if installed | No |
| 30303/tcp + udp | GYDS peer-to-peer traffic | Yes for nodes |
| 8545/tcp | GYDS HTTP JSON-RPC | Only for `rpc`, `full`, or `lite` nodes |
| 8546/tcp | GYDS WebSocket RPC | Only for `rpc`, `full`, or `lite` nodes |
| 5432/tcp | PostgreSQL | No |
| 6060/tcp | Node metrics | No |
| 8008/tcp | pgAdmin's local Apache backend | No; use `/pgadmin4/` through Nginx |

The frontend is a static build. `PORT=8080` during `npm run build` does not
start a web server. After deployment, use either:

- `http://YOUR_SERVER_IP/`
- `http://YOUR_SERVER_IP:8080/` (the direct web-port alias)

If you choose a different direct port, use `--web-port=PORT` and use that port
in the second URL.

## 2. Clean explorer deployment

Install the required tools and clone the repository:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
sudo git clone https://github.com/hc172808/gyds-explorer.git /var/www/gyds-explorer
cd /var/www/gyds-explorer
sudo chmod +x deploy.sh node-setup.sh check-services.sh update.sh
```

Deploy the UI with the default ports:

```bash
sudo ./deploy.sh
```

Deploy with a domain and direct UI port:

```bash
sudo ./deploy.sh example.com --web-port=8080
```

The script installs Node.js 22.18 or newer, PostgreSQL, Nginx, PM2, and the
frontend dependencies. It creates `/var/www/gyds-explorer/dist`, writes the
server `.env`, configures Nginx, and prints the final URLs.

The script asks whether to install a blockchain node. Answer `N` if this
machine should only host the explorer. The explorer itself reads the public RPC
values in `.env` directly from the browser and does not require the API service
for normal browsing.

## 3. Verify the UI and firewall

Run the local health check:

```bash
cd /var/www/gyds-explorer
sudo bash check-services.sh
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo ss -ltnp | grep -E ':(80|8080)\b'
curl -f http://127.0.0.1/
curl -f http://127.0.0.1:8080/
```

From a different computer, test the public path:

```bash
nc -vz YOUR_SERVER_IP 80
nc -vz YOUR_SERVER_IP 8080
curl -f http://YOUR_SERVER_IP/
curl -f http://YOUR_SERVER_IP:8080/
```

If local `curl` works but the remote test fails, open the same ports in the
cloud provider's firewall/security group. On Ubuntu with UFW, the deployment
opens SSH, 80, and the configured direct web port. Check it with:

```bash
sudo ufw status verbose
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 8080/tcp
```

Do not open 3001, 3002, 5432, 6060, or 8008 to the internet. Only open 8545
and 8546 when this machine is intentionally a public RPC node.

### Blank page or connection refused

Run these commands in order:

```bash
sudo systemctl status nginx --no-pager -l
sudo nginx -t
sudo journalctl -u nginx -n 100 --no-pager
sudo ss -ltnp | grep -E ':(80|8080)\b'
sudo bash /var/www/gyds-explorer/check-services.sh
```

Common causes are using port 8080 before deploying the Nginx alias, a cloud
firewall rule that allows neither 80 nor 8080, or Nginx failing its config
test. The app is not served by a Node process in production; `pm2 list` will
show API/indexer processes, not the UI.

## 4. Optional API and indexer checks

The API is intentionally local and is reached through Nginx:

```bash
curl -f http://127.0.0.1:3001/api/health
pm2 list
pm2 logs gyds-api --lines 100
pm2 logs gyds-indexer --lines 100
```

The generated `.env` contains a random API signing secret. Do not replace it
with a public value or commit the file.

## 5. GYDS node roles

The current GYDS genesis created by `node-setup.sh` uses **Clique
proof-of-authority**. A `validator` in this repository is a Clique authority
that signs blocks after the MAIN node authorizes its address. It is **not
proof-of-stake staking** and it does not earn rewards through a staking
contract.

That distinction matters: enabling `--mine` on the existing Clique genesis
cannot turn it into proof-of-stake. True staking requires a coordinated
protocol/genesis change across the whole network, validator deposit/reward
rules, and a migration plan. Do not change one node's consensus settings on a
live network.

### MAIN node (one per network)

Run this once on the authority server:

```bash
sudo NODE_TYPE=main ./node-setup.sh
sudo gyds-enode
sudo cp /etc/gyds/genesis.json /secure/location/genesis.json
```

Keep `/etc/gyds/account-password.txt`, the node key, and `genesis.json`
private. Give other node operators the exact matching genesis file and the
MAIN node's enode URL, not the account password or private key.

### Validator authority node

Copy the exact MAIN genesis file to the validator server, then run:

```bash
sudo install -o root -g root -m 600 genesis.json /etc/gyds/genesis.json
sudo NODE_TYPE=validator \
  MAIN_NODE_IP=MAIN_PUBLIC_IP \
  MAIN_NODE_ENODE='enode://PUBLIC_KEY@MAIN_PUBLIC_IP:30303' \
  ./node-setup.sh
```

The script creates a local validator account when no address is supplied. On
an existing installation, set `VALIDATOR_ADDRESS` to the account already in
`/var/lib/gyds/keystore`; the script refuses to start with an address that is
not present in that keystore. The password is stored only in
`/etc/gyds/validator-password.txt` with mode 600.

On the MAIN node, authorize the validator through the local geth console:

```bash
sudo gyds-console
clique.propose("VALIDATOR_ADDRESS", true)
clique.getSigners()
```

Then verify the validator:

```bash
sudo gyds-status
sudo gyds-peers
sudo gyds-console
eth.syncing
eth.mining
eth.blockNumber
```

The validator must be synchronized and authorized before it can seal blocks.
Open only `30303/tcp` and `30303/udp` to the validator; its HTTP RPC remains
bound to localhost by design.

## 6. Node port rules

For a MAIN, FULL, or VALIDATOR node, allow peer traffic:

```bash
sudo ufw allow 30303/tcp
sudo ufw allow 30303/udp
```

For an intentionally public RPC or lite node, also allow:

```bash
sudo ufw allow 8545/tcp
sudo ufw allow 8546/tcp
```

The health check distinguishes validator nodes from public RPC nodes and does
not report localhost-only validator RPC as a failure.

## 7. Updates and rollback-safe checks

Update the server with:

```bash
cd /var/www/gyds-explorer
sudo ./update.sh
sudo bash check-services.sh
```

If an update reports a failed build, fix that before restarting services.
Inspect `nginx -t`, `pm2 list`, `pm2 logs`, and the systemd node journal rather
than opening additional ports.