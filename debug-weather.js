const http = require('http');

const postData = JSON.stringify({
  messages: [
    {
      role: "user",
      content: "你好"
    }
  ],
  skill: "utility-skill"
});

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

console.log('=== 开始测试天气查询 ===');
console.log('请求URL:', `http://${options.hostname}:${options.port}${options.path}`);
console.log('请求数据:', JSON.stringify(JSON.parse(postData), null, 2));

const req = http.request(options, (res) => {
  console.log('\n=== 响应信息 ===');
  console.log('状态码:', res.statusCode);
  console.log('状态信息:', res.statusMessage);
  console.log('响应头:', JSON.stringify(res.headers, null, 2));
  
  let responseData = '';
  let totalChunks = 0;
  
  res.on('data', (chunk) => {
    totalChunks++;
    const chunkStr = chunk.toString();
    responseData += chunkStr;
    console.log(`\n--- 数据块 ${totalChunks} (${chunk.length} 字节) ---`);
    console.log('内容:', chunkStr);
  });
  
  res.on('end', () => {
    console.log('\n=== 响应完成 ===');
    console.log('总数据块数:', totalChunks);
    console.log('总数据长度:', responseData.length);
    
    if (responseData) {
      const lines = responseData.trim().split('\n');
      console.log('\n=== 解析响应数据 ===');
      lines.forEach((line, index) => {
        try {
          const parsed = JSON.parse(line);
          console.log(`行 ${index + 1}:`, parsed);
        } catch (e) {
          console.log(`行 ${index + 1} (无法解析):`, line);
        }
      });
    }
  });
});

req.on('error', (e) => {
  console.log('\n=== 请求错误 ===');
  console.log('错误代码:', e.code);
  console.log('错误消息:', e.message);
  console.log('错误详情:', e);
});

req.on('timeout', () => {
  console.log('\n=== 请求超时 ===');
  req.destroy();
});

req.setTimeout(30000); // 30秒
req.write(postData);
req.end();

console.log('\n请求已发送，等待响应...');