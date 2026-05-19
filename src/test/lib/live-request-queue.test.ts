import { describe, expect, it } from "vitest";

import { buildFakeLiveRequests } from "../../lib/live/fakeLiveClients";
import {
  removeLiveRequest,
  selectNextLiveRequest,
  upsertLiveRequest,
} from "../../lib/live/liveRequestQueue";

describe("live request queue", () => {
  it("upserts, selects, and removes requests deterministically", () => {
    const [first, second] = buildFakeLiveRequests();
    const initial = [first!];
    const added = upsertLiveRequest(initial, second!);
    const replaced = upsertLiveRequest(added, { ...second!, origin: "changed" });

    expect(added).toHaveLength(2);
    expect(replaced).toHaveLength(2);
    expect(replaced[0]?.origin).toBe("changed");
    expect(selectNextLiveRequest(replaced, second!.id)?.id).toBe(second!.id);
    expect(removeLiveRequest(replaced, second!.id)).toHaveLength(1);
  });
});
