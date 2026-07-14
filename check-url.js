// 检查URL可访问性的脚本
// 使用Node.js内置的fetch API（版本18+）

async function checkUrl(url) {
  console.log(`检查URL: ${url}`);
  
  const methods = ['GET', 'HEAD'];
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0'
  ];
  
  for (const method of methods) {
    for (let i = 0; i < userAgents.length; i++) {
      try {
        console.log(`\n尝试 ${method} 请求 (User-Agent ${i + 1})...`);
        
        const response = await fetch(url, {
          method,
          headers: {
            'User-Agent': userAgents[i],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          timeout: 10000
        });
        
        console.log(`状态码: ${response.status} ${response.statusText}`);
        console.log(`内容类型: ${response.headers.get('content-type')}`);
        console.log(`内容长度: ${response.headers.get('content-length')}`);
        
        if (response.status === 200 && method === 'GET') {
          const text = await response.text();
          console.log(`内容预览: ${text.substring(0, 500)}...`);
          return { success: true, content: text };
        }
        
      } catch (error) {
        console.log(`请求失败: ${error.message}`);
      }
    }
  }
  
  return { success: false, error: '所有尝试都失败' };
}

const url = 'https://juejin.cn/post/7645147525191696422';
checkUrl(url).then(result => {
  console.log('\n最终结果:', result);
}).catch(error => {
  console.error('脚本执行错误:', error);
});