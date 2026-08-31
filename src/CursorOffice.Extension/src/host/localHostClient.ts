import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import * as vscode from 'vscode';

export type HostAgentSnapshot = {
  id: string;
  displayName: string;
  role: string;
  status: 'unknown' | 'idle' | 'working' | 'waitingForUser' | 'error' | 'completed' | 'offline';
  currentTask?: string | null;
  detail?: string | null;
  lastActivityAt?: string;
  kind?: 'primary' | 'subagent';
  parentAgentId?: string | null;
  workspace?: string | null;
  workspacePath?: string | null;
  windowId?: string | null;
  windowLabel?: string | null;
  windowCorrelation?: 'focused' | 'conversation' | 'workspace' | null;
  model?: string | null;
  modelParams?: HostModelParams | null;
  isParallelWorker?: boolean;
  generationId?: string | null;
  usage?: HostTokenUsage | null;
  contextUsage?: HostContextUsage | null;
  interactionKind?: 'userPrompt' | 'agentResponse' | 'delegationStarted' | 'handoffCompleted' | null;
  isFallback?: boolean;
};

export type HostActivityEvent = {
  agentId: string;
  occurredAt: string;
  kind: string;
  status: HostAgentSnapshot['status'];
  tool?: string;
};

export type HostModelParams = {
  thinking?: string | null;
  effort?: string | null;
  context?: string | null;
};

export type HostTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

export type HostContextUsage = {
  contextTokens?: number | null;
  contextWindowSize?: number | null;
  contextUsagePercent?: number | null;
};

export type HostUsageBucket = HostTokenUsage & {
  key: string;
  requestCount: number;
};

export type HostUsageSnapshot = {
  total: HostUsageBucket;
  byWorkspace: HostUsageBucket[];
  byModel: HostUsageBucket[];
  byWorkspaceModel: HostUsageBucket[];
  byDay: HostUsageBucket[];
  updatedAt?: string | null;
};

type ProtocolEnvelope = {
  protocolVersion: number;
  type: string;
  payload?: unknown;
};

type HostLaunch = {
  command: string;
  args: string[];
  description: string;
};

export class LocalHostClient implements vscode.Disposable {
  private readonly agents = new Map<string, HostAgentSnapshot>();
  private readonly agentEmitter = new vscode.EventEmitter<readonly HostAgentSnapshot[]>();
  private readonly usageEmitter = new vscode.EventEmitter<HostUsageSnapshot>();
  private activity: HostActivityEvent[] = [];
  private restoreTeamPending = false;
  private liveAfterSnapshot = false;
  private usage: HostUsageSnapshot = emptyUsageSnapshot();
  private process: ChildProcessWithoutNullStreams | undefined;
  private reader: Interface | undefined;

  public readonly onDidChangeAgents = this.agentEmitter.event;
  public readonly onDidChangeUsage = this.usageEmitter.event;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly output: vscode.OutputChannel
  ) {}

  public get currentAgents(): readonly HostAgentSnapshot[] {
    return [...this.agents.values()];
  }

  public get currentUsage(): HostUsageSnapshot {
    return this.usage;
  }

  public get currentActivity(): readonly HostActivityEvent[] {
    return [...this.activity];
  }

  /**
   * Snapshot restore is not consumed by webview.ready/reload. Live
   * agent.changed/removed bootstraps flip to restoreTeam: false.
   */
  public restoreTeamFor(cause: 'webview.ready' | 'agents'): boolean {
    if (!this.restoreTeamPending) {
      return false;
    }
    return cause === 'webview.ready' || !this.liveAfterSnapshot;
  }

  public start(): void {
    this.stopProcess();
    const launch = this.resolveLaunch();
    if (!launch) {
      this.output.appendLine('[host] Lokální .NET host nebyl nalezen; zůstává demonstrační projekce.');
      return;
    }

    this.output.appendLine(`[host] Spouštím ${launch.description}`);
    const child = spawn(launch.command, launch.args, {
      cwd: this.extensionUri.fsPath,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.process = child;
    this.reader = createInterface({ input: child.stdout });
    this.reader.on('line', line => this.acceptLine(line));
    child.stderr.on('data', chunk => this.output.append(chunk.toString()));
    child.on('error', error => this.output.appendLine(`[host] Nelze spustit proces: ${error.message}`));
    child.on('exit', (code, signal) => {
      this.output.appendLine(`[host] Proces skončil (code=${String(code)}, signal=${String(signal)}).`);
      if (this.process === child) {
        this.process = undefined;
        this.reader = undefined;
      }
    });
  }

  public dispose(): void {
    this.stopProcess();
    this.agentEmitter.dispose();
    this.usageEmitter.dispose();
  }

  private resolveLaunch(): HostLaunch | undefined {
    const configuredPath = vscode.workspace
      .getConfiguration('cursorOffice')
      .get<string>('hostPath', '')
      .trim();
    if (configuredPath) {
      return this.launchForPath(configuredPath);
    }

    const extensionPath = this.extensionUri.fsPath;
    const candidates = [
      join(extensionPath, 'host', 'CursorOffice.Host.dll'),
      join(extensionPath, '..', 'CursorOffice.Host', 'bin', 'Debug', 'net10.0', 'CursorOffice.Host.dll'),
      join(extensionPath, '..', 'CursorOffice.Host', 'bin', 'Release', 'net10.0', 'CursorOffice.Host.dll'),
      join(extensionPath, '..', 'CursorOffice.Host', 'CursorOffice.Host.csproj')
    ];

    const target = candidates.find(existsSync);
    return target ? this.launchForPath(target) : undefined;
  }

  private launchForPath(target: string): HostLaunch {
    const extension = extname(target).toLowerCase();
    if (extension === '.dll') {
      return { command: 'dotnet', args: [target], description: target };
    }
    if (extension === '.csproj') {
      return {
        command: 'dotnet',
        args: ['run', '--project', target, '--no-launch-profile'],
        description: target
      };
    }

    return { command: target, args: [], description: target };
  }

  private acceptLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let envelope: ProtocolEnvelope;
    try {
      envelope = JSON.parse(trimmed) as ProtocolEnvelope;
    } catch {
      this.output.appendLine(`[host] Neplatný NDJSON řádek: ${trimmed}`);
      return;
    }

    if (envelope.protocolVersion !== 1) {
      this.output.appendLine(`[host] Nepodporovaná verze protokolu: ${String(envelope.protocolVersion)}`);
      return;
    }
    if (envelope.type === 'host.ready') {
      this.output.appendLine('[host] Připraven.');
      return;
    }
    if (envelope.type === 'usage.changed' && this.isUsageSnapshot(envelope.payload)) {
      this.usage = envelope.payload;
      this.usageEmitter.fire(this.usage);
      return;
    }
    if (envelope.type === 'agent.removed' && this.isAgentRemoval(envelope.payload)) {
      this.liveAfterSnapshot = true;
      if (this.agents.delete(envelope.payload.id)) {
        this.agentEmitter.fire(this.currentAgents);
      }
      return;
    }
    if (envelope.type === 'agents.snapshot') {
      if (this.isAgentsSnapshot(envelope.payload)) {
        this.applyAgentsSnapshot(envelope.payload);
      }
      return;
    }
    if (envelope.type !== 'agent.changed' || !this.isAgentSnapshot(envelope.payload)) {
      return;
    }

    this.liveAfterSnapshot = true;
    this.agents.set(envelope.payload.id, envelope.payload);
    this.agentEmitter.fire(this.currentAgents);
  }

  private applyAgentsSnapshot(payload: { agents: HostAgentSnapshot[]; activity: HostActivityEvent[] }): void {
    this.agents.clear();
    for (const agent of payload.agents) {
      this.agents.set(agent.id, agent);
    }
    this.activity = payload.activity.map(event => this.toActivityEvent(event));
    this.restoreTeamPending = true;
    this.liveAfterSnapshot = false;
    this.agentEmitter.fire(this.currentAgents);
  }

  private isAgentsSnapshot(value: unknown): value is { agents: HostAgentSnapshot[]; activity: HostActivityEvent[] } {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as { agents?: unknown; activity?: unknown };
    return Array.isArray(candidate.agents)
      && candidate.agents.every(item => this.isAgentSnapshot(item))
      && Array.isArray(candidate.activity)
      && candidate.activity.every(item => this.isActivityEvent(item));
  }

  private isActivityEvent(value: unknown): value is HostActivityEvent {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Partial<HostActivityEvent> & { tool?: string | null };
    return typeof candidate.agentId === 'string'
      && typeof candidate.occurredAt === 'string'
      && typeof candidate.kind === 'string'
      && typeof candidate.status === 'string'
      && (candidate.tool === undefined || candidate.tool === null || typeof candidate.tool === 'string');
  }

  private toActivityEvent(value: HostActivityEvent & { tool?: string | null }): HostActivityEvent {
    const event: HostActivityEvent = {
      agentId: value.agentId,
      occurredAt: value.occurredAt,
      kind: value.kind,
      status: value.status
    };
    if (typeof value.tool === 'string') {
      event.tool = value.tool;
    }
    return event;
  }

  private isAgentSnapshot(value: unknown): value is HostAgentSnapshot {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Partial<HostAgentSnapshot>;
    return typeof candidate.id === 'string'
      && typeof candidate.displayName === 'string'
      && typeof candidate.role === 'string'
      && typeof candidate.status === 'string';
  }

  private isAgentRemoval(value: unknown): value is { id: string } {
    return Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string');
  }

  private isUsageSnapshot(value: unknown): value is HostUsageSnapshot {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Partial<HostUsageSnapshot>;
    return Boolean(candidate.total
      && typeof candidate.total.totalTokens === 'number'
      && Array.isArray(candidate.byWorkspace)
      && Array.isArray(candidate.byModel));
  }

  private stopProcess(): void {
    this.reader?.close();
    this.reader = undefined;
    this.process?.kill();
    this.process = undefined;
  }
}

function emptyUsageSnapshot(): HostUsageSnapshot {
  return {
    total: {
      key: 'Celkem',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      requestCount: 0
    },
    byWorkspace: [],
    byModel: [],
    byWorkspaceModel: [],
    byDay: []
  };
}
