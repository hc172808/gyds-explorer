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
