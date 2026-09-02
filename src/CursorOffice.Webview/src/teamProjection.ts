import type {
  AgentSnapshot,
  CursorWindowSnapshot,
  OfficeBootstrap
} from './contracts';

const ownerInteractions = new Set(['userPrompt', 'agentResponse']);

export function projectWindowTeams(bootstrap: OfficeBootstrap): AgentSnapshot[] {
  const windows = uniqueWindows(bootstrap.windows, bootstrap.currentWindow);
  const correlatedAgents = correlateWindowlessAgents(bootstrap.agents, windows);

  const managerIdByWindow = new Map(
    windows.map(window => [window.id, managerId(window.id)])
  );
  const workspaceByWindow = new Map(
    windows.map(window => [window.id, inferWorkspace(window, correlatedAgents)])
  );
  const workspaceCounts = new Map<string, number>();
  for (const workspace of workspaceByWindow.values()) {
    workspaceCounts.set(workspace, (workspaceCounts.get(workspace) ?? 0) + 1);
  }

  const managers = windows.map(window => createWindowManager(
    window,
    workspaceByWindow.get(window.id) ?? 'Cursor',
    workspaceCounts,
    correlatedAgents.filter(agent => agent.windowId === window.id),
    bootstrap
  ));
  const childCounts = new Map<string, number>();
  for (const agent of correlatedAgents) {
    if (agent.kind === 'subagent' && agent.parentAgentId) {
      childCounts.set(agent.parentAgentId, (childCounts.get(agent.parentAgentId) ?? 0) + 1);
    }
  }
  const workers = correlatedAgents.map(agent => {
    if (agent.kind === 'subagent') {
      return {
        ...agent,
        ...provenRuntimeFields(agent)
      };
    }
    const parentAgentId = agent.windowId
      ? managerIdByWindow.get(agent.windowId)
      : undefined;
    const childCount = childCounts.get(agent.id) ?? 0;
    const isTeamLead = childCount > 0;
    const conversationTitle = agent.conversationTitle?.trim();
    const transferredInteraction = parentAgentId
      ? agent.interactionKind === 'userPrompt'
        ? 'delegationStarted' as const
        : agent.interactionKind === 'agentResponse'
          ? 'handoffCompleted' as const
          : agent.interactionKind
      : agent.interactionKind;
    return {
      ...agent,
      displayName: conversationTitle || `${isTeamLead ? 'Senior agent' : 'Agent'} ${shortAgentId(agent.id)}`,
      role: `${agent.workspace?.trim() || 'Cursor'} · ${isTeamLead
        ? 'senior / coordinator'
        : parentAgentId
          ? 'working agent'
          : 'unassigned chat'}`,
      detail: [
        conversationTitle ? `Chat: ${conversationTitle}` : undefined,
        agent.detail,
        isTeamLead ? `coordinating ${formatCount(childCount, 'subagent', 'subagents')}` : undefined
      ].filter(Boolean).join(' · ') || agent.detail,
      kind: 'subagent' as const,
      parentAgentId,
      interactionKind: transferredInteraction,
      ...provenRuntimeFields(agent)
    };
  });

  return [...managers, ...workers];
}

/**
 * Transcript fallback records do not know which Cursor window produced them.
 * Associate them only when the workspace identifies exactly one live window.
 * A duplicate workspace in two windows intentionally stays unassigned rather
 * than creating a convincing but incorrect hierarchy.
 */
function correlateWindowlessAgents(
  agents: AgentSnapshot[],
  windows: CursorWindowSnapshot[]
): AgentSnapshot[] {
  const directlyCorrelated = agents.map(agent => correlateAgent(agent, windows));
  const agentsById = new Map(directlyCorrelated.map(agent => [agent.id, agent]));

  return directlyCorrelated.map(agent => {
    if (agent.windowId || !agent.parentAgentId) {
      return agent;
    }
    const parent = agentsById.get(agent.parentAgentId);
    if (!parent?.windowId) {
      return agent;
    }
    return {
      ...agent,
      workspace: parent.workspace,
      workspacePath: parent.workspacePath,
      windowId: parent.windowId,
      windowLabel: parent.windowLabel,
      windowCorrelation: parent.windowCorrelation
    };
  });
}

function correlateAgent(
  agent: AgentSnapshot,
  windows: CursorWindowSnapshot[]
): AgentSnapshot {
  if (agent.windowId || windows.length === 0) {
    return agent;
  }
  const agentAliases = aliasesForAgent(agent);
  if (agentAliases.size === 0) {
    return agent;
  }
  const matches = windows.filter(window =>
    intersects(agentAliases, aliasesForWindow(window))
  );
  if (matches.length !== 1) {
    return agent;
  }
  const window = matches[0];
  return {
    ...agent,
    workspace: workspaceNameForWindow(window),
    workspacePath: window.workspaceRoots[0] ?? agent.workspacePath,
    windowId: window.id,
    windowLabel: window.label,
    windowCorrelation: 'workspace'
  };
}

function aliasesForAgent(agent: AgentSnapshot): Set<string> {
  const aliases = new Set<string>();
  addNameAliases(aliases, agent.workspace);
  if (agent.workspacePath) {
    addPathAliases(aliases, agent.workspacePath);
  }
  return aliases;
}

function aliasesForWindow(window: CursorWindowSnapshot): Set<string> {
  const aliases = new Set<string>();
  addNameAliases(aliases, window.label.split('·')[0]?.trim());
  for (const root of window.workspaceRoots) {
    addPathAliases(aliases, root);
  }
  return aliases;
}

function addNameAliases(aliases: Set<string>, value?: string | null): void {
  if (!value?.trim()) {
    return;
  }
  aliases.add(canonicalWorkspace(value));
  aliases.add(canonicalWorkspace(normalizeWorkspaceName(value)));
  aliases.delete('');
}

function addPathAliases(aliases: Set<string>, path: string): void {
  const segments = path.split(/[\\/]/u).filter(Boolean);
  if (segments.length === 0) {
    return;
  }
  let repositoriesIndex = -1;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (/^(?:repos|repositories)$/iu.test(segments[index])) {
      repositoriesIndex = index;
      break;
    }
  }
  if (repositoriesIndex >= 0 && repositoriesIndex < segments.length - 1) {
    addNameAliases(aliases, segments.slice(repositoriesIndex + 1).join(' '));
  }
  const maximumTail = Math.min(4, segments.length);
  for (let length = 1; length <= maximumTail; length += 1) {
    addNameAliases(aliases, segments.slice(-length).join(' '));
  }
}

function canonicalWorkspace(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function intersects(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}

function workspaceNameForWindow(window: CursorWindowSnapshot): string {
  const fromLabel = window.label.split('·')[0]?.trim();
  if (fromLabel) {
    return normalizeWorkspaceName(fromLabel);
  }
  const fromRoot = window.workspaceRoots[0]?.split(/[\\/]/u).filter(Boolean).at(-1);
  return fromRoot ? normalizeWorkspaceName(fromRoot) : 'Cursor';
}

function createWindowManager(
  window: CursorWindowSnapshot,
  workspace: string,
  workspaceCounts: ReadonlyMap<string, number>,
  agents: AgentSnapshot[],
  bootstrap: OfficeBootstrap
): AgentSnapshot {
  const conversations = agents.filter(agent => agent.kind !== 'subagent');
  const activeInteraction = latestAgent(conversations.filter(agent =>
    ownerInteractions.has(agent.interactionKind ?? '')
  ));
  const workingCount = agents.filter(agent => agent.status === 'working').length;
  const errorCount = agents.filter(agent => agent.status === 'error').length;
  const waitingCount = agents.filter(agent => agent.status === 'waitingForUser').length;
  const status: AgentSnapshot['status'] = workingCount > 0
    ? 'working'
    : errorCount > 0
      ? 'error'
      : waitingCount > 0
        ? 'waitingForUser'
        : 'idle';
  const suffix = (workspaceCounts.get(workspace) ?? 0) > 1
    ? ` · ${shortWindowId(window)}`
    : '';
  const currentTask = activeInteraction?.interactionKind === 'userPrompt'
    ? `Discussing a new assignment for chat ${chatLabel(activeInteraction)} with the owner`
    : activeInteraction?.interactionKind === 'agentResponse'
      ? `Handing the result from chat ${chatLabel(activeInteraction)} to the owner`
      : workingCount > 0
        ? `Coordinating ${formatCount(workingCount, 'active task', 'active tasks')}`
        : conversations.length > 0
          ? `Supervising ${formatCount(conversations.length, 'chat', 'chats')}`
          : 'Waiting for work in this Cursor window';
  const workspacePath = window.workspaceRoots[0];
  const workspaceUsage = bootstrap.usage?.byWorkspace.find(bucket =>
    samePath(bucket.key, workspacePath)
    || bucket.key.localeCompare(workspace, 'en-US', { sensitivity: 'accent' }) === 0
  );
  const teamModels = collectTeamModels(agents, bootstrap, workspacePath);

  return {
    id: managerId(window.id),
    displayName: `Manager ${workspace}${suffix}`,
    role: `${workspace} · Cursor window manager`,
    status,
    currentTask,
    detail: `${window.label} · ${formatCount(conversations.length, 'chat', 'chats')}`,
    lastActivityAt: activeInteraction?.lastActivityAt ?? window.updatedAt,
    kind: 'primary',
    workspace,
    workspacePath,
    teamModels,
    usage: workspaceUsage,
    usageScope: workspaceUsage ? 'workspace' : undefined,
    interactionKind: activeInteraction?.interactionKind,
    windowId: window.id,
    windowLabel: window.label,
    windowCorrelation: window.isFocused ? 'focused' : 'workspace'
  };
}

function provenRuntimeFields(agent: AgentSnapshot): Pick<
  AgentSnapshot,
  'model' | 'modelParams' | 'usage' | 'contextUsage' | 'currentTask' | 'generationId' | 'usageScope'
> {
  const model = agent.model?.trim();
  const currentTask = agent.currentTask?.trim();
  const generationId = agent.generationId?.trim();
  return {
    model: model || undefined,
    modelParams: agent.modelParams ?? undefined,
    usage: agent.usage ?? undefined,
    contextUsage: agent.contextUsage ?? undefined,
    currentTask: currentTask || undefined,
    generationId: generationId || undefined,
    usageScope: agent.usage ? 'generation' : agent.usageScope
  };
}

function collectTeamModels(
  agents: AgentSnapshot[],
  bootstrap: OfficeBootstrap,
  workspacePath?: string
): string[] {
  const models = new Set(agents
    .map(agent => agent.model?.trim())
    .filter((model): model is string => Boolean(model)));
  if (workspacePath) {
    const prefix = `${workspacePath} · `;
    for (const bucket of bootstrap.usage?.byWorkspaceModel ?? []) {
      if (bucket.key.toLocaleLowerCase('en-US').startsWith(prefix.toLocaleLowerCase('en-US'))) {
        const model = bucket.key.slice(prefix.length).trim();
        if (model) models.add(model);
      }
    }
  }
  return [...models].sort((left, right) => left.localeCompare(right, 'en-US'));
}

function samePath(left: string, right?: string): boolean {
  return right !== undefined && normalizePath(left) === normalizePath(right);
}

function normalizePath(value: string): string {
  return value.replace(/[\\/]+$/gu, '').toLocaleLowerCase('en-US');
}

function uniqueWindows(
  windows: CursorWindowSnapshot[] | undefined,
  currentWindow: CursorWindowSnapshot | undefined
): CursorWindowSnapshot[] {
  const result = new Map<string, CursorWindowSnapshot>();
  for (const window of [...(windows ?? []), ...(currentWindow ? [currentWindow] : [])]) {
    const previous = result.get(window.id);
    result.set(window.id, previous
      ? { ...previous, ...window, isCurrent: previous.isCurrent || window.isCurrent }
      : window);
  }
  return [...result.values()];
}

function inferWorkspace(window: CursorWindowSnapshot, agents: AgentSnapshot[]): string {
  const agentWorkspace = agents.find(agent => agent.windowId === window.id)?.workspace?.trim();
  if (agentWorkspace) {
    return agentWorkspace;
  }
  const labelWorkspace = window.label.split('·')[0]?.trim();
  if (labelWorkspace) {
    return normalizeWorkspaceName(labelWorkspace);
  }
  const root = window.workspaceRoots[0]?.split(/[\\/]/u).filter(Boolean).at(-1)?.trim();
  return root ? normalizeWorkspaceName(root) : 'Cursor';
}

function normalizeWorkspaceName(value: string): string {
  const withoutPackagingSuffix = value
    .replace(/\.git$/iu, '')
    .replace(/(?:[_\s.-]+(?:v?\d+(?:[._-]\d+)*|source))+$/iu, '')
    .replace(/^\s+|\s+$/gu, '');
  const normalized = withoutPackagingSuffix || value;
  return /^[a-z]/u.test(normalized) && /[A-Z]/u.test(normalized.slice(1))
    ? `${normalized[0].toUpperCase()}${normalized.slice(1)}`
    : normalized;
}

function latestAgent(agents: AgentSnapshot[]): AgentSnapshot | undefined {
  return agents.reduce<AgentSnapshot | undefined>((latest, candidate) => {
    if (!latest) {
      return candidate;
    }
    return activityTime(candidate) >= activityTime(latest) ? candidate : latest;
  }, undefined);
}

function activityTime(agent: AgentSnapshot): number {
  const value = Date.parse(agent.lastActivityAt ?? '');
  return Number.isFinite(value) ? value : 0;
}

function managerId(windowId: string): string {
  return `cursor-window-manager-${windowId}`;
}

function shortWindowId(window: CursorWindowSnapshot): string {
  const fromLabel = window.label.split('·').at(-1)?.trim();
  return fromLabel || window.id.replace(/[^a-zA-Z0-9]/gu, '').slice(-5).toUpperCase();
}

function shortAgentId(agentId: string): string {
  return agentId.replace(/^cursor-/iu, '').slice(0, 6);
}

function chatLabel(agent: AgentSnapshot): string {
  const title = agent.conversationTitle?.trim();
  return title ? `"${title}"` : shortAgentId(agent.id);
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
