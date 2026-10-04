function definition(name, description, properties = {}, required = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}
export const SUBAGENT_TOOLS = [
  definition('spawn_agent', 'Start a subagent with a separate conversation and the same workspace. Explorer/reviewer agents are read-only; workers inherit the current permissions. Give each worker distinct files. Use wait_agent to collect its result. Subagents cannot spawn more agents.', {
    task: { type: 'string', description: 'A self-contained task, including expected result and relevant file paths.' },
    label: { type: 'string', description: 'Short label for the task.' },
    model: { type: 'string', description: 'Optional model ID; defaults to the current model.' },
    role: { type: 'string', enum: ['explorer', 'reviewer', 'worker'], description: 'Defaults to explorer. Workers may edit only under inherited permissions.' },
  }, ['task']),
  definition('wait_agent', 'Wait for a subagent and return its verified tool outcomes plus final report. Omit agent_id to collect all uncollected results.', { agent_id: { type: 'string' } }),
  definition('list_agents', 'List subagent IDs, tasks, models, roles, and statuses.'),
  definition('stop_agent', 'Cancel a running subagent. Wait for its result before retrying its work.', { agent_id: { type: 'string' } }, ['agent_id']),
];
export async function executeSubagent(name, args, context) {
  if (!context.subagents) return { error: 'Subagents are unavailable in this execution context. Nested delegation is not supported.' };
  return context.subagents[name](args, context);
}
