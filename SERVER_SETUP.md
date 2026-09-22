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
| 8545/tcp | GYDS HTTP JSON-RPC | Only for `rpc`, `boost`, `full`, or `lite` nodes |
| 8546/tcp | GYDS WebSocket RPC | Only for `rpc`, `boost`, `full`, or `lite` nodes |
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

### Re-running the deployment

Running `deploy.sh` against an existing deployment asks whether to reset the
generated state. Type `YES` only when a clean installation is intended. A
confirmed reset stops the managed PM2 services and GYDS node, drops and
recreates the explorer database, removes GYDS chain data, genesis, keystores,
node configuration, logs, backups, and the node systemd unit, then continues
through node setup again. The application source directory is retained.

Answer anything other than `YES` to preserve the database and node data. A
reset is destructive and cannot recover indexed data or node keys without an
external backup.

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

### FULL node

A FULL node keeps a complete chain replica and syncs from MAIN. It is useful
for operators who need local history or want to provide a trusted upstream to
lite nodes:

```bash
sudo install -o root -g root -m 600 genesis.json /etc/gyds/genesis.json
sudo NODE_TYPE=full \
  MAIN_NODE_IP=MAIN_PUBLIC_IP \
  MAIN_NODE_ENODE='enode://PUBLIC_KEY@MAIN_PUBLIC_IP:30303' \
  ./node-setup.sh
sudo gyds-status
sudo gyds-console
eth.syncing
eth.blockNumber
```

Open `30303/tcp` and `30303/udp` between this node and the network. A FULL
node's HTTP and WebSocket RPC are bound to `0.0.0.0` by the current setup, so
do not open 8545/8546 unless you intentionally want this node to be public.
For a public endpoint, use the RPC role instead.

### LITE node

A LITE node stores reduced state and exposes an RPC endpoint for wallets and
websites. It should peer with one or more FULL nodes:

```bash
sudo install -o root -g root -m 600 genesis.json /etc/gyds/genesis.json
sudo NODE_TYPE=lite \
  FULL_NODE_IPS='FULL_PUBLIC_IP' \
  MAIN_NODE_ENODE='enode://FULL_NODE_PUBLIC_KEY@FULL_PUBLIC_IP:30303' \
  ./node-setup.sh
sudo gyds-status
sudo gyds-console
eth.syncing
```

Add additional FULL node enodes to
`/var/lib/gyds/geth/static-nodes.json`, then run `sudo gyds-restart`.
The LITE node exposes `http://SERVER_IP:8545` and
`ws://SERVER_IP:8546`; point the explorer's `VITE_RPC_URL` and
`VITE_RPC_URL_2` at reachable HTTPS reverse-proxy URLs in production.
Opening raw HTTP RPC on an internet-facing IP is not recommended without an
authenticated proxy and rate limiting.

### RPC node

An RPC node is a FULL-sync/archive node intended to serve wallets, explorers,
and other clients:

```bash
sudo install -o root -g root -m 600 genesis.json /etc/gyds/genesis.json
sudo NODE_TYPE=rpc \
  MAIN_NODE_IP=MAIN_PUBLIC_IP \
  MAIN_NODE_ENODE='enode://PUBLIC_KEY@MAIN_PUBLIC_IP:30303' \
  ./node-setup.sh
sudo gyds-status
sudo gyds-console
eth.syncing
```

For a deliberately public RPC node, open `30303/tcp`, `30303/udp`,
`8545/tcp`, and `8546/tcp` in both UFW and the cloud firewall. Test it from
another machine:

```bash
curl -sS -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  http://SERVER_IP:8545
```

Use `https://` and `wss://` behind a domain/reverse proxy when wallets will
connect from a browser. Browsers and wallet extensions commonly reject
insecure RPC URLs on public hostnames.

### BOOST node

A BOOST node is a second, dedicated full-sync/archive RPC node used as the
explorer's failover endpoint. It runs the same Geth profile as an RPC node but
is recorded separately in the Admin Dashboard so it can be managed and tested
independently:

```bash
sudo install -o root -g root -m 600 genesis.json /etc/gyds/genesis.json
sudo NODE_TYPE=boost \
  MAIN_NODE_IP=MAIN_PUBLIC_IP \
  MAIN_NODE_ENODE='enode://PUBLIC_KEY@MAIN_PUBLIC_IP:30303' \
  ./node-setup.sh
sudo gyds-status
```

After it is reachable through HTTPS, configure it in Admin → Node Settings as
the **Boost node RPC URL**. The generated deployment values are:

```dotenv
VITE_RPC_URL_2=https://boost.example.com
VITE_BOOSTNODE_RPC_URL=https://boost.example.com
BOOSTNODE_RPC_URL=https://boost.example.com
```

The same setup can be started through the deployment script:

```bash
sudo ./deploy.sh --node-only --node-type=boost
# or
sudo ./deploy.sh --boost-node
```

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

## 6. Wallet login and admin setup

The public **Connect Wallet** flow accepts any wallet after it signs a
one-time message. The **Admin Login** dialog additionally requires that the
wallet address exists as an active row in `admin_wallets`.

First, open the explorer directly in a browser tab, not inside an embedded
preview. Wallet extensions refuse `eth_requestAccounts` and signature
requests from many embedded iframes. Use the same origin as the API, for
example `http://SERVER_IP/` or the published HTTPS domain.

Then seed the public address that will sign in:

```bash
cd /var/www/gyds-explorer
ADMIN_WALLET=0xYOUR_PUBLIC_WALLET_ADDRESS \
ADMIN_WALLET_LABEL=Founder \
npm run seed:admin --workspace=@workspace/api-server
```

Confirm the API and database are running before trying again:

```bash
curl -f http://127.0.0.1:3001/api/health
pm2 logs gyds-api --lines 100
```

Never put a private key in the server environment. Only the public wallet
address is seeded; the wallet extension signs the nonce locally. If sign-in
returns `Wallet not authorized`, seed the exact address currently selected in
the wallet. If it returns `No nonce found` or the API is unreachable, check
the API health command, `DATABASE_URL`, and the API/JWT/session secret.

## 7. Node port rules

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

## 8. Updates and rollback-safe checks

Update the server with:

```bash
cd /var/www/gyds-explorer
sudo ./update.sh
sudo bash check-services.sh
```

If an update reports a failed build, fix that before restarting services.
Inspect `nginx -t`, `pm2 list`, `pm2 logs`, and the systemd node journal rather
than opening additional ports.