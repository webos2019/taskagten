#!/usr/bin/env node
/**
 * 测试 tasklist MCP Server 的 prompt、resource 和 tool 调用
 */

const { mcpClientManager } = require('./lib/mcp/manager');
const path = require('path');

const TASKLIST_SERVER_ID = 'tasklist-server';
const tsxPath = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');

async function testTasklistMCP() {
  console.log('=== 测试 Tasklist MCP Server ===\n');

  // 注册 server
  mcpClientManager.register(TASKLIST_SERVER_ID, {
    serverId: TASKLIST_SERVER_ID,
    command: process.execPath,
    args: [tsxPath, path.resolve(process.cwd(), 'lib/mcp/servers/tasklist-server.ts')],
  });

  try {
    // 测试 1: 调用 tasklist-draft prompt
    console.log('\n--- 测试 1: tasklist-draft prompt ---');
    const promptResult = await mcpClientManager.getPrompt(TASKLIST_SERVER_ID, 'tasklist-draft', {
      goal: '我要查看北京的天气',
    });
    console.log('Prompt 结果:');
    if (promptResult.messages) {
      for (const msg of promptResult.messages) {
        if (typeof msg.content === 'string') {
          console.log(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c.type === 'text') console.log(c.text);
          }
        }
      }
    }

    // 测试 2: 读取 project://latest-context resource
    console.log('\n--- 测试 2: project://latest-context resource ---');
    const resourceResult = await mcpClientManager.readResource(TASKLIST_SERVER_ID, 'project://latest-context');
    console.log('Resource 结果:');
    if (resourceResult.contents) {
      for (const c of resourceResult.contents) {
        console.log(c.text || '(无文本内容)');
      }
    }

    // 测试 3: 调用 check_doc_consistency tool
    console.log('\n--- 测试 3: check_doc_consistency tool ---');
    const toolResult = await mcpClientManager.callTool(TASKLIST_SERVER_ID, 'check_doc_consistency', {
      docContent: 'function foo() { return 42; }',
      actualContent: 'function bar() { return 42; }',
    });
    console.log('Tool 结果:');
    if (toolResult.content) {
      for (const c of toolResult.content) {
        if (c.type === 'text') console.log(c.text);
      }
    }

    console.log('\n=== 所有测试通过 ===');
  } catch (err) {
    console.error('\n=== 测试失败 ===');
    console.error(err);
  } finally {
    await mcpClientManager.shutdown();
  }
}

testTasklistMCP();
