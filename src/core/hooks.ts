import { BRANCH_BASES } from "./git-flow.js";

export type HookVerdict = {
  permission: "allow" | "ask" | "deny";
  user_message?: string;
  agent_message?: string;
};

const ALLOW: HookVerdict = { permission: "allow" };
const BASES = new Set<string>(BRANCH_BASES);

function isBase(name: string): boolean {
  return BASES.has(name);
}

function rank(verdict: HookVerdict): number {
  return verdict.permission === "deny" ? 2 : verdict.permission === "ask" ? 1 : 0;
}

function ask(message: string): HookVerdict {
  return { permission: "ask", user_message: message, agent_message: message };
}

function deny(message: string): HookVerdict {
  return { permission: "deny", user_message: message, agent_message: message };
}

function unquote(token: string): string {
  if (token.length >= 2) {
    const start = token[0];
    const end = token[token.length - 1];
    if ((start === '"' || start === "'") && start === end) return token.slice(1, -1);
  }
  return token;
}

function tokenize(segment: string): string[] {
  const toks: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  const flush = (): void => {
    if (cur.length === 0) return;
    toks.push(unquote(cur));
    cur = "";
  };
  for (const ch of segment) {
    if (quote !== null) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === " " || ch === "\t") {
      flush();
      continue;
    }
    cur += ch;
  }
  flush();
  return toks;
}

export function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  const flush = (): void => {
    const part = current.trim();
    if (part.length > 0) parts.push(part);
    current = "";
  };
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]!;
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ";") {
      flush();
      continue;
    }
    if (ch === "&" && command[i + 1] === "&") {
      flush();
      i += 1;
      continue;
    }
    if (ch === "|") {
      if (command[i + 1] === "|") i += 1;
      flush();
      continue;
    }
    current += ch;
  }
  flush();
  return parts;
}

function skipGitOptions(toks: string[], start: number): number {
  let i = start;
  while (i < toks.length) {
    const t = toks[i]!;
    if (t === "-C" || t === "-c" || t === "--git-dir" || t === "--work-tree") {
      i += 2;
      continue;
    }
    if (
      t.startsWith("-C") && t.length > 2 ||
      t.startsWith("--git-dir=") ||
      t.startsWith("--work-tree=")
    ) {
      i += 1;
      continue;
    }
    if (t.startsWith("-") && t !== "-" && t !== "--") {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

function refspecDest(spec: string): string {
  const body = spec.startsWith("+") ? spec.slice(1) : spec;
  const colon = body.lastIndexOf(":");
  return colon >= 0 ? body.slice(colon + 1) : body;
}

function isForceFlag(token: string): boolean {
  if (token === "--force" || token.startsWith("--force-with-lease")) return true;
  return token.startsWith("-") && !token.startsWith("--") && token.includes("f");
}

function pushDests(args: string[]): string[] {
  if (args.length === 0) return [];
  if (args.length === 1) {
    const one = args[0]!;
    if (one.includes(":") || one.startsWith("+") || isBase(one)) return [refspecDest(one)];
    return [];
  }
  return args.slice(1).map(refspecDest);
}

function decideGit(toks: string[], currentBranch: string | undefined): HookVerdict {
  const subAt = skipGitOptions(toks, 1);
  const sub = toks[subAt];
  const rest = toks.slice(subAt + 1);
  if (sub === "push") {
    let force = false;
    const args: string[] = [];
    for (const token of rest) {
      if (token === "--") continue;
      if (token.startsWith("-")) {
        if (isForceFlag(token)) force = true;
        continue;
      }
      args.push(token);
    }
    if (force) return ask("Force-push requires confirmation.");
    const dests = pushDests(args);
    const hit = dests.find((name) => isBase(name));
    if (hit !== undefined) return ask(`Push to base branch ${hit} requires confirmation.`);
    if (dests.length === 0 && currentBranch !== undefined && isBase(currentBranch)) {
      return ask(`Push from base branch ${currentBranch} requires confirmation.`);
    }
    return ALLOW;
  }
  if (sub === "merge" && currentBranch !== undefined && isBase(currentBranch)) {
    return ask(`Merge on base branch ${currentBranch} requires confirmation.`);
  }
  return ALLOW;
}

function isApproveFlag(token: string): boolean {
  if (token === "--approve" || token === "-a") return true;
  return token.startsWith("-") && !token.startsWith("--") && token.includes("a");
}

function decideGh(toks: string[], autoMerge: boolean): HookVerdict {
  const pr = toks.indexOf("pr", 1);
  if (pr < 0) return ALLOW;
  const rest = toks.slice(pr + 1);
  if (rest.includes("review") && rest.some(isApproveFlag)) {
    return deny("Tito never approves a pull request.");
  }
  if (rest.includes("merge")) {
    return autoMerge ? ALLOW : ask("Merging a pull request requires confirmation.");
  }
  return ALLOW;
}

function decideNpm(toks: string[]): HookVerdict {
  let i = 1;
  while (i < toks.length && toks[i]!.startsWith("-")) i += 1;
  if (toks[i] === "publish") return ask("npm publish requires confirmation.");
  return ALLOW;
}

function decideSegment(
  segment: string,
  currentBranch: string | undefined,
  autoMerge: boolean,
): HookVerdict {
  const toks = tokenize(segment);
  const cmd = toks[0];
  if (cmd === "git") return decideGit(toks, currentBranch);
  if (cmd === "gh") return decideGh(toks, autoMerge);
  if (cmd === "npm") return decideNpm(toks);
  return ALLOW;
}

export function decideShell(
  command: string,
  currentBranch: string | undefined,
  autoMerge?: boolean,
): HookVerdict {
  const mergeOn = autoMerge === true;
  let best: HookVerdict = ALLOW;
  for (const segment of splitCommand(command)) {
    const verdict = decideSegment(segment, currentBranch, mergeOn);
    if (rank(verdict) > rank(best)) best = verdict;
  }
  return best;
}
