import * as vscode from 'vscode';
import { GlobalHookInstaller } from './globalHookInstaller';
import { LocalHostClient } from './host/localHostClient';
import { OfficePanel } from './officePanel';
import { WindowPresenceReporter } from './windowPresenceReporter';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Cursor Office');
  const windowPresence = new WindowPresenceReporter();
  const host = new LocalHostClient(context.extensionUri, output);
  const hookInstaller = new GlobalHookInstaller(context.extensionUri);
  hookInstaller.refreshIfInstalled();
  host.start();

  context.subscriptions.push(
    output,
    windowPresence,
    host,
    vscode.commands.registerCommand('cursorOffice.openOffice', () => {
      OfficePanel.createOrShow(context.extensionUri, host, windowPresence);
    }),
    vscode.commands.registerCommand('cursorOffice.selectOfficeLogo', async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Obrázky': ['png', 'jpg', 'jpeg', 'webp', 'gif']
        },
        title: 'Vyberte logo kanceláře'
      });
      if (!selected?.[0]) {
        return;
      }
      await vscode.workspace
        .getConfiguration('cursorOffice')
        .update('officeLogoPath', selected[0].fsPath, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('cursorOffice.installGlobalHooks', async () => {
      const choice = await vscode.window.showWarningMessage(
        'Cursor Office přidá pasivní hooks do uživatelského ~/.cursor/hooks.json. Hooky nic neblokují a neposílají obsah promptů ani souborů.',
        { modal: true },
        'Nainstalovat'
      );
      if (choice !== 'Nainstalovat') {
        return;
      }
      hookInstaller.install();
      void vscode.window.showInformationMessage('Globální Cursor Office hooks jsou nainstalované pro všechna Cursor okna.');
    }),
    vscode.commands.registerCommand('cursorOffice.uninstallGlobalHooks', () => {
      hookInstaller.uninstall();
      void vscode.window.showInformationMessage('Globální Cursor Office hooks byly odebrány.');
    }),
    vscode.window.registerWebviewPanelSerializer(OfficePanel.viewType, {
      async deserializeWebviewPanel(panel): Promise<void> {
        OfficePanel.revive(panel, context.extensionUri, host, windowPresence);
      }
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('cursorOffice.hostPath')) {
        host.start();
      }
    })
  );
}

export function deactivate(): void {
  OfficePanel.disposeCurrent();
}
