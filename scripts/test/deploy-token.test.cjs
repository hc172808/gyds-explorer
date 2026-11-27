const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const deployScript = path.resolve(__dirname, "../../deploy-token.js");
const deployer = "0x1111111111111111111111111111111111111111";
const unreachableRpc = "http://127.0.0.1:1";

function runDeploy(symbol, supply, mintable) {
  return spawnSync(process.execPath, [
    deployScript,
    "--name", `${symbol} test`,
    "--symbol", symbol,
    "--supply", supply,
    "--decimals", symbol === "GYD" ? "6" : "18",
    "--mintable", String(mintable),
    "--deployer-address", deployer,
    "--rpc", unreachableRpc,
  ], { encoding: "utf8", timeout: 15000 });
}

test("mintable GYD accepts zero initial supply for on-demand minting", () => {
  const result = runDeploy("GYD", "0", true);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(output, /zero is allowed only for mintable GYD/);
  assert.doesNotMatch(output, /GYD must use 6 decimals and owner-controlled minting/);
});

test("zero initial supply remains invalid for non-GYD tokens", () => {
  const result = runDeploy("TEST", "0", false);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 1);
  assert.match(output, /zero is allowed only for mintable GYD/);
});
