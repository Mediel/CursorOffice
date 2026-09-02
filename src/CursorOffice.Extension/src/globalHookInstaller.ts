import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as vscode from 'vscode';

type HookDefinition = {
  command?: string;
  [key: string]: unknown;
};

type HooksConfiguration = {
  version: number;
  hooks: Record<string, HookDefinition[]>;
};

const observedEvents = [
  'sessionStart',
  'sessionEnd',
  'beforeSubmitPrompt',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'afterAgentThought',
  'afterAgentResponse',
  'afterFileEdit',
  'preCompact',
  'subagentStart',
  'subagentStop',
  'stop'
] as const;

export class GlobalHookInstaller {
  public constructor(private readonly extensionUri: vscode.Uri) {}

  public install(): void {
    const source = vscode.Uri.joinPath(this.extensionUri, 'bridge').fsPath;
    if (!existsSync(source)) {
      throw new Error('The packaged CursorOffice.Hook was not found. Install a complete VSIX package.');
    }

    const bridgeDirectory = this.bridgeDirectory();
    mkdirSync(bridgeDirectory, { recursive: true });
    cpSync(source, bridgeDirectory, { recursive: true, force: true });

    const configuration = this.readConfiguration();
    const command = this.hookCommand();
    this.removeManagedDefinitions(configuration);
    this.ensureObservedEvents(configuration, command);

    this.writeConfiguration(configuration);
  }

  public uninstall(): void {
    const configuration = this.readConfiguration();
    for (const eventName of observedEvents) {
      const remaining = (configuration.hooks[eventName] ?? [])
        .filter(definition => !this.isManagedCommand(definition.command));
      if (remaining.length > 0) {
        configuration.hooks[eventName] = remaining;
      } else {
        delete configuration.hooks[eventName];
      }
    }

    this.writeConfiguration(configuration);
  }

  public refreshIfInstalled(): void {
    const configuration = this.readConfiguration();
    const command = this.hookCommand();
    const installed = Object.values(configuration.hooks)
      .some(definitions => definitions.some(definition => this.isManagedCommand(definition.command)));
    if (!installed) {
      return;
    }

    const source = vscode.Uri.joinPath(this.extensionUri, 'bridge').fsPath;
    if (existsSync(source)) {
      mkdirSync(this.bridgeDirectory(), { recursive: true });
      cpSync(source, this.bridgeDirectory(), { recursive: true, force: true });
    }
    this.removeManagedDefinitions(configuration);
    this.ensureObservedEvents(configuration, command);
    this.writeConfiguration(configuration);
  }

  private ensureObservedEvents(configuration: HooksConfiguration, command: string): void {
    for (const eventName of observedEvents) {
      const definitions = configuration.hooks[eventName] ?? [];
      if (!definitions.some(definition => definition.command === command)) {
        definitions.push({ command });
      }
      configuration.hooks[eventName] = definitions;
    }
  }

  private removeManagedDefinitions(configuration: HooksConfiguration): void {
    for (const eventName of observedEvents) {
      const remaining = (configuration.hooks[eventName] ?? [])
        .filter(definition => !this.isManagedCommand(definition.command));
      if (remaining.length > 0) {
        configuration.hooks[eventName] = remaining;
      } else {
        delete configuration.hooks[eventName];
      }
    }
  }

  private isManagedCommand(command?: string): boolean {
    if (!command) {
      return false;
    }
    const bridge = this.bridgeDirectory();
    return command === `dotnet "${join(bridge, 'CursorOffice.Hook.dll')}"`
      || command === `"${join(bridge, 'CursorOffice.Hook.exe')}"`;
  }

  private readConfiguration(): HooksConfiguration {
    const path = this.configurationPath();
    if (!existsSync(path)) {
      return { version: 1, hooks: {} };
    }

    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<HooksConfiguration>;
    return {
      version: parsed.version ?? 1,
      hooks: parsed.hooks ?? {}
    };
  }

  private writeConfiguration(configuration: HooksConfiguration): void {
    const path = this.configurationPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(configuration, null, 2)}\n`, 'utf8');
  }

  private configurationPath(): string {
    return join(homedir(), '.cursor', 'hooks.json');
  }

  private bridgeDirectory(): string {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new Error('The LOCALAPPDATA environment variable is unavailable.');
    }
    return join(localAppData, 'CursorOffice', 'bridge');
  }

  private hookCommand(): string {
    return `"${join(this.bridgeDirectory(), 'CursorOffice.Hook.exe')}"`;
  }
}
