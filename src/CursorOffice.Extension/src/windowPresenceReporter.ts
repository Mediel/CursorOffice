import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

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

const heartbeatMilliseconds = 2_000;
const activeWindowMilliseconds = 7_000;

/**
 * Publishes privacy-safe window presence for the local hook bridge. Cursor Hooks
 * do not expose a window id, so the bridge correlates a submitted conversation
 * with the focused extension instance that owns the same workspace.
 */
export class WindowPresenceReporter implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<readonly CursorWindowSnapshot[]>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly timer: NodeJS.Timeout;
  private readonly presencePath: string;
  private readonly processExitHandler: () => void;
  private lastFocusedAt = new Date().toISOString();
  private registrySignature = '';

  // sessionId is editor-session scoped; the extension-host PID makes the
  // identity unambiguous even when several local windows share that session.
  public readonly id = `cursor-window-${vscode.env.sessionId}-${process.pid}`;
  public readonly onDidChangeWindows = this.emitter.event;

  public constructor() {
    mkdirSync(this.directoryPath(), { recursive: true });
    this.presencePath = join(this.directoryPath(), `${safeFileName(this.id)}.json`);
    this.processExitHandler = () => this.removePresenceFile();
    process.once('exit', this.processExitHandler);
    if (vscode.window.state.focused) {
      this.lastFocusedAt = new Date().toISOString();
    }
    this.disposables.push(
      vscode.window.onDidChangeWindowState(state => {
        if (state.focused) {
          this.lastFocusedAt = new Date().toISOString();
        }
        this.publish();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.publish())
    );
    this.publish();
    this.timer = setInterval(() => this.publish(), heartbeatMilliseconds);
  }

  public get currentWindow(): CursorWindowSnapshot {
    return { ...this.createSnapshot(), isCurrent: true };
  }

  public get activeWindows(): readonly CursorWindowSnapshot[] {
    const now = Date.now();
    const windows: CursorWindowSnapshot[] = [];
    if (!existsSync(this.directoryPath())) {
      return [this.currentWindow];
    }

    for (const fileName of readdirSync(this.directoryPath())) {
      if (!fileName.endsWith('.json')) {
        continue;
      }
      const candidatePath = join(this.directoryPath(), fileName);
      try {
        const candidate = JSON.parse(readFileSync(candidatePath, 'utf8')) as Partial<CursorWindowSnapshot>;
        const updatedAt = Date.parse(candidate.updatedAt ?? '');
        if (typeof candidate.id !== 'string'
          || typeof candidate.label !== 'string'
          || !Array.isArray(candidate.workspaceRoots)
          || !Number.isFinite(updatedAt)) {
          continue;
        }
        const processId = typeof candidate.processId === 'number'
          ? candidate.processId
          : processIdFromWindowId(candidate.id);
        const expired = now - updatedAt > activeWindowMilliseconds;
        const orphaned = candidate.id !== this.id
          && processId !== undefined
          && !isProcessAlive(processId);
        if (expired || orphaned) {
          tryUnlink(candidatePath);
          continue;
        }
        windows.push({
          id: candidate.id,
          label: candidate.label,
          workspaceRoots: candidate.workspaceRoots.filter((root): root is string => typeof root === 'string'),
          processId,
          isFocused: candidate.isFocused === true,
          lastFocusedAt: typeof candidate.lastFocusedAt === 'string' ? candidate.lastFocusedAt : candidate.updatedAt!,
          updatedAt: candidate.updatedAt!,
          isCurrent: candidate.id === this.id
        });
      } catch {
        // Another window may be replacing its own tiny heartbeat file.
      }
    }

    if (!windows.some(window => window.id === this.id)) {
      windows.push(this.currentWindow);
    }
    return windows.sort((left, right) => {
      if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
      if (left.isFocused !== right.isFocused) return left.isFocused ? -1 : 1;
      return left.label.localeCompare(right.label, 'cs');
    });
  }

  public dispose(): void {
    clearInterval(this.timer);
    process.off('exit', this.processExitHandler);
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.emitter.dispose();
    this.removePresenceFile();
  }

  private publish(): void {
    const snapshot = this.createSnapshot();
    try {
      writeFileSync(this.presencePath, `${JSON.stringify(snapshot)}\n`, 'utf8');
    } catch {
      return;
    }

    const windows = this.activeWindows;
    const signature = windows
      .map(window => `${window.id}:${window.label}:${window.isFocused}:${window.workspaceRoots.join('|')}`)
      .join(';');
    if (signature !== this.registrySignature) {
      this.registrySignature = signature;
      this.emitter.fire(windows);
    }
  }

  private createSnapshot(): CursorWindowSnapshot {
    const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map(folder => normalizePath(folder.uri.fsPath));
    const workspaceName = vscode.workspace.name?.trim()
      || workspaceRoots[0]?.split(/[\\/]/).filter(Boolean).at(-1)
      || 'Cursor';
    return {
      id: this.id,
      label: `${workspaceName} · ${shortWindowId(this.id)}`,
      workspaceRoots,
      processId: process.pid,
      isFocused: vscode.window.state.focused,
      lastFocusedAt: this.lastFocusedAt,
      updatedAt: new Date().toISOString()
    };
  }

  private directoryPath(): string {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new Error('The LOCALAPPDATA environment variable is unavailable.');
    }
    return join(localAppData, 'CursorOffice', 'windows-v1');
  }

  private removePresenceFile(): void {
    tryUnlink(this.presencePath);
  }
}

function normalizePath(value: string): string {
  return value.replace(/[\\/]+$/, '').toLocaleLowerCase('en-US');
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function shortWindowId(value: string): string {
  const compact = value.replace(/[^a-zA-Z0-9]/g, '');
  return compact.slice(-5).toUpperCase();
}

function processIdFromWindowId(value: string): number | undefined {
  const match = value.match(/-(\d+)$/u);
  if (!match) {
    return undefined;
  }
  const processId = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(processId) && processId > 0 ? processId : undefined;
}

function isProcessAlive(processId: number): boolean {
  if (processId === process.pid) {
    return true;
  }
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function tryUnlink(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Heartbeats are leases; a missing or concurrently replaced file is harmless.
  }
}
