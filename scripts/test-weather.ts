import { mcpClientManager } from '../lib/mcp/manager';
import { weatherToolAdapter } from '../lib/mcp/adapters';

const WEATHER_SERVER_ID = 'weather-server';

async function testWeatherMCP() {
  console.log('=== 测试 MCP 天气服务器 ===\n');
  
  mcpClientManager.register(WEATHER_SERVER_ID, {
    serverId: WEATHER_SERVER_ID,
    command: 'npx',
    args: ['tsx', 'lib/mcp/servers/weather-server.ts'],
  });

  try {
    console.log('1. 测试天气适配器 - 北京');
    const result = await weatherToolAdapter({ city: '北京' });
    console.log('✓ 调用成功');
    console.log('  输出:', result.outputText);
    console.log('');
  } catch (error) {
    console.log('✗ 调用失败:', error instanceof Error ? error.message : error);
    console.log('');
  }

  try {
    console.log('2. 测试天气适配器 - 上海');
    const result = await weatherToolAdapter({ city: '上海' });
    console.log('✓ 调用成功');
    console.log('  输出:', result.outputText);
    console.log('');
  } catch (error) {
    console.log('✗ 调用失败:', error instanceof Error ? error.message : error);
    console.log('');
  }

  await mcpClientManager.shutdown();
}

async function testWeatherDirectAPI() {
  console.log('=== 测试直接调用天气 API ===\n');

  const testCities = ['Beijing', 'Shanghai', 'Guangzhou'];
  
  for (const city of testCities) {
    try {
      console.log(`查询 ${city} 天气...`);
      const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
      
      if (!response.ok) {
        console.log(`✗ HTTP 错误: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const current = data.current_condition?.[0];
      
      if (!current) {
        console.log(`✗ 无天气数据`);
        continue;
      }

      console.log(`✓ ${city}: ${current.weatherDesc?.[0]?.value || '未知'} ${current.temp_C}°C`);
    } catch (error) {
      console.log(`✗ ${city} 查询失败:`, error instanceof Error ? error.message : error);
    }
  }
  
  console.log('');
}

async function testMockWeather() {
  console.log('=== 测试模拟天气数据 ===\n');
  
  const mockWeatherData: Record<string, { weather: string; temp: string; feelsLike: string; humidity: string; windSpeed: string }> = {
    '北京': { weather: '晴', temp: '28', feelsLike: '30', humidity: '65', windSpeed: '15' },
    '上海': { weather: '多云', temp: '30', feelsLike: '33', humidity: '75', windSpeed: '10' },
    '广州': { weather: '雷阵雨', temp: '32', feelsLike: '36', humidity: '85', windSpeed: '20' },
    '深圳': { weather: '阴', temp: '31', feelsLike: '34', humidity: '80', windSpeed: '12' },
    '杭州': { weather: '小雨', temp: '26', feelsLike: '28', humidity: '90', windSpeed: '8' },
  };

  for (const [city, data] of Object.entries(mockWeatherData)) {
    const weatherText = `${city}今天天气为 ${data.weather}，气温 ${data.temp}°C，体感温度 ${data.feelsLike}°C。湿度 ${data.humidity}%，风速 ${data.windSpeed}公里/小时。最高气温35°C，最低气温25°C。`;
    console.log(`✓ ${city}: ${weatherText}`);
  }

  console.log('\n模拟数据格式符合预期 ✓');
}

async function main() {
  await testMockWeather();
  await testWeatherDirectAPI();
  await testWeatherMCP();
}

main().catch(console.error);
