import * as vscode from 'vscode';
import * as path from 'path';
import { ScriptManager } from '../../script-manager/manager';

export class ScriptsProvider implements vscode.TreeDataProvider<ScriptItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ScriptItem | undefined | null | void> = new vscode.EventEmitter<ScriptItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ScriptItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private scriptManager: ScriptManager,
        private workspaceRoot: string
    ) {
        // S'assurer que le manager est initialisé
        if (!this.scriptManager) {
            throw new Error('ScriptManager is required');
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ScriptItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ScriptItem): Promise<ScriptItem[]> {
        try {
            if (!this.workspaceRoot) {
                return Promise.resolve([]);
            }

            if (element) {
                return Promise.resolve([]);
            } else {
                // Lister les scripts disponibles
                const scripts = await this.scriptManager.listScripts();
                
                // S'il n'y a pas de scripts, afficher un élément d'information
                if (!scripts || scripts.length === 0) {
                    return [new ScriptItem(
                        'No scripts found',
                        '',
                        vscode.TreeItemCollapsibleState.None
                    )];
                }
                
                // Créer les éléments de l'arbre
                return scripts.map((script: any) => {
                    const scriptPath = typeof script === 'string' ? script : script.script_info?.path || script;
                    const label = path.basename(scriptPath);
                    
                    return new ScriptItem(
                        label,
                        scriptPath,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'devtoolkit.runScript',
                            title: 'Run Script',
                            arguments: [scriptPath]
                        }
                    );
                });
            }
        } catch (error) {
            console.error('Error getting scripts:', error);
            
            // Retourner un élément d'erreur
            return [new ScriptItem(
                'Error loading scripts',
                '',
                vscode.TreeItemCollapsibleState.None
            )];
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
        
        // Ajouter des informations supplémentaires
        this.tooltip = scriptPath;
        if (scriptPath) {
            this.description = path.relative(vscode.workspace.rootPath || '', scriptPath);
            this.iconPath = new vscode.ThemeIcon('symbol-method');
        } else {
            // Pour les éléments d'information
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }

    contextValue = 'script';
}