const express = require('express');
const app = express();

console.log("如果这个运行，Node能加载依赖");

// 让我们检查useStreamTextBuffer中的实际问题

console.log("问题是：如果流响应只包含工具调用或推理块，而没有type: 'text'的块，");
console.log("那么streamingText就会保持为空字符串，导致UI显示空白。");
console.log("");
console.log("可能的原因：");
console.log("1. 模型正在思考但没有产生文本输出");
console.log("2. 模型调用了工具但没有文本总结");
console.log("3. 流协议实现有问题，不发送text类型块");
console.log("");
console.log("答案：需要检查实际发送的流内容！");