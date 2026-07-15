const http = require('http');

async function sendChatRequest(messages, skill = "utility-skill") {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ messages, skill });
    
    console.log("\n=== 发送请求 ===");
    console.log("Skill: " + skill);
    console.log("消息: " + JSON.stringify(messages));
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 60000
    };

    const req = http.request(options, (res) => {
      console.log("\n=== 响应 ===");
      console.log("状态码: " + res.statusCode);
      
      let responseData = '';
      const chunks = [];
      
      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        chunks.push(chunkStr);
        responseData += chunkStr;
      });
      
      res.on('end', () => {
        console.log("\n=== 解析结果 ===");
        console.log("原始数据块数量: " + chunks.length);
        
        try {
          const parsedChunks = chunks
            .join('')
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line));
          
          console.log("解析后的块数量: " + parsedChunks.length);
          
          const toolCallChunks = parsedChunks.filter(c => c.type === 'tool_call');
          const toolResultChunks = parsedChunks.filter(c => c.type === 'tool_result');
          const textChunks = parsedChunks.filter(c => c.type === 'text');
          
          console.log("\n工具调用块: " + toolCallChunks.length);
          console.log("工具结果块: " + toolResultChunks.length);
          console.log("文本块: " + textChunks.length);
          
          parsedChunks.forEach((chunk, index) => {
            console.log("\n[块 " + (index + 1) + "] type: " + chunk.type);
            if (chunk.content) {
              console.log("[块 " + (index + 1) + "] content: " + chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''));
            }
            if (chunk.toolCallId) {
              console.log("[块 " + (index + 1) + "] toolCallId: " + chunk.toolCallId);
            }
            if (chunk.toolName) {
              console.log("[块 " + (index + 1) + "] toolName: " + chunk.toolName);
            }
            if (chunk.toolArgs) {
              console.log("[块 " + (index + 1) + "] toolArgs:", chunk.toolArgs);
            }
            if (chunk.toolResult) {
              console.log("[块 " + (index + 1) + "] toolResult: " + chunk.toolResult.substring(0, 200) + (chunk.toolResult.length > 200 ? '...' : ''));
            }
          });
          
          resolve({ 
            statusCode: res.statusCode, 
            chunks: parsedChunks,
            hasToolCall: toolCallChunks.length > 0,
            hasToolResult: toolResultChunks.length > 0
          });
        } catch (err) {
          console.error('解析失败:', err);
          console.log('原始响应:', responseData);
          resolve({ statusCode: res.statusCode, raw: responseData });
        }
      });
    });

    req.on('error', (e) => {
      console.error("请求出错: " + e.message);
      reject(e);
    });

    req.on('timeout', () => {
      console.log('请求超时');
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('========================================');
  console.log('工具调用场景测试');
  console.log('========================================\n');

  let allPassed = true;

  console.log('=== 测试 1: 使用工具调用指令触发 get_weather ===');
  try {
    const result = await sendChatRequest([
      { role: "user", content: "请调用 get_weather 工具查询北京的天气" }
    ], "utility-skill");
    if (result.hasToolCall) {
      console.log('✅ 工具调用成功触发！');
    } else {
      console.log('❌ 工具调用未触发');
      allPassed = false;
    }
  } catch (err) {
    console.error('测试失败:', err.message);
    allPassed = false;
  }

  console.log('\n=== 测试 2: 使用工具调用指令触发 calculator ===');
  try {
    const result = await sendChatRequest([
      { role: "user", content: "请调用 calculator 工具计算 123 * 456" }
    ], "utility-skill");
    if (result.hasToolCall) {
      console.log('✅ 工具调用成功触发！');
    } else {
      console.log('❌ 工具调用未触发');
      allPassed = false;
    }
  } catch (err) {
    console.error('测试失败:', err.message);
    allPassed = false;
  }

  console.log('\n=== 测试 3: 中文自然语言触发天气查询 ===');
  try {
    const result = await sendChatRequest([
      { role: "user", content: "北京今天天气怎么样？" }
    ], "utility-skill");
    if (result.hasToolCall) {
      console.log('✅ 工具调用成功触发！');
    } else {
      console.log('❌ 工具调用未触发 - 模型直接回答了');
    }
  } catch (err) {
    console.error('测试失败:', err.message);
  }

  console.log('\n=== 测试 4: 中文自然语言触发计算 ===');
  try {
    const result = await sendChatRequest([
      { role: "user", content: "计算一下 12345 * 67890 等于多少" }
    ], "utility-skill");
    if (result.hasToolCall) {
      console.log('✅ 工具调用成功触发！');
    } else {
      console.log('❌ 工具调用未触发 - 模型直接回答了');
    }
  } catch (err) {
    console.error('测试失败:', err.message);
  }

  console.log('\n========================================');
  console.log('测试完成:', allPassed ? '所有测试通过' : '部分测试未通过');
  console.log('========================================');
}

runTests().catch(console.error);
