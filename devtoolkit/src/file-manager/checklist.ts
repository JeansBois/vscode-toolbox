import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SimpleGit, simpleGit } from 'simple-git';

// Types et interfaces de base
interface FileNode {
    path: string;
    type: 'file' | 'directory';
    name: string;
    checked: boolean;
    children?: FileNode[];
    metadata: FileMetadata;
    tags: string[];
}

interface FileMetadata {
    size: number;
    modified: Date;
    created: Date;
    extension: string;
    gitStatus?: GitStatus;
}

interface GitStatus {
    modified: boolean;
    staged: boolean;
    untracked: boolean;
    branch: string;
}

interface FileFilter {
    type: 'extension' | 'pattern' | 'tag' | 'git' | 'date';
    value: string | RegExp | Date;
    exclude?: boolean;
}

interface ChecklistState {
    nodes: FileNode[];
    filters: FileFilter[];
    tags: Set<string>;
    lastSync: Date;
    version: string;
}

// Gestionnaire principal de l'arborescence
class FileTreeManager {
    private readonly _onDidChangeTree = new vscode.EventEmitter<FileNode | undefined>();
    private readonly _onDidChangeSelection = new vscode.EventEmitter<FileNode[]>();
    private git: SimpleGit;
    private undoStack: ChecklistState[] = [];
    private redoStack: ChecklistState[] = [];

    constructor(
        private storage: StorageProvider,
        private readonly workspaceRoot: string
    ) {
        this.git = simpleGit(workspaceRoot);
    }

    // Construction et mise à jour de l'arbre
    async buildFileTree(rootPath: string): Promise<FileNode> {
        const normalizedPath = path.normalize(rootPath);
        const stats = await fs.promises.stat(normalizedPath);
        const node: FileNode = {
            path: normalizedPath,
            type: stats.isDirectory() ? 'directory' : 'file',
            name: path.basename(normalizedPath),
            checked: false,
            metadata: await this.getFileMetadata(normalizedPath, stats),
            tags: []
        };

        if (node.type === 'directory') {
            const entries = await fs.promises.readdir(normalizedPath);
            node.children = await Promise.all(
                entries.map(entry => this.buildFileTree(path.join(normalizedPath, entry)))
            );
        }

        return node;
    }

    private async getFileMetadata(filePath: string, stats: fs.Stats): Promise<FileMetadata> {
        const gitStatus = await this.getGitStatus(filePath);
        return {
            size: stats.size,
            modified: new Date(stats.mtime),
            created: new Date(stats.birthtime),
            extension: path.extname(filePath),
            gitStatus
        };
    }

    private async getGitStatus(filePath: string): Promise<GitStatus | undefined> {
        try {
            const status = await this.git.status();
            const normalizedWorkspaceRoot = path.normalize(this.workspaceRoot);
            const normalizedFilePath = path.normalize(filePath);
            const relativePath = path.relative(normalizedWorkspaceRoot, normalizedFilePath);
            
            return {
                modified: status.modified.includes(relativePath),
                staged: status.staged.includes(relativePath),
                untracked: status.not_added.includes(relativePath),
                branch: status.current ?? ''
            };
        } catch {
            return undefined;
        }
    }

    // Opérations sur les nœuds
    async updateNode(path: string, changes: Partial<FileNode>): Promise<void> {
        this.saveStateForUndo();
        const node = this.findNode(path);
        if (node) {
            Object.assign(node, changes);
            await this.storage.saveState(this.getCurrentState());
            this._onDidChangeTree.fire(node);
        }
    }

    async moveNode(sourcePath: string, targetPath: string): Promise<void> {
        this.saveStateForUndo();
        const normalizedSourcePath = path.normalize(sourcePath);
        const normalizedTargetPath = path.normalize(targetPath);
        const targetParentPath = path.dirname(normalizedTargetPath);
        
        const sourceNode = this.findNode(normalizedSourcePath);
        const targetParent = this.findNode(targetParentPath);

        if (sourceNode && targetParent && targetParent.type === 'directory') {
            // Supprimer du parent source
            const sourceParentPath = path.dirname(normalizedSourcePath);
            const sourceParent = this.findNode(sourceParentPath);
            if (sourceParent && sourceParent.children) {
                sourceParent.children = sourceParent.children.filter(n => 
                    path.normalize(n.path) !== normalizedSourcePath);
            }

            // Mettre à jour le chemin et ajouter au nouveau parent
            sourceNode.path = normalizedTargetPath;
            sourceNode.name = path.basename(normalizedTargetPath);
            if (!targetParent.children) targetParent.children = [];
            targetParent.children.push(sourceNode);

            await this.storage.saveState(this.getCurrentState());
            this._onDidChangeTree.fire(undefined);
        }
    }

    // Opérations de sélection
    toggleNodeSelection(path: string): void {
        const node = this.findNode(path);
        if (node) {
            node.checked = !node.checked;
            if (node.type === 'directory') {
                this.toggleChildrenSelection(node);
            }
            this._onDidChangeSelection.fire([node]);
        }
    }

    private toggleChildrenSelection(node: FileNode): void {
        if (node.children) {
            node.children.forEach(child => {
                child.checked = node.checked;
                this.toggleChildrenSelection(child);
            });
        }
    }

    selectByPattern(pattern: string): void {
        const regex = new RegExp(pattern);
        this.traverseNodes(node => {
            if (regex.test(node.name)) {
                node.checked = true;
            }
        });
        this._onDidChangeSelection.fire(this.getSelectedNodes());
    }

    invertSelection(): void {
        this.traverseNodes(node => {
            node.checked = !node.checked;
        });
        this._onDidChangeSelection.fire(this.getSelectedNodes());
    }

    // Gestion des tags
    addTag(nodePath: string, tag: string): void {
        const node = this.findNode(nodePath);
        if (node && !node.tags.includes(tag)) {
            node.tags.push(tag);
            this._onDidChangeTree.fire(node);
        }
    }

    removeTag(nodePath: string, tag: string): void {
        const node = this.findNode(nodePath);
        if (node) {
            node.tags = node.tags.filter(t => t !== tag);
            this._onDidChangeTree.fire(node);
        }
    }

    // Filtrage et recherche
    filterNodes(filters: FileFilter[]): FileNode[] {
        return this.getAllNodes().filter(node => {
            return filters.every(filter => this.matchesFilter(node, filter));
        });
    }

    private matchesFilter(node: FileNode, filter: FileFilter): boolean {
        switch (filter.type) {
            case 'extension':
                return node.metadata.extension === filter.value;
            case 'pattern':
                return (filter.value as RegExp).test(node.name);
            case 'tag':
                return node.tags.includes(filter.value as string);
            case 'git':
                return node.metadata.gitStatus?.modified === true;
            case 'date':
                return node.metadata.modified > (filter.value as Date);
            default:
                return true;
        }
    }

    // Opérations par lots
    async batchOperation(nodes: FileNode[], operation: (node: FileNode) => Promise<void>): Promise<void> {
        this.saveStateForUndo();
        await Promise.all(nodes.map(operation));
        await this.storage.saveState(this.getCurrentState());
        this._onDidChangeTree.fire(undefined);
    }

    // Gestion de l'historique
    private saveStateForUndo(): void {
        this.undoStack.push(this.getCurrentState());
        this.redoStack = [];
    }

    async undo(): Promise<void> {
        const previousState = this.undoStack.pop();
        if (previousState) {
            this.redoStack.push(this.getCurrentState());
            await this.storage.saveState(previousState);
            this._onDidChangeTree.fire(undefined);
        }
    }

    async redo(): Promise<void> {
        const nextState = this.redoStack.pop();
        if (nextState) {
            this.undoStack.push(this.getCurrentState());
            await this.storage.saveState(nextState);
            this._onDidChangeTree.fire(undefined);
        }
    }

    // Utilitaires
    private findNode(nodePath: string, root?: FileNode): FileNode | undefined {
        const normalizedPath = path.normalize(nodePath);
        const nodes = root ? [root] : this.getAllNodes();
        return nodes.find(node => path.normalize(node.path) === normalizedPath);
    }

    private getAllNodes(root?: FileNode): FileNode[] {
        const nodes: FileNode[] = [];
        this.traverseNodes(node => nodes.push(node), root);
        return nodes;
    }

    private traverseNodes(callback: (node: FileNode) => void, root?: FileNode): void {
        const traverse = (node: FileNode) => {
            callback(node);
            if (node.children) {
                node.children.forEach(traverse);
            }
        };

        if (root) {
            traverse(root);
        } else {
            this.getCurrentState().nodes.forEach(traverse);
        }
    }

    private getSelectedNodes(): FileNode[] {
        return this.getAllNodes().filter(node => node.checked);
    }

    private getCurrentState(): ChecklistState {
        return {
            nodes: this.getAllNodes(),
            filters: [],
            tags: new Set(this.getAllNodes().flatMap(n => n.tags)),
            lastSync: new Date(),
            version: '2.0.0'
        };
    }

    // Événements
    get onDidChangeTree(): vscode.Event<FileNode | undefined> {
        return this._onDidChangeTree.event;
    }

    get onDidChangeSelection(): vscode.Event<FileNode[]> {
        return this._onDidChangeSelection.event;
    }
}

// Interface de stockage
interface StorageProvider {
    saveState(state: ChecklistState): Promise<void>;
    loadState(): Promise<ChecklistState>;
    clearState(): Promise<void>;
}

// Implémentation du stockage workspace
class WorkspaceStorage implements StorageProvider {
    private static readonly STORAGE_KEY = 'checklist.state';
    private readonly watcher: vscode.FileSystemWatcher;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly onFileChange: () => void
    ) {
        this.watcher = vscode.workspace.createFileSystemWatcher(path.join('**', '*'));
        this.setupWatcher();
    }

    private setupWatcher(): void {
        this.watcher.onDidCreate(() => this.handleFileChange());
        this.watcher.onDidDelete(() => this.handleFileChange());
        this.watcher.onDidChange(() => this.handleFileChange());
    }

    private handleFileChange(): void {
        this.onFileChange();
    }

    async saveState(state: ChecklistState): Promise<void> {
        const serialized = this.serializeState(state);
        await this.context.workspaceState.update(WorkspaceStorage.STORAGE_KEY, serialized);
    }

    async loadState(): Promise<ChecklistState> {
        const serialized = this.context.workspaceState.get<string>(WorkspaceStorage.STORAGE_KEY);
        if (!serialized) {
            return this.createEmptyState();
        }
        return this.deserializeState(serialized);
    }

    async clearState(): Promise<void> {
        await this.context.workspaceState.update(WorkspaceStorage.STORAGE_KEY, undefined);
    }

    private serializeState(state: ChecklistState): string {
        return JSON.stringify(state, (_key, value) => {
            if (value instanceof Set) {
                return Array.from(value);
            }
            if (value instanceof Date) {
                return { __type: 'Date', value: value.toISOString() };
            }
            if (value instanceof RegExp) {
                return { __type: 'RegExp', source: value.source, flags: value.flags };
            }
            return value;
        });
    }

    private deserializeState(data: string): ChecklistState {
        return JSON.parse(data, (_key, value) => {
            if (value && typeof value === 'object') {
                if (value.__type === 'Date') {
                    return new Date(value.value);
                }
                if (value.__type === 'RegExp') {
                    return new RegExp(value.source, value.flags);
                }
                if (Array.isArray(value) && _key === 'tags') {
                    return new Set(value);
                }
            }
            return value;
        });
    }

    private createEmptyState(): ChecklistState {
        return {
            nodes: [],
            filters: [],
            tags: new Set<string>(),
            lastSync: new Date(),
            version: '2.0.0'
        };
    }

    dispose(): void {
        this.watcher.dispose();
    }
}

// Interface d'affichage
class ChecklistViewProvider implements vscode.TreeDataProvider<FileNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<FileNode | undefined>();

    constructor(private readonly treeManager: FileTreeManager) {
        // Utiliser treeManager pour s'abonner aux changements
        this.treeManager.onDidChangeTree(node => this._onDidChangeTreeData.fire(node));
    }

    getTreeItem(element: FileNode): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            element.name,
            element.type === 'directory' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        treeItem.contextValue = element.type;
        treeItem.tooltip = this.getTooltip(element);
        treeItem.description = this.getDescription(element);
        treeItem.iconPath = this.getIcon(element);
        treeItem.command = element.type === 'file' ? {
            command: 'checklist.openFile',
            title: 'Open File',
            arguments: [element]
        } : undefined;

        return treeItem;
    }

    getChildren(element?: FileNode): FileNode[] | Promise<FileNode[]> {
        return element ? element.children || [] : [];
    }

    private getTooltip(element: FileNode): string {
        const parts = [
            `Path: ${element.path}`,
            `Size: ${this.formatSize(element.metadata.size)}`,
            `Modified: ${element.metadata.modified.toLocaleString()}`,
            element.tags.length ? `Tags: ${element.tags.join(', ')}` : null,
            element.metadata.gitStatus ? `Git: ${this.formatGitStatus(element.metadata.gitStatus)}` : null
        ];
        return parts.filter(Boolean).join('\n');
    }

    private getDescription(element: FileNode): string {
        const parts = [];
        if (element.tags.length) parts.push(`[${element.tags.join(', ')}]`);
        if (element.metadata.gitStatus?.modified) parts.push('(M)');
        return parts.join(' ');
    }

    private getIcon(element: FileNode): vscode.ThemeIcon {
        if (element.type === 'directory') {
            return new vscode.ThemeIcon('folder');
        }
        return new vscode.ThemeIcon('file');
    }

    private formatSize(size: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = size;
        let unit = 0;
        while (value > 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return `${value.toFixed(1)} ${units[unit]}`;
    }

    private formatGitStatus(status: GitStatus): string {
        const parts = [];
        if (status.modified) parts.push('Modified');
        if (status.staged) parts.push('Staged');
        if (status.untracked) parts.push('Untracked');
        return `${parts.join(', ')} (${status.branch})`;
    }

    get onDidChangeTreeData(): vscode.Event<FileNode | undefined> {
        return this._onDidChangeTreeData.event;
    }
}

// Classe principale de gestion de la checklist
export class ChecklistManager implements vscode.Disposable {
    private treeManager: FileTreeManager;
    private storage: WorkspaceStorage;
    private viewProvider: ChecklistViewProvider;

    constructor(context: vscode.ExtensionContext) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            throw new Error('No workspace folder found');
        }

        // Initialiser les composants avec le contexte
        this.storage = new WorkspaceStorage(context, () => this.refresh());
        this.treeManager = new FileTreeManager(this.storage, workspaceRoot);
        this.viewProvider = new ChecklistViewProvider(this.treeManager);

        // Enregistrer le provider de vue dans le contexte
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('checklistView', this.viewProvider)
        );
    }

    async addItem(path: string): Promise<void> {
        const node = await this.treeManager.buildFileTree(path);
        await this.storage.saveState({
            nodes: [...(await this.storage.loadState()).nodes, node],
            filters: [],
            tags: new Set<string>(),
            lastSync: new Date(),
            version: '2.0.0'
        });
    }

    async getItems(): Promise<string[]> {
        const state = await this.storage.loadState();
        return state.nodes.map(node => node.path);
    }

    async removeItem(path: string): Promise<void> {
        const state = await this.storage.loadState();
        state.nodes = state.nodes.filter(node => node.path !== path);
        await this.storage.saveState(state);
    }

    private refresh(): void {
        this.viewProvider['_onDidChangeTreeData'].fire(undefined);
    }

    dispose(): void {
        this.storage.dispose();
    }
}

// Export des types et classes
export type {
    FileNode,
    FileMetadata,
    GitStatus,
    FileFilter,
    ChecklistState,
    StorageProvider
};

export {
    FileTreeManager,
    WorkspaceStorage,
    ChecklistViewProvider
};
