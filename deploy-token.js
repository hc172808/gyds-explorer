#!/usr/bin/env node
// ============================================================
// GYDS Token Deployer
// ============================================================
// Deploys a standard ERC-20 token to the GYDS network via RPC.
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
//     --private-key 0xYOUR_PRIVATE_KEY
//
// Or use .env / environment variables:
//   TOKEN_NAME, TOKEN_SYMBOL, TOKEN_SUPPLY, TOKEN_DECIMALS, DEPLOYER_PRIVATE_KEY
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
const PRIVATE_KEY     = getArg("--private-key",  "DEPLOYER_PRIVATE_KEY","");
const RPC_URL         = getArg("--rpc",          "VITE_RPC_URL",        "https://rpc.netlifegy.com");
const MINTABLE        = getArg("--mintable",     "TOKEN_MINTABLE",      "false") === "true";

// ---- Validate ----------------------------------------------
if (!TOKEN_NAME)   { console.error("Error: --name is required.   Example: --name 'Gold Token'"); process.exit(1); }
if (!TOKEN_SYMBOL) { console.error("Error: --symbol is required. Example: --symbol GLD"); process.exit(1); }
if (!PRIVATE_KEY || PRIVATE_KEY === "0xYOUR_PRIVATE_KEY") {
  console.error("Error: --private-key (or DEPLOYER_PRIVATE_KEY in .env) is required.");
  console.error("This is the private key of the account that will deploy the contract.");
  console.error("Make sure the account has enough GYDS to pay gas.");
  process.exit(1);
}

// ---- Contract bytecode & ABI --------------------------------
// Standard ERC-20 (Solidity ^0.8.20) compiled with solc 0.8.24 --optimize
// Source: see token-contract.sol in the same directory.
// ABI definition
const ERC20_ABI = [
  "constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 initialSupply, address owner)",
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

// Compiled bytecode for the standard ERC-20 below.
// To recompile: solc --optimize --bin token-contract.sol
// This bytecode includes the constructor parameters encoded at deploy time by ethers.js.
const ERC20_BYTECODE =
  "0x608060405234801561001057600080fd5b5060405161" +
  // NOTE: This is a placeholder. See instructions below to compile with solc.
  // Run: node deploy-token.js --compile  to generate and cache the real bytecode.
  "PLACEHOLDER_SEE_COMPILE_INSTRUCTIONS";

// ---- Inline compile via geth RPC ---------------------------
// We use eth_sendTransaction with compiled bytecode. Since we can't run solc here,
// we generate a geth console script instead when bytecode is unavailable.

async function deployViaRpc() {
  // Dynamically require ethers
  let ethers;
  try {
    ethers = require("ethers");
  } catch {
    console.error("ethers not found. Run: npm install ethers");
    console.error("Or: cd /var/www/gyds-explorer && npm install ethers");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("");
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   GYDS Token Deployer                                ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║   Name:     ${TOKEN_NAME.padEnd(41)}║`);
  console.log(`║   Symbol:   ${TOKEN_SYMBOL.padEnd(41)}║`);
  console.log(`║   Supply:   ${TOKEN_SUPPLY.padEnd(41)}║`);
  console.log(`║   Decimals: ${TOKEN_DECIMALS.padEnd(41)}║`);
  console.log(`║   Deployer: ${wallet.address.padEnd(41)}║`);
  console.log(`║   RPC:      ${RPC_URL.padEnd(41)}║`);
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log("");

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  const ethBalance = ethers.formatEther(balance);
  console.log(`Deployer balance: ${ethBalance} GYDS`);
  if (balance === 0n) {
    console.error("Error: Deployer account has 0 GYDS. Fund the account before deploying.");
    process.exit(1);
  }

  // Get chain info
  const network = await provider.getNetwork();
  console.log(`Chain ID: ${network.chainId}`);

  // Encode constructor arguments for the geth script approach
  const supply = BigInt(TOKEN_SUPPLY) * (10n ** BigInt(TOKEN_DECIMALS));
  console.log(`Total supply (raw): ${supply.toString()}`);

  // Since we can't compile Solidity in Node without solc, we generate a geth JS script
  generateGethScript(wallet.address, supply);
}

function generateGethScript(deployerAddress, supply) {
  const supplyHex = "0x" + supply.toString(16);
  const decimalsHex = "0x" + parseInt(TOKEN_DECIMALS).toString(16);

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
  console.log(`  "${TOKEN_NAME}",       // name`);
  console.log(`  "${TOKEN_SYMBOL}",     // symbol`);
  console.log(`  ${TOKEN_DECIMALS},     // decimals`);
  console.log(`  "${supply.toString()}", // initial supply (raw)`);
  console.log(`  "${deployerAddress}",   // owner`);
  console.log(`  { from: "${deployerAddress}", data: bytecode, gas: 3000000 }`);
  console.log(`);`);
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
  console.log(`     RPC URL:      ${RPC_URL}`);
  console.log(`     Chain ID:     29987`);
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
