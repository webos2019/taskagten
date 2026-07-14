const http = require('http');

const testWeather = async (skill) => {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      messages: [
        {
          role: "user",
          content: "南宁天气"
        }
      ],
      skill: skill
    });

    console.log(`\n=== 测试天气查询 (${skill}) ===`);
    console.log('发送时间:', new Date().toLocaleString());
    
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

    const req = http.request(options, (res) => {
      console.log('响应状态码:', res.statusCode);
      console.log('响应头:', JSON.stringify(res.headers));
      
      let responseData = '';
      let chunkCount = 0;

      res.on('data', (chunk) => {
        chunkCount++;
        const chunkStr = chunk.toString();
        responseData += chunkStr;
        console.log(`[数据块 ${chunkCount}] ${chunkStr.length} 字节`);
        
        // 尝试解析JSON
        try {
          const parsed = JSON.parse(chunkStr);
          console.log(`  类型: ${parsed.type}`);
          if (parsed.content) {
            console.log(`  内容: ${parsed.content.substring(0, 50)}...`);
          }
          if (parsed.toolName) {
            console.log(`  工具: ${parsed.toolName}`);
          }
          if (parsed.error) {
            console.log(`  错误: ${parsed.error}`);
          }
        } catch (e) {
          console.log(`  原始数据: ${chunkStr.substring(0, 100)}`);
        }
      });

      res.on('end', () => {
        console.log(`响应结束，共收到 ${chunkCount} 个数据块`);
        resolve({ statusCode: res.statusCode, data: responseData });
      });
    });

    req.on('error', (e) => {
      console.log('请求错误:', e.message);
      reject(e);
    });

    req.write(postData);
    req.end();
  });
};

(async () => {
  try {
    await testWeather('utility-skill');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await testWeather('reader-skill'); 
  } catch (error) {
    console.error('测试失败:', error);
  }
})();