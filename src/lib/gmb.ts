import type { GmbStatus } from "./types";

/** A GMB profile is "poor" if it is thin on reviews or has a weak rating. */
export function gmbStatusFrom(hasProfile: boolean, rating: number | null, reviews: number | null): GmbStatus {
  if (!hasProfile) return "missing";
  if (rating === null || reviews === null) return "poor";
  if (reviews < 15 || rating < 4.0) return "poor";
  return "good";
}
