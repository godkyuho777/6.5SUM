import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  model?: string;
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") return part;
  if (part.type === "image_url") return part;
  if (part.type === "file_url") return part;

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return { role, name, tool_call_id, content };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return { role, name, content: contentParts[0].text };
  }

  return { role, name, content: contentParts };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;
  if (toolChoice === "none" || toolChoice === "auto") return toolChoice;

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return { type: "function", function: { name: toolChoice.name } };
  }

  return toolChoice;
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const {
    messages,
    model,
    tools,
    toolChoice,
    tool_choice,
    maxTokens,
    max_tokens,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: model ?? ENV.openrouterModel,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice ?? tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  const resolvedMaxTokens = maxTokens ?? max_tokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${ENV.openrouterApiKey}`,
    "X-Title": ENV.openrouterAppName,
  };
  if (ENV.openrouterSiteUrl) {
    headers["HTTP-Referer"] = ENV.openrouterSiteUrl;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}

// ─── P2-#4 (2026-05-23): Anthropic direct fallback ───────────────────────
//
// OpenRouter 장애 시 backup. AUDIT.md 권장: 단일 provider 의존 → fallback
// 다중화.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * Anthropic Messages API direct 호출 (OpenRouter 형식 → Anthropic 형식 변환).
 *
 * 차이점:
 *   - OpenRouter: messages 배열 + system 메시지를 messages 안에 role:"system"
 *   - Anthropic: system 별도 필드 + messages 에는 user/assistant 만
 *   - tools / response_format 도 형식 다름 (현재 fallback 은 plain text 만 지원)
 */
async function invokeAnthropicDirect(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured (fallback unavailable)");
  }
  // System 메시지 분리
  const systemMessages = params.messages.filter((m) => m.role === "system");
  const nonSystemMessages = params.messages.filter((m) => m.role !== "system");
  const systemContent = systemMessages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n\n");

  // user / assistant 만 변환 (tool / function messages 는 fallback 미지원)
  const anthropicMessages = nonSystemMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

  const payload = {
    model: ENV.anthropicModel,
    max_tokens: params.maxTokens ?? params.max_tokens ?? 1024,
    ...(systemContent ? { system: systemContent } : {}),
    messages: anthropicMessages,
  };

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Anthropic invoke failed: ${response.status} ${response.statusText} – ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    id: string;
    model: string;
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  // Anthropic 응답을 OpenRouter 호환 InvokeResult 로 변환
  const text = data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");

  return {
    id: data.id,
    created: Math.floor(Date.now() / 1000),
    model: data.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: "stop",
      },
    ],
    usage: data.usage
      ? {
          prompt_tokens: data.usage.input_tokens,
          completion_tokens: data.usage.output_tokens,
          total_tokens: data.usage.input_tokens + data.usage.output_tokens,
        }
      : undefined,
  } as InvokeResult;
}

/**
 * P2-#4: LLM invoke with automatic fallback.
 *
 * Primary: OpenRouter (multi-model gateway, cost-effective)
 * Fallback: Anthropic direct (장애 시 backup)
 *
 * @param params 표준 InvokeParams
 * @param options.skipFallback true 면 OpenRouter 실패 시 즉시 throw (test 용)
 * @returns InvokeResult — OpenRouter 또는 Anthropic 어느 쪽이든 통일 형식
 */
export async function invokeLLMWithFallback(
  params: InvokeParams,
  options: { skipFallback?: boolean } = {},
): Promise<InvokeResult> {
  try {
    return await invokeLLM(params);
  } catch (primaryErr) {
    if (options.skipFallback || !ENV.anthropicApiKey) {
      throw primaryErr;
    }
    console.warn(
      `[llm] OpenRouter failed (${(primaryErr as Error).message?.slice(0, 100)}), trying Anthropic direct fallback`,
    );
    try {
      return await invokeAnthropicDirect(params);
    } catch (fallbackErr) {
      console.error(
        `[llm] Both OpenRouter + Anthropic fallback failed. ` +
          `Primary: ${(primaryErr as Error).message?.slice(0, 80)}. ` +
          `Fallback: ${(fallbackErr as Error).message?.slice(0, 80)}`,
      );
      throw fallbackErr;
    }
  }
}

/**
 * P2-#4: Prompt injection 방어 헬퍼.
 *
 * 사용자 입력을 LLM 의 system prompt 내부에 직접 삽입하기 전에 호출.
 * Markdown / 특수 문자 escape + length cap.
 *
 * 한계:
 *   - 완벽한 방어 X — LLM 자체가 학습 데이터에서 prompt injection 패턴 인식
 *   - 본 헬퍼는 *첫 번째 방어선* — 명백한 escape attempts 차단
 *   - 진짜 보안 critical 한 경우는 user/system message 분리 (별도 messages 배열) 사용
 *
 * @param input 사용자 raw 입력
 * @param maxLength 최대 문자 수 (default 4000 — Claude context 비례)
 */
export function sanitizeUserPrompt(input: string, maxLength = 4000): string {
  if (typeof input !== "string") return "";
  let result = input
    // markdown fence 차단 (LLM 이 사용자 입력을 코드 블록으로 잘못 해석 방지)
    .replace(/```/g, "''")
    // Anthropic / OpenAI 의 system prompt escape 패턴
    .replace(/\\nSystem:/gi, " system:")
    .replace(/\\nAssistant:/gi, " assistant:")
    .replace(/\\nHuman:/gi, " human:");
  // Length cap
  if (result.length > maxLength) {
    result = result.slice(0, maxLength) + "... [TRUNCATED]";
  }
  return result;
}
