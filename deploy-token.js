#!/usr/bin/env node
// ============================================================
// GYDS Token Deployment Helper
// ============================================================
// Checks a Mainnet RPC and prints matching Geth-console deployment instructions.
// It does not sign or broadcast a transaction.
//
// Requirements:
//   npm install ethers dotenv
//   (already in /var/www/gyds-explorer/node_modules if deploy.sh was run)
//
// Usage:
//   node deploy-token.js \
//     --name "My Token" \
//     --symbol MTK \
//     --supply 1000000 \
//     --decimals 18 \
//     --deployer-address 0xYOUR_PUBLIC_WALLET_ADDRESS
//
// GYD starts with zero supply and can be minted by its owner on demand:
//   --name "GYD Stablecoin" --symbol GYD --supply 0 --decimals 6 --mintable true
//
// Or use .env / environment variables:
//   TOKEN_NAME, TOKEN_SYMBOL, TOKEN_SUPPLY, TOKEN_DECIMALS, DEPLOYER_ADDRESS
//
// The deployer account must have GYDS (native coin) to pay gas.
// ============================================================

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// ---- Parse CLI args ----------------------------------------
const args = process.argv.slice(2);
function getArg(flag, envKey, fallback) {
  const idx = args.findIndex((a) => a === flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return process.env[envKey] || fallback;
}

const TOKEN_NAME      = getArg("--name",        "TOKEN_NAME",          "");
const TOKEN_SYMBOL    = getArg("--symbol",       "TOKEN_SYMBOL",        "");
const TOKEN_SUPPLY    = getArg("--supply",       "TOKEN_SUPPLY",        "1000000");
const TOKEN_DECIMALS  = getArg("--decimals",     "TOKEN_DECIMALS",      "18");
const DEPLOYER_ADDRESS = getArg("--deployer-address", "DEPLOYER_ADDRESS", "");
const RPC_URL         = getArg("--rpc",          "GYDS_REMOTE_RPC_URL", "");
const EXPECTED_CHAIN_ID = 198282n;
const MINTABLE_VALUE  = getArg("--mintable",     "TOKEN_MINTABLE",      "false").toLowerCase();
const MINTABLE        = MINTABLE_VALUE === "true";

function getRpcHost(value) {
  const rpcUrl = new URL(value);
  return `${rpcUrl.protocol}//${rpcUrl.host}`;
}

// ---- Validate ----------------------------------------------
if (!TOKEN_NAME)   { console.error("Error: --name is required.   Example: --name 'Gold Token'"); process.exit(1); }
if (!TOKEN_SYMBOL) { console.error("Error: --symbol is required. Example: --symbol GLD"); process.exit(1); }
if (!/^0x[a-fA-F0-9]{40}$/.test(DEPLOYER_ADDRESS)) {
  console.error("Error: --deployer-address (or DEPLOYER_ADDRESS in .env) must be a public EVM wallet address.");
  process.exit(1);
}
const isGyd = TOKEN_SYMBOL.trim().toUpperCase() === "GYD";
if (
  !/^\d+$/.test(TOKEN_SUPPLY) ||
  (BigInt(TOKEN_SUPPLY) === 0n && !(isGyd && MINTABLE))
) {
  console.error("Error: --supply must be a positive whole-token amount; zero is allowed only for mintable GYD.");
  process.exit(1);
}
if (!/^\d+$/.test(TOKEN_DECIMALS) || Number(TOKEN_DECIMALS) > 18) {
  console.error("Error: --decimals must be a whole number from 0 to 18.");
  process.exit(1);
}
if (!["true", "false"].includes(MINTABLE_VALUE)) {
  console.error("Error: --mintable must be true or false.");
  process.exit(1);
}
if (TOKEN_SYMBOL.trim().toUpperCase() === "TGYD") {
  console.error("Error: TGYD is Testnet-only; this helper targets GYDS Mainnet.");
  process.exit(1);
}
if (isGyd && (Number(TOKEN_DECIMALS) !== 6 || !MINTABLE)) {
  console.error("Error: GYD must use 6 decimals and owner-controlled minting.");
  process.exit(1);
}
if (!RPC_URL) {
  console.error("Error: --rpc (or GYDS_REMOTE_RPC_URL in .env) must point to a reachable GYDS Mainnet RPC.");
  process.exit(1);
}
try {
  const rpcUrl = new URL(RPC_URL);
  if (rpcUrl.protocol !== "http:" && rpcUrl.protocol !== "https:") throw new Error("unsupported protocol");
} catch {
  console.error("Error: RPC URL must be an absolute HTTP(S) URL.");
  process.exit(1);
}

// The generated console factory needs the constructor ABI from token-contract.sol.
const ERC20_ABI = [
  "constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 initialSupply, bool mintable_)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

async function deployViaRpc() {
  // Dynamically require ethers
  let ethers;
  try {
    ethers = require("ethers");
  } catch {
    console.error("ethers not found. Run: npm install ethers");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployerAddress = ethers.getAddress(DEPLOYER_ADDRESS);
  const initialSupply = BigInt(TOKEN_SUPPLY);
  const rawSupply = initialSupply * (10n ** BigInt(TOKEN_DECIMALS));
  if (rawSupply >= (1n << 256n)) {
    throw new Error("Initial supply exceeds the token contract's uint256 limit.");
  }

  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   GYDS Token Deployment Helper                       ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║   Name:     ${TOKEN_NAME.padEnd(41)}║`);
  console.log(`║   Symbol:   ${TOKEN_SYMBOL.padEnd(41)}║`);
  console.log(`║   Supply:   ${TOKEN_SUPPLY.padEnd(41)}║`);
  console.log(`║   Decimals: ${TOKEN_DECIMALS.padEnd(41)}║`);
  console.log(`║   Deployer: ${deployerAddress.padEnd(41)}║`);
  console.log(`║   RPC host: ${getRpcHost(RPC_URL).padEnd(41)}║`);
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");

  // Check balance
  const balance = await provider.getBalance(deployerAddress);
  const gydsBalance = ethers.formatEther(balance);
  console.log(`Deployer balance: ${gydsBalance} GYDS`);
  if (balance === 0n) {
    console.error("Error: Deployer account has 0 GYDS. Fund the account before deploying.");
    process.exit(1);
  }

  // Get chain info
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Configured RPC is on chain ${network.chainId}, expected GYDS Mainnet chain ${EXPECTED_CHAIN_ID}.`);
  }
  console.log(`Chain ID: ${network.chainId}`);

  console.log(`Initial supply base units: ${rawSupply.toString()}`);
  generateGethScript(deployerAddress, rawSupply);
}

function generateGethScript(deployerAddress, rawSupply) {
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Geth Console Deployment Script");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("Run on your node server:");
  console.log("  gyds-console");
  console.log("");
  console.log("Then paste this into the geth console:");
  console.log("");
  console.log("// This helper only prints instructions; it does not sign or send a transaction.");
  console.log(`// ── Deploy ${TOKEN_NAME} (${TOKEN_SYMBOL}) ──────────────────────────`);
  console.log(`var tokenABI = ${JSON.stringify(ERC20_ABI, null, 2)};`);
  console.log("");
  console.log(`// Unlock your deployer account first:`);
  console.log(`personal.unlockAccount("${deployerAddress}", "YOUR_PASSWORD", 300)`);
  console.log("");
  console.log(`// Deploy using a compiled bytecode (compile token-contract.sol with solc or Remix first):`);
  console.log(`var bytecode = "0x..."; // paste your compiled bytecode here`);
  console.log("");
  console.log(`var factory = eth.contract(tokenABI);`);
  console.log(`var token = factory.new(`);
  console.log(`  ${JSON.stringify(TOKEN_NAME)},       // name`);
  console.log(`  ${JSON.stringify(TOKEN_SYMBOL)},     // symbol`);
  console.log(`  ${TOKEN_DECIMALS},     // decimals`);
  console.log(`  "${TOKEN_SUPPLY}", // initial supply (whole tokens)`);
  console.log(`  ${MINTABLE}, // mintable`);
  console.log(`  { from: "${deployerAddress}", data: bytecode, gas: 3000000 }`);
  console.log(`);`);
  console.log(`// Constructor supply in base units: ${rawSupply.toString()}`);
  console.log(`// Wait for mining, then:`);
  console.log(`token.address  // contract address`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Alternative: Deploy via Remix IDE");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("1. Open https://remix.ethereum.org");
  console.log("2. Create a new file and paste the contents of token-contract.sol");
  console.log("3. Compile with Solidity 0.8.20+");
  console.log("4. In Deploy tab: select 'Injected Provider - MetaMask'");
  console.log(`5. Add your GYDS network to MetaMask:`);
  console.log(`     Network name: GYDS Network`);
  console.log(`     RPC host:     ${getRpcHost(RPC_URL)}`);
  console.log(`     Chain ID:     198282`);
  console.log(`     Currency:     GYDS`);
  console.log("6. Deploy with constructor args:");
  console.log(`     name_:         ${TOKEN_NAME}`);
  console.log(`     symbol_:       ${TOKEN_SYMBOL}`);
  console.log(`     decimals_:     ${TOKEN_DECIMALS}`);
  console.log(`     initialSupply: ${TOKEN_SUPPLY}`);
  console.log(`     owner:         ${deployerAddress}`);
  console.log("");
  console.log("  Copy the deployed contract address for your explorer.");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  After deployment:");
  console.log("  Add the contract address to the explorer at /admin → Tokens");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

deployViaRpc().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
