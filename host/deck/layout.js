// Which agent each Stream Deck key shows. No Node imports: the control
// page draws the same layout in the browser.

// What each of `keys` keys shows on page `page`: an agent, an overflow key
// ({ more: n hidden, asking: how many of them need you, page, pages }), or
// null. Each agent sits on the key of his seat (cast.js), so nobody moves
// when others come, go or change what they are doing; an agent with no
// seat yet takes the next one after the last. With a seat past the last
// key, the last key turns into the overflow key and pages: seat n is then
// on page n / (keys - 1).
export function layout(agents, keys, page = 0) {
  let next = Math.max(-1, ...agents.map(a => (Number.isInteger(a.seat) ? a.seat : -1))) + 1
  const seated = agents.map(a => (Number.isInteger(a.seat) ? a : { ...a, seat: next++ }))
  const last = Math.max(-1, ...seated.map(a => a.seat))

  if (last < keys) {
    const slots = Array(keys).fill(null)
    for (const a of seated) slots[a.seat] = a
    return { page: 0, slots }
  }

  const per = keys - 1
  const pages = Math.floor(last / per) + 1
  const p = ((page % pages) + pages) % pages
  const slots = Array(per).fill(null)
  const hidden = []
  for (const a of seated) {
    if (Math.floor(a.seat / per) === p) slots[a.seat % per] = a
    else hidden.push(a)
  }
  slots.push({ more: hidden.length, asking: hidden.filter(a => a.kind === 'ask').length, page: p, pages })
  return { page: p, slots }
}
