import test from 'node:test'
import assert from 'node:assert/strict'
import { conversationText, visibleUserText } from '../src/shared/conversation-messages.mjs'

test('tool results never masquerade as user text, including mixed messages', () => {
  assert.equal(conversationText([{ type: 'tool_result', content: 'generated output' }]), '')
  assert.equal(conversationText([{ type: 'text', text: 'My actual reply' }, { type: 'tool_result', content: 'noise' }]), 'My actual reply')
})

test('known machine wrappers are hidden while human answers and code are preserved', () => {
  assert.equal(visibleUserText('# AGENTS.md instructions\n<INSTRUCTIONS>rules</INSTRUCTIONS><environment_context>context</environment_context>'), '')
  assert.equal(visibleUserText('<external_codex_apps_open_page>code</external_codex_apps_open_page>'), '')
  assert.equal(visibleUserText('<send_user_message_question_reply>[{"answer":"both"}]</send_user_message_question_reply>'), 'both')
  assert.equal(visibleUserText('Fix this <Widget /> please'), 'Fix this <Widget /> please')
  assert.equal(visibleUserText('My reply\n<system-reminder>machine context</system-reminder>'), 'My reply')
})
