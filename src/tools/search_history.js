export const searchHistoryDefinition = {
  type: 'function',
  function: {
    name: 'search_history',
    description: 'Search this session’s earlier user requests, model replies, tool calls, and real results, including turns compacted out of the current model context. Use this to recover decisions or actions from a previous model.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'A file path, decision keyword, tool name, or phrase.' }, limit: { type: 'integer', description: 'Number of recent matching records, 1–20 (default 8).' } }, required: ['query'] },
  },
};
export async function executeSearchHistory(args, context = {}) {
  if (!args.query.trim()) return { error: 'Provide a nonempty search query.' };
  if (!context.session) return { error: 'Conversation history is unavailable in this execution context.' };
  const history = context.session.searchableHistory?.() || context.session.history?.() || context.session.messages || [];
  const query = args.query.toLowerCase();
  const matches = history.map((message, index) => ({ message, index, text: [message.name, message.content, JSON.stringify(message.tool_calls || []), message.scope && JSON.stringify(message.scope)].filter(Boolean).join('\n') })).filter(entry => entry.message.role !== 'system' && entry.text.toLowerCase().includes(query));
  return { match_count: matches.length, records: matches.slice(-Math.max(1, Math.min(20, args.limit || 8))).map(entry => {
    const at = entry.text.toLowerCase().indexOf(query);
    const start = Math.max(0, at - 300);
    return { index: entry.index, role: entry.message.role, ...(entry.message.scope ? {scope:entry.message.scope} : {}), ...(entry.message.name ? { tool: entry.message.name } : {}), excerpt: entry.text.slice(start, start + 4000), truncated: start > 0 || entry.text.length > start + 4000 };
  }) };
}
