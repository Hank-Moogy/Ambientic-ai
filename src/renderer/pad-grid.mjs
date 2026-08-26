// Which thread sits on which pad. The hardware grid is built from the session
// store in `seq` order — pads hold their position and only ever recolour, so a
// thread does not move under the user's finger. The on-screen grid has to make
// the same choice or the two stop describing each other, which is the whole
// point of showing it.
//
// History sessions never reach the hardware, so they are not given a pad here.
export function padGridSessions (sessions = [], padCount = 40) {
  const live = sessions
    .filter((session) => session && !session.history)
    .slice()
    .sort((left, right) => padOrder(left) - padOrder(right))
  return Array.from({ length: Math.max(0, padCount) }, (_, index) => live[index] || null)
}

function padOrder (session) {
  // A session with no seq was never assigned a pad; keep it after the ones that
  // were rather than letting it displace them.
  return Number.isFinite(session?.seq) ? session.seq : Number.MAX_SAFE_INTEGER
}
