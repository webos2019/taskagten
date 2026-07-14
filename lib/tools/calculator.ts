import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ChatToolDefinition } from "../tool-registry";

const calculatorSchema = z.object({
  expression: z.string().describe("数学表达式，如: 1+2*3"),
});

function parseMathExpression(expression: string): number | string {
  const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '').trim();
  
  if (!sanitized) {
    return "无效表达式";
  }

  try {
    const tokens = tokenize(sanitized);
    const postfix = infixToPostfix(tokens);
    const result = evaluatePostfix(postfix);
    
    if (typeof result !== 'number' || !isFinite(result)) {
      return "计算结果无效";
    }
    
    return result;
  } catch {
    return "表达式错误";
  }
}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let current = '';
  
  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    
    if (/[+\-*/()]/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(char);
      continue;
    }
    
    if (/[0-9.]/.test(char)) {
      current += char;
      continue;
    }
  }
  
  if (current) {
    tokens.push(current);
  }
  
  return tokens;
}

function infixToPostfix(tokens: string[]): string[] {
  const output: string[] = [];
  const operators: string[] = [];
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  
  for (const token of tokens) {
    if (/^[\d.]+$/.test(token)) {
      output.push(token);
    } else if (token === '(') {
      operators.push(token);
    } else if (token === ')') {
      while (operators.length && operators[operators.length - 1] !== '(') {
        output.push(operators.pop()!);
      }
      operators.pop();
    } else {
      while (
        operators.length && 
        operators[operators.length - 1] !== '(' && 
        precedence[operators[operators.length - 1]] >= precedence[token]
      ) {
        output.push(operators.pop()!);
      }
      operators.push(token);
    }
  }
  
  while (operators.length) {
    output.push(operators.pop()!);
  }
  
  return output;
}

function evaluatePostfix(postfix: string[]): number {
  const stack: number[] = [];
  
  for (const token of postfix) {
    if (/^[\d.]+$/.test(token)) {
      stack.push(parseFloat(token));
    } else {
      const b = stack.pop();
      const a = stack.pop();
      
      if (a === undefined || b === undefined) {
        throw new Error("无效表达式");
      }
      
      switch (token) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          if (b === 0) {
            throw new Error("除零错误");
          }
          stack.push(a / b);
          break;
        default:
          throw new Error(`未知运算符: ${token}`);
      }
    }
  }
  
  if (stack.length !== 1) {
    throw new Error("无效表达式");
  }
  
  return stack[0];
}

export const calculatorTool: ChatToolDefinition<z.infer<typeof calculatorSchema>> = {
  name: "calculator",
  tool: langchainTool(
    async ({ expression }) => {
      const result = parseMathExpression(expression);
      return { expression, result };
    },
    {
      name: "calculator",
      description: "执行数学计算，支持加减乘除等运算",
      schema: calculatorSchema,
    },
  ),
  schema: calculatorSchema,
  formatInput: ({ expression }) => `计算: ${expression}`,
  formatOutput: (result) => JSON.stringify(result),
  getDisplayConfig: () => ({ title: "计算器", description: "数学计算", category: "math" }),
  resultIsAuthoritative: true,
  planningCategory: 'action',
  decisionWeight: 0.9,
  keywords: ["计算", "数学", "加减乘除", "表达式", "公式"],
};