import type { Prd, WorkflowState } from "../schemas";
import { getAllowedNextStates } from "./states";

export interface ValidationContext {
  hasResearchMd: boolean;
  hasPlanMd: boolean;
  prd: Prd | null;
  hasPr: boolean;
  prMerged: boolean;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function allStoriesDone(prd: Prd | null): boolean {
  if (!prd || prd.user_stories.length === 0) {
    return false;
  }
  return prd.user_stories.every((story) => story.status === "done");
}

export function hasPendingStories(prd: Prd | null): boolean {
  if (!prd) {
    return false;
  }
  return prd.user_stories.some((story) => story.status === "pending");
}

export function canEnterResearched(
  ctx: Pick<ValidationContext, "hasResearchMd">
): ValidationResult {
  if (!ctx.hasResearchMd) {
    return { valid: false, reason: "research.md does not exist" };
  }
  return { valid: true };
}

export function canEnterPlanned(
  ctx: Pick<ValidationContext, "hasPlanMd" | "prd">
): ValidationResult {
  if (!ctx.hasPlanMd) {
    return { valid: false, reason: "plan.md does not exist" };
  }
  if (!ctx.prd) {
    return { valid: false, reason: "prd.json is not valid" };
  }
  return { valid: true };
}

export function canEnterImplementing(
  ctx: Pick<ValidationContext, "prd">
): ValidationResult {
  if (!hasPendingStories(ctx.prd)) {
    return {
      valid: false,
      reason: "prd.json has no stories with status pending",
    };
  }
  return { valid: true };
}

export function canEnterInPr(
  ctx: Pick<ValidationContext, "prd" | "hasPr">
): ValidationResult {
  if (!allStoriesDone(ctx.prd)) {
    return { valid: false, reason: "not all stories are done" };
  }
  if (!ctx.hasPr) {
    return { valid: false, reason: "PR not created" };
  }
  return { valid: true };
}

export function canEnterDone(
  ctx: Pick<ValidationContext, "prMerged">
): ValidationResult {
  if (!ctx.prMerged) {
    return { valid: false, reason: "PR not merged" };
  }
  return { valid: true };
}

export function validateTransition(
  current: WorkflowState,
  target: WorkflowState,
  ctx: ValidationContext
): ValidationResult {
  const allowed = getAllowedNextStates(current);
  if (!allowed.includes(target)) {
    return {
      valid: false,
      reason: `cannot transition from ${current} to ${target}`,
    };
  }

  switch (target) {
    case "researched":
      return canEnterResearched(ctx);
    case "planned":
      return canEnterPlanned(ctx);
    case "implementing":
      return canEnterImplementing(ctx);
    case "in_pr":
      return canEnterInPr(ctx);
    case "done":
      return canEnterDone(ctx);
    default:
      return { valid: false, reason: `unknown target state: ${target}` };
  }
}
