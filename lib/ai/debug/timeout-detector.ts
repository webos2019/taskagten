export interface TimeoutConfig {
  timeoutMs: number;
  checkIntervalMs?: number;
  onTimeout?: (info: TimeoutInfo) => void;
}

export interface TimeoutInfo {
  operation: string;
  elapsedMs: number;
  startTime: number;
  stack?: string;
}

const defaultConfig: TimeoutConfig = {
  timeoutMs: 30000,
  checkIntervalMs: 5000,
};

export function withTimeout<T>(
  operation: string,
  promise: Promise<T>,
  config?: Partial<TimeoutConfig>
): Promise<T> {
  const mergedConfig = { ...defaultConfig, ...config };
  const startTime = Date.now();
  const stack = new Error().stack;

  let isCompleted = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let checkIntervalId: ReturnType<typeof setInterval> | null = null;

  const checkProgress = () => {
    if (isCompleted) return;
    
    const elapsedMs = Date.now() - startTime;
    const progress = Math.round((elapsedMs / mergedConfig.timeoutMs) * 100);
    
    console.log(`[DEBUG-TIMEOUT] [${operation}] Still running... elapsed=${elapsedMs}ms (${progress}%)`);
  };

  const triggerTimeout = () => {
    if (isCompleted) return;
    isCompleted = true;
    
    if (checkIntervalId) {
      clearInterval(checkIntervalId);
    }

    const elapsedMs = Date.now() - startTime;
    const timeoutInfo: TimeoutInfo = {
      operation,
      elapsedMs,
      startTime,
      stack,
    };

    console.error(`\n🚨 [DEBUG-TIMEOUT] TIMEOUT DETECTED! Operation "${operation}" has been running for ${elapsedMs}ms`);
    console.error(`[DEBUG-TIMEOUT] Timeout threshold: ${mergedConfig.timeoutMs}ms`);
    console.error(`[DEBUG-TIMEOUT] Call stack:`);
    console.error(stack);
    console.error(`\n[DEBUG-TIMEOUT] Possible causes:`);
    console.error(`  1. Network request hanging (API not responding)`);
    console.error(`  2. External process stuck (MCP server not starting)`);
    console.error(`  3. Promise never resolving`);
    console.error(`  4. Deadlock or infinite loop\n`);

    if (config?.onTimeout) {
      config.onTimeout(timeoutInfo);
    }
  };

  checkIntervalId = setInterval(checkProgress, mergedConfig.checkIntervalMs!);
  timeoutId = setTimeout(triggerTimeout, mergedConfig.timeoutMs);

  return promise.finally(() => {
    isCompleted = true;
    if (timeoutId) clearTimeout(timeoutId);
    if (checkIntervalId) clearInterval(checkIntervalId);
    
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > mergedConfig.timeoutMs) {
      console.log(`[DEBUG-TIMEOUT] [${operation}] Completed after timeout warning: ${elapsedMs}ms`);
    } else if (elapsedMs > mergedConfig.timeoutMs / 2) {
      console.log(`[DEBUG-TIMEOUT] [${operation}] Slow but completed: ${elapsedMs}ms`);
    }
  });
}

export function timeoutGuard<T>(
  operation: string,
  timeoutMs: number = 30000
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    
    if (typeof originalMethod !== 'function') {
      return descriptor;
    }

    descriptor.value = async function(...args: any[]) {
      const promise = originalMethod.apply(this, args);
      return withTimeout(`${operation} (${propertyKey})`, promise, { timeoutMs });
    };

    return descriptor;
  };
}

export function debugLogStep(step: string, detail?: string) {
  console.log(`\n📋 [DEBUG-STEP] === ${step} ===`);
  if (detail) {
    console.log(`[DEBUG-STEP] Detail: ${detail}`);
  }
}

export function debugLogTiming(operation: string, startTime: number) {
  const elapsed = Date.now() - startTime;
  console.log(`⏱️ [DEBUG-TIMING] ${operation}: ${elapsed}ms`);
  return elapsed;
}