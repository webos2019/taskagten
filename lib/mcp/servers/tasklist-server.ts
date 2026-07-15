import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'tasklist-server',
  version: '0.0.9',
});

// 注册 prompt: tasklist-draft
// 当用户提到"任务列表"、"任务草稿"、"tasklist"、"待办"时触发
server.registerPrompt(
  'tasklist-draft',
  {
    description: '根据用户目标生成任务列表草稿，将复杂需求分解为可执行的步骤',
    argumentSchema: z.object({
      goal: z.string().describe('用户的目标或需求描述'),
    }),
  },
  async (args) => {
    const goal = (args as { goal: string }).goal;

    console.log(`[DEBUG-TASKLIST-SERVER] Received tasklist-draft request for goal: ${goal}`);

    const tasks = generateTaskDraft(goal);
    const formatted = formatTaskList(goal, tasks);

    console.log(`[DEBUG-TASKLIST-SERVER] Generated ${tasks.length} tasks`);

    return {
      messages: [
        {
          role: 'assistant',
          content: {
            type: 'text' as const,
            text: formatted,
          },
        },
      ],
    };
  }
);

// 注册 tool: check_doc_consistency
server.registerTool(
  'check_doc_consistency',
  {
    description: '检查文档之间的一致性，对比项目文件内容是否与描述一致',
    inputSchema: z.object({
      docContent: z.string().describe('文档内容'),
      actualContent: z.string().describe('实际代码/文件内容'),
    }),
  },
  async (args) => {
    const { docContent, actualContent } = args as { docContent: string; actualContent: string };

    console.log(`[DEBUG-TASKLIST-SERVER] check_doc_consistency called`);

    const issues = checkConsistency(docContent, actualContent);
    const result = issues.length > 0
      ? `发现 ${issues.length} 个不一致：\n${issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`
      : '文档一致性检查通过，未发现明显不一致';

    return {
      type: 'tool_result',
      content: [
        {
          type: 'text' as const,
          text: result,
        },
      ],
      isError: false,
    };
  }
);

// 注册 resource: project://latest-context
server.resource(
  'latest-context',
  'project://latest-context',
  {
    description: '获取项目最新上下文信息',
  },
  async () => {
    console.log(`[DEBUG-TASKLIST-SERVER] Reading latest-context resource`);

    const context = getLatestContext();

    return {
      contents: [
        {
          uri: 'project://latest-context',
          text: context,
        },
      ],
    };
  }
);

function generateTaskDraft(goal: string): Array<{ title: string; description: string; priority: 'high' | 'medium' | 'low' }> {
  const tasks: Array<{ title: string; description: string; priority: 'high' | 'medium' | 'low' }> = [];

  // 根据目标关键词分析任务类型
  const lowerGoal = goal.toLowerCase();

  if (lowerGoal.includes('天气') || lowerGoal.includes('weather')) {
    tasks.push({ title: '获取用户位置', description: '通过 IP 获取用户所在城市', priority: 'high' });
    tasks.push({ title: '查询天气信息', description: '调用天气 API 获取实时天气', priority: 'high' });
    tasks.push({ title: '格式化天气结果', description: '将天气数据整理为易读的格式', priority: 'medium' });
  }

  if (lowerGoal.includes('文件') || lowerGoal.includes('file') || lowerGoal.includes('读取')) {
    tasks.push({ title: '列出项目文件', description: '查看项目根目录下可用的文件', priority: 'high' });
    tasks.push({ title: '读取目标文件', description: '读取用户指定文件的内容', priority: 'high' });
    tasks.push({ title: '总结文件内容', description: '提取文件中的关键信息', priority: 'medium' });
  }

  if (lowerGoal.includes('计算') || lowerGoal.includes('calculator') || lowerGoal.includes('数学')) {
    tasks.push({ title: '解析表达式', description: '识别用户输入的数学表达式', priority: 'high' });
    tasks.push({ title: '执行计算', description: '调用计算器工具进行精确计算', priority: 'high' });
    tasks.push({ title: '验证结果', description: '检查计算结果是否合理', priority: 'medium' });
  }

  if (lowerGoal.includes('单位') || lowerGoal.includes('换算') || lowerGoal.includes('convert')) {
    tasks.push({ title: '识别单位和数值', description: '解析用户输入的源单位和目标单位', priority: 'high' });
    tasks.push({ title: '执行单位换算', description: '调用换算工具进行转换', priority: 'high' });
  }

  if (lowerGoal.includes('时间') || lowerGoal.includes('日期') || lowerGoal.includes('datetime')) {
    tasks.push({ title: '获取当前时间', description: '调用日期时间工具获取当前时间', priority: 'high' });
    tasks.push({ title: '格式化输出', description: '按用户需求格式化时间显示', priority: 'medium' });
  }

  // 如果没有匹配到特定类型，生成通用任务
  if (tasks.length === 0) {
    tasks.push({ title: '理解用户需求', description: `分析用户目标：${goal}`, priority: 'high' });
    tasks.push({ title: '选择合适的工具', description: '根据需求选择可用的工具或能力', priority: 'high' });
    tasks.push({ title: '执行任务', description: '使用选定的工具完成用户请求', priority: 'medium' });
    tasks.push({ title: '验证和总结', description: '检查执行结果并总结回复', priority: 'low' });
  }

  return tasks;
}

function formatTaskList(goal: string, tasks: Array<{ title: string; description: string; priority: string }>): string {
  const lines: string[] = [];
  lines.push(`# 任务列表草稿`);
  lines.push('');
  lines.push(`**目标**: ${goal}`);
  lines.push('');
  lines.push(`| # | 任务 | 描述 | 优先级 |`);
  lines.push(`|---|------|------|--------|`);
  tasks.forEach((task, idx) => {
    lines.push(`| ${idx + 1} | ${task.title} | ${task.description} | ${task.priority} |`);
  });
  lines.push('');
  lines.push(`共 ${tasks.length} 个任务，请根据实际情况调整。`);

  return lines.join('\n');
}

function checkConsistency(docContent: string, actualContent: string): string[] {
  const issues: string[] = [];

  // 检查文档中提到的函数名是否在实际代码中存在
  const funcPattern = /(?:function|def|class)\s+(\w+)/g;
  const docFuncs = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = funcPattern.exec(docContent)) !== null) {
    docFuncs.add(match[1]);
  }

  for (const func of docFuncs) {
    if (!actualContent.includes(func)) {
      issues.push(`文档中提到的 "${func}" 在实际代码中未找到`);
    }
  }

  // 检查文档中提到的文件路径
  const filePattern = /[`'"]([a-zA-Z0-9_\-\/]+\.\w{1,5})[`'"]/g;
  const docFiles = new Set<string>();
  while ((match = filePattern.exec(docContent)) !== null) {
    docFiles.add(match[1]);
  }

  for (const file of docFiles) {
    if (!actualContent.includes(file)) {
      issues.push(`文档中引用的文件 "${file}" 在实际内容中未找到`);
    }
  }

  return issues;
}

function getLatestContext(): string {
  const now = new Date().toISOString();
  return [
    `# 项目最新上下文`,
    ``,
    `**时间**: ${now}`,
    `**项目**: code-assistant`,
    `**版本**: 0.1.0`,
    ``,
    `## 已注册工具`,
    `- calculator: 数学计算`,
    `- datetime: 日期时间`,
    `- unit_convert: 单位换算`,
    `- get_location: 获取位置`,
    `- get_weather: 获取天气 (MCP)`,
    `- list_files: 列出文件 (MCP)`,
    `- local-text-read: 本地文件读取 (MCP)`,
    `- web_browse: 网页浏览`,
    ``,
    `## 已注册技能`,
    `- utility-skill: 实用工具模式`,
    `- reader-skill: 文件与天气模式`,
    ``,
    `## MCP 服务`,
    `- weather-server: 天气查询`,
    `- project-files-server: 项目文件读取`,
    `- tasklist-server: 任务列表管理`,
  ].join('\n');
}

const transport = new StdioServerTransport();
server.connect(transport);
