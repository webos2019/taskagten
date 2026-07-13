"use client";

import type { StructuredBlock as StructuredBlockType } from "@/types/chat";
import MarkdownRenderer from "./MarkdownRenderer";

function ReasoningBlock({ block }: { block: StructuredBlockType }) {
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30">
      <details className="group" open>
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100/50 dark:text-amber-400 dark:hover:bg-amber-900/30">
          <svg
            className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>推理过程</span>
          <span className="ml-auto text-amber-500 dark:text-amber-500">点击展开/收起</span>
        </summary>
        <div className="border-t border-amber-200/50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-800/50 dark:text-amber-300">
          <MarkdownRenderer content={block.content} />
        </div>
      </details>
    </div>
  );
}

function formatToolArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  return Object.entries(args)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

interface ParsedWeather {
  city?: string;
  region?: string;
  weather?: string;
  temperature?: number | string;
  feelsLike?: number | string;
  temperatureMax?: number | string;
  temperatureMin?: number | string;
  humidity?: number | string;
  windSpeed?: number | string;
  windDirection?: string;
  visibility?: number | string;
  uvIndex?: number | string;
  source?: string;
}

function parseWeatherResult(result: string): ParsedWeather | null {
  try {
    const parsed = JSON.parse(result);
    if (parsed.error) return null;
    return {
      city: parsed.city,
      region: parsed.region,
      weather: parsed.weather,
      temperature: parsed.temperature,
      feelsLike: parsed.feelsLike,
      temperatureMax: parsed.temperatureMax,
      temperatureMin: parsed.temperatureMin,
      humidity: parsed.humidity,
      windSpeed: parsed.windSpeed,
      windDirection: parsed.windDirection,
      visibility: parsed.visibility,
      uvIndex: parsed.uvIndex,
      source: parsed.source || "wttr.in",
    };
  } catch {
    return null;
  }
}

interface ParsedLocation {
  city?: string;
  regionName?: string;
  country?: string;
  latitude?: number | string;
  longitude?: number | string;
}

function parseLocationResult(result: string): ParsedLocation | null {
  try {
    const parsed = JSON.parse(result);
    if (parsed.error) return null;
    return {
      city: parsed.city,
      regionName: parsed.regionName,
      country: parsed.country,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    };
  } catch {
    return null;
  }
}

function ToolCallBlock({ block, step }: { block: StructuredBlockType; step?: number }) {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 shadow-sm">
      <div className="flex items-center justify-between border-b border-blue-100 px-3 py-2.5 dark:border-blue-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">工具调用: {block.toolName}</span>
        </div>
        <div className="flex items-center gap-2">
          {block.toolName === "get_weather" && (
            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
              实时天气
            </span>
          )}
          {block.toolName === "get_location" && (
            <span className="rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/50 dark:text-green-400">
              地理位置
            </span>
          )}
          {block.toolName === "read_file" && (
            <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-400">
              文件读取
            </span>
          )}
          {block.toolName === "list_directory" && (
            <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-400">
              目录浏览
            </span>
          )}
          <span className="flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
            <svg className="h-3 w-3 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" />
              <path className="opacity-75" fillRule="evenodd" d="M12 2a10 10 0 00-10 10c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.26-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.578 9.578 0 0112 6.8c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.38.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.33 4.68-4.56 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10.02 10.02 0 0022 12c0-5.52-4.48-10-10-10z" clipRule="evenodd" />
            </svg>
            执行中
          </span>
        </div>
      </div>

      {block.toolArgs && Object.keys(block.toolArgs).length > 0 && (
        <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
          <div className="text-[10px] font-medium text-gray-500 dark:text-gray-500">输入</div>
          <div className="mt-1 text-xs font-mono text-gray-700 dark:text-gray-300">
            {formatToolArgs(block.toolArgs)}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolResultBlock({ block }: { block: StructuredBlockType }) {
  let displayResult = block.toolResult || block.content;
  let isError = false;
  let weatherData: ParsedWeather | null = null;
  let locationData: ParsedLocation | null = null;

  try {
    const parsed = JSON.parse(displayResult);
    if (parsed.error) {
      displayResult = parsed.error;
      isError = true;
    } else {
      weatherData = parseWeatherResult(displayResult);
      if (!weatherData) {
        locationData = parseLocationResult(displayResult);
      }
    }
  } catch {
    // 不是 JSON 则直接展示
  }

  if (weatherData) {
    return (
      <div className="my-2 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-sm">
        <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
          <div className="text-[10px] font-medium text-gray-500 dark:text-gray-500">结果</div>
        </div>
        <div className="px-3 py-3 space-y-1.5 text-xs">
          {weatherData.city && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">城市</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{weatherData.city}</span>
            </div>
          )}
          {weatherData.region && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">地区</span>
              <span className="text-gray-700 dark:text-gray-300">{weatherData.region}</span>
            </div>
          )}
          {weatherData.weather && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">天气</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{weatherData.weather}</span>
            </div>
          )}
          {weatherData.temperature !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">温度</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{weatherData.temperature}°C</span>
            </div>
          )}
          {weatherData.feelsLike !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">体感温度</span>
              <span className="text-gray-700 dark:text-gray-300">{weatherData.feelsLike}°C</span>
            </div>
          )}
          {(weatherData.temperatureMin !== undefined || weatherData.temperatureMax !== undefined) && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">温度范围</span>
              <span className="text-gray-700 dark:text-gray-300">{weatherData.temperatureMin}°C ~ {weatherData.temperatureMax}°C</span>
            </div>
          )}
          {weatherData.humidity !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">湿度</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{weatherData.humidity}%</span>
            </div>
          )}
          {weatherData.windSpeed !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">风速</span>
              <span className="text-gray-700 dark:text-gray-300">{weatherData.windSpeed} km/h</span>
            </div>
          )}
          {weatherData.windDirection && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">风向</span>
              <span className="text-gray-700 dark:text-gray-300">{weatherData.windDirection}</span>
            </div>
          )}
          {weatherData.visibility !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">能见度</span>
              <span className="text-gray-700 dark:text-gray-300">{weatherData.visibility} km</span>
            </div>
          )}
          {weatherData.uvIndex !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">紫外线指数</span>
              <span className="text-gray-700 dark:text-gray-300">{weatherData.uvIndex}</span>
            </div>
          )}
          {weatherData.source && (
            <div className="flex justify-between border-t border-gray-100 pt-2 dark:border-gray-800">
              <span className="text-gray-500 dark:text-gray-500">来源</span>
              <span className="text-gray-500 dark:text-gray-500">{weatherData.source}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (locationData) {
    return (
      <div className="my-2 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-sm">
        <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
          <div className="text-[10px] font-medium text-gray-500 dark:text-gray-500">结果</div>
        </div>
        <div className="px-3 py-3 space-y-1.5 text-xs">
          {locationData.city && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">城市</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{locationData.city}</span>
            </div>
          )}
          {locationData.regionName && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">省份</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{locationData.regionName}</span>
            </div>
          )}
          {locationData.country && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">国家</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{locationData.country}</span>
            </div>
          )}
          {locationData.latitude !== undefined && locationData.longitude !== undefined && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-500">坐标</span>
              <span className="font-mono text-gray-700 dark:text-gray-300">{locationData.latitude}, {locationData.longitude}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isSuccess = !isError && block.isValid !== false;

  return (
    <div className={`my-2 overflow-hidden rounded-xl border shadow-sm ${
      isError 
        ? "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20" 
        : isSuccess
          ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
    }`}>
      <div className={`border-b px-3 py-2 ${
        isError 
          ? "border-red-100 dark:border-red-800" 
          : isSuccess
            ? "border-green-100 dark:border-green-800"
            : "border-gray-100 dark:border-gray-800"
      }`}>
        <div className="flex items-center justify-between">
          <div className={`text-[10px] font-medium ${
            isError 
              ? "text-red-500 dark:text-red-500" 
              : isSuccess
                ? "text-green-500 dark:text-green-500"
                : "text-gray-500 dark:text-gray-500"
          }`}>结果</div>
          <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
            isError
              ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
              : isSuccess
                ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                : "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-400"
          }`}>
            {isError ? (
              <>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                失败
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                成功
              </>
            )}
          </span>
        </div>
      </div>
      <div className={`px-3 py-3 text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono">{displayResult}</pre>
      </div>
    </div>
  );
}

function ResourceStartBlock({ block }: { block: StructuredBlockType }) {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/20 shadow-sm">
      <div className="flex items-center justify-between border-b border-indigo-100 px-3 py-2.5 dark:border-indigo-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-indigo-600 text-white">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">读取资源: {block.resourceName}</span>
        </div>
        <span className="flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400">
          <svg className="h-3 w-3 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" />
            <path className="opacity-75" fillRule="evenodd" d="M12 2a10 10 0 00-10 10c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.7c-2.78.61-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.26-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.578 9.578 0 0112 6.8c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.38.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.33 4.68-4.56 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10.02 10.02 0 0022 12c0-5.52-4.48-10-10-10z" clipRule="evenodd" />
          </svg>
          读取中
        </span>
      </div>
      <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <div className="text-[10px] font-medium text-gray-500 dark:text-gray-500">URI</div>
        <div className="mt-1 text-xs font-mono text-gray-700 dark:text-gray-300">
          {block.resourceUri}
        </div>
      </div>
    </div>
  );
}

function ResourceEndBlock({ block }: { block: StructuredBlockType }) {
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-indigo-200 bg-white dark:border-indigo-800 dark:bg-gray-900 shadow-sm">
      <div className="border-b border-indigo-100 px-3 py-2 dark:border-indigo-800">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium text-indigo-500 dark:text-indigo-500">资源内容</div>
          <span className="flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            已读取
          </span>
        </div>
      </div>
      <div className="px-3 py-3">
        <div className="text-[10px] font-medium text-gray-500 dark:text-gray-500 mb-1">文件名: {block.resourceName}</div>
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300 max-h-48">{block.content}</pre>
        {block.isTruncated && (
          <div className="mt-2 text-[10px] text-gray-500 dark:text-gray-500">
            内容已截断，仅显示前 {block.previewChars} 个字符
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceErrorBlock({ block }: { block: StructuredBlockType }) {
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20 shadow-sm">
      <div className="border-b border-red-100 px-3 py-2 dark:border-red-800">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium text-red-500 dark:text-red-500">资源读取失败</div>
          <span className="flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/50 dark:text-red-400">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            错误
          </span>
        </div>
      </div>
      <div className="px-3 py-3">
        <div className="text-[10px] font-medium text-gray-500 dark:text-gray-500 mb-1">文件名: {block.resourceName}</div>
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs font-mono text-red-600 dark:text-red-400">{block.content}</pre>
      </div>
    </div>
  );
}

function TextBlock({ block }: { block: StructuredBlockType }) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
      <MarkdownRenderer content={block.content} />
    </div>
  );
}

export default function StructuredBlockView({
  block,
  step,
}: {
  block: StructuredBlockType;
  step?: number;
}) {
  switch (block.type) {
    case "reasoning":
      return <ReasoningBlock block={block} />;
    case "tool_call":
      return <ToolCallBlock block={block} step={step} />;
    case "tool_result":
      return <ToolResultBlock block={block} />;
    case "resource_start":
      return <ResourceStartBlock block={block} />;
    case "resource_end":
      return <ResourceEndBlock block={block} />;
    case "resource_error":
      return <ResourceErrorBlock block={block} />;
    case "text":
      return <TextBlock block={block} />;
    default:
      return null;
  }
}