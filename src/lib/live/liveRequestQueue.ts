import type { LiveRequest } from "./types";

export function upsertLiveRequest(queue: LiveRequest[], request: LiveRequest) {
  const existing = queue.findIndex((item) => item.id === request.id);
  if (existing === -1) return [request, ...queue];
  return queue.map((item, index) => (index === existing ? request : item));
}

export function removeLiveRequest(queue: LiveRequest[], requestId: string) {
  return queue.filter((request) => request.id !== requestId);
}

export function selectNextLiveRequest(queue: LiveRequest[], requestId?: string) {
  if (!queue.length) return undefined;
  return queue.find((request) => request.id === requestId) ?? queue[0];
}
