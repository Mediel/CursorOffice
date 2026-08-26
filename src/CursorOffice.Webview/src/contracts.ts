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
export type OfficeLanguageSetting = 'auto' | OfficeLanguage;
export type OfficeRoleColors = Record<AgentVisualRole, string>;
export type HairStyle = 'bald' | 'buzz' | 'short' | 'sidePart' | 'executive' | 'bob' | 'long' | 'curly' | 'bun' | 'mohawk';
export type FacialHair = 'none' | 'stubble' | 'mustache' | 'soulPatch' | 'goatee' | 'anchor' | 'fullBeard' | 'muttonChops' | 'sideburns';
export type Eyewear = 'none' | 'glasses' | 'sunglasses';
export type OwnerAppearancePreferences = {
  hairStyle: HairStyle;
  hairColor: string;
  skinColor: string;
  facialHair: FacialHair;
  eyewear: Eyewear;
};
export type OfficePreferences = {
  language: OfficeLanguage;
  roleColors: OfficeRoleColors;
  ownerAppearance?: OwnerAppearancePreferences;
  showModel?: boolean;
  showTokens?: boolean;
  showActivity?: boolean;
};

export type OfficeSettingsSnapshot = {
  language: OfficeLanguageSetting;
  ownerName: string;
  officeName: string;
  officeLogoPath: string;
  roleColors: OfficeRoleColors;
  ownerAppearance: OwnerAppearancePreferences;
  showModel: boolean;
  showTokens: boolean;
  showActivity: boolean;
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
  modelParams?: ModelParams | null;
  isParallelWorker?: boolean;
  generationId?: string | null;
  usage?: TokenUsage | null;
  contextUsage?: ContextUsage | null;
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

export type ModelParams = {
  thinking?: string | null;
  effort?: string | null;
  context?: string | null;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

export type ContextUsage = {
  contextTokens?: number | null;
  contextWindowSize?: number | null;
  contextUsagePercent?: number | null;
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
  appearance?: OwnerAppearancePreferences;
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
  settings?: OfficeSettingsSnapshot;
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
