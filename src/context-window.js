// Estimates are intentionally labeled: routers do not all expose tokenizers,
// context limits, or usage. Never infer a limit from the model's marketing name.
import { contextHandoff, modelMessages } from './context-handoff.js';
export function contextLimit(model = {}, config = {}) {
  const configured = config.contextWindows?.[model.id || config.model];
  if (Number.isSafeInteger(configured) && configured >= 1024) return { tokens: configured, source: 'configured' };
  const values = [model.context_window, model.contextWindow, model.context_length, model.max_context_tokens, model.limits?.context_window, model.limits?.context, model.capabilities?.context_window, model.capabilities?.contextWindow];
  const tokens = values.find(value => Number.isSafeInteger(value) && value > 0);
  return { tokens: tokens || null, source: tokens ? 'provider' : 'unknown' };
}

export function estimateTokens(messages, tools = null) {
  return Math.ceil(Buffer.byteLength(JSON.stringify({messages, ...(tools?.length ? {tools} : {})}), 'utf8') / 4);
}

export function contextSnapshot({ session, model, config, messages, tools }) {
  const limit = contextLimit(model || {id:config.model}, config);
  const usedTokens = estimateTokens(messages || session.messages, tools);
  const reported = session.contextUsage?.model === config.model ? session.contextUsage : null;
  const outputReserve = config.maxTokens || 4096;
  const remainingTokens = limit.tokens ? Math.max(0, limit.tokens - usedTokens) : null;
  const availableInputTokens = limit.tokens ? Math.max(0, limit.tokens - usedTokens - outputReserve) : null;
  return {
    model: config.model, usedTokens, estimated: true, limitTokens: limit.tokens, limitSource: limit.source,
    percentUsed: limit.tokens ? Math.min(100, Math.ceil(usedTokens / limit.tokens * 100)) : null,
    outputReserve, remainingTokens, availableInputTokens,
    percentAvailable: limit.tokens ? Math.max(0, Math.floor((limit.tokens - usedTokens - outputReserve) / limit.tokens * 100)) : null,
    overBudget: limit.tokens ? usedTokens + outputReserve > limit.tokens : false,
    reportedPromptTokens: reported?.promptTokens ?? null, reportedCompletionTokens: reported?.completionTokens ?? null,
    activeMessages: session.messages.filter(message => message.role !== 'system').length,
    archivedMessages: session.archivedMessages?.length || 0,
  };
}

const shortTokens = value => value >= 1000000 ? (value / 1000000).toFixed(1) + 'm' : value >= 1000 ? (value / 1000).toFixed(1) + 'k' : String(value);
export function contextLabel(snapshot) {
  if (!snapshot) return '';
  const used = '~' + shortTokens(snapshot.usedTokens);
  return snapshot.limitTokens ? `context ${used}/${shortTokens(snapshot.limitTokens)} · ${snapshot.percentAvailable ?? 100 - snapshot.percentUsed}% left` : `context ${used} · limit unknown`;
}

export function parseContextLimit(value) {
  const match = /^(\d+)(k|m)?$/i.exec(value.trim());
  if (!match) return null;
  const count = Number(match[1]) * (match[2]?.toLowerCase() === 'k' ? 1000 : match[2]?.toLowerCase() === 'm' ? 1000000 : 1);
  return Number.isSafeInteger(count) && count >= 1024 && count <= 10000000 ? count : null;
}

export function contextError(error) {
  return error?.code === 'context_length_exceeded' || [400,413,422].includes(error?.status) && /context.{0,40}(?:length|limit|exceed|too long)|(?:maximum|max).{0,15}(?:input|context).{0,20}tokens/i.test(error.message || '');
}

// The session keeps the originals. Only the outgoing request is shortened,
// retaining paired native calls/results and the latest user instruction.
export function fitContext(messages, tools, budgetTokens) {
  if (!budgetTokens || estimateTokens(messages,tools)<=budgetTokens) return messages;
  const latestUser=messages.findLastIndex(message=>message.role==='user');
  const latestTools=messages.map((message,index)=>message.role==='tool'?index:-1).filter(index=>index>=0).slice(-2);
  let result=messages.map((message,index)=>{
    if(typeof message.content!=='string')return message;
    const limit=message.role==='tool'?(latestTools.includes(index)?6000:1200):message.role==='assistant'?2400:message.role==='user'&&index!==latestUser?3000:Infinity;
    if(message.content.length<=limit)return message;
    const content=message.role==='tool'?JSON.stringify({poli_context_excerpt:true,original_characters:message.content.length,excerpt:message.content.slice(0,limit),recovery:'Use search_history to recover the full recorded result by tool name, file path, or keyword.'}):message.content.slice(0,limit)+'\n[Earlier message excerpt shortened for context; the full record is available through search_history.]';
    return {...message,content};
  });
  if(estimateTokens(result,tools)>budgetTokens) {
    const rounds=result.map((message,index)=>index>latestUser&&message.role==='assistant'&&message.tool_calls?.length?index:-1).filter(index=>index>=0);
    if(rounds.length>3) {
      const cut=rounds.at(-3),removed=messages.slice(latestUser+1,cut);
      result=[...result.slice(0,latestUser+1),{role:'system',content:'Earlier tool rounds in this task were shortened for context. Their full recorded outcomes remain available through search_history.\n'+contextHandoff(removed).slice(0,8000)},...result.slice(cut)];
    }
  }
  result=modelMessages(result,{extraInstructions:'Some earlier message or tool-result excerpts have been shortened for context. Do not infer that omitted work did not happen. Use search_history to recover full recorded details when needed.'});
  return result;
}
