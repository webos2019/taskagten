export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export interface OrchestratorError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
  originalError?: { message: string; stack?: string };
}

export const ErrorCodes = {
  TOOL_NOT_FOUND: "TOOL_NOT_FOUND",
  TOOL_PARAMETER_ERROR: "TOOL_PARAMETER_ERROR",
  TOOL_EXECUTION_ERROR: "TOOL_EXECUTION_ERROR",
  TOOL_UNAVAILABLE: "TOOL_UNAVAILABLE",
  CAPABILITY_NOT_FOUND: "CAPABILITY_NOT_FOUND",
  CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
  CAPABILITY_EXECUTION_ERROR: "CAPABILITY_EXECUTION_ERROR",
  LLM_TIMEOUT: "LLM_TIMEOUT",
  LLM_ERROR: "LLM_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

export class ToolExecutionError extends Error {
  public code: string;
  public details?: Record<string, unknown>;
  public retryable: boolean;

  constructor(code: string, message: string, details?: Record<string, unknown>, retryable: boolean = false) {
    super(message);
    this.name = "ToolExecutionError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toJSON(): ToolError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
    };
  }
}

export class CapabilityError extends Error {
  public code: string;
  public details?: Record<string, unknown>;
  public retryable: boolean;

  constructor(code: string, message: string, details?: Record<string, unknown>, retryable: boolean = false) {
    super(message);
    this.name = "CapabilityError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toJSON(): ToolError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
    };
  }
}

export class OrchestratorRuntimeError extends Error {
  public code: string;
  public details?: Record<string, unknown>;
  public retryable: boolean;
  public originalError?: Error;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
    retryable: boolean = false,
    originalError?: Error
  ) {
    super(message);
    this.name = "OrchestratorRuntimeError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    this.originalError = originalError;
  }

  toJSON(): OrchestratorError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      retryable: this.retryable,
      originalError: this.originalError ? { message: this.originalError.message, stack: this.originalError.stack } : undefined,
    };
  }
}

export function createToolNotFoundError(toolName: string): ToolExecutionError {
  return new ToolExecutionError(
    ErrorCodes.TOOL_NOT_FOUND,
    `工具 "${toolName}" 未找到`,
    { toolName },
    false
  );
}

export function createToolParameterError(toolName: string, errors: Array<{ field: string; message: string }>): ToolExecutionError {
  return new ToolExecutionError(
    ErrorCodes.TOOL_PARAMETER_ERROR,
    `工具 "${toolName}" 参数校验失败`,
    { toolName, errors },
    false
  );
}

export function createToolExecutionError(toolName: string, error: Error): ToolExecutionError {
  return new ToolExecutionError(
    ErrorCodes.TOOL_EXECUTION_ERROR,
    `工具 "${toolName}" 执行失败: ${error.message}`,
    { toolName, error: error.message },
    error.message.includes("timeout")
  );
}

export function createToolUnavailableError(toolName: string, availability: string): ToolExecutionError {
  return new ToolExecutionError(
    ErrorCodes.TOOL_UNAVAILABLE,
    `工具 "${toolName}" 当前不可用 (${availability})`,
    { toolName, availability },
    availability === "starting"
  );
}

export function createCapabilityNotFoundError(capabilityId: string): CapabilityError {
  return new CapabilityError(
    ErrorCodes.CAPABILITY_NOT_FOUND,
    `能力 "${capabilityId}" 未找到`,
    { capabilityId },
    false
  );
}

export function createCapabilityUnavailableError(capabilityId: string, availability: string): CapabilityError {
  return new CapabilityError(
    ErrorCodes.CAPABILITY_UNAVAILABLE,
    `能力 "${capabilityId}" 当前不可用 (${availability})`,
    { capabilityId, availability },
    availability === "starting"
  );
}

export function createCapabilityExecutionError(capabilityId: string, error: Error): CapabilityError {
  return new CapabilityError(
    ErrorCodes.CAPABILITY_EXECUTION_ERROR,
    `能力 "${capabilityId}" 执行失败: ${error.message}`,
    { capabilityId, error: error.message },
    error.message.includes("timeout")
  );
}

export function createLLMTimeoutError(operation: string): OrchestratorRuntimeError {
  return new OrchestratorRuntimeError(
    ErrorCodes.LLM_TIMEOUT,
    `${operation} 超时`,
    { operation },
    true
  );
}

export function createLLMError(operation: string, error: Error): OrchestratorRuntimeError {
  return new OrchestratorRuntimeError(
    ErrorCodes.LLM_ERROR,
    `${operation} 失败: ${error.message}`,
    { operation, error: error.message },
    false,
    error
  );
}

export function createValidationError(message: string, details?: Record<string, unknown>): OrchestratorRuntimeError {
  return new OrchestratorRuntimeError(
    ErrorCodes.VALIDATION_ERROR,
    message,
    details,
    false
  );
}

export function createInternalError(message: string, error?: Error): OrchestratorRuntimeError {
  return new OrchestratorRuntimeError(
    ErrorCodes.INTERNAL_ERROR,
    message,
    error ? { error: error.message } : undefined,
    true,
    error
  );
}

export function isRetryableError(error: Error): boolean {
  if (error instanceof ToolExecutionError || error instanceof CapabilityError || error instanceof OrchestratorRuntimeError) {
    return error.retryable;
  }
  return error.message.includes("timeout") || error.message.includes("网络") || error.message.includes("network");
}

export function formatErrorForUser(error: Error): string {
  if (error instanceof ToolExecutionError || error instanceof CapabilityError || error instanceof OrchestratorRuntimeError) {
    return error.message;
  }
  return "服务暂时不可用，请稍后重试";
}

export function formatErrorForLogging(error: Error): string {
  if (error instanceof ToolExecutionError || error instanceof CapabilityError || error instanceof OrchestratorRuntimeError) {
    return `[${error.code}] ${error.message}${error.details ? ` | ${JSON.stringify(error.details)}` : ""}`;
  }
  return `${error.name}: ${error.message}\n${error.stack}`;
}