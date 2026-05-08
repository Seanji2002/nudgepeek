import type { CommentWithMeta } from '../shared/types.js'

export type CommentEvent =
  | { kind: 'insert'; comment: CommentWithMeta }
  | { kind: 'update'; comment: CommentWithMeta }
  | { kind: 'delete'; id: string; photoId: string }

type Listener = (event: CommentEvent) => void

const listeners = new Set<Listener>()

export const commentBus = {
  emit(event: CommentEvent): void {
    listeners.forEach((fn) => fn(event))
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}
