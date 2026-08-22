import { describe, expect, it } from "vitest";
import { distanceMetres, estimateEtaSeconds } from "./tracking.js";

describe("tracking", () => {
  it("calculates a bounded Monrovia route distance and ETA", () => {
    const distance = distanceMetres({ latitude: 6.3156, longitude: -10.8074 }, { latitude: 6.3058, longitude: -10.7492 });
    expect(distance).toBeGreaterThan(6_000);
    expect(distance).toBeLessThan(7_000);
    expect(estimateEtaSeconds(distance)).toBeGreaterThan(700);
  });
});
