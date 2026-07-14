const http = require('http');

const postData = JSON.stringify({
  messages: [
    {
      role: "user",
      content: "你好，请测试一下响应"
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
  },
  timeout: 10000
};

console.log('正在发送聊天请求...');

const req = http.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  console.log('响应头:', JSON.stringify(res.headers, null, 2));
  
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
    console.log('收到数据块:', chunk.toString());
  });
  
  res.on('end', () => {
    console.log('响应结束');
    console.log('完整响应:', responseData);
  });
});

req.on('error', (e) => {
  console.log(`请求出错: ${e.message}`);
  console.log('错误详情:', e);
});

req.on('timeout', () => {
  console.log('请求超时');
  req.destroy();
});

req.write(postData);
req.end();