// What a pad is saying, independent of what is lighting it. The APC grid and
// the on-screen grid resolve through here so the two can never drift: a pad the
// user sees orange on the desk must be orange on the glass, and a change of
// meaning has one place to happen.
//
// ART_DIRECTION.md, "One instrument": MIDI light, on-screen motion, and future
// sound share one colour language.
export const PAD_TONE = {
  EMPTY: 'empty',
  RUNNING: 'running',
  APPROVAL: 'approval',
  ATTENTION: 'attention',
  IDLE: 'idle'
}

// Motion carries urgency, never meaning. Reduced-motion viewers keep the tone
// and lose only the movement.
export const PAD_MOTION = {
  STILL: 'still',
  BLINK: 'blink'
}

export function padLightForSession (session) {
  if (!session) return { tone: PAD_TONE.EMPTY, motion: PAD_MOTION.STILL }
  // An approval outranks the lifecycle state beneath it: the thread cannot move
  // until the person answers, so that is all the pad needs to say.
  if (session.awaitingApproval) return { tone: PAD_TONE.APPROVAL, motion: PAD_MOTION.STILL }
  if (session.state === 'running') return { tone: PAD_TONE.RUNNING, motion: PAD_MOTION.STILL }
  if (session.state === 'attention' || session.state === 'waiting') {
    return { tone: PAD_TONE.ATTENTION, motion: session.unseen ? PAD_MOTION.BLINK : PAD_MOTION.STILL }
  }
  return { tone: PAD_TONE.IDLE, motion: PAD_MOTION.STILL }
}
