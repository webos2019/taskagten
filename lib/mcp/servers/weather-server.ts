import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'weather-server',
  version: '0.0.9',
});

server.registerTool('get_weather', {
  description: '获取指定城市的实时天气信息',
  inputSchema: z.object({
    city: z.string().describe('城市名称，如：北京、上海'),
  }),
}, async (args) => {
  const city = (args as { city: string }).city;
  
  console.log(`[DEBUG-WEATHER-SERVER] Received get_weather request for city: ${city}`);
  
  const start = Date.now();
  try {
    console.log(`[DEBUG-WEATHER-SERVER] Fetching weather from wttr.in...`);
    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    
    const fetchElapsed = Date.now() - start;
    console.log(`[DEBUG-WEATHER-SERVER] Fetch completed in ${fetchElapsed}ms, status: ${response.status}`);
    
    if (!response.ok) {
      console.error(`[DEBUG-WEATHER-SERVER] HTTP error: ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log(`[DEBUG-WEATHER-SERVER] Parsing JSON response...`);
    const data = await response.json();
    
    console.log(`[DEBUG-WEATHER-SERVER] Response received, current_condition: ${data.current_condition ? 'exists' : 'null'}`);
    
    const current = data.current_condition?.[0];
    const forecast = data.weather?.[0];
    
    if (!current) {
      console.error(`[DEBUG-WEATHER-SERVER] No current weather data for ${city}`);
      return {
        type: 'tool_result',
        content: [
          {
            type: 'text' as const,
            text: `无法获取 ${city} 的天气信息`,
          },
        ],
        isError: true,
      };
    }
    
    const weatherText = `${city}今天天气为 ${current.weatherDesc?.[0]?.value || '未知'}，气温 ${current.temp_C}°C，体感温度 ${current.FeelsLikeC}°C。${current.humidity ? `湿度 ${current.humidity}%，` : ''}${current.windspeedKmph ? `风速 ${current.windspeedKmph}公里/小时。` : ''}${forecast?.maxtempC ? `最高气温${forecast.maxtempC}°C，` : ''}${forecast?.mintempC ? `最低气温${forecast.mintempC}°C。` : ''}`;
    
    const totalElapsed = Date.now() - start;
    console.log(`[DEBUG-WEATHER-SERVER] Weather query successful! Total elapsed: ${totalElapsed}ms`);
    console.log(`[DEBUG-WEATHER-SERVER] Result: ${weatherText.slice(0, 50)}...`);
    
    return {
      type: 'tool_result',
      content: [
        {
          type: 'text' as const,
          text: weatherText,
        },
      ],
      isError: false,
    };
  } catch (error) {
    const elapsed = Date.now() - start;
    console.error(`[DEBUG-WEATHER-SERVER] Weather query failed! Elapsed: ${elapsed}ms`);
    console.error(`[DEBUG-WEATHER-SERVER] Error:`, error);
    
    return {
      type: 'tool_result',
      content: [
        {
          type: 'text' as const,
          text: `天气查询失败：${error instanceof Error ? error.message : '未知错误'}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);