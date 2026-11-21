const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeRpcUrl,
  assertExpectedChainId,
  advanceIndexedBlock,
} = require("../helpers");

test("RPC endpoints must be absolute HTTP(S) URLs", () => {
  assert.equal(normalizeRpcUrl("/api/rpc"), null);
  assert.equal(normalizeRpcUrl("ws://node.example"), null);
  assert.equal(normalizeRpcUrl("https://node.example/rpc"), "https://node.example/rpc");
});

test("indexer accepts only its configured chain ID", () => {
  assert.equal(assertExpectedChainId("0x3068a", 198282), 198282n);
  assert.throws(() => assertExpectedChainId("0x30689", 198282), /Wrong chain ID/);
});

test("indexer cursor advances one successfully indexed block at a time", () => {
  assert.equal(advanceIndexedBlock(100, 101), 101);
  assert.throws(() => advanceIndexedBlock(100, 102), /Refusing to skip blocks/);
});
