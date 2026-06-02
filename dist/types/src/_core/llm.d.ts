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
        mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
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
export type ToolChoiceByName = {
    name: string;
};
export type ToolChoiceExplicit = {
    type: "function";
    function: {
        name: string;
    };
};
export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;
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
export type ResponseFormat = {
    type: "text";
} | {
    type: "json_object";
} | {
    type: "json_schema";
    json_schema: JsonSchema;
};
export declare function invokeLLM(params: InvokeParams): Promise<InvokeResult>;
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
export declare function invokeLLMWithFallback(params: InvokeParams, options?: {
    skipFallback?: boolean;
}): Promise<InvokeResult>;
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
export declare function sanitizeUserPrompt(input: string, maxLength?: number): string;
