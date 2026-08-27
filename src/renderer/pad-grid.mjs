// Which thread sits on which pad. The hardware grid is built from the session
// store in `padIndex` order — pads hold their position and only ever recolour, so a
// thread does not move under the user's finger. The on-screen grid has to make
// the same choice or the two stop describing each other, which is the whole
// point of showing it.
//
// History and empty discovery placeholders never reach the hardware, so they
// are not given a pad index by the shared session store.
export function padGridSessions (sessions = [], padCount = 40) {
  const live = sessions
    .filter((session) => session && Number.isInteger(session.padIndex))
    .slice()
    .sort((left, right) => left.padIndex - right.padIndex)
  return Array.from({ length: Math.max(0, padCount) }, (_, index) => live[index] || null)
}
