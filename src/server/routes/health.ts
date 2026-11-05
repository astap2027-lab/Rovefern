import { aiEnabled, MODEL } from "../anthropic";
import { nodeHandler } from "../http";

export async function run(): Promise<unknown> {
  return { ok: true, ai: aiEnabled() ? "live" : "offline", model: aiEnabled() ? MODEL() : null, time: new Date().toISOString() };
}

export default nodeHandler(run);
