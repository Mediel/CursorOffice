import { randomBytes } from 'node:crypto';
import { userInfo } from 'node:os';
import * as vscode from 'vscode';
import type { LocalHostClient } from './host/localHostClient';
import type { WindowPresenceReporter } from './windowPresenceReporter';

type WebviewMessage = {
  type?: unknown;
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
        if (event.affectsConfiguration('cursorOffice.ownerName')) {
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
      'Cursor Office',
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
    }
  }

  private sendBootstrap(): void {
    const configuredName = vscode.workspace
      .getConfiguration('cursorOffice')
      .get<string>('ownerName', '')
      .trim();

    void this.panel.webview.postMessage({
      type: 'office.bootstrap',
      payload: {
        owner: {
          displayName: configuredName || userInfo().username,
          role: 'Majitel kanceláře',
          accent: '#f4b85c'
        },
        agents: this.host.currentAgents,
        usage: this.host.currentUsage,
        currentWindow: this.windowPresence.currentWindow,
        windows: this.windowPresence.activeWindows
      }
    });
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'office.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'office.css')
    );
    const nonce = randomBytes(16).toString('base64');

    return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Cursor Office</title>
  </head>
  <body>
    <div id="app"></div>
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
