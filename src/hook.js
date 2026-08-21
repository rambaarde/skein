// The ambient line (PRD §1, thesis §5). This is the product.
//
// Rules, all of them load-bearing:
//   - it never blocks; the caller exits 0 on every path, including errors
//   - silence when there is nothing to say (PRD Q7) -- an injected line
//     nobody asked for is worse than no line
//   - it states a fact and stops. No instruction, no recommendation.
import { collect } from './sources/index.js'
import { who } from './collide.js'
import { gitRoot } from './project.js'
import { ago, short, trunc } from './format.js'

export function hookLine({ cwd = process.cwd(), session = null, activeMin = 30, now = Date.now() } = {}) {
  const root = gitRoot(`${cwd}/.`) ?? cwd
  const { events, sessions } = collect()
  const others = who(events, sessions, { root, activeMin, self: session, now })
  if (!others.length) return null                      // silence when alone

  const n = others.length
  const head = `${n} other agent${n === 1 ? '' : 's'} active in this repo`
  const rows = others.slice(0, 5).map(o => {
    const verb = o.kind === 'add' ? 'added' : o.kind === 'delete' ? 'deleted' : 'editing'
    return `  ${o.agent.padEnd(8)} ${verb.padEnd(8)} ${short(o.path, root).padEnd(34)} (${ago(o.at, now)} ago)`
  })
  const more = n > 5 ? [`  … and ${n - 5} more`] : []
  return [head, ...rows, ...more].join('\n')
}
