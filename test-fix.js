const http = require('http');

console.log('=== 测试修复后的天气查询 ===\n');

const testData = {
  messages: [
    {
      role: "user",
      content: "南宁天气"
    }
  ],
  skill: "utility-skill" // 使用utility-skill而不是reader-skill
};

const postData = JSON.stringify(testData);

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  },
  timeout: 15000
};

console.log('请求信息:');
console.log('URL:', `http://${options.hostname}:${options.port}${options.path}`);
console.log('Skill:', testData.skill);
console.log('问题:', testData.messages[0].content);
console.log('\n发送请求...');

const startTime = Date.now();
const req = http.request(options, (res) => {
  console.log(`\n状态码: ${res.statusCode}`);
  
  let responseData = '';
  let chunkCount = 0;
  
  res.on('data', (chunk) => {
    chunkCount++;
    const chunkStr = chunk.toString();
    responseData += chunkStr;
    
    try {
      const parsed = JSON.parse(chunkStr);
      console.log(`数据块 ${chunkCount}:`);
      console.log('  类型:', parsed.type);
      if (parsed.content) {
        console.log('  内容:', parsed.content.substring(0, 100) + (parsed.content.length > 100 ? '...' : ''));
      }
      if (parsed.toolName) {
        console.log('  工具:', parsed.toolName);
      }
    } catch {
      if (chunkStr.trim()) {
        console.log(`原始数据块 ${chunkCount}:`, chunkStr);
      }
    }
  });
  
  res.on('end', () => {
    const elapsed = Date.now() - startTime;
    console.log(`\n=== 测试完成 ===`);
    console.log(`总耗时: ${elapsed}ms`);
    console.log(`总数据块数: ${chunkCount}`);
    
    if (responseData) {
      const lines = responseData.trim().split('\n');
      console.log(`\n响应事件数: ${lines.length}`);
      
      const hasError = lines.some(line => {
        try {
          const parsed = JSON.parse(line);
          return parsed.type === 'error' || (parsed.content && parsed.content.includes('error'));
        } catch {
          return false;
        }
      });
      
      if (hasError) {
        console.log('❌ 发现错误事件');
      } else {
        console.log('✅ 响应成功，无错误事件');
      }
    }
  });
});

req.on('error', (e) => {
  const elapsed = Date.now() - startTime;
  console.log(`\n❌ 请求失败 (${elapsed}ms)`);
  console.log('错误:', e.message);
});

req.on('timeout', () => {
  const elapsed = Date.now() - startTime;
  console.log(`\n⏰ 请求超时 (${elapsed}ms)`);
  req.destroy();
});

req.write(postData);
req.end();