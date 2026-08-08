import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadOpenApiYaml } from "./openapi.js";

describe("OpenAPI contract", () => {
  it("loads the checked-in contract used by the runtime endpoint", () => {
    const contract = loadOpenApiYaml();
    expect(contract).toContain("title: LibSwiftRide API");
    expect(contract).toContain("  /rides/quote:");
    expect(contract).toContain("bearerAuth:");
  });

  it("does not advertise operations that are absent from the API router", () => {
    const routesSource = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
    const implemented = new Set([...routesSource.matchAll(/api\.(get|post|put|patch|delete)\("([^"]+)"/g)].map((match) =>
      `${match[1]!.toUpperCase()} ${match[2]!.replace(/:([A-Za-z0-9_]+)/g, "{$1}")}`
    ));
    const documented: string[] = [];
    let currentPath = "";
    for (const line of loadOpenApiYaml().split("\n")) {
      const path = line.match(/^  (\/[^:]*):$/);
      if (path) currentPath = path[1]!;
      const method = line.match(/^    (get|post|put|patch|delete):$/);
      if (currentPath && method) documented.push(`${method[1]!.toUpperCase()} ${currentPath}`);
    }
    expect(documented.length).toBeGreaterThan(0);
    expect(documented.filter((operation) => !implemented.has(operation))).toEqual([]);
  });
});
