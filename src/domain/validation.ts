import type { Prd, WorkflowState } from "../schemas";
import { getAllowedNextStates } from "./states";
import type { ParsedIdea } from "./ideas";

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

/**
 * Payload size limits for idea ingestion as specified in 001-ideas-ingestion.md
 * These limits prevent denial-of-service and cost blowups
 */
export const PAYLOAD_LIMITS = {
  MAX_IDEAS: 50,
  MAX_TITLE_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_SUCCESS_CRITERIA_ITEMS: 20,
  MAX_TOTAL_PAYLOAD_SIZE_BYTES: 100 * 1024, // 100 KB
} as const;

/**
 * Validation error details for payload size violations
 */
export interface PayloadValidationErrorDetails {
  valid: boolean;
  errors: string[];
}

/**
 * Calculate the approximate byte size of a JSON object
 */
function calculateJsonSize(obj: unknown): number {
  return JSON.stringify(obj).length;
}

/**
 * Validate a single ParsedIdea against size limits
 */
function validateSingleIdea(idea: ParsedIdea, index: number): string[] {
  const errors: string[] = [];

  // Check title length
  if (idea.title && idea.title.length > PAYLOAD_LIMITS.MAX_TITLE_LENGTH) {
    errors.push(
      `Idea #${index + 1}: Title exceeds ${PAYLOAD_LIMITS.MAX_TITLE_LENGTH} characters ` +
        `(${idea.title.length} characters)`
    );
  }

  // Check description length
  if (idea.description && idea.description.length > PAYLOAD_LIMITS.MAX_DESCRIPTION_LENGTH) {
    errors.push(
      `Idea #${index + 1}: Description exceeds ${PAYLOAD_LIMITS.MAX_DESCRIPTION_LENGTH} characters ` +
        `(${idea.description.length} characters)`
    );
  }

  // Check success criteria count
  if (idea.successCriteria && idea.successCriteria.length > PAYLOAD_LIMITS.MAX_SUCCESS_CRITERIA_ITEMS) {
    errors.push(
      `Idea #${index + 1}: Success criteria exceeds ${PAYLOAD_LIMITS.MAX_SUCCESS_CRITERIA_ITEMS} items ` +
        `(${idea.successCriteria.length} items)`
    );
  }

  return errors;
}

/**
 * Validate an array of parsed ideas against payload size limits.
 * Returns an object with valid flag and array of error messages.
 *
 * Per the 001-ideas-ingestion.md spec:
 * - Maximum ideas per ingestion: 50
 * - Title length: 120 characters
 * - Description length: 2000 characters
 * - Success criteria items: 20
 * - Total payload size: 100 KB
 *
 * @param ideas - Array of parsed ideas to validate
 * @returns Validation result with errors array
 */
export function validatePayloadLimits(ideas: ParsedIdea[]): PayloadValidationErrorDetails {
  const errors: string[] = [];

  // Check total idea count
  if (ideas.length > PAYLOAD_LIMITS.MAX_IDEAS) {
    errors.push(
      `Too many ideas: maximum ${PAYLOAD_LIMITS.MAX_IDEAS} ideas per ingestion, got ${ideas.length}`
    );
  }

  // Validate each individual idea
  for (let i = 0; i < ideas.length; i++) {
    const ideaErrors = validateSingleIdea(ideas[i], i);
    errors.push(...ideaErrors);
  }

  // Check total payload size
  const totalSize = calculateJsonSize(ideas);
  if (totalSize > PAYLOAD_LIMITS.MAX_TOTAL_PAYLOAD_SIZE_BYTES) {
    const sizeKb = (totalSize / 1024).toFixed(2);
    const maxKb = (PAYLOAD_LIMITS.MAX_TOTAL_PAYLOAD_SIZE_BYTES / 1024).toFixed(0);
    errors.push(
      `Total payload size exceeds ${maxKb} KB ` +
        `(${sizeKb} KB / ${totalSize} bytes)`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate payload limits and throw a PayloadValidationError if invalid.
 * This is a convenience function for use in command handlers.
 *
 * @param ideas - Array of parsed ideas to validate
 * @throws PayloadValidationError if validation fails
 */
export function assertPayloadLimits(ideas: ParsedIdea[]): void {
  const result = validatePayloadLimits(ideas);
  if (!result.valid) {
    const message = "Payload validation failed:\n" + result.errors.map((e) => `  - ${e}`).join("\n");
    throw new (require("../errors").PayloadValidationError)(message);
  }
}

/**
 * Options for research quality validation as specified in 002-research-phase.md
 */
export interface ResearchQualityOptions {
  /** Minimum number of file:line citations required (default: 5) */
  minCitations: number;
  /** Minimum length of Summary section in characters (default: 100) */
  minSummaryLength: number;
  /** Minimum length of Current State Analysis section in characters (default: 150) */
  minAnalysisLength: number;
  /** Required section headers (case-insensitive matching) */
  requiredSections: string[];
}

/**
 * Result of research quality validation
 */
export interface ResearchQualityResult {
  /** Whether the research document passes quality checks */
  valid: boolean;
  /** Number of file:line citations found */
  citations: number;
  /** Length of Summary section in characters */
  summaryLength: number;
  /** Length of Current State Analysis section in characters */
  analysisLength: number;
  /** Required sections that are missing */
  missingSections: string[];
  /** Array of validation error messages */
  errors: string[];
}

/**
 * Default options for research quality validation.
 * Based on 002-research-phase.md quality requirements.
 */
export const DEFAULT_RESEARCH_QUALITY_OPTIONS: ResearchQualityOptions = {
  minCitations: 5,
  minSummaryLength: 100,
  minAnalysisLength: 150,
  requiredSections: [
    "Header",
    "Research Question",
    "Summary",
    "Current State Analysis",
    "Key Files",
    "Technical Considerations",
    "Risks and Mitigations",
    "Recommended Approach",
    "Open Questions",
  ],
};

/**
 * Count file:line citations in text.
 * Matches patterns like:
 * - src/file.ts:42
 * - src/file.ts:42-50 (range)
 * - path/to/file.ext:123
 *
 * @param text - Text to search for citations
 * @returns Number of citations found
 */
function countCitations(text: string): number {
  // Match file paths followed by : and line numbers
  // Pattern: path/to/file.ext:line or path/to/file.ext:start-end
  const citationPattern = /\b[\w./-]+\.[\w-]+:\d+(?:-\d+)?\b/g;
  const matches = text.match(citationPattern);
  return matches ? matches.length : 0;
}

/**
 * Extract content between two section headers.
 *
 * @param content - Full document content
 * @param startSection - Section name to start from (inclusive)
 * @param endSection - Section name to end at (exclusive)
 * @returns Content between sections, or empty string if not found
 */
function extractSectionContent(
  content: string,
  startSection: string,
  endSection?: string
): string {
  const lines = content.split("\n");
  let inSection = false;
  const sectionContent: string[] = [];

  // Normalize section names for comparison (case-insensitive, remove # prefix)
  const normalizeSection = (section: string) =>
    section.replace(/^#+\s*/, "").toLowerCase().trim();

  const normalizedStart = normalizeSection(startSection);
  const normalizedEnd = endSection ? normalizeSection(endSection) : null;

  for (const line of lines) {
    const normalizedLine = normalizeSection(line);

    // Check if this is a section header
    if (line.match(/^#+\s/) && normalizedLine) {
      if (!inSection && normalizedLine === normalizedStart) {
        inSection = true;
        continue; // Skip the header line itself
      } else if (inSection) {
        // We've hit the next section
        if (normalizedEnd && normalizedLine === normalizedEnd) {
          break;
        }
        // If we don't have a specific end section, any ## level section ends our content
        if (!normalizedEnd) {
          break;
        }
      }
    }

    if (inSection) {
      sectionContent.push(line);
    }
  }

  return sectionContent.join("\n").trim();
}

/**
 * Check which required sections are present in the document.
 *
 * @param content - Research document content
 * @param requiredSections - List of required section names
 * @returns Array of missing section names
 */
function findMissingSections(content: string, requiredSections: string[]): string[] {
  const missing: string[] = [];
  const normalizedContent = content.toLowerCase();

  for (const section of requiredSections) {
    // Special case: "Header" checks for any top-level heading (# Title)
    if (section.toLowerCase() === "header") {
      const hasHeader = /^#\s+\S.*/m.test(content);
      if (!hasHeader) {
        missing.push(section);
      }
      continue;
    }

    // Check for section header (## Section Name or # Section Name)
    const pattern = new RegExp(`^#+\\s*${section.toLowerCase()}\\s*$`, "m");
    if (!pattern.test(normalizedContent)) {
      missing.push(section);
    }
  }

  return missing;
}

/**
 * Validate research document quality according to 002-research-phase.md requirements.
 *
 * This function checks:
 * 1. Required sections are present (Header, Research Question, Summary, etc.)
 * 2. Minimum citation density (file:line references)
 * 3. Minimum content length for key sections
 *
 * Per the spec:
 * - "At least 5-10 `file:line` references"
 * - "Summary and analysis sections have substantive content"
 * - "Required sections present"
 *
 * @param content - Research document content (markdown)
 * @param options - Validation options (uses defaults if not provided)
 * @returns Validation result with details
 */
export function validateResearchQuality(
  content: string,
  options: Partial<ResearchQualityOptions> = {}
): ResearchQualityResult {
  const opts: ResearchQualityOptions = {
    ...DEFAULT_RESEARCH_QUALITY_OPTIONS,
    ...options,
  };

  const errors: string[] = [];

  // Check for required sections
  const missingSections = findMissingSections(content, opts.requiredSections);
  if (missingSections.length > 0) {
    errors.push(`Missing required sections: ${missingSections.join(", ")}`);
  }

  // Extract and validate Summary section
  const summaryContent = extractSectionContent(content, "Summary", "Current State Analysis");
  const summaryLength = summaryContent.length;

  // Extract and validate Current State Analysis section
  const analysisContent = extractSectionContent(content, "Current State Analysis", "Key Files");
  const analysisLength = analysisContent.length;

  // Count citations in the entire document
  const citations = countCitations(content);

  // Validate citation density
  if (citations < opts.minCitations) {
    errors.push(
      `Insufficient citations: found ${citations}, required at least ${opts.minCitations} file:line references`
    );
  }

  // Validate summary length
  if (summaryLength < opts.minSummaryLength) {
    errors.push(
      `Summary section too short: ${summaryLength} characters, required at least ${opts.minSummaryLength}`
    );
  }

  // Validate analysis length
  if (analysisLength < opts.minAnalysisLength) {
    errors.push(
      `Current State Analysis section too short: ${analysisLength} characters, required at least ${opts.minAnalysisLength}`
    );
  }

  return {
    valid: errors.length === 0,
    citations,
    summaryLength,
    analysisLength,
    missingSections,
    errors,
  };
}

/**
 * Options for plan quality validation as specified in 003-plan-phase.md
 */
export interface PlanQualityOptions {
  /** Required section headers (case-insensitive matching) */
  requiredSections: string[];
  /** Minimum number of phases required in the plan (default: 1) */
  minPhases: number;
}

/**
 * Result of plan quality validation
 */
export interface PlanQualityResult {
  /** Whether the plan document passes quality checks */
  valid: boolean;
  /** Number of implementation phases found */
  phases: number;
  /** Required sections that are missing */
  missingSections: string[];
  /** Array of validation error messages */
  errors: string[];
}

/**
 * Default options for plan quality validation.
 * Based on 003-plan-phase.md quality requirements.
 */
export const DEFAULT_PLAN_QUALITY_OPTIONS: PlanQualityOptions = {
  minPhases: 1,
  requiredSections: [
    "Header",
    "Implementation Plan Title",
    "Overview",
    "Current State",
    "Desired End State",
    "What We're NOT Doing",
    "Implementation Approach",
    "Phases",
    "Testing Strategy",
  ],
};

/**
 * Count the number of implementation phases in the plan.
 * Looks for ### (level 3) headers under the "Phases" section.
 *
 * @param content - Plan document content
 * @returns Number of phases found
 */
function countPhases(content: string): number {
  // Find the Phases section
  const phasesSection = extractSectionContent(content, "Phases", "Testing Strategy");
  if (!phasesSection) {
    return 0;
  }

  // Count ### headers (phase headers)
  const phaseHeaderRegex = /^###\s+\S.*/gm;
  const matches = phasesSection.match(phaseHeaderRegex);
  return matches ? matches.length : 0;
}

/**
 * Check which required sections are present in the plan document.
 *
 * @param content - Plan document content
 * @param requiredSections - List of required section names
 * @returns Array of missing section names
 */
function findMissingPlanSections(content: string, requiredSections: string[]): string[] {
  const missing: string[] = [];
  const normalizedContent = content.toLowerCase();

  for (const section of requiredSections) {
    // Special case: "Header" checks for any top-level heading (# Title)
    if (section.toLowerCase() === "header") {
      const hasHeader = /^#\s+\S.*/m.test(content);
      if (!hasHeader) {
        missing.push(section);
      }
      continue;
    }

    // Check for section header (## Section Name or # Section Name)
    const pattern = new RegExp(`^#+\\s*${section.toLowerCase()}\\s*$`, "m");
    if (!pattern.test(normalizedContent)) {
      missing.push(section);
    }
  }

  return missing;
}

/**
 * Validate plan document quality according to 003-plan-phase.md requirements.
 *
 * This function checks:
 * 1. Required sections are present (Header, Overview, Current State, etc.)
 * 2. Minimum number of implementation phases
 *
 * Per the spec:
 * - "Required sections present"
 * - "Phased approach: Logical ordering with dependencies"
 *
 * @param content - Plan document content (markdown)
 * @param options - Validation options (uses defaults if not provided)
 * @returns Validation result with details
 */
export function validatePlanQuality(
  content: string,
  options: Partial<PlanQualityOptions> = {}
): PlanQualityResult {
  const opts: PlanQualityOptions = {
    ...DEFAULT_PLAN_QUALITY_OPTIONS,
    ...options,
  };

  const errors: string[] = [];

  // Check for required sections
  const missingSections = findMissingPlanSections(content, opts.requiredSections);
  if (missingSections.length > 0) {
    errors.push(`Missing required sections: ${missingSections.join(", ")}`);
  }

  // Count implementation phases
  const phases = countPhases(content);

  // Validate minimum phases
  if (phases < opts.minPhases) {
    errors.push(
      `Insufficient implementation phases: found ${phases}, required at least ${opts.minPhases}`
    );
  }

  return {
    valid: errors.length === 0,
    phases,
    missingSections,
    errors,
  };
}
