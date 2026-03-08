import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { InMemoryChatMessageHistory } from'@langchain/core/chat_history';
import { JsonOutputToolsParser } from '@langchain/core/output_parsers/openai_tools';
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
    executeCommandTool,
];

const modelWithTools = model.bindTools(tools);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


let history = new InMemoryChatMessageHistory();

let systemMessage = new SystemMessage(
    `你是一个经验丰富的程序员，使用工具完成任务。并且当你创建好项目写好代码后，要让代码能够正常运行，
    才能算完成任务，如果出现错误那就解决错误后再次运行。你可以使用以下工具来帮助你完成任务：

    工具：
    1. read_file: 读取文件
    2. write_file: 写入文件
    3. execute_command: 执行系统命令，支持指定工作目录
`);

async function runAgentWithTools(prompt, maxIterations = 30) {
    await history.addMessage(new HumanMessage(prompt));
    let toolParser = new JsonOutputToolsParser();


    for (let i = 0; i < maxIterations; i++) {
        let messages = await history.getMessages();
        console.log(`⏳ 正在等待 AI 思考...`);
        
        // 使用 stream 方法流式获取完整响应
        let fullResponse = null;
        let hasStartedOutput = false;
        const stream = await modelWithTools.stream(messages);
        
        for await (const chunk of stream) {
            // console.log("🚀 ~ runAgentWithTools ~ chunk:", chunk)
            // 如果是第一个 chunk，初始化 fullResponse
            if (!fullResponse) {
                fullResponse = chunk;
            } else {
                // 合并后续的 chunk
                fullResponse = fullResponse.concat(chunk);
            }
            let parsedTools = null
            try {
                parsedTools = await toolParser.parseResult([{message:fullResponse}])
            } catch (error) {
                console.log(`  [工具调用] 解析工具调用失败: ${error.message}`);
            }

            // 实时流式输出内容 - 处理两种情况
            let outputContent = '';
            
            // 情况 1: 普通文本内容在 content 字段
            if (chunk.content) {
                outputContent = chunk.content;
            }
            // 情况 2: 结构化后如果有工具调用内容字段
            else if (parsedTools && parsedTools.length > 0) {
                for (const toolCallChunk of parsedTools) {
                    if (toolCallChunk.type=== 'write_file'&&toolCallChunk.args.content) {
                        outputContent += toolCallChunk.args.content;
                    }
                }
            }
            
            // 如果有内容需要输出
            if (outputContent && outputContent.trim() !== '') {
                if (!hasStartedOutput) {
                    console.log(`\n✨ AI 回复:\n`);
                    hasStartedOutput = true;
                }
                process.stdout.write(outputContent);
            }
        }
        
        const response = fullResponse;
        await history.addMessage(response);

        if (!response.tool_calls || response.tool_calls.length === 0) {
            if (hasStartedOutput) {
                console.log('\n');
            }
            return response.content;
        }

        if (hasStartedOutput) {
            console.log('\n');
        }

        for (const toolCall of response.tool_calls) {
            const foundTool = tools.find(t => t.name === toolCall.name);
            if (foundTool) {
                const toolResult = await foundTool.invoke(toolCall.args);
                await history.addMessage(
                    new ToolMessage({
                        content: toolResult,
                        tool_call_id: toolCall.id,
                    })
                );
            }
        }
    }

    return '达到最大迭代次数';
}


async function interactiveChat() {
    await history.addMessage(systemMessage);

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