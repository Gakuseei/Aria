/**
 * Slash command system for Aria chat interface.
 * Commands are intercepted before being sent to the AI model.
 */

const COMMANDS = {
  '/help': { handler: handleHelp },
  '/summary': { handler: handleSummary }
};

/**
 * @param {string} text - Raw input text
 * @returns {boolean}
 */
export function isCommand(text) {
  return text.trim().startsWith('/');
}

/**
 * @param {string} text - Raw command text
 * @param {{ messages: Array, t: object, settings: object, character: object, passionLevel: number, sessionId: string }} ctx
 * @returns {{ handled: boolean, message?: object }}
 */
export function executeCommand(text, ctx) {
  const trimmed = text.trim();
  const cmd = trimmed.split(/\s+/)[0].toLowerCase();

  const entry = COMMANDS[cmd];
  if (!entry) {
    return {
      handled: true,
      message: systemMsg(ctx.t.commands?.unknownCommand?.replace('{cmd}', cmd) || `Unknown command: ${cmd}. Type /help for available commands.`)
    };
  }

  return entry.handler(ctx);
}

function systemMsg(content) {
  return { role: 'system', content, timestamp: Date.now() };
}

function handleHelp({ t }) {
  const c = t.commands || {};
  const lines = [
    c.helpTitle || '── Commands ──',
    '',
    `/help — ${c.helpDesc || 'Show available commands'}`,
    `/summary — ${c.summaryDesc || "Today's session summary"}`,
  ];

  return { handled: true, message: systemMsg(lines.join('\n')) };
}

function handleSummary({ messages, t, settings, character, passionLevel }) {
  const c = t.commands || {};
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const ts = todayStart.getTime();

  const todayMsgs = messages.filter(m => (m.timestamp || 0) >= ts);
  const userMsgs = todayMsgs.filter(m => m.role === 'user');
  const aiMsgs = todayMsgs.filter(m => m.role === 'assistant');

  let tokens = 0;
  let promptTokens = 0;
  let responseMs = 0;

  for (const m of aiMsgs) {
    if (m.stats) {
      tokens += m.stats.tokens || 0;
      promptTokens += m.stats.promptTokens || 0;
      responseMs += m.stats.responseTime || 0;
    }
  }

  const totalTokens = tokens + promptTokens;
  const avgResponse = aiMsgs.length > 0 ? Math.round(responseMs / aiMsgs.length / 1000) : 0;
  const charName = character?.name || '—';
  const model = settings?.ollamaModel || '—';

  const lines = [
    c.summaryTitle || '── Today\'s Summary ──',
    '',
    `${c.character || 'Character'}: ${charName}`,
    `${c.model || 'Model'}: ${model}`,
    `${c.passion || 'Passion'}: ${passionLevel || 0}%`,
    '',
    `${c.messagesSent || 'Messages'}: ${userMsgs.length} → ${aiMsgs.length}`,
    `${c.tokensUsed || 'Tokens'}: ${totalTokens.toLocaleString()} (${promptTokens.toLocaleString()} prompt + ${tokens.toLocaleString()} response)`,
    `${c.avgResponse || 'Avg response'}: ${avgResponse}s`,
  ];

  return { handled: true, message: systemMsg(lines.join('\n')) };
}
