import { parseContextLimit } from '../context-window.js';
import { section, plainText } from '../ui/theme.js';

const usage = 'Usage: /agents [id|stop <id>|stop all]';
const safe = value => plainText(String(value ?? ''));

export function contextReport(agent) {
  const context = agent.getContext();
  const rows = [
    `Model: ${context.model}`,
    `Current input estimate: ~${context.usedTokens.toLocaleString()} tokens`,
    `Context window: ${context.limitTokens ? context.limitTokens.toLocaleString() + ' tokens (' + context.limitSource + ')' : 'not supplied by the provider'}`,
    ...(context.limitTokens ? [`Available for input and answer: ${context.remainingTokens.toLocaleString()} tokens`, `After output reserve: ${context.availableInputTokens.toLocaleString()} tokens`] : []),
    `Output reserve: ${context.outputReserve.toLocaleString()} tokens`,
    `Last provider-reported input: ${context.reportedPromptTokens == null ? 'not available' : context.reportedPromptTokens.toLocaleString() + ' tokens'}`,
    `Messages: ${context.activeMessages} active · ${context.archivedMessages} archived`,
    ...(context.overBudget ? ['The current task and instructions exceed this estimate’s input budget. Shorten the request or choose a larger context window.'] : []),
    '',
    'Estimates include request instructions and tool schemas. They are not tokenizer measurements.',
    '/context 128k sets a local limit for this model; it does not change the provider’s capacity.',
    '/context auto uses provider metadata. /context compact archives older turns.',
  ];
  return section('Context window', rows.map(safe).join('\n'));
}

export function agentReport(agent, arg = '') {
  const manager = agent.subagents;
  const current = manager.list_agents().agents;
  const jobs = [...current, ...(agent.session.subagentRecords || []).filter(record => !current.some(job => job.agent_id === record.agent_id))];
  if (!arg) return section('Subagents', jobs.length ? jobs.map(job => `${safe(job.agent_id)} · ${safe(job.status)} · ${safe(job.role)} · ${safe(job.model)}\n  ${safe(job.label)} · ${job.tool_calls || 0} tools`).join('\n') + '\n\n' + usage : 'No subagents yet. Ask Poli to delegate a task.');
  const parts = arg.split(/\s+/);
  if (parts[0] === 'stop' && parts.length === 2) {
    if (parts[1] === 'all') {
      const running = manager.running().length;
      manager.cancelRunning();
      return running ? `Cancellation requested for ${running} subagent${running === 1 ? '' : 's'}. The parent task continues.` : 'No subagents are running.';
    }
    const result = manager.stop_agent({agent_id:parts[1]});
    return safe(result.error || `${result.agent_id} · ${result.message}`);
  }
  if (parts.length !== 1) return usage;
  const job = jobs.find(job => job.agent_id === arg);
  if (!job) return `Unknown subagent: ${safe(arg)}\n${usage}`;
  const live = manager.jobs.get(arg);
  const record = live || agent.session.subagentRecords?.find(record => record.agent_id === arg);
  const messages = record?.messages || [];
  const report = live?.result?.report || messages.findLast(message => message.role === 'assistant' && message.content)?.content;
  const rows = [
    `${safe(job.label)} · ${safe(job.status)}`,
    `Role: ${safe(job.role)} · Model: ${safe(job.model)} · Permissions: ${safe(job.permission)}`,
    `Task: ${safe(job.task)}`,
    `Activity: ${safe(job.activity)} · ${job.tool_calls || 0} tools`,
    ...(report ? ['', 'Report:', safe(report).slice(0, 8000)] : []),
    ...(live?.result?.error ? ['', `Error: ${safe(live.result.error)}`] : []),
    ...messages.filter(message => message.role === 'tool').slice(-5).flatMap(message => ['', `Recorded ${safe(message.name)} result:`, safe(message.content).slice(0, 1500)]),
    '',
    'This view does not collect the report for the parent. Full records remain searchable with search_history.',
    ...(job.status === 'running' ? [`/agents stop ${safe(arg)} cancels this subagent.`] : []),
  ];
  return section(safe(arg), rows.join('\n'));
}

// Only these commands may run during inference. In particular, changing models,
// permissions, or conversations mid-request must not modify an active tool round.
export function handleSessionControl(input, {agent, write, saveConfig, busy = false, controller} = {}) {
  const match = /^\/(context|agents|stop)(?:\s+([\s\S]*))?$/i.exec(input.trim());
  if (!match) return false;
  const command = match[1].toLowerCase(), arg = (match[2] || '').trim();
  let result;
  try {
    if (command === 'agents') result = agentReport(agent, arg);
    else if (command === 'stop') {
      if (arg) result = 'Usage: /stop · or /agents stop <id> to stop one subagent';
      else if (controller) { controller.abort(); result = 'Stopping the current task…'; }
      else result = 'No task is running.';
    } else {
      if (arg === 'compact') {
        if (busy) result = 'Run /context compact after this task finishes, or press Esc to stop it first.';
        else {
          agent.session.compact();
          agent.session.save();
          result = contextReport(agent);
        }
      } else {
        if (arg) {
          const limit = arg.toLowerCase() === 'auto' ? null : parseContextLimit(arg);
          if (limit === null && arg.toLowerCase() !== 'auto') result = 'Usage: /context [tokens|auto|compact] · examples: /context 128k, /context auto';
          else {
            const windows = {...agent.config.contextWindows};
            if (limit === null) delete windows[agent.config.model];
            else windows[agent.config.model] = limit;
            saveConfig?.({contextWindows:windows});
            agent.config.contextWindows = windows;
            agent.historyBudgetTokens = null;
          }
        }
        result ??= contextReport(agent);
      }
    }
  } catch (error) { result = `Command failed: ${safe(error.message)}`; }
  write('\n' + result + '\n\n');
  return true;
}
