const http = require('http');

const testData = {
  messages: [
    {
      role: "user",
      content: "南宁天气"
    }
  ]
  // 注意：skill参数未指定，让系统自动检测
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
  }
};

console.log('=== 最终测试：自动技能检测 + 天气查询 ===');
console.log('问题:', testData.messages[0].content);
console.log('不指定skill，让系统自动检测');
console.log('开始测试...');

const startTime = Date.now();

const req = http.request(options, (res) => {
  console.log('响应状态码:', res.statusCode);
  
  let responseData = '';
  let chunkCount = 0;
  let hasError = false;

  res.on('data', (chunk) => {
    chunkCount++;
    const chunkStr = chunk.toString();
    responseData += chunkStr;
    
    try {
      const parsed = JSON.parse(chunkStr);
      console.log(`[${chunkCount}] 类型: ${parsed.type}`);
      if (parsed.toolName) console.log(`     工具: ${parsed.toolName}`);
      if (parsed.content && parsed.content.length > 50) {
        console.log(`     内容: ${parsed.content.substring(0, 50)}...`);
      }
      if (parsed.error) {
        hasError = true;
        console.log(`     ❌ 错误: ${parsed.error}`);
      }
    } catch {
      // 忽略无法解析的数据
    }
  });

  res.on('end', () => {
    const elapsed = Date.now() - startTime;
    console.log(`\n=== 测试结束 ===`);
    console.log(`总耗时: ${elapsed}ms`);
    console.log(`接收数据块: ${chunkCount}`);
    
    if (hasError) {
      console.log('❌ 响应包含错误');
    } else if (chunkCount > 1) {
      console.log('✅ 响应成功！');
    } else {
      console.log('❌ 响应数据不完整');
    }
  });
});

req.on('error', (e) => {
  const elapsed = Date.now() - startTime;
  console.log(`❌ 请求失败 (${elapsed}ms): ${e.message}`);
});

req.write(postData);
req.end();