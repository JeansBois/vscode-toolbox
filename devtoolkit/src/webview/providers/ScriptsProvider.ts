import * as vscode from 'vscode';
import * as path from 'path';
import { ScriptManager } from '../../script-manager/manager';

export class ScriptsProvider implements vscode.TreeDataProvider<ScriptItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ScriptItem | undefined | null | void> = new vscode.EventEmitter<ScriptItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ScriptItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private scriptManager: ScriptManager,
        private workspaceRoot: string
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ScriptItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ScriptItem): Promise<ScriptItem[]> {
        if (!this.workspaceRoot) {
            return Promise.resolve([]);
        }

        if (element) {
            return Promise.resolve([]);
        } else {
            const scripts = await this.scriptManager.listScripts();
            return scripts.map(script => new ScriptItem(
                path.basename(script),
                script,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'devtoolkit.runScript',
                    title: 'Exécuter le script',
                    arguments: [script]
                }
            ));
        }
    }
}

class ScriptItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly scriptPath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = scriptPath;
        this.description = path.relative(vscode.workspace.rootPath || '', scriptPath);
        this.iconPath = new vscode.ThemeIcon('symbol-method');
    }

    contextValue = 'script';
}
