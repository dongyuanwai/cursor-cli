import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { readFileTool, writeFileTool, executeCommandTool } from './tools.js';
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import readline from 'node:readline';

const model = new ChatOpenAI({
    modelName: process.env.MODEL_NAME,
    apiKey: process.env.API_KEY,
    configuration: {
        baseURL: process.env.BASE_URL,
    },
});


const tools = [
    readFileTool,
    writeFileTool,
    executeCommandTool
];

const modelWithTools = model.bindTools(tools);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let messages = [
    new SystemMessage(
        `你是一个经验丰富的程序员，可以使用工具完成任务。

        工具：
        1. read_file: 读取文件
        2. write_file: 写入文件
        3. execute_command: 执行系统命令，支持指定工作目录
    `),
];

async function runAgentWithTools(prompt, maxIterations = 30) {

    messages.push(new HumanMessage(prompt))

    for (let i = 0; i < maxIterations; i++) {
        console.log(`⏳ 正在等待 AI 思考...`);
        const response = await modelWithTools.invoke(messages);
        messages.push(response);

        if (!response.tool_calls || response.tool_calls.length === 0) {
            console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
            return response.content;
        }

        for (const toolCall of response.tool_calls) {
            const foundTool = tools.find(t => t.name === toolCall.name);
            if (foundTool) {
                const toolResult = await foundTool.invoke(toolCall.args);
                messages.push(new ToolMessage({
                    content: toolResult,
                    tool_call_id: toolCall.id,
                }));
            }
        }
    }

    return '达到最大迭代次数';
}

async function interactiveChat() {
    console.log('\n=== AI 编程助手 ===');
    console.log('输入 "exit" 或 "quit" 退出\n');

    while (true) {
        const userInput = await new Promise((resolve) => {
            rl.question('用户: ', resolve);
        });

        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
            console.log('\n再见！');
            rl.close();
            break;
        }

        if (userInput.trim() === '') {
            continue;
        }

        try {
            await runAgentWithTools(userInput);
        } catch (error) {
            console.error(`\n❌ 错误: ${error.message}\n`);
        }
    }
}

interactiveChat().catch(console.error);
