import { executeTool as executeToolImpl, registerHandler, readFileHandler, getWeatherHandler, listDirectoryHandler } from "@/lib/tool-runtime";

registerHandler("read_file", readFileHandler);
registerHandler("get_weather", getWeatherHandler);
registerHandler("list_directory", listDirectoryHandler);

export { executeToolImpl as executeTool };
export type { ToolCall, ToolResult, ToolExecutionContext } from "@/lib/tool-runtime";