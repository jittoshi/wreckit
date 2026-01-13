import type { WorkflowState } from "../schemas";

export const WORKFLOW_STATES: WorkflowState[] = [
  "raw",
  "researched",
  "planned",
  "implementing",
  "in_pr",
  "done",
];

export function getStateIndex(state: WorkflowState): number {
  return WORKFLOW_STATES.indexOf(state);
}

export function getNextState(current: WorkflowState): WorkflowState | null {
  const index = getStateIndex(current);
  if (index === -1 || index >= WORKFLOW_STATES.length - 1) {
    return null;
  }
  return WORKFLOW_STATES[index + 1];
}

export function getAllowedNextStates(current: WorkflowState): WorkflowState[] {
  const next = getNextState(current);
  return next ? [next] : [];
}

export function isTerminalState(state: WorkflowState): boolean {
  return state === "done";
}
