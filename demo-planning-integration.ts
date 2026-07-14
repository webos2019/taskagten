// 受控规划决策系统集成演示
// 展示基于文章"一次受控规划决策"的设计思想

import { skillPlanningIntegrator, processUserRequestWithPlanning, recommendTool, planTask } from "./lib/planning-integration";
import { planningRuntime } from "./lib/tools";

async function demo() {
  console.log("=== 受控规划决策系统集成演示 ===\n");

  // 演示1：基本网页浏览请求的决策流程
  console.log("🎯 演示1：网页浏览请求的处理");
  console.log("用户输入：访问https://juejin.cn/post/7645147525191696422获取内容\n");

  const webBrowseInput = "访问https://juejin.cn/post/7645147525191696422获取内容";
  const webBrowseResult = await processUserRequestWithPlanning(webBrowseInput);

  console.log("📋 规划决策结果：");
  console.log(`- 选择动作：${webBrowseResult.combinedResult.decision.chosenAction}`);
  console.log(`- 置信度：${webBrowseResult.combinedResult.confidence}`);
  console.log(`- 决策理由：${webBrowseResult.combinedResult.decision.reasoning}`);
  console.log(`- 推荐技能：${webBrowseResult.combinedResult.recommendedSkill}`);
  console.log();

  // 演示2：复杂数学计算请求
  console.log("🔢 演示2：数学计算请求");
  console.log("用户输入：计算1234+5678的结果\n");

  const calcInput = "计算1234+5678的结果";
  const calcResult = await planningRuntime.recommendTool(calcInput);

  console.log("🛠️  工具推荐结果：");
  if (calcResult) {
    console.log(`- 推荐工具：${calcResult.name}`);
    console.log(`- 工具分类：${(calcResult as any).planningCategory}`);
    console.log(`- 决策权重：${(calcResult as any).decisionWeight}`);
  }
  console.log();

  // 演示3：工具推荐系统
  console.log("🎯 演示3：智能工具推荐");
  console.log("为以下任务推荐最适合的工具：\n");

  const tasks = [
    "访问https://example.com并提取链接",
    "计算圆的面积，半径为5.2",
    "查询北京今天天气怎么样",
    "获取当前时间并格式化显示"
  ];

  for (const task of tasks) {
    console.log(`任务：${task}`);
    try {
      const recommendation = await recommendTool(task);
      console.log(`- 推荐工具：${recommendation.recommendedTool}`);
      console.log(`- 置信度：${recommendation.confidence}`);
      console.log(`- 理由：${recommendation.reasoning}`);
      console.log(`- 备选工具：${recommendation.alternatives.join(', ')}`);
    } catch (error) {
      console.log(`- 推荐失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
    console.log();
  }

  // 演示4：复杂任务规划
  console.log("🎯 演示4：复杂任务分解与规划");
  console.log("用户输入：先计算2+3的平方，然后查询上海天气，最后浏览example.com\n");

  const complexTask = "先计算2+3的平方，然后查询上海天气，最后浏览example.com";
  try {
    const taskPlan = await planTask(complexTask);
    
    console.log("📋 任务分析结果：");
    console.log(`- 分析：${taskPlan.taskAnalysis}`);
    console.log(`- 预估步骤：${taskPlan.estimatedSteps}`);
    console.log(`- 推荐动作：${taskPlan.recommendedActions.join(', ')}`);
    console.log(`- 所需工具：${taskPlan.requiredTools.join(', ')}`);
    console.log(`- 整体置信度：${taskPlan.confidence}`);
    console.log();
  } catch (error) {
    console.log(`任务规划失败：${error instanceof Error ? error.message : '未知错误'}`);
    console.log();
  }

  // 演示5：规划引擎的直接使用
  console.log("🎯 演示5：规划引擎决策流程");
  console.log("展示5类基础动作的选择过程：\n");

  const testInputs = [
    { input: "获取help信息", description: "简单信息请求" },
    { input: "这个怎么计算呢？", description: "需要澄清的场景" },
    { input: "分别计算1+1, 2+2, 3+3然后比较大小", description: "复杂多步骤任务" },
    { input: "用错误的工具来查询天气", description: "需要切换工具的场景" }
  ];

  for (const { input, description } of testInputs) {
    console.log(`📝 ${description}：${input}`);
    
    try {
      const planningResult = await planningRuntime.processUserRequest(input);
      console.log(`- 决策动作：${planningResult.decision.chosenAction}`);
      console.log(`- 置信度：${planningResult.decision.confidence}`);
      console.log(`- 理由：${planningResult.decision.reasoning}`);
    } catch (error) {
      console.log(`- 处理失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
    console.log();
  }

  console.log("=== 演示完成 ===\n");
  console.log("📚 设计要点总结（基于'受控规划决策'文章）：");
  console.log("✓ 白名单机制：只允许5类预定义动作");
  console.log("✓ 避免无限循环：设置最大处理深度");
  console.log("✓ 置信度决策：每次决策都有明确的置信度评分");
  console.log("✓ 条件触发：基于上下文智能选择动作");
  console.log("✓ 安全终止：明确的终止条件和约束");
}

// 运行演示
demo().catch(error => {
  console.error("演示运行出错：", error);
});