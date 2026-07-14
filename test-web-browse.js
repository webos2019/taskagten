// 简单的网页浏览工具测试脚本
const { toolRegistry } = require("./lib/tool-registry.ts");

async function testWebBrowse() {
  console.log("开始测试网页浏览工具...");
  
  try {
    // 测试访问掘金网页
    console.log("\n1. 测试访问掘金网页:");
    const result1 = await toolRegistry.execute("web_browse", {
      url: "https://juejin.cn/post/7645147525191696422",
      operation: "fetch_content"
    });
    console.log("结果:", result1);
    
    // 测试提取文本
    console.log("\n2. 测试提取掘金文本:");
    const result2 = await toolRegistry.execute("web_browse", {
      url: "https://juejin.cn/post/7645147525191696422",
      operation: "extract_text"
    });
    console.log("结果:", result2);
    
    // 测试提取链接
    console.log("\n3. 测试提取掘金链接:");
    const result3 = await toolRegistry.execute("web_browse", {
      url: "https://juejin.cn/post/7645147525191696422",
      operation: "extract_links"
    });
    console.log("结果:", result3);
    
    console.log("\n✅ 测试完成！");
  } catch (error) {
    console.error("测试失败:", error);
  }
}

testWebBrowse();