import { capabilityRegistry, createCapabilityId } from './registry';
import type { CapabilityDefinition, CapabilityIdentity } from './types';

function createCapabilityDefinition(identity: CapabilityIdentity, title: string, description: string, availability: 'available' | 'unavailable' | 'limited' = 'available'): CapabilityDefinition {
  return {
    ...identity,
    capabilityId: createCapabilityId(identity),
    title,
    description,
    availability,
  };
}

export function initCapabilities(): void {
  capabilityRegistry.register(createCapabilityDefinition(
    { name: 'get_weather', capabilityType: 'tool', providerKind: 'mcp', location: 'local', serverId: 'weather-server' },
    '实时天气',
    '查询指定城市的实时天气信息',
    'available'
  ));

  capabilityRegistry.register(createCapabilityDefinition(
    { name: 'local-text-read', capabilityType: 'resource', providerKind: 'mcp', location: 'local', serverId: 'project-files-server' },
    '本地文本读取',
    '读取项目根目录下的文本文件内容',
    'available'
  ));

  capabilityRegistry.register(createCapabilityDefinition(
    { name: 'local-file-summary', capabilityType: 'prompt', providerKind: 'mcp', location: 'local', serverId: 'project-files-server' },
    '本地文件总结',
    '生成文件总结的上下文消息',
    'available'
  ));

  capabilityRegistry.register(createCapabilityDefinition(
    { name: 'project://latest-context', capabilityType: 'resource', providerKind: 'mcp', location: 'remote', serverId: 'tasklist-server' },
    '项目上下文',
    '获取项目最新上下文信息',
    'available'
  ));

  capabilityRegistry.register(createCapabilityDefinition(
    { name: 'tasklist-draft', capabilityType: 'prompt', providerKind: 'mcp', location: 'remote', serverId: 'tasklist-server' },
    '任务草稿',
    '生成任务列表草稿的上下文消息',
    'available'
  ));

  capabilityRegistry.register(createCapabilityDefinition(
    { name: 'check_doc_consistency', capabilityType: 'tool', providerKind: 'mcp', location: 'remote', serverId: 'tasklist-server' },
    '文档一致性检查',
    '检查文档之间的一致性',
    'available'
  ));

  capabilityRegistry.register(createCapabilityDefinition(
    { name: 'calculator', capabilityType: 'tool', providerKind: 'internal', location: 'local' },
    '计算器',
    '执行数学计算',
    'available'
  ));

  capabilityRegistry.register(createCapabilityDefinition(
    { name: 'datetime', capabilityType: 'tool', providerKind: 'internal', location: 'local' },
    '日期时间',
    '获取当前时间、日期加减、判断星期、格式化日期',
    'available'
  ));

  capabilityRegistry.register(createCapabilityDefinition(
    { name: 'unit_convert', capabilityType: 'tool', providerKind: 'internal', location: 'local' },
    '单位换算',
    '单位换算：支持长度、重量、温度单位之间的转换',
    'available'
  ));

  console.log(`[Capability Surface] 已注册 ${capabilityRegistry.list().length} 个能力`);
}