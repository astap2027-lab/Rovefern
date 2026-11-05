import { z } from "zod/v4";
import { extractRequirements, missingQuestions, normaliseAnswer, starterKit } from "../../lib/ai/heuristics";
import { defaultShareable, guessCategory } from "../../lib/domain/gearDefaults";
import { findTrail } from "../../lib/domain/trails";
import { AIError, aiEnabled, structuredCall, type ChatMessage } from "../anthropic";
import { clip, nodeHandler } from "../http";
import { planSystem } from "../prompts";
import { PlanResponseSchema, type PlanResponse } from "../schemas";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(30),
  settings: z.object({ currency: z.string().regex(/^[A-Z]{3}$/).default("AUD"), units: z.enum(["metric", "imperial"]).default("metric"), locale: z.string().max(20).optional() }).default({ currency: "AUD", units: "metric" }),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export function offlinePlan(messages: ChatMessage[], currency: string): PlanResponse {
  const text = messages.filter((m) => m.role === "user").map((m) => normaliseAnswer(typeof m.content === "string" ? m.content : "")).join(". ");
  const r = extractRequirements(text, currency);
  const questions = missingQuestions(r);
  const extracted = {
    destination: r.destination ?? null,
    country: r.country ?? null,
    month: r.month ?? null,
    durationDays: r.durationDays ?? null,
    groupSize: r.groupSize ?? null,
    budgetMax: r.budgetMax ?? null,
    currency: r.currency ?? null,
    budgetBasis: r.budgetBasis ?? null,
    experience: r.experience ?? null,
    desiredDifficulty: r.desiredDifficulty ?? null,
    scenery: r.scenery,
    existingGear: r.existingGear,
    dietary: r.dietary,
  };
  const ready = Boolean(r.destination && r.durationDays);
  if (!ready) {
    return { reply: "Happy to help plan this. A couple of quick questions first:", ready: false, questions, extracted };
  }
  const trail = findTrail(r.trailId);
  const days = r.durationDays!;
  return {
    reply: trail
      ? `I've set up ${trail.name} using its official details. AI suggestions are offline right now, so add your own notes to each day.`
      : `I've set up a ${days}-day trip for ${r.destination}. AI suggestions are offline right now, so the route is blank for you to fill in, import a GPX file, or start from a trail in Explore.`,
    ready: true,
    questions: [],
    extracted,
    trip: {
      title: trail ? trail.name : `${r.destination} ${days > 1 ? `${days}-day hike` : "day hike"}`,
      trailId: trail?.id ?? null,
      isEstablishedTrail: Boolean(trail),
      destinationName: trail?.name ?? r.destination!,
      country: trail?.country ?? r.country ?? null,
      region: trail?.region ?? null,
      lat: trail?.lat ?? null,
      lon: trail?.lon ?? null,
      timezone: trail?.timezone ?? null,
      currency: r.currency ?? trail?.currency ?? currency,
      difficulty: trail?.grade.value ?? null,
      gradingSystem: trail?.gradingSystem ?? null,
      summary: trail ? trail.blurb : "",
      intensity: !r.desiredDifficulty || /moderate/.test(r.desiredDifficulty) ? "moderate" : /easy|gentle/.test(r.desiredDifficulty) ? "easy" : "hard",
      days: Array.from({ length: days }, (_, i) => ({ from: "", to: "", title: `Day ${i + 1}` })),
      gearSuggestions: [
        ...r.existingGear.map((name) => ({ name: name[0].toUpperCase() + name.slice(1), category: guessCategory(name), essential: true, shareable: defaultShareable(guessCategory(name)), alreadyOwned: true, reason: null })),
        ...starterKit(days)
          .filter((k) => !r.existingGear.some((g) => guessCategory(g) === k.category && k.category !== "clothing"))
          .map((k) => ({ ...k, alreadyOwned: false })),
      ],
      budgetLines: [],
      checklistExtras: [],
      limitations: trail ? [] : ["The route hasn't been planned yet. Add stages yourself, import a GPX file, or pick an established trail."],
    },
  };
}

export async function run(input: unknown): Promise<unknown> {
  const body = Body.parse(input);
  const messages: ChatMessage[] = body.messages.map((m) => ({ role: m.role, content: clip(m.content, 4000) }));
  // The conversation must start with the user for the Messages API.
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length) throw new AIError("Tell me about the hike you have in mind.", 400);

  if (!aiEnabled()) return ({ mode: "offline", ...offlinePlan(messages, body.settings.currency) });

  const today = body.today ?? new Date().toISOString().slice(0, 10);
  const result = await structuredCall({
    system: planSystem(today, body.settings),
    messages,
    toolName: "plan_response",
    toolDescription: "Respond to the user: extracted requirements, follow-up questions, and the trip plan when ready.",
    schema: PlanResponseSchema,
    maxTokens: 12000,
  });
  if (result.ready && !result.trip) result.ready = false;
  if (result.trip?.trailId && !findTrail(result.trip.trailId)) result.trip.trailId = null;
  return { mode: "live", ...result };
}

export default nodeHandler(run);
