// What every number on screen actually counts.
//
// The keys page told you how to move around a screen full of terms nobody
// defined: LEAD, ATTN/SHIP, DEPLOYS, CFR. A metric whose definition lives only
// in the README is a metric the reader guesses at, and a guessed DORA number
// is worse than no number -- they will compare it to someone else's.
//
// Each entry says what is counted and, where it matters, what is deliberately
// NOT counted, because that is the half a reader cannot infer from the screen.
//
// Its own module, not the TUI's, because D13 says no metric may exist in only
// one door: the TUI draws it, `skeins glossary` prints it, and neither can
// drift away from the other.
export const GLOSSARY = [
  ['attention', 'wall-clock time an agent spent editing this project. Gaps longer than a few minutes are not counted, so it is time worked, not time elapsed.'],
  ['landed', 'commits on the trunk (main, master, develop) first-parent line inside the window. Release commits are excluded -- they are bookkeeping, not work.'],
  ['/day  /week', 'landed divided by the window. Over a window shorter than a week the column says /DAY, because a weekly rate from two days is a projection.'],
  ['lead', 'median time from the first edit made after the previous landing until this one lands. "I started on this, and this is when it shipped."'],
  ['attn/ship', 'attention divided by landings: how much agent time one shipped change cost. The join no other tool can make -- skeins knows the time, git knows what came out of it.'],
  ['deployment', 'a version tag. Where a repo tags nothing, a release commit instead -- never both, or release-please counts one publish twice.'],
  ['deploys n/m', 'm deployments in the window, n of them judged. The newest can never be judged: nothing has shipped after it yet.'],
  ['CFR', 'change failure rate -- the share of judged deployments whose NEXT deployment carried a fix or revert touching a file that deployment shipped.'],
  ['', 'the unit is the deployment, not the commit. A fix that lands before the next release means nothing ever shipped broken: 92% of this repo by the loose rule, 15% by this one.'],
  ['hotfixed n/m', 'of the m deployments a file shipped in, n were repaired by the next one. The denominator is the point: the file that ships most often is not the file that breaks most often, and a bare count sends you to rewrite the wrong one.'],
  ['bands', "DORA's own: 0-15% elite and high, 16-30% medium, above that low. The colour is red at every value and only the tone moves, so it reads as severity."],
  ['open', 'a session is in a repo and has written nothing there yet. It still counts: measured on a real machine, the gap between opening a session and its first write ran from zero to forty-one minutes, and a quarter of sessions never wrote at all. That is exactly when a warning is worth having.'],
  ['compacting', 'time a session spent rebuilding a picture it already had, because the context window filled. It is part of the attention beside it, not extra -- and "auto" means the ceiling was hit rather than a compaction chosen. CLAUDE ONLY so far: Codex and opencode compact too and skeins has not found their markers, so this under-reports rather than being complete.'],
  ['collision', 'two SESSIONS editing one file close enough together to overwrite each other, and whose lifetimes actually overlapped. Frequently the same agent twice.'],
  ['graph', 'preset 5: change coupling. A node is a file, an edge is "these two are edited in the same commit", and the ratio is measured against the rarer of the two. Two files that always move together are one thing wearing two names. Red marks a file two overlapping sessions wrote minutes apart, drawn whether git paired it or not.'],
  ['improving', 'the ARE YOU IMPROVING band under the velocity table. Every project pooled, per fortnight, because measured on real solo-developer data a per-project week has two of four buckets EMPTY and an arrow drawn from two landings is a confident lie. An arrow knows which way is GOOD: more landed is better, more attention per change is not. A dot is a fortnight your loaded window does not reach.'],
  ['not here', 'mean time to restore needs incidents a laptop does not have, and deployment frequency for one developer is the landed column. Two of DORA\'s four are absent rather than faked.'],
]
