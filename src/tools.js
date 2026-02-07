import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

// 文件读取工具
const readFileTool = tool(
    async ({ filePath }) => {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            console.log(`  [工具调用] read_file("${filePath}") - 成功读取`);
            return `文件内容:\n${content}`;
        } catch (error) { 
            console.log(`   [工具调用] read_file("${filePath}") - 错误: ${error.message}`);
            return `读取文件失败: ${error.message}`;
        }
    },
    {
        name: 'read_file',
        description: '用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。',
        schema: z.object({
            filePath: z.string().describe('要读取的文件路径'),
        }),
    }
);

// 文件写入工具
const writeFileTool = tool(
    async ({ filePath, content }) => {
        try {
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(filePath, content, 'utf-8');
            console.log(`   [工具调用] write_file("${filePath}") - 成功写入`);
            return `文件写入成功: ${filePath}`;
        } catch (error) {
            console.log(`   [工具调用] write_file("${filePath}") - 错误: ${error.message}`);
            return `写入文件失败: ${error.message}`;
        }
    },
    {
        name: 'write_file',
        description: '向指定路径写入文件内容，自动创建目录',
        schema: z.object({
            filePath: z.string().describe('文件路径'),
            content: z.string().describe('要写入的文件内容'),
        }),
    }
);

// 执行命令工具（支持后台运行）
const executeCommandTool = tool(
    async ({ command, workingDirectory, background = false }) => {
        const cwd = workingDirectory || process.cwd();
        console.log(`  [工具调用] execute_command("${command}")${workingDirectory ? ` - 工作目录: ${workingDirectory}` : ''}${background ? ' - 后台运行' : ''}`);

        return new Promise((resolve, reject) => {
            const [cmd, ...args] = command.split(' ');

            const child = spawn(cmd, args, {
                cwd,
                stdio: background ? 'pipe' : 'inherit',
                shell: true,
                detached: background,  // 后台运行
            });

            let errorMsg = '';
            let output = '';

            child.on('error', (error) => {
                errorMsg = error.message;
            });

            if (background) {
                // 后台运行模式：启动后立即返回
                child.unref();  // 允许父进程独立于子进程

                console.log(`  [工具调用] execute_command("${command}") - 后台服务已启动`);
                const cwdInfo = workingDirectory
                    ? `\n\n重要提示：服务已在目录 "${workingDirectory}" 中启动。服务将在后台运行，您可以继续与 AI 对话。`
                    : '';
                resolve(`命令已在后台启动: ${command}${cwdInfo}\n\n服务正在运行中，您可以继续输入其他命令。如需停止服务，请使用 Ctrl+C 或在另一个终端中执行停止命令。`);
            } else {
                // 前台运行模式：等待命令完成
                if (child.stdout) {
                    child.stdout.on('data', (data) => {
                        output += data.toString();
                    });
                }

                if (child.stderr) {
                    child.stderr.on('data', (data) => {
                        output += data.toString();
                    });
                }
                child.on('close', (code) => {
                    if (code === 0) {
                        console.log(`  [工具调用] execute_command("${command}") - 执行成功`);
                        const cwdInfo = workingDirectory
                            ? `\n\n重要提示：命令在目录 "${workingDirectory}" 中执行成功。如果需要在这个项目目录中继续执行命令，请使用 workingDirectory: "${workingDirectory}" 参数，不要使用 cd 命令。`
                            : '';
                        resolve(`命令执行成功: ${command}${cwdInfo}${output ? '\n\n输出:\n' + output : ''}`);
                    } else {
                        console.log(`  [工具调用] execute_command("${command}") - 执行失败，退出码: ${code}`);
                        resolve(`命令执行失败，退出码: ${code}${errorMsg ? '\n错误: ' + errorMsg : ''}${output ? '\n\n输出:\n' + output : ''}`);
                    }
                });
            }
        });
    },
    {
        name: 'execute_command',
        description: '执行系统命令。支持指定工作目录和后台运行模式。对于启动服务（如 npm run dev、npm start），建议使用 background: true 参数。',
        schema: z.object({
            command: z.string().describe('要执行的命令'),
            workingDirectory: z.string().optional().describe('工作目录（推荐指定）'),
            background: z.boolean().optional().describe('是否后台运行（启动服务时设置为 true）'),
        }),
    }
);

export { readFileTool, writeFileTool, executeCommandTool };