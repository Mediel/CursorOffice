import { randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';
import { extname } from 'node:path';
import * as vscode from 'vscode';
import type { LocalHostClient } from './host/localHostClient';
import {
  applyOfficeSettingUpdate,
  ownerRoleFor,
  readOfficePreferences,
  readOfficeSettingsSnapshot
} from './officePreferences';
import type { WindowPresenceReporter } from './windowPresenceReporter';

type WebviewMessage = {
  type?: unknown;
  payload?: unknown;
};

export class OfficePanel {
  public static readonly viewType = 'cursorOffice.office';
  private static currentPanel: OfficePanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    private readonly host: LocalHostClient,
    private readonly windowPresence: WindowPresenceReporter
  ) {
    this.configureWebview();

    panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.onMessage(message),
      undefined,
      this.disposables
    );
    vscode.workspace.onDidChangeConfiguration(
      event => {
        if (event.affectsConfiguration('cursorOffice.language')
          || event.affectsConfiguration('cursorOffice.shirtColors')) {
          this.configureWebview();
        } else if (event.affectsConfiguration('cursorOffice.ownerName')
          || event.affectsConfiguration('cursorOffice.ownerAppearance')
          || event.affectsConfiguration('cursorOffice.officeName')
          || event.affectsConfiguration('cursorOffice.officeLogoPath')
          || event.affectsConfiguration('cursorOffice.hud')) {
          this.sendBootstrap();
        }
      },
      undefined,
      this.disposables
    );
    host.onDidChangeAgents(() => this.sendBootstrap(), undefined, this.disposables);
    host.onDidChangeUsage(() => this.sendBootstrap(), undefined, this.disposables);
    windowPresence.onDidChangeWindows(() => this.sendBootstrap(), undefined, this.disposables);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    host: LocalHostClient,
    windowPresence: WindowPresenceReporter
  ): void {
    if (OfficePanel.currentPanel) {
      OfficePanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      OfficePanel.viewType,
      readOfficeName(),
      vscode.ViewColumn.Active,
      OfficePanel.webviewOptions(extensionUri)
    );

    OfficePanel.currentPanel = new OfficePanel(panel, extensionUri, host, windowPresence);
  }

  public static revive(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    host: LocalHostClient,
    windowPresence: WindowPresenceReporter
  ): void {
    OfficePanel.currentPanel?.dispose();
    panel.webview.options = OfficePanel.webviewOptions(extensionUri);
    OfficePanel.currentPanel = new OfficePanel(panel, extensionUri, host, windowPresence);
  }

  public static disposeCurrent(): void {
    OfficePanel.currentPanel?.dispose();
  }

  private static webviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
    };
  }

  private configureWebview(): void {
    this.panel.webview.html = this.getHtml();
  }

  private onMessage(message: WebviewMessage): void {
    if (message.type === 'webview.ready') {
      this.sendBootstrap();
      return;
    }
    if (message.type === 'office.settings.selectLogo') {
      void vscode.commands.executeCommand('cursorOffice.selectOfficeLogo');
      return;
    }
    if (message.type === 'office.settings.update') {
      void this.updateSettingFromWebview(message.payload);
    }
  }

  private async updateSettingFromWebview(payload: unknown): Promise<void> {
    const update = asSettingUpdate(payload);
    if (!update) {
      this.sendPreferences();
      return;
    }
    const applied = await applyOfficeSettingUpdate(update.key, update.value);
    if (!applied) {
      this.sendPreferences();
    }
  }

  private sendBootstrap(): void {
    const preferences = readOfficePreferences();
    const officeName = readOfficeName();
    const configuredName = vscode.workspace
      .getConfiguration('cursorOffice')
      .get<string>('ownerName', '')
      .trim();

    const settings = readOfficeSettingsSnapshot();
    void this.panel.webview.postMessage({
      type: 'office.bootstrap',
      payload: {
        brand: {
          name: officeName,
          logoDataUri: readOfficeLogoDataUri()
        },
        owner: {
          displayName: configuredName || userInfo().username,
          role: ownerRoleFor(preferences.language),
          accent: '#f4b85c',
          appearance: preferences.ownerAppearance
        },
        agents: this.host.currentAgents,
        usage: this.host.currentUsage,
        currentWindow: this.windowPresence.currentWindow,
        windows: this.windowPresence.activeWindows,
        settings
      }
    });
    this.panel.title = officeName;
  }

  private sendPreferences(): void {
    void this.panel.webview.postMessage({
      type: 'office.preferences',
      payload: readOfficeSettingsSnapshot()
    });
  }

  private getHtml(): string {
    const preferences = readOfficePreferences();
    const settings = readOfficeSettingsSnapshot();
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'office.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'office.css')
    );
    const nonce = randomBytes(16).toString('base64');

    return `<!doctype html>
<html lang="${preferences.language}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Cursor Office</title>
  </head>
  <body>
    <div id="app" data-office-preferences="${encodeURIComponent(JSON.stringify(preferences))}" data-office-settings="${encodeURIComponent(JSON.stringify(settings))}"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  private dispose(): void {
    if (OfficePanel.currentPanel === this) {
      OfficePanel.currentPanel = undefined;
    }

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}

function asSettingUpdate(payload: unknown): { key: string; value: unknown } | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const record = payload as { key?: unknown; value?: unknown };
  return typeof record.key === 'string' ? { key: record.key, value: record.value } : undefined;
}

function readOfficeName(): string {
  return vscode.workspace
    .getConfiguration('cursorOffice')
    .get<string>('officeName', 'Cursor Office')
    .trim() || 'Cursor Office';
}

function readOfficeLogoDataUri(): string | undefined {
  const logoPath = vscode.workspace
    .getConfiguration('cursorOffice')
    .get<string>('officeLogoPath', '')
    .trim();
  if (!logoPath) {
    return undefined;
  }

  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
  };
  const mimeType = mimeTypes[extname(logoPath).toLowerCase()];
  if (!mimeType) {
    return undefined;
  }

  try {
    if (statSync(logoPath).size > 2 * 1024 * 1024) {
      return undefined;
    }
    return `data:${mimeType};base64,${readFileSync(logoPath).toString('base64')}`;
  } catch {
    return undefined;
  }
}
