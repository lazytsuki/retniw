import { ApiError } from "@/src/lib/api-error";
import { parseEntryInput } from '@/src/server/fragments/parse-fragment-input'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ThoughtEntryInput = {
  entryId: string;
  clientRequestId: string;
  content: string;
  entryType: "user" | "import";
  sourceLabel: string | null;
};

function requireUuid(value: unknown, field: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ApiError(400, "INVALID_INPUT", `${field} 必须是有效的 UUID`);
  }

  return value;
}

export function parseThoughtEntryInput(body: unknown): ThoughtEntryInput {
  if (!body || typeof body !== "object") {
    throw new ApiError(400, "INVALID_INPUT", "请求内容无效");
  }

  const input = body as Record<string, unknown>;
  const entry = parseEntryInput(input)

  return {
    entryId: requireUuid(input.entryId, "entryId"),
    clientRequestId: requireUuid(input.clientRequestId, "clientRequestId"),
    ...entry,
  };
}

export function parseThoughtInput(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new ApiError(400, "INVALID_INPUT", "请求内容无效");
  }

  return {
    thoughtId: requireUuid((body as Record<string, unknown>).thoughtId, "thoughtId"),
    ...parseThoughtEntryInput(body),
  };
}
