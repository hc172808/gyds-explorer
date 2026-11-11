import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "artifacts/solana-explorer/src/lib/TGYDTestToken.sol");
const artifactPath = path.join(
  root,
  "artifacts/solana-explorer/src/lib/tgyd-token-artifact.json",
);
const source = await readFile(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: { "TGYDTestToken.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((error) => error.severity === "error");
if (errors.length) {
  throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
}

const contract = output.contracts?.["TGYDTestToken.sol"]?.TGYDTestToken;
if (!contract?.evm?.bytecode?.object) {
  throw new Error("Solidity compiler did not produce TGYD bytecode.");
}

await writeFile(
  artifactPath,
  `${JSON.stringify({
    contractName: "TGYDTestToken",
    compilerVersion: solc.version(),
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  }, null, 2)}\n`,
);
console.log(`Wrote ${path.relative(root, artifactPath)} using ${solc.version()}`);
