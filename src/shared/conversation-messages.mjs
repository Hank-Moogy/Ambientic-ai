// Provider transcripts contain model context and tool results as well as chat.
// Only textual message blocks belong in a human message bubble.
export function conversationText (content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((part) => ['text', 'input_text', 'output_text'].includes(part?.type))
    .map((part) => part.text || '').filter(Boolean).join('\n')
}

export function visibleUserText (input) {
  let text = String(input || '').trim()
  if (/^# AGENTS\.md instructions\s*[\r\n]/.test(text) && /<environment_context>/.test(text)) return ''
  if (/^<(?:environment_context|external_codex_apps_open_page|task-notification|turn_aborted|local-command-caveat|command-name|local-command-stdout|guardian_tool_descriptions)(?:\s|>)/.test(text)) return ''
  if (/^This session is being continued from a previous conversation/.test(text)) return ''
  if (text.startsWith('<send_user_message_question_reply>')) {
    try {
      const answers = JSON.parse(text.replace(/^<send_user_message_question_reply>/, '').replace(/<\/send_user_message_question_reply>\s*$/, ''))
      return answers.map((item) => String(item.answer || '')).filter(Boolean).join('\n')
    } catch { return '' }
  }
  text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
  return text
}
