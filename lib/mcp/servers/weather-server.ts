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
  
  try {
    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    
    const current = data.current_condition?.[0];
    const forecast = data.weather?.[0];
    
    if (!current) {
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