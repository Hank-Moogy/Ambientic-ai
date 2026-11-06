import test from 'node:test'
import assert from 'node:assert/strict'
import { claudeTranscriptMessages, describeToolCall, isSyntheticUserRow, parseClaudeTranscript } from '../src/main/claude-transcript.mjs'

const toolUse = (id, name, input) => ({
  type: 'assistant',
  uuid: `a-${id}`,
  message: { content: [{ type: 'tool_use', id, name, input }] }
})

const toolResult = (id, content, extra = {}) => ({
  type: 'user',
  uuid: `u-${id}`,
  message: { content: [{ tool_use_id: id, type: 'tool_result', content, ...extra }] }
})

test('a tool result never becomes a message from the user', () => {
  const messages = claudeTranscriptMessages([
    { type: 'user', uuid: 'p1', message: { content: 'Fix the parser' } },
    toolUse('t1', 'Read', { file_path: '/Users/x/src/app/parser.mjs' }),
    toolResult('t1', 'line one\nline two'),
    { type: 'assistant', uuid: 'a2', message: { content: [{ type: 'text', text: 'Done.' }] } }
  ])
  assert.deepEqual(messages.map((entry) => entry.role), ['user', 'activity', 'assistant'])
  assert.equal(messages[0].text, 'Fix the parser')
  const activity = messages[1]
  assert.equal(activity.title, 'Read …/app/parser.mjs')
  assert.equal(activity.text, 'line one\nline two')
  assert.equal(activity.status, 'done')
})

test('a failed tool result marks its own step rather than the thread', () => {
  const messages = claudeTranscriptMessages([
    toolUse('t1', 'Bash', { command: 'npm test', description: 'Run tests' }),
    toolResult('t1', 'exit 1', { is_error: true })
  ])
  assert.equal(messages[0].status, 'failed')
  assert.equal(messages[0].title, 'Run: Run tests')
  assert.equal(messages[0].detail, 'npm test')
})

test('array tool results and long output stay readable', () => {
  const messages = claudeTranscriptMessages([
    toolUse('t1', 'Grep', { pattern: 'TODO' }),
    toolResult('t1', [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]),
    toolUse('t2', 'Read', { file_path: '/tmp/big.txt' }),
    toolResult('t2', 'x'.repeat(9000))
  ])
  assert.equal(messages[0].text, 'a\n[image]\nb')
  assert.ok(messages[1].text.length < 4200)
  assert.match(messages[1].text, /more characters\)$/)
})

test('machinery written into user rows stays out of the conversation', () => {
  const rows = [
    { type: 'user', uuid: 'm1', isMeta: true, message: { content: [{ type: 'text', text: 'Continue from where you left off.' }] } },
    { type: 'user', uuid: 'm2', message: { content: '<system-reminder>be nice</system-reminder>' } },
    { type: 'user', uuid: 'm3', message: { content: '<ambientic-context mode="build">\nProject context\n</ambientic-context>' } },
    { type: 'user', uuid: 'm4', message: { content: '<task-notification>agent finished</task-notification>' } },
    { type: 'user', uuid: 'm5', message: { content: '<local-command-stdout>ok</local-command-stdout>' } },
    { type: 'user', uuid: 'm6', isSidechain: true, message: { content: 'subagent chatter' } }
  ]
  for (const row of rows) assert.equal(isSyntheticUserRow(row), true, row.uuid)
  assert.deepEqual(claudeTranscriptMessages(rows), [])
})

test('a real prompt survives the reminders attached to it', () => {
  const messages = claudeTranscriptMessages([{
    type: 'user',
    uuid: 'p1',
    message: { content: '<system-reminder>context</system-reminder>\nShip the release\n<system-reminder>more</system-reminder>' }
  }])
  assert.deepEqual(messages.map((entry) => entry.text), ['Ship the release'])
})

test('thinking is kept as collapsible activity, not as the answer', () => {
  const messages = claudeTranscriptMessages([{
    type: 'assistant',
    uuid: 'a1',
    message: { content: [{ type: 'thinking', thinking: 'weighing options' }, { type: 'text', text: 'Here is the plan.' }] }
  }])
  assert.deepEqual(messages.map((entry) => [entry.role, entry.kind || '']), [['activity', 'reasoning'], ['assistant', '']])
})

test('tool calls are named the way an approval card names them', () => {
  assert.equal(describeToolCall('Write', { file_path: '/tmp/a/b/c/notes.md' }), 'Write …/c/notes.md')
  assert.equal(describeToolCall('mcp__github__create_issue', {}), 'github: create issue')
  assert.equal(describeToolCall('', {}), 'Claude Code tool')
})

test('parses JSONL and ignores unparseable lines', () => {
  const contents = [
    JSON.stringify({ type: 'user', uuid: 'p1', message: { content: 'hello' } }),
    'not json',
    '',
    JSON.stringify({ type: 'assistant', uuid: 'a1', message: { content: [{ type: 'text', text: 'hi' }] } })
  ].join('\n')
  assert.deepEqual(parseClaudeTranscript(contents).map((entry) => entry.text), ['hello', 'hi'])
})

test('mixed tool results retain real replies and structured question answers', () => {
  const messages = claudeTranscriptMessages([
    toolUse('mixed', 'Read', { file_path: '/tmp/example' }),
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'mixed', content: 'machine output' }, { type: 'text', text: 'My actual reply' }] } },
    { type: 'user', message: { content: '<send_user_message_question_reply>[{"answer":"Keep both"}]</send_user_message_question_reply>' } }
  ])
  assert.deepEqual(messages.filter((entry) => entry.role === 'user').map((entry) => entry.text), ['My actual reply', 'Keep both'])
  assert.equal(messages[0].text, 'machine output')
})
