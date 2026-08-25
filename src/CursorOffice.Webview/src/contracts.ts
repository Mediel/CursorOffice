export type AgentStatus =
  | 'unknown'
  | 'idle'
  | 'working'
  | 'waitingForUser'
  | 'error'
  | 'completed'
  | 'offline';

export type AgentVisualRole = 'owner' | 'manager' | 'chat' | 'subagent';
export type OfficeLanguage = 'cs' | 'en';
export type OfficeRoleColors = Record<AgentVisualRole, string>;
export type OfficePreferences = {
  language: OfficeLanguage;
  roleColors: OfficeRoleColors;
};

export type AgentSnapshot = {
  id: string;
  displayName: string;
  role: string;
  status: AgentStatus;
  currentTask?: string | null;
  detail?: string | null;
  lastActivityAt?: string;
  kind?: 'primary' | 'subagent';
  parentAgentId?: string | null;
  workspace?: string | null;
  model?: string | null;
  isParallelWorker?: boolean;
  generationId?: string | null;
  usage?: TokenUsage | null;
  interactionKind?: AgentInteractionKind | null;
  workspacePath?: string | null;
  windowId?: string | null;
  windowLabel?: string | null;
  windowCorrelation?: 'focused' | 'conversation' | 'workspace' | null;
  isFallback?: boolean;
  teamModels?: string[];
  usageScope?: 'generation' | 'workspace';
  conversationTitle?: string | null;
};

export type AgentInteractionKind =
  | 'userPrompt'
  | 'agentResponse'
  | 'delegationStarted'
  | 'handoffCompleted';

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

export type UsageBucket = TokenUsage & {
  key: string;
  requestCount: number;
};

export type UsageLedgerSnapshot = {
  total: UsageBucket;
  byWorkspace: UsageBucket[];
  byModel: UsageBucket[];
  byWorkspaceModel: UsageBucket[];
  byDay: UsageBucket[];
  updatedAt?: string | null;
};

export type OfficeOwner = {
  displayName: string;
  role: string;
  accent: string;
};

export type OfficeBrand = {
  name: string;
  logoDataUri?: string;
};

export type CursorWindowSnapshot = {
  id: string;
  label: string;
  workspaceRoots: string[];
  processId?: number;
  isFocused: boolean;
  lastFocusedAt: string;
  updatedAt: string;
  isCurrent?: boolean;
};

export type OfficeBootstrap = {
  brand?: OfficeBrand;
  owner: OfficeOwner;
  agents: AgentSnapshot[];
  usage?: UsageLedgerSnapshot;
  currentWindow?: CursorWindowSnapshot;
  windows?: CursorWindowSnapshot[];
};

export type HostMessage = {
  type: string;
  payload?: unknown;
};

export const statusColors: Record<AgentStatus, number> = {
  unknown: 0x8392a5,
  idle: 0x4da3ff,
  working: 0x39d98a,
  waitingForUser: 0xffbd4a,
  error: 0xff5f6d,
  completed: 0x9d7cff,
  offline: 0x566471
};

/** Role is the permanent shirt color; runtime status uses the selection ring and labels. */
export const roleColors: Record<AgentVisualRole, number> = {
  owner: 0x32c477,
  manager: 0x00c7c7,
  chat: 0x2f6bff,
  subagent: 0xb084ff
};

export function applyRoleColors(colors?: Partial<OfficeRoleColors>): void {
  for (const role of ['owner', 'manager', 'chat', 'subagent'] as const) {
    const value = colors?.[role];
    if (value && /^#[0-9a-f]{6}$/i.test(value)) {
      roleColors[role] = Number.parseInt(value.slice(1), 16);
    }
  }
}

export function visualRoleFor(agent: AgentSnapshot): Exclude<AgentVisualRole, 'owner'> {
  if (agent.id.startsWith('cursor-window-manager-')) {
    return 'manager';
  }
  if (agent.parentAgentId?.startsWith('cursor-window-manager-')) {
    return 'chat';
  }
  return agent.kind === 'subagent' && agent.parentAgentId ? 'subagent' : 'chat';
}
