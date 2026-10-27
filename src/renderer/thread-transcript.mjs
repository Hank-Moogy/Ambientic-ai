// A thread has two registers: the conversation (what you and the agent said)
// and the work (what the agent did to answer). The conversation is the page;
// the work is a footnote you can open. A run of consecutive activity entries is
// therefore folded into one collapsed step group rather than N stacked cards,
// so a 40-tool turn still reads as one exchange.

export function groupThreadMessages (messages = []) {
  const output = []
  for (const item of messages) {
    if (!item) continue
    if (item.role !== 'activity') {
      output.push({ type: 'message', id: item.id, item })
      continue
    }
    const last = output.at(-1)
    if (last?.type === 'steps') {
      last.steps.push(item)
      continue
    }
    output.push({ type: 'steps', id: `steps:${item.id}`, steps: [item] })
  }
  return output
}

// The one line a collapsed group shows. While the agent is still working, the
// live step is more informative than a count, so it leads.
export function stepsSummary (steps = [], { running = false } = {}) {
  const total = steps.length
  const failed = steps.filter((step) => step.status === 'failed').length
  const current = steps.at(-1)
  if (running && current) return { label: current.title || 'Working…', count: total, failed, live: true }
  const files = new Set()
  for (const step of steps) for (const file of step.files || []) files.add(file)
  const noun = total === 1 ? 'step' : 'steps'
  const label = files.size
    ? `Worked · ${total} ${noun} · ${files.size} ${files.size === 1 ? 'file' : 'files'}`
    : `Worked · ${total} ${noun}`
  return { label: failed ? `${label} · ${failed} failed` : label, count: total, failed, live: false }
}

// A group stays open only while it is the tail of a running thread. Once the
// answer lands, the work folds itself away without the user tidying up.
export function stepsAreLive (group, index, groups, running) {
  return Boolean(running) && group.type === 'steps' && index === groups.length - 1
}
