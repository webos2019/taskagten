const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  res.on('data', (data) => {
    console.log(`收到数据长度: ${data.length}`);
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.log(`请求出错: ${e.message}`);
  process.exit(1);
});

req.end();