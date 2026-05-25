function parseStreamLine(line) {
  if (!line || !line.trim()) return null;
  let msg;
  try { msg = JSON.parse(line); } catch { return null; }

  if (msg.type === 'system' && msg.subtype === 'init') {
    return { type: 'system', subtype: 'init', sessionId: msg.session_id || null };
  }

  if (msg.type === 'assistant' && msg.message?.content) {
    const texts = [];
    const toolUses = [];
    for (const block of msg.message.content) {
      if (block.type === 'text') texts.push(block.text);
      if (block.type === 'tool_use') toolUses.push({ id: block.id, name: block.name, input: block.input });
    }
    return { type: 'assistant', texts, toolUses };
  }

  if (msg.type === 'tool_result') {
    const content = msg.content || [];
    const output = content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    return { type: 'tool_result', toolUseId: msg.tool_use_id || null, output };
  }

  if (msg.type === 'result') {
    return {
      type: 'result',
      subtype: msg.subtype || 'unknown',
      result: msg.result || null,
      sessionId: msg.session_id || null,
      costUsd: msg.total_cost_usd ?? null
    };
  }

  return null;
}

function extractDisplayEvents(parsed) {
  if (!parsed) return [];

  if (parsed.type === 'assistant') {
    const events = [];
    for (const text of parsed.texts) {
      events.push({ kind: 'text', content: text });
    }
    for (const tu of parsed.toolUses) {
      const inputStr = typeof tu.input === 'object'
        ? (tu.input.command || tu.input.path || JSON.stringify(tu.input))
        : String(tu.input);
      events.push({ kind: 'tool_use', name: tu.name, input: inputStr });
    }
    return events;
  }

  if (parsed.type === 'tool_result') {
    return [{ kind: 'tool_result', output: parsed.output }];
  }

  if (parsed.type === 'result') {
    return [{
      kind: 'result',
      status: parsed.subtype,
      result: parsed.result,
      sessionId: parsed.sessionId,
      costUsd: parsed.costUsd
    }];
  }

  return [];
}

module.exports = { parseStreamLine, extractDisplayEvents };
