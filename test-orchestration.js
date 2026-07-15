const http = require('http');

async function sendChatRequest(messages, skill = "utility-skill") {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ messages, skill });
    
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
      console.log(`\n[请求] 状态码: ${res.statusCode}`);
      console.log('[请求] 响应头 Content-Type:', res.headers['content-type']);
      
      let responseData = '';
      const chunks = [];
      
      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        chunks.push(chunkStr);
        responseData += chunkStr;
      });
      
      res.on('end', () => {
        console.log('[请求] 响应结束');
        console.log('[请求] 收到的 chunk 数量:', chunks.length);
        
        try {
          const parsedChunks = chunks
            .join('')
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line));
          
          console.log('[请求] 解析后的 chunk 数量:', parsedChunks.length);
          
          parsedChunks.forEach((chunk, index) => {
            console.log(`\n[Chunk ${index + 1}] type: ${chunk.type}`);
            if (chunk.content) {
              console.log(`[Chunk ${index + 1}] content: ${chunk.content.substring(0, 100)}${chunk.content.length > 100 ? '...' : ''}`);
            }
            if (chunk.toolCallId) {
              console.log(`[Chunk ${index + 1}] toolCallId: ${chunk.toolCallId}`);
            }
            if (chunk.toolName) {
              console.log(`[Chunk ${index + 1}] toolName: ${chunk.toolName}`);
            }
            if (chunk.toolArgs) {
              console.log(`[Chunk ${index + 1}] toolArgs:`, chunk.toolArgs);
            }
            if (chunk.error) {
              console.log(`[Chunk ${index + 1}] error: ${chunk.error}`);
            }
          });
          
          resolve({ statusCode: res.statusCode, chunks: parsedChunks });
        } catch (err) {
          console.error('[请求] 解析响应失败:', err);
          console.log('[请求] 原始响应:', responseData);
          resolve({ statusCode: res.statusCode, raw: responseData });
        }
      });
    });

    req.on('error', (e) => {
      console.error(`[请求] 出错: ${e.message}`);
      reject(e);
    });

    req.on('timeout', () => {
      console.log('[请求] 超时');
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('========================================');
  console.log('测试新的编排流程 - 工具调用场景');
  console.log('========================================\n');

  console.log('=== 测试 1: 天气查询（会触发工具调用）===');
  try {
    await sendChatRequest([
      { role: "user", content: "北京今天天气怎么样？" }
    ], "utility-skill");
  } catch (err) {
    console.error('测试 1 失败:', err.message);
  }

  console.log('\n=== 测试 2: 计算（会触发工具调用）===');
  try {
    await sendChatRequest([
      { role: "user", content: "123 + 456 等于多少？" }
    ], "utility-skill");
  } catch (err) {
    console.error('测试 2 失败:', err.message);
  }

  console.log('\n=== 测试 3: 普通问答（不会触发工具调用）===');
  try {
    await sendChatRequest([
      { role: "user", content: "你好，介绍一下你自己" }
    ], "utility-skill");
  } catch (err) {
    console.error('测试 3 失败:', err.message);
  }

  console.log('\n=== 测试 4: 读取文件（会触发工具调用）===');
  try {
    await sendChatRequest([
      { role: "user", content: "读取 README.md 文件内容" }
    ], "reader-skill");
  } catch (err) {
    console.error('测试 4 失败:', err.message);
  }

  console.log('\n========================================');
  console.log('所有测试完成');
  console.log('========================================');
}

runTests().catch(console.error);
