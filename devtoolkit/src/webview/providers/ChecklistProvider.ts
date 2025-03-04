import * as vscode from 'vscode';
import * as path from 'path';
import { ChecklistManager } from '../../file-manager/checklist';

export class ChecklistProvider implements vscode.TreeDataProvider<ChecklistItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ChecklistItem | undefined | null | void> = new vscode.EventEmitter<ChecklistItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChecklistItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private checklistManager: ChecklistManager
    ) {
        // Manually refresh on a regular basis since ChecklistManager 
        // doesn't expose a change event directly
        if (this.checklistManager) {
            // Initial refresh
            this.refresh();
            
            // Set up a polling mechanism to refresh the view
            setInterval(() => {
                this.refresh();
            }, 5000); // Refresh every 5 seconds
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ChecklistItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ChecklistItem): Promise<ChecklistItem[]> {
        try {
            if (element) {
                return Promise.resolve([]);
            } else {
                // Get checklist items
                const items = await this.checklistManager.getItems();
                
                // If there are no items, display an information element
                if (!items || items.length === 0) {
                    return [new ChecklistItem(
                        'No items in checklist',
                        '',
                        vscode.TreeItemCollapsibleState.None
                    )];
                }
                
                // Create tree items
                return items.map(item => new ChecklistItem(
                    path.basename(item),
                    item,
                    vscode.TreeItemCollapsibleState.None
                ));
            }
        } catch (error) {
            console.error('Error getting checklist items:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            // Return an error item
            return [new ChecklistItem(
                `Error loading checklist: ${errorMessage}`,
                '',
                vscode.TreeItemCollapsibleState.None
            )];
        }
    }
}

export class ChecklistItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        
        if (filePath) {
            this.tooltip = filePath;
            this.description = path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', filePath);
            this.iconPath = new vscode.ThemeIcon('check');
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(filePath)]
            };
            this.contextValue = 'checklistItem';
        } else {
            // For information elements
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}
