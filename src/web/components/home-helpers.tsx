export { Contours, PhotoCredit, useFormat } from "./ui";
import { formatHours } from "../../lib/engine/units";
export const formatHoursSafe = (h: number) => formatHours(h);
