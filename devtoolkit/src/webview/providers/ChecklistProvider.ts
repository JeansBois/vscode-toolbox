import * as vscode from 'vscode';
import * as path from 'path';
import { ChecklistManager } from '../../file-manager/checklist';

export class ChecklistProvider implements vscode.TreeDataProvider<ChecklistItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ChecklistItem | undefined | null | void> = new vscode.EventEmitter<ChecklistItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChecklistItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private checklistManager: ChecklistManager
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ChecklistItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ChecklistItem): Promise<ChecklistItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            const items = await this.checklistManager.getItems();
            return items.map((item: string) => new ChecklistItem(
                path.basename(item),
                item,
                vscode.TreeItemCollapsibleState.None
            ));
        }
    }
}

class ChecklistItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = filePath;
        this.description = path.relative(vscode.workspace.rootPath || '', filePath);
        this.iconPath = new vscode.ThemeIcon('check');
        this.command = {
            command: 'vscode.open',
            title: 'Ouvrir le fichier',
            arguments: [vscode.Uri.file(filePath)]
        };
    }

    contextValue = 'checklistItem';
}
