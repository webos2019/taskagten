import { executeTool, type ToolCall, type ToolExecutionContext } from "@/lib/ai/runtime/tool-runtime";
import { initCapabilities } from "@/lib/capability";
import { capabilityRegistry, createCapabilityId } from "@/lib/capability/registry";
import { toolRegistry } from "@/lib/tools";
import { skillRegistry } from "@/lib/skill-registry";
import "@/lib/tools";

initCapabilities();

async function runTest(testName: string, toolCall: ToolCall, context: ToolExecutionContext = {}) {
  console.log(`\n=================== ${testName} ===================`);
  console.log(`工具调用: ${toolCall.name}`, JSON.stringify(toolCall.args));
  
  try {
    const result = await executeTool(toolCall, context);
    
    console.log(`\n执行结果:`);
    console.log(`  roundFailed: ${result.roundFailed}`);
    console.log(`  hasAuthoritativeResult: ${result.hasAuthoritativeResult}`);
    console.log(`  toolResults: ${result.toolResults.length}`);
    result.toolResults.forEach((tr, i) => {
      console.log(`    [${i}] ${tr.toolName}: ${tr.isAuthoritative ? '(权威)' : ''}`);
      try {
        const parsed = JSON.parse(tr.result);
        console.log(`        ${parsed.message || JSON.stringify(parsed).substring(0, 100)}...`);
      } catch {
        console.log(`        ${tr.result.substring(0, 100)}...`);
      }
    });
    
    console.log(`  failedToolCalls: ${result.failedToolCalls.length}`);
    result.failedToolCalls.forEach((fc, i) => {
      console.log(`    [${i}] ${fc.toolName}: ${fc.error}`);
    });
    
    console.log(`  chunks: ${result.chunks.length}`);
    result.chunks.forEach((chunk: any, i) => {
      console.log(`    [${i}] type=${chunk.type}`, chunk.toolName || chunk.resourceName || '');
    });
    
    console.log(`\n✅ 测试通过`);
  } catch (err) {
    console.log(`\n❌ 测试失败: ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  console.log("[Tool Runtime Mock 测试]");
  console.log(`已注册能力: ${capabilityRegistry.list().length} 个`);
  console.log(`已注册工具: ${toolRegistry.list().length} 个`);
  console.log(`已注册技能: ${skillRegistry.size} 个`);

  await runTest("1. 测试计算器工具", {
    id: "test-calc-001",
    name: "calculator",
    args: { expression: "1+2*3" },
  });

  await runTest("2. 测试日期时间工具", {
    id: "test-datetime-001",
    name: "datetime",
    args: { action: "current_time" },
  });

  await runTest("3. 测试单位换算工具", {
    id: "test-unit-001",
    name: "unit_convert",
    args: { value: 100, from: "km", to: "mile" },
  });

  await runTest("4. 测试读取文件", {
    id: "test-readfile-001",
    name: "read_file",
    args: { filename: "README.md" },
  });

  await runTest("5. 测试读取不存在的文件", {
    id: "test-readfile-002",
    name: "read_file",
    args: { filename: "nonexistent.txt" },
  });

  await runTest("6. 测试目录列表", {
    id: "test-listdir-001",
    name: "list_directory",
    args: {},
  });

  await runTest("7. 测试位置获取(无IP)", {
    id: "test-location-001",
    name: "get_location",
    args: {},
  });

  await runTest("8. 测试位置获取(本地IP)", {
    id: "test-location-002",
    name: "get_location",
    args: { ip: "127.0.0.1" },
  });

  await runTest("9. 测试天气查询(北京)", {
    id: "test-weather-001",
    name: "get_weather",
    args: { city: "北京" },
  });

  await runTest("10. 测试天气查询(南宁)", {
    id: "test-weather-002",
    name: "get_weather",
    args: { city: "南宁" },
  });

  await runTest("11. 测试文本转换工具", {
    id: "test-text-transform-001",
    name: "text_transform",
    args: { action: "json_pretty", content: '{"a":1,"b":2}' },
  });

  await runTest("12. 测试无效工具调用", {
    id: "test-invalid-001",
    name: "unknown_tool",
    args: { foo: "bar" },
  });

  await runTest("13. 测试计算器参数校验失败", {
    id: "test-calc-invalid-001",
    name: "calculator",
    args: {},
  });

  console.log("\n=================== 所有测试完成 ===================");
}

main().catch(console.error);