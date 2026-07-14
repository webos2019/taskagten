// 简单的受控规划决策测试
// 使用Node.js内置fetch和CommonJS语法

const { createRequire } = require('module');
const require = createRequire(import.meta.url);

// 动态导入ESM模块
async function runTest() {
  try {
    console.log("=== 受控规划决策系统测试 ===\n");
    
    // 导入规划决策组件
    const { planningRuntime } = await import('./lib/tools.js');
    const { PlanningDecisionEngine } = await import('./lib/planning-decision.js');
    
    console.log("✅ 成功加载规划决策模块\n");
    
    // 测试1：基本规划引擎功能
    console.log("🎯 测试1：规划引擎基础功能");
    const engine = new PlanningDecisionEngine({ maxDepth: 3, timeout: 5000 });
    
    const initialContext = {
      userInput: "访问https://juejin.cn/post/测试决策系统",
      currentState: 'INIT',
      availableTools: ['calculator', 'datetime', 'web_browse', 'get_weather'],
      resources: {},
      constraints: {
        maxDepth: 3,
        timeout: 5000,
        allowedActions: ['CONTINUE_PROCESSING', 'REQUEST_MORE_INFO', 'SWITCH_TOOL', 'DECOMPOSE_TASK', 'TERMINATE_PROCESSING']
      },
      history: []
    };
    
    console.log("📋 初始上下文创建完成");
    console.log("可用工具：", initialContext.availableTools);
    console.log();
    
    // 测试2：决策制定
    console.log("🎯 测试2：规划决策制定");
    const decision = await engine.makeDecision(initialContext);
    
    console.log("📊 决策结果：");
    console.log(`- 选择的动作：${decision.chosenAction}`);
    console.log(`- 置信度：${decision.confidence}`);
    console.log(`- 决策理由：${decision.reasoning}`);
    console.log(`- 下一个状态：${decision.nextContext.currentState}`);
    console.log();
    
    // 测试3：动作执行
    console.log("🎯 测试3：动作执行测试");
    const executionResult = await engine.executeAction(decision.chosenAction, decision.nextContext);
    
    console.log("⚡ 执行结果：");
    console.log(`- 动作：${decision.chosenAction}`);
    console.log(`- 执行状态：${executionResult.status || 'completed'}`);
    console.log(`- 结果：`, executionResult);
    console.log();
    
    // 测试4：工具推荐测试
    console.log("🎯 测试4：工具推荐测试");
    
    // 简单的工具推荐测试
    const testInputs = [
      "计算1+2+3",
      "访问example.com",
      "查询天气",
      "获取时间"
    ];
    
    for (const input of testInputs) {
      const planningContext = {
        ...initialContext,
        userInput: input
      };
      
      const testDecision = await engine.makeDecision(planningContext);
      console.log(`输入："${input}"`);
      console.log(`- 推荐动作：${testDecision.chosenAction}`);
      console.log(`- 置信度：${testDecision.confidence}`);
      console.log();
    }
    
    console.log("🎉 所有测试完成！");
    
  } catch (error) {
    console.error("❌ 测试运行出错：", error.message);
    console.error("详细错误：", error);
  }
}

// 运行测试
runTest().catch(error => {
  console.error("❌ 测试运行失败：", error);
});