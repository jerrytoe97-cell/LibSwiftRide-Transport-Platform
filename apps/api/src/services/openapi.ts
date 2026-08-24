import { readFileSync } from "node:fs";

const contractUrl = new URL("../../../../docs/openapi.yaml", import.meta.url);

export function loadOpenApiYaml() {
  const contract = readFileSync(contractUrl, "utf8").replaceAll("\r\n", "\n");
  if (!contract.startsWith("openapi: 3.1.0") || !contract.includes("\npaths:\n")) {
    throw new Error("The OpenAPI contract is missing or invalid");
  }
  return contract;
}
