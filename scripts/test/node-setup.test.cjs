const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const helpers = path.resolve(__dirname, "../node-setup-helpers.sh");
const setupScript = path.resolve(__dirname, "../../node-setup.sh");
const nodeVerify = path.resolve(__dirname, "../../node-verify.sh");

function runShell(command, args = []) {
  return spawnSync("bash", ["-c", command, "bash", helpers, ...args], {
    encoding: "utf8",
  });
}

test("unsigned supply parsing strips leading zeroes without arithmetic overflow", () => {
  const normalized = runShell('source "$1"; gyds_normalize_uint "$2"', [
    "000000000000000000000000000000000000000010",
  ]);
  assert.equal(normalized.status, 0);
  assert.equal(normalized.stdout.trim(), "10");

  const atMainnetCap = runShell('source "$1"; gyds_uint_le "$2" 3000000000', [
    "3000000000",
  ]);
  assert.equal(atMainnetCap.status, 0);

  const aboveMainnetCap = runShell('source "$1"; gyds_uint_le "$2" 3000000000', [
    "3000000001",
  ]);
  assert.notEqual(aboveMainnetCap.status, 0);

  const validLeadingZeroes = runShell('source "$1"; gyds_uint_le "$2" 3000000000', [
    "000000000000001000000000",
  ]);
  assert.equal(validLeadingZeroes.status, 0);
});

test("Mainnet node setup targets exactly 3 billion GYDS", () => {
  const source = readFileSync(setupScript, "utf8");
  assert.match(source, /NATIVE_SUPPLY="\$\{NATIVE_SUPPLY:-3000000000\}"/);
  assert.match(source, /\[ "\$NATIVE_SUPPLY_VALUE" = "3000000000" \]/);
  assert.match(source, /Mainnet NATIVE_SUPPLY must be exactly 3,000,000,000 GYDS/);

  const mainnetEnvFiles = source.match(/else\s+ENV_FILES=\(([\s\S]*?)\n\s*\)\nfi/);
  assert.ok(mainnetEnvFiles);
  const files = mainnetEnvFiles[1];
  assert.ok(files.indexOf('"${SCRIPT_DIR}/node.env"') < files.indexOf('"${SCRIPT_DIR}/.env"'));
  assert.ok(files.indexOf('"/etc/gyds/node.env"') < files.indexOf('"${SCRIPT_DIR}/.env"'));
});

test("network selection maps to the documented chain IDs and node ports", () => {
  const result = runShell(
    'source "$1"; printf "%s %s %s %s %s\\n" "$(gyds_network_chain_id testnet)" "$(gyds_network_default_port testnet rpc)" "$(gyds_network_default_port testnet ws)" "$(gyds_network_default_port testnet p2p)" "$(gyds_network_default_port testnet metrics)"',
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "198281 9545 9546 30304 6061");

  const invalid = runShell('source "$1"; gyds_network_chain_id staging');
  assert.notEqual(invalid.status, 0);
});

test("enode output is unquoted and validated before sharing", () => {
  const key = "a".repeat(128);
  const quoted = `"enode://${key}@203.0.113.10:30303?discport=0"\r`;
  const normalized = runShell('source "$1"; gyds_normalize_enode_output "$2"', [quoted]);
  assert.equal(normalized.status, 0);
  assert.equal(normalized.stdout.trim(), `enode://${key}@203.0.113.10:30303?discport=0`);

  const valid = runShell('source "$1"; gyds_is_valid_enode_url "$2"', [
    normalized.stdout.trim(),
  ]);
  assert.equal(valid.status, 0);

  const invalid = runShell('source "$1"; gyds_is_valid_enode_url "$2"', [
    `enode://abcd@203.0.113.10:30303`,
  ]);
  assert.notEqual(invalid.status, 0);
});

test("node verifier applies Testnet chain identity from NETWORK_ENV", async (context) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "gyds-verify-test-"));
  context.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const binDir = path.join(tempDir, "bin");
  mkdirSync(binDir);
  const sleep = path.join(binDir, "sleep");
  writeFileSync(sleep, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(sleep, 0o755);
  const curl = path.join(binDir, "curl");
  writeFileSync(curl, `#!/usr/bin/env bash
payload=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--data" ]; then payload="$2"; shift 2; else shift; fi
done
method="$(printf '%s' "$payload" | jq -r '.method')"
case "$method" in
  eth_chainId) result='"0x30689"' ;;
  net_version) result='"198281"' ;;
  eth_blockNumber) result='"0x10"' ;;
  net_peerCount) result='"0x1"' ;;
  eth_syncing) result='false' ;;
  eth_getBlockByNumber) result='{"hash":"0x${"a".repeat(64)}"}' ;;
  web3_clientVersion) result='"Geth/test"' ;;
  *) result='null' ;;
esac
printf '{"jsonrpc":"2.0","id":1,"result":%s}\\n' "$result"
`);
  chmodSync(curl, 0o755);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    NETWORK_ENV: "testnet",
    CHECK_HOST: "no",
    MIN_PEERS: "0",
  };
  delete env.RPC_URL;
  const result = spawnSync("bash", [nodeVerify], {
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /chain_id=198281 \(0x30689\)/);
  assert.match(result.stdout, /network_id=198281/);
  assert.match(result.stdout, /rpc_host=127\.0\.0\.1:9545/);
  assert.match(result.stdout, /status=OK/);
});

test("peer genesis is initialized only when its chain ID matches", (context) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "gyds-genesis-test-"));
  context.after(() => rmSync(tempDir, { recursive: true, force: true }));
  const dataDir = path.join(tempDir, "data");
  const genesis = path.join(tempDir, "genesis.json");
  const callLog = path.join(tempDir, "geth-args.txt");
  const geth = path.join(tempDir, "geth");
  mkdirSync(dataDir);
  writeFileSync(geth, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "$CALL_LOG"\n`);
  chmodSync(geth, 0o755);
  process.env.CALL_LOG = callLog;
  context.after(() => {
    delete process.env.CALL_LOG;
  });

  writeFileSync(genesis, JSON.stringify({ config: { chainId: 198282 } }));
  const valid = spawnSync("bash", [
    "-c",
    'source "$1"; gyds_validate_and_init_genesis "$2" 198282 "$3" "$4"',
    "bash",
    helpers,
    genesis,
    dataDir,
    geth,
  ], { encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(readFileSync(callLog, "utf8").trim().split("\n"), [
    "init",
    "--datadir",
    dataDir,
    genesis,
  ]);

  rmSync(callLog);
  writeFileSync(genesis, JSON.stringify({ config: { chainId: 198281 } }));
  const wrongNetwork = spawnSync("bash", [
    "-c",
    'source "$1"; gyds_validate_and_init_genesis "$2" 198282 "$3" "$4"',
    "bash",
    helpers,
    genesis,
    dataDir,
    geth,
  ], { encoding: "utf8" });
  assert.notEqual(wrongNetwork.status, 0);
  assert.match(wrongNetwork.stderr, /does not match 198282/);
  assert.equal(require("node:fs").existsSync(callLog), false);

  writeFileSync(genesis, JSON.stringify({ config: { chainId: 198282.5 } }));
  const invalidIdentity = spawnSync("bash", [
    "-c",
    'source "$1"; gyds_validate_and_init_genesis "$2" 198282 "$3" "$4"',
    "bash",
    helpers,
    genesis,
    dataDir,
    geth,
  ], { encoding: "utf8" });
  assert.notEqual(invalidIdentity.status, 0);
  assert.match(invalidIdentity.stderr, /valid positive integer/);
  assert.equal(require("node:fs").existsSync(callLog), false);
});
