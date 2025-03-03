"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChecklistViewProvider = exports.WorkspaceStorage = exports.FileTreeManager = exports.ChecklistManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const simple_git_1 = require("simple-git");
// Gestionnaire principal de l'arborescence
class FileTreeManager {
    constructor(storage, workspaceRoot) {
        this.storage = storage;
        this.workspaceRoot = workspaceRoot;
        this._onDidChangeTree = new vscode.EventEmitter();
        this._onDidChangeSelection = new vscode.EventEmitter();
        this.undoStack = [];
        this.redoStack = [];
        this.git = (0, simple_git_1.simpleGit)(workspaceRoot);
    }
    // Construction et mise à jour de l'arbre
    async buildFileTree(rootPath) {
        const stats = await fs.promises.stat(rootPath);
        const node = {
            path: rootPath,
            type: stats.isDirectory() ? 'directory' : 'file',
            name: path.basename(rootPath),
            checked: false,
            metadata: await this.getFileMetadata(rootPath, stats),
            tags: []
        };
        if (node.type === 'directory') {
            const entries = await fs.promises.readdir(rootPath);
            node.children = await Promise.all(entries.map(entry => this.buildFileTree(path.join(rootPath, entry))));
        }
        return node;
    }
    async getFileMetadata(filePath, stats) {
        const gitStatus = await this.getGitStatus(filePath);
        return {
            size: stats.size,
            modified: new Date(stats.mtime),
            created: new Date(stats.birthtime),
            extension: path.extname(filePath),
            gitStatus
        };
    }
    async getGitStatus(filePath) {
        try {
            const status = await this.git.status();
            const relativePath = path.relative(this.workspaceRoot, filePath);
            return {
                modified: status.modified.includes(relativePath),
                staged: status.staged.includes(relativePath),
                untracked: status.not_added.includes(relativePath),
                branch: status.current ?? ''
            };
        }
        catch {
            return undefined;
        }
    }
    // Opérations sur les nœuds
    async updateNode(path, changes) {
        this.saveStateForUndo();
        const node = this.findNode(path);
        if (node) {
            Object.assign(node, changes);
            await this.storage.saveState(this.getCurrentState());
            this._onDidChangeTree.fire(node);
        }
    }
    async moveNode(sourcePath, targetPath) {
        this.saveStateForUndo();
        const sourceNode = this.findNode(sourcePath);
        const targetParentPath = path.dirname(targetPath);
        const targetParent = this.findNode(targetParentPath);
        if (sourceNode && targetParent && targetParent.type === 'directory') {
            // Supprimer du parent source
            const sourceParent = this.findNode(path.dirname(sourcePath));
            if (sourceParent && sourceParent.children) {
                sourceParent.children = sourceParent.children.filter(n => n.path !== sourcePath);
            }
            // Mettre à jour le chemin et ajouter au nouveau parent
            sourceNode.path = targetPath;
            sourceNode.name = path.basename(targetPath);
            if (!targetParent.children)
                targetParent.children = [];
            targetParent.children.push(sourceNode);
            await this.storage.saveState(this.getCurrentState());
            this._onDidChangeTree.fire(undefined);
        }
    }
    // Opérations de sélection
    toggleNodeSelection(path) {
        const node = this.findNode(path);
        if (node) {
            node.checked = !node.checked;
            if (node.type === 'directory') {
                this.toggleChildrenSelection(node);
            }
            this._onDidChangeSelection.fire([node]);
        }
    }
    toggleChildrenSelection(node) {
        if (node.children) {
            node.children.forEach(child => {
                child.checked = node.checked;
                this.toggleChildrenSelection(child);
            });
        }
    }
    selectByPattern(pattern) {
        const regex = new RegExp(pattern);
        this.traverseNodes(node => {
            if (regex.test(node.name)) {
                node.checked = true;
            }
        });
        this._onDidChangeSelection.fire(this.getSelectedNodes());
    }
    invertSelection() {
        this.traverseNodes(node => {
            node.checked = !node.checked;
        });
        this._onDidChangeSelection.fire(this.getSelectedNodes());
    }
    // Gestion des tags
    addTag(nodePath, tag) {
        const node = this.findNode(nodePath);
        if (node && !node.tags.includes(tag)) {
            node.tags.push(tag);
            this._onDidChangeTree.fire(node);
        }
    }
    removeTag(nodePath, tag) {
        const node = this.findNode(nodePath);
        if (node) {
            node.tags = node.tags.filter(t => t !== tag);
            this._onDidChangeTree.fire(node);
        }
    }
    // Filtrage et recherche
    filterNodes(filters) {
        return this.getAllNodes().filter(node => {
            return filters.every(filter => this.matchesFilter(node, filter));
        });
    }
    matchesFilter(node, filter) {
        switch (filter.type) {
            case 'extension':
                return node.metadata.extension === filter.value;
            case 'pattern':
                return filter.value.test(node.name);
            case 'tag':
                return node.tags.includes(filter.value);
            case 'git':
                return node.metadata.gitStatus?.modified === true;
            case 'date':
                return node.metadata.modified > filter.value;
            default:
                return true;
        }
    }
    // Opérations par lots
    async batchOperation(nodes, operation) {
        this.saveStateForUndo();
        await Promise.all(nodes.map(operation));
        await this.storage.saveState(this.getCurrentState());
        this._onDidChangeTree.fire(undefined);
    }
    // Gestion de l'historique
    saveStateForUndo() {
        this.undoStack.push(this.getCurrentState());
        this.redoStack = [];
    }
    async undo() {
        const previousState = this.undoStack.pop();
        if (previousState) {
            this.redoStack.push(this.getCurrentState());
            await this.storage.saveState(previousState);
            this._onDidChangeTree.fire(undefined);
        }
    }
    async redo() {
        const nextState = this.redoStack.pop();
        if (nextState) {
            this.undoStack.push(this.getCurrentState());
            await this.storage.saveState(nextState);
            this._onDidChangeTree.fire(undefined);
        }
    }
    // Utilitaires
    findNode(nodePath, root) {
        const nodes = root ? [root] : this.getAllNodes();
        return nodes.find(node => node.path === nodePath);
    }
    getAllNodes(root) {
        const nodes = [];
        this.traverseNodes(node => nodes.push(node), root);
        return nodes;
    }
    traverseNodes(callback, root) {
        const traverse = (node) => {
            callback(node);
            if (node.children) {
                node.children.forEach(traverse);
            }
        };
        if (root) {
            traverse(root);
        }
        else {
            this.getCurrentState().nodes.forEach(traverse);
        }
    }
    getSelectedNodes() {
        return this.getAllNodes().filter(node => node.checked);
    }
    getCurrentState() {
        return {
            nodes: this.getAllNodes(),
            filters: [],
            tags: new Set(this.getAllNodes().flatMap(n => n.tags)),
            lastSync: new Date(),
            version: '2.0.0'
        };
    }
    // Événements
    get onDidChangeTree() {
        return this._onDidChangeTree.event;
    }
    get onDidChangeSelection() {
        return this._onDidChangeSelection.event;
    }
}
exports.FileTreeManager = FileTreeManager;
// Implémentation du stockage workspace
class WorkspaceStorage {
    constructor(context, onFileChange) {
        this.context = context;
        this.onFileChange = onFileChange;
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
        this.setupWatcher();
    }
    setupWatcher() {
        this.watcher.onDidCreate(() => this.handleFileChange());
        this.watcher.onDidDelete(() => this.handleFileChange());
        this.watcher.onDidChange(() => this.handleFileChange());
    }
    handleFileChange() {
        this.onFileChange();
    }
    async saveState(state) {
        const serialized = this.serializeState(state);
        await this.context.workspaceState.update(WorkspaceStorage.STORAGE_KEY, serialized);
    }
    async loadState() {
        const serialized = this.context.workspaceState.get(WorkspaceStorage.STORAGE_KEY);
        if (!serialized) {
            return this.createEmptyState();
        }
        return this.deserializeState(serialized);
    }
    async clearState() {
        await this.context.workspaceState.update(WorkspaceStorage.STORAGE_KEY, undefined);
    }
    serializeState(state) {
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
    deserializeState(data) {
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
    createEmptyState() {
        return {
            nodes: [],
            filters: [],
            tags: new Set(),
            lastSync: new Date(),
            version: '2.0.0'
        };
    }
    dispose() {
        this.watcher.dispose();
    }
}
exports.WorkspaceStorage = WorkspaceStorage;
WorkspaceStorage.STORAGE_KEY = 'checklist.state';
// Interface d'affichage
class ChecklistViewProvider {
    constructor(treeManager) {
        this.treeManager = treeManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        // Utiliser treeManager pour s'abonner aux changements
        this.treeManager.onDidChangeTree(node => this._onDidChangeTreeData.fire(node));
    }
    getTreeItem(element) {
        const treeItem = new vscode.TreeItem(element.name, element.type === 'directory' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
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
    getChildren(element) {
        return element ? element.children || [] : [];
    }
    getTooltip(element) {
        const parts = [
            `Path: ${element.path}`,
            `Size: ${this.formatSize(element.metadata.size)}`,
            `Modified: ${element.metadata.modified.toLocaleString()}`,
            element.tags.length ? `Tags: ${element.tags.join(', ')}` : null,
            element.metadata.gitStatus ? `Git: ${this.formatGitStatus(element.metadata.gitStatus)}` : null
        ];
        return parts.filter(Boolean).join('\n');
    }
    getDescription(element) {
        const parts = [];
        if (element.tags.length)
            parts.push(`[${element.tags.join(', ')}]`);
        if (element.metadata.gitStatus?.modified)
            parts.push('(M)');
        return parts.join(' ');
    }
    getIcon(element) {
        if (element.type === 'directory') {
            return new vscode.ThemeIcon('folder');
        }
        return new vscode.ThemeIcon('file');
    }
    formatSize(size) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = size;
        let unit = 0;
        while (value > 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return `${value.toFixed(1)} ${units[unit]}`;
    }
    formatGitStatus(status) {
        const parts = [];
        if (status.modified)
            parts.push('Modified');
        if (status.staged)
            parts.push('Staged');
        if (status.untracked)
            parts.push('Untracked');
        return `${parts.join(', ')} (${status.branch})`;
    }
    get onDidChangeTreeData() {
        return this._onDidChangeTreeData.event;
    }
}
exports.ChecklistViewProvider = ChecklistViewProvider;
// Classe principale de gestion de la checklist
class ChecklistManager {
    constructor(context) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            throw new Error('No workspace folder found');
        }
        // Initialiser les composants avec le contexte
        this.storage = new WorkspaceStorage(context, () => this.refresh());
        this.treeManager = new FileTreeManager(this.storage, workspaceRoot);
        this.viewProvider = new ChecklistViewProvider(this.treeManager);
        // Enregistrer le provider de vue dans le contexte
        context.subscriptions.push(vscode.window.registerTreeDataProvider('checklistView', this.viewProvider));
    }
    async addItem(path) {
        const node = await this.treeManager.buildFileTree(path);
        await this.storage.saveState({
            nodes: [...(await this.storage.loadState()).nodes, node],
            filters: [],
            tags: new Set(),
            lastSync: new Date(),
            version: '2.0.0'
        });
    }
    async getItems() {
        const state = await this.storage.loadState();
        return state.nodes.map(node => node.path);
    }
    async removeItem(path) {
        const state = await this.storage.loadState();
        state.nodes = state.nodes.filter(node => node.path !== path);
        await this.storage.saveState(state);
    }
    refresh() {
        this.viewProvider['_onDidChangeTreeData'].fire(undefined);
    }
    dispose() {
        this.storage.dispose();
    }
}
exports.ChecklistManager = ChecklistManager;
//# sourceMappingURL=checklist.js.map