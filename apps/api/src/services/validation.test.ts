import { z } from "zod";
import { describe, expect, it } from "vitest";
import { validationErrorMessage } from "./validation.js";

describe("validation error messages", () => {
  it("returns the first safe field-specific issue without including submitted values", () => {
    const result = z.object({ phone: z.string().min(8) }).safeParse({ phone: "secret-input".slice(0, 3) });
    if (result.success) throw new Error("Expected validation failure");
    const message = validationErrorMessage(result.error);
    expect(message).toMatch(/^phone:/);
    expect(message).not.toContain("sec");
  });
});
