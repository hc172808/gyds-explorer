function normalizeRpcUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function assertExpectedChainId(actualHex, expectedChainId) {
  let actual;
  try {
    actual = BigInt(actualHex);
  } catch {
    throw new Error(`RPC returned an invalid chain ID: ${String(actualHex)}`);
  }

  if (actual !== BigInt(expectedChainId)) {
    throw new Error(`Wrong chain ID: expected ${BigInt(expectedChainId)}, received ${actual}`);
  }
  return actual;
}

function advanceIndexedBlock(currentBlock, nextBlock) {
  if (!Number.isSafeInteger(currentBlock) || !Number.isSafeInteger(nextBlock)) {
    throw new Error("Block cursor must use safe integer values.");
  }
  if (nextBlock !== currentBlock + 1) {
    throw new Error(`Refusing to skip blocks: expected ${currentBlock + 1}, received ${nextBlock}`);
  }
  return nextBlock;
}

module.exports = { normalizeRpcUrl, assertExpectedChainId, advanceIndexedBlock };
