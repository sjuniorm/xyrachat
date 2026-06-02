// Monotonic per-process id, used to give each Realtime channel instance a
// unique topic name. Two hooks subscribing to the "same" logical channel (e.g.
// the assigned-conversations badge in the tab bar AND the Notifications screen)
// would otherwise collide on one topic and throw
// "cannot add postgres_changes callbacks after subscribe()".
let counter = 0;

export function uid(): string {
  counter += 1;
  return counter.toString(36);
}
