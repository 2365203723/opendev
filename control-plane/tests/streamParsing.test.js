const { parseStreamLine, extractDisplayEvents } = require('../src/runner/streamParser');

describe('parseStreamLine', () => {
  it('parses a system init line', () => {
    const line = '{"type":"system","subtype":"init","session_id":"abc123","cwd":"/tmp"}';
    expect(parseStreamLine(line)).toEqual({ type: 'system', subtype: 'init', sessionId: 'abc123' });
  });

  it('parses an assistant text message', () => {
    const line = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}';
    const result = parseStreamLine(line);
    expect(result).toEqual({ type: 'assistant', texts: ['Hello'], toolUses: [] });
  });

  it('parses an assistant tool use', () => {
    const line = '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu1","name":"Bash","input":{"command":"ls"}}]}}';
    const result = parseStreamLine(line);
    expect(result.toolUses).toEqual([{ id: 'tu1', name: 'Bash', input: { command: 'ls' } }]);
  });

  it('parses a tool result', () => {
    const line = '{"type":"tool_result","tool_use_id":"tu1","content":[{"type":"text","text":"file.txt"}]}';
    expect(parseStreamLine(line)).toEqual({ type: 'tool_result', toolUseId: 'tu1', output: 'file.txt' });
  });

  it('parses a success result', () => {
    const line = '{"type":"result","subtype":"success","result":"done","session_id":"abc","total_cost_usd":0.01}';
    expect(parseStreamLine(line)).toEqual({ type: 'result', subtype: 'success', result: 'done', sessionId: 'abc', costUsd: 0.01 });
  });

  it('returns null for non-JSON lines', () => {
    expect(parseStreamLine('not json')).toBeNull();
  });

  it('returns null for empty lines', () => {
    expect(parseStreamLine('')).toBeNull();
    expect(parseStreamLine('  ')).toBeNull();
  });

  it('returns null for unknown type', () => {
    expect(parseStreamLine('{"type":"unknown"}')).toBeNull();
  });
});

describe('extractDisplayEvents', () => {
  it('extracts text events from assistant message', () => {
    const parsed = { type: 'assistant', texts: ['Hello world'], toolUses: [] };
    const events = extractDisplayEvents(parsed);
    expect(events).toEqual([{ kind: 'text', content: 'Hello world' }]);
  });

  it('extracts tool_use events', () => {
    const parsed = { type: 'assistant', texts: [], toolUses: [{ id: 'tu1', name: 'Bash', input: { command: 'ls' } }] };
    const events = extractDisplayEvents(parsed);
    expect(events).toEqual([{ kind: 'tool_use', name: 'Bash', input: 'ls' }]);
  });

  it('extracts tool_result events', () => {
    const parsed = { type: 'tool_result', toolUseId: 'tu1', output: 'file.txt' };
    const events = extractDisplayEvents(parsed);
    expect(events).toEqual([{ kind: 'tool_result', output: 'file.txt' }]);
  });

  it('extracts result event on success', () => {
    const parsed = { type: 'result', subtype: 'success', result: 'done', sessionId: 'abc', costUsd: 0.01 };
    const events = extractDisplayEvents(parsed);
    expect(events).toEqual([{ kind: 'result', status: 'success', result: 'done', sessionId: 'abc', costUsd: 0.01 }]);
  });

  it('returns empty array for system events', () => {
    const parsed = { type: 'system', subtype: 'init', sessionId: 'abc' };
    expect(extractDisplayEvents(parsed)).toEqual([]);
  });
});
