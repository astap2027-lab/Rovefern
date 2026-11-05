import { z } from "zod/v4";
import { guessCategory, defaultShareable, defaultWeightClass } from "../../lib/domain/gearDefaults";
import { parseWeight } from "../../lib/engine/units";
import { aiEnabled, structuredCall, type ContentBlock } from "../anthropic";
import { nodeHandler } from "../http";
import { GearParseSchema, type GearParse } from "../schemas";
import { GEAR_PARSE_SYSTEM } from "../prompts";

const Body = z.object({ text: z.string().min(1).max(2000), image: z.string().max(4_000_000).optional() });

export function offlineGearParse(text: string): GearParse {
  const parts = text.split(/\n|;|(?:,\s*and\s+)|(?:\.\s+)/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const items = parts.map((p) => {
    const w = p.match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|g|grams?|oz|ounces?|lb|lbs|pounds?)\b/i);
    const grams = w ? parseWeight(`${w[1]} ${w[2]}`) : null;
    const name = p
      .replace(/^(add|i have|i own|my|a|an)\s+/gi, "")
      .replace(/^(my|a|an)\s+/i, "")
      .replace(/[.,]?\s*(it )?(weighs|weighing|at|is|which is)?\s*(about|around|~)?\s*\d+(?:[.,]\d+)?\s*(kg|kgs|kilos?|g|grams?|oz|ounces?|lb|lbs|pounds?)\b.*$/i, "")
      .trim()
      .slice(0, 120);
    const category = guessCategory(p);
    return {
      name: name ? name[0].toUpperCase() + name.slice(1) : "Item",
      brand: null,
      model: null,
      category,
      weightGrams: grams,
      quantity: 1,
      weightClass: defaultWeightClass(category),
      essential: ["shelter", "sleeping_bag", "first_aid", "navigation", "safety", "water_filter", "lighting"].includes(category),
      shareable: defaultShareable(category),
      notes: null,
      needsConfirmation: [grams == null ? "Weight wasn't given" : "", category === "misc" ? "Category" : ""].filter(Boolean),
    };
  });
  return { items, reply: items.length ? "Here's what I picked out. Check the details before saving." : "I couldn't find any items in that." };
}

export async function run(input: unknown): Promise<unknown> {
  const body = Body.parse(input);
  if (!aiEnabled()) return ({ mode: "offline", ...offlineGearParse(body.text) });
  const img = body.image?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  const content: ContentBlock[] | string = img
    ? [
        { type: "image", source: { type: "base64", media_type: img[1], data: img[2] } },
        {
          type: "text",
          text: `${body.text}\n\nA photo of the item is attached. Identify the item type (and brand/model only if clearly visible). You cannot weigh things from a photo: weightGrams must come from the text or be null. List anything you inferred from the photo in needsConfirmation.`,
        },
      ]
    : body.text;
  const result = await structuredCall({
    system: GEAR_PARSE_SYSTEM,
    messages: [{ role: "user", content }],
    toolName: "add_gear",
    toolDescription: "Structured gear records parsed from the user's description.",
    schema: GearParseSchema,
    maxTokens: 3000,
  });
  return { mode: "live", ...result };
}

export default nodeHandler(run);
