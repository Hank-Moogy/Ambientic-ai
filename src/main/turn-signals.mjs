// A turn that ends by asking the user something is not finished work — it is
// blocked on a person. Neither Codex nor Claude emits a distinct "I need input"
// event for this: the model simply stops and the last thing it said is a
// question. So the last message is the only signal there is, and it has to read
// the same way for every provider, or the same pause shows up as red on one pad
// and grey on the next.
//
// Trailing formatting is stripped first because a question rarely ends on the
// question mark itself — it ends on a closing bracket, a quote, or the emphasis
// markers around it.
export function awaitsUserReply (text) {
  const clean = String(text || '').replace(/[\s*_"'`)\]]+$/, '')
  return /\?$/.test(clean)
}
