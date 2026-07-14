import { toolRegistry } from './lib/tool-registry.js';
import { initCapabilities } from './lib/capability/index.js';
import './lib/tools.js';

initCapabilities();

async function testLocalWeatherTool() {
  console.log('=== 测试本地天气工具 ===');
  console.log('已注册工具:', toolRegistry.list().length);
  
  const weatherTool = toolRegistry.get('get_weather');
  if (!weatherTool) {
    console.log('❌ 天气工具未注册');
    return;
  }
  
  console.log('✅ 找到天气工具');
  console.log('工具名称:', weatherTool.tool.name);
  console.log('工具描述:', weatherTool.tool.description);
  
  try {
    console.log('\n执行天气查询: 南宁');
    const start = Date.now();
    
    const result = await toolRegistry.execute('get_weather', { city: '南宁' });
    const elapsed = Date.now() - start;
    
    console.log(`✅ 执行成功 (${elapsed}ms)`);
    console.log('结果:', result);
    
    try {
      const parsed = JSON.parse(result);
      console.log('解析后的结果:');
      if (parsed.error) {
        console.log('  ❌ 错误:', parsed.error);
      } else {
        console.log('  ✅ 成功:', parsed.city, parsed.temperature + '°C');
      }
    } catch (e) {
      console.log('无法解析JSON结果');
    }
    
  } catch (error) {
    const elapsed = Date.now() - start;
    console.log(`❌ 执行失败 (${elapsed}ms)`);
    console.log('错误:', error.message);
  }
}

testLocalWeatherTool().catch(console.error);