import crypto from 'node:crypto';
import { ALL_TOOLS } from './tools/index.js';

export function bridgeInstructions() {
  return `You have working local workspace tools through poli-cli. The CLI executes your requests; you do not execute tools directly. Never ask the user to run your tool call for you.

TOOL REQUEST FORMAT (mandatory for local actions):
Emit a separate fenced code block with the EXACT language poli-tool, containing {"name":"tool_name","arguments":{...}}. For example, to read hello.txt emit:
\`\`\`poli-tool
{"name":"view_file","arguments":{"file_path":"hello.txt"}}
\`\`\`
To list the workspace emit:
\`\`\`poli-tool
{"name":"list_dir","arguments":{"dir_path":"."}}
\`\`\`
Use the exact parameter names from the schemas below. Ordinary json blocks and prose such as "Tool call: view_file" DO NOT invoke tools. After emitting a request, end your response and wait for the result. The CLI validates requests and asks for approval for changes. You may emit several separate poli-tool blocks. Do not claim success before reading the returned tool result. For greetings and ordinary conversation, answer naturally without requesting a tool. Do not put executable tool blocks in documentation or examples.
Available local tool schemas:
${JSON.stringify(ALL_TOOLS.map(t => t.function))}`;
}

export function parseBridgeCalls(text) {
  const calls = [];
  const content = text.replace(/^[ \t]*```poli-tool[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm, (_, raw) => {
    try {
      const request = JSON.parse(raw);
      if (typeof request.name !== 'string' || !request.arguments || typeof request.arguments !== 'object' || Array.isArray(request.arguments)) throw new Error('Expected name and arguments object');
      calls.push({ id: `bridge_${crypto.randomBytes(8).toString('hex')}`, type: 'function', function: { name: request.name, arguments: JSON.stringify(request.arguments) } });
    } catch (error) {
      calls.push({ id: `bridge_${crypto.randomBytes(8).toString('hex')}`, type: 'function', function: { name: '__invalid_tool_request', arguments: JSON.stringify({ error: `Invalid poli-tool JSON: ${error.message}` }) } });
    }
    return '';
  }).trim();
  return { content, calls };
}

// Chat-only transports cannot accept role=tool or assistant.tool_calls.
export function chatMessages(messages, bridge = false, { workspaceDir = process.cwd() } = {}) {
  const converted = messages.map(m => {
      if (m.role === 'tool') return { role: 'user', content: `Local tool result (${m.name}, call ${m.tool_call_id}):\n${m.content}` };
      if (m.tool_calls) {
        const actions = m.tool_calls.map(c => `\`\`\`poli-tool\n${JSON.stringify({ name: c.function.name, arguments: (() => { try { return JSON.parse(c.function.arguments); } catch { return {}; } })() })}\n\`\`\``).join('\n');
        return { role: 'assistant', content: [m.content, actions].filter(Boolean).join('\n') };
      }
      return { role: m.role, content: m.content || '' };
    });
  if (!bridge) return converted;
  const lastUser = converted.map(m => m.role).lastIndexOf('user');
  const toolReference = ALL_TOOLS.map(({ function: tool }) => {
    const required = new Set(tool.parameters.required || []);
    const params = Object.keys(tool.parameters.properties || {}).map(key => key + (required.has(key) ? '' : '?'));
    return `${tool.name}(${params.join(', ')})`;
  }).join('\n');
  if (lastUser >= 0) converted[lastUser] = {
    ...converted[lastUser],
    content: converted[lastUser].content + `\n\n[poli-cli local execution context]
Workspace directory: ${workspaceDir}
Relative paths resolve inside this workspace; start with list_dir({"dir_path":"."}) when exploring it. You already have the workspace path and tool list. Do not ask the user to supply them.
Actual available tools and EXACT argument names (? = optional):
${toolReference}
To read a file: \`\`\`poli-tool\n{"name":"view_file","arguments":{"file_path":"README.md"}}\n\`\`\`
To list this workspace: \`\`\`poli-tool\n{"name":"list_dir","arguments":{"dir_path":"."}}\n\`\`\`
You choose the next action for a LOCAL program that can read/edit files and run commands. You do not need direct filesystem access yourself. Generate dedicated poli-tool blocks only for actions needed by the user's task; then wait for real results. For normal chat, just answer naturally. Do not refuse local actions for lack of your own filesystem access.`,
  };
  return [
    { role: 'system', content: [...converted.filter(m => m.role === 'system').map(m => m.content), bridgeInstructions()].join('\n\n') },
    ...converted.filter(m => m.role !== 'system'),
  ];
}
