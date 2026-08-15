import type { ZodError } from "zod";

export function validationErrorMessage(error: ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Request validation failed";
  const field = issue.path.map(String).join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}
