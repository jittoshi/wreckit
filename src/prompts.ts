import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getWreckitDir } from "./fs/paths";

export type PromptName = "research" | "plan" | "implement";

export interface PromptVariables {
  id: string;
  title: string;
  section: string;
  overview: string;
  item_path: string;
  branch_name: string;
  base_branch: string;
  completion_signal: string;
  research?: string;
  plan?: string;
  prd?: string;
  progress?: string;
}

function getPromptsDir(root: string): string {
  return path.join(getWreckitDir(root), "prompts");
}

function getPromptPath(root: string, name: PromptName): string {
  return path.join(getPromptsDir(root), `${name}.md`);
}

function getBundledPromptPath(name: PromptName): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "prompts", `${name}.md`);
}

export async function getDefaultTemplate(name: PromptName): Promise<string> {
  const bundledPath = getBundledPromptPath(name);
  return fs.readFile(bundledPath, "utf-8");
}

export async function loadPromptTemplate(
  root: string,
  name: PromptName
): Promise<string> {
  const promptPath = getPromptPath(root, name);

  try {
    const content = await fs.readFile(promptPath, "utf-8");
    return content;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return getDefaultTemplate(name);
    }
    throw err;
  }
}

export function renderPrompt(
  template: string,
  variables: PromptVariables
): string {
  let result = template;

  const varMap: Record<string, string | undefined> = {
    id: variables.id,
    title: variables.title,
    section: variables.section,
    overview: variables.overview,
    item_path: variables.item_path,
    branch_name: variables.branch_name,
    base_branch: variables.base_branch,
    completion_signal: variables.completion_signal,
    research: variables.research,
    plan: variables.plan,
    prd: variables.prd,
    progress: variables.progress,
  };

  for (const [key, value] of Object.entries(varMap)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(pattern, value ?? "");
  }

  return result;
}

export async function initPromptTemplates(root: string): Promise<void> {
  const promptsDir = getPromptsDir(root);
  await fs.mkdir(promptsDir, { recursive: true });

  const promptNames: PromptName[] = ["research", "plan", "implement"];

  for (const name of promptNames) {
    const filePath = getPromptPath(root, name);
    try {
      await fs.access(filePath);
    } catch {
      const content = await getDefaultTemplate(name);
      await fs.writeFile(filePath, content, "utf-8");
    }
  }
}
