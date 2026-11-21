const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeRpcUrl,
  assertExpectedChainId,
  advanceIndexedBlock,
  withTransaction,
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

test("database transaction commits and releases its client on success", async () => {
  const calls = [];
  const client = {
    query: async (statement) => calls.push(statement),
    release: () => calls.push("RELEASE"),
  };
  const pool = { connect: async () => client };

  const result = await withTransaction(pool, async (transaction) => {
    assert.equal(transaction, client);
    calls.push("WRITE BLOCK DATA");
    return "saved";
  });

  assert.equal(result, "saved");
  assert.deepEqual(calls, ["BEGIN", "WRITE BLOCK DATA", "COMMIT", "RELEASE"]);
});

test("database transaction rolls back and releases its client on failure", async () => {
  const calls = [];
  const client = {
    query: async (statement) => calls.push(statement),
    release: () => calls.push("RELEASE"),
  };
  const pool = { connect: async () => client };

  await assert.rejects(
    withTransaction(pool, async () => {
      calls.push("WRITE BLOCK DATA");
      throw new Error("database write failed");
    }),
    /database write failed/,
  );

  assert.deepEqual(calls, ["BEGIN", "WRITE BLOCK DATA", "ROLLBACK", "RELEASE"]);
});
