import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SimpleGit, simpleGit } from 'simple-git';
import { 
    AppError, 
    FileSystemError, 
    ValidationError, 
    NotFoundError,
    logError,
    wrapError,
    ErrorCode, 
    showErrorMessage 
} from '../utils/error-handling';

/**
 * Represents a node in the file tree structure
 */
export interface FileNode {
    path: string;
    type: 'file' | 'directory';
    name: string;
    checked: boolean;
    children?: ReadonlyArray<FileNode>;
    metadata: FileMetadata;
    tags: string[];
}

/**
 * Metadata associated with a file node
 */
export interface FileMetadata {
    size: number;
    modified: Date;
    created: Date;
    extension: string;
    gitStatus?: GitStatus;
}

/**
 * Git status information for a file
 */
export interface GitStatus {
    modified: boolean;
    staged: boolean;
    untracked: boolean;
    branch: string;
}

/**
 * Filter types for file filtering
 */
export type FilterType = 'extension' | 'pattern' | 'tag' | 'git' | 'date';

/**
 * Filter value types based on filter type
 */
export type FilterValue<T extends FilterType> = 
    T extends 'extension' ? string :
    T extends 'pattern' ? RegExp :
    T extends 'tag' ? string :
    T extends 'git' ? boolean :
    T extends 'date' ? Date :
    never;

/**
 * Type-safe file filter interface
 */
export interface FileFilter<T extends FilterType = FilterType> {
    type: T;
    value: FilterValue<T>;
    exclude?: boolean;
}

/**
 * State of the checklist system
 */
export interface ChecklistState {
    nodes: ReadonlyArray<FileNode>;
    filters: ReadonlyArray<FileFilter>;
    tags: Set<string>;
    lastSync: Date;
    version: string;
}

/**
 * Type guard to check if an object is a FileNode
 */
export function isFileNode(obj: unknown): obj is FileNode {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'path' in obj &&
        'type' in obj &&
        'name' in obj &&
        'checked' in obj &&
        'metadata' in obj &&
        'tags' in obj &&
        (obj as FileNode).type === 'file' || (obj as FileNode).type === 'directory'
    );
}

/**
 * Manages the file tree structure and operations
 */
class FileTreeManager {
    private readonly _onDidChangeTree = new vscode.EventEmitter<FileNode | undefined>();
    private readonly _onDidChangeSelection = new vscode.EventEmitter<ReadonlyArray<FileNode>>();
    private git: SimpleGit;
    private undoStack: ChecklistState[] = [];
    private redoStack: ChecklistState[] = [];

    constructor(
        private storage: StorageProvider,
        private readonly workspaceRoot: string
    ) {
        this.git = simpleGit(workspaceRoot);
    }

    /**
     * Builds a file tree structure from a given root path
     * @param rootPath The root path to build the tree from
     * @returns A promise resolving to the root FileNode
     * @throws {FileSystemError} If file operations fail
     * @throws {ValidationError} If path is invalid
     */
    async buildFileTree(rootPath: string): Promise<FileNode> {
        try {
            // Validate input path
            if (!rootPath || typeof rootPath !== 'string') {
                throw new ValidationError('Invalid path provided for file tree', {
                    context: { path: rootPath }
                });
            }

            const normalizedPath = path.normalize(rootPath);
            
            // Check if path exists
            if (!fs.existsSync(normalizedPath)) {
                throw new NotFoundError(`Path does not exist: ${normalizedPath}`, {
                    context: { path: normalizedPath }
                });
            }
            
            // Get file stats
            const stats = await fs.promises.stat(normalizedPath).catch(err => {
                throw new FileSystemError(`Failed to get file stats: ${err.message}`, {
                    originalError: err,
                    context: { path: normalizedPath }
                });
            });
            
            // Create node
            const node: FileNode = {
                path: normalizedPath,
                type: stats.isDirectory() ? 'directory' : 'file',
                name: path.basename(normalizedPath),
                checked: false,
                metadata: await this.getFileMetadata(normalizedPath, stats),
                tags: []
            };

            // Process children for directories
            if (node.type === 'directory') {
                try {
                    const entries = await fs.promises.readdir(normalizedPath);
                    
                    // Process each child with error isolation
                    const childPromises = entries.map(async entry => {
                        try {
                            return await this.buildFileTree(path.join(normalizedPath, entry));
                        } catch (error) {
                            // Log but don't fail the entire tree for a single child error
                            logError(error, { 
                                operation: 'buildFileTree.childProcess',
                                path: path.join(normalizedPath, entry) 
                            });
                            // Return a placeholder for failed children
                            const placeholderNode: FileNode = {
                                path: path.join(normalizedPath, entry),
                                type: 'file' as const, // Use const assertion to ensure correct type
                                name: entry,
                                checked: false,
                                metadata: {
                                    size: 0,
                                    modified: new Date(),
                                    created: new Date(),
                                    extension: path.extname(entry),
                                    gitStatus: undefined
                                },
                                tags: ['error_loading']
                            };
                            return placeholderNode;
                        }
                    });
                    
                    node.children = await Promise.all(childPromises);
                } catch (dirError) {
                    // If directory reading fails, mark as empty but still return the node
                    logError(dirError, { 
                        operation: 'buildFileTree.readDirectory',
                        path: normalizedPath 
                    });
                    node.children = [];
                }
            }

            return node;
        } catch (error) {
            // Make sure all errors are properly wrapped
            if (error instanceof AppError) {
                throw error;
            }
            throw new FileSystemError(`Failed to build file tree: ${(error as Error).message}`, {
                originalError: error as Error,
                context: { path: rootPath }
            });
        }
    }

    /**
     * Gets metadata for a file
     * @param filePath Path to the file
     * @param stats File stats from fs.Stats
     * @returns Promise resolving to file metadata
     * @throws {FileSystemError} If metadata extraction fails
     */
    private async getFileMetadata(filePath: string, stats: fs.Stats): Promise<FileMetadata> {
        try {
            const gitStatus = await this.getGitStatus(filePath);
            return {
                size: stats.size,
                modified: new Date(stats.mtime),
                created: new Date(stats.birthtime),
                extension: path.extname(filePath),
                gitStatus
            };
        } catch (error) {
            // Log but don't fail - metadata is non-critical
            logError(error, { 
                operation: 'getFileMetadata',
                path: filePath 
            });
            
            // Return basic metadata when git or other enrichments fail
            return {
                size: stats.size,
                modified: new Date(stats.mtime),
                created: new Date(stats.birthtime),
                extension: path.extname(filePath),
                gitStatus: undefined
            };
        }
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
        } catch (error) {
            // Log error but don't propagate - git status is non-critical
            logError(error, { 
                operation: 'getGitStatus',
                path: filePath,
                severity: 'low'
            });
            return undefined;
        }
    }

    /**
     * Updates a node's properties
     * @param path Path of the node to update
     * @param changes Partial changes to apply to the node
     * @returns Promise that resolves when the update is complete
     * @throws {NotFoundError} If node is not found
     * @throws {ValidationError} If changes are invalid
     * @throws {FileSystemError} If state cannot be saved
     */
    async updateNode(path: string, changes: Partial<FileNode>): Promise<void> {
        try {
            // Validate input
            if (!path) {
                throw new ValidationError('Invalid path provided for node update', {
                    context: { changes }
                });
            }
            
            // Save current state for undo capability
            this.saveStateForUndo();
            
            // Find the node
            const node = this.findNode(path);
            if (!node) {
                throw new NotFoundError(`Node not found for update: ${path}`, {
                    context: { path, changes }
                });
            }
            
            // Validate changes before applying
            this.validateNodeChanges(changes);
            
            // Apply changes
            Object.assign(node, changes);
            
            // Save state
            await this.storage.saveState(this.getCurrentState())
                .catch(err => {
                    throw new FileSystemError(`Failed to save state after node update: ${err.message}`, {
                        originalError: err,
                        context: { path, changes }
                    });
                });
                
            // Notify listeners
            this._onDidChangeTree.fire(node);
        } catch (error) {
            // Attempt to restore previous state for critical failures
            if (error instanceof FileSystemError) {
                try {
                    // Try to restore from last undo state
                    if (this.undoStack.length > 0) {
                        const lastState = this.undoStack[this.undoStack.length - 1];
                        await this.storage.saveState(lastState);
                        // Don't fire an event here to avoid confusion
                    }
                } catch (restoreError) {
                    // Log but don't throw - we don't want to mask the original error
                    logError(restoreError, { 
                        operation: 'updateNode.stateRestoreAttempt',
                        originalError: error
                    });
                }
            }
            
            // Propagate the original error
            if (error instanceof AppError) {
                throw error;
            }
            throw wrapError(error, ErrorCode.INTERNAL_ERROR, 'Failed to update node', {
                operation: 'updateNode',
                path,
                changes
            });
        }
    }
    
    /**
     * Validates node changes before applying them
     * @param changes The changes to validate
     * @throws {ValidationError} If changes are invalid
     */
    private validateNodeChanges(changes: Partial<FileNode>): void {
        // Check for invalid path changes
        if (changes.path && (!changes.path || typeof changes.path !== 'string')) {
            throw new ValidationError('Invalid path in node changes', {
                context: { changes }
            });
        }
        
        // Check for invalid type changes
        if (changes.type && (changes.type !== 'file' && changes.type !== 'directory')) {
            throw new ValidationError('Invalid type in node changes', {
                context: { changes }
            });
        }
        
        // Check for invalid tags
        if (changes.tags && !Array.isArray(changes.tags)) {
            throw new ValidationError('Invalid tags in node changes', {
                context: { changes }
            });
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
            (targetParent.children as FileNode[]).push(sourceNode);

            await this.storage.saveState(this.getCurrentState());
            this._onDidChangeTree.fire(undefined);
        }
    }

    /**
     * Toggles the selection state of a node
     * @param path Path of the node to toggle
     */
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

    /**
     * Recursively toggles selection for a node and all its children
     * @param node The node to toggle selection for
     */
    private toggleChildrenSelection(node: FileNode): void {
        if (node.children) {
            node.children.forEach(child => {
                child.checked = node.checked;
                this.toggleChildrenSelection(child);
            });
        }
    }

    /**
     * Selects nodes matching a pattern
     * @param pattern The regex pattern to match against node names
     */
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

    /**
     * Adds a tag to a node
     * @param nodePath Path of the node to tag
     * @param tag Tag to add
     */
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

    /**
     * Filters nodes based on provided filters
     * @param filters Array of filters to apply
     * @returns Array of filtered nodes
     */
    filterNodes(filters: ReadonlyArray<FileFilter>): ReadonlyArray<FileNode> {
        return this.getAllNodes().filter(node => {
            return filters.every(filter => this.matchesFilter(node, filter));
        });
    }

    /**
     * Checks if a node matches a filter
     * @param node Node to check
     * @param filter Filter to match against
     * @returns True if the node matches the filter
     */
    private matchesFilter(node: FileNode, filter: FileFilter): boolean {
        switch (filter.type) {
            case 'extension':
                return node.metadata.extension === filter.value;
            case 'pattern':
                return (filter.value as RegExp).test(node.name);
            case 'tag':
                return node.tags.includes(filter.value as string);
            case 'git':
                return node.metadata.gitStatus?.modified === (filter.value as boolean);
            case 'date':
                return node.metadata.modified > (filter.value as Date);
            default:
                console.error(`Unexpected filter type: ${(filter as FileFilter).type}`);
                return false;
        }
    }

    /**
     * Performs an operation on multiple nodes
     * @param nodes Nodes to operate on
     * @param operation Async operation to perform on each node
     * @returns Promise that resolves when all operations are complete
     */
    async batchOperation(
        nodes: ReadonlyArray<FileNode>, 
        operation: (node: FileNode) => Promise<void>
    ): Promise<void> {
        this.saveStateForUndo();
        await Promise.all(nodes.map(operation));
        await this.storage.saveState(this.getCurrentState());
        this._onDidChangeTree.fire(undefined);
    }

    /**
     * Saves the current state to the undo stack
     */
    /**
     * Saves the current state to the undo stack
     */
    private saveStateForUndo(): void {
        try {
            // Limit undo stack size to prevent memory issues
            if (this.undoStack.length >= 20) {
                this.undoStack.shift(); // Remove oldest state
            }
            this.undoStack.push(this.getCurrentState());
            this.redoStack = [];
        } catch (error) {
            // Log but don't throw - this is a non-critical operation
            logError(error, { 
                operation: 'saveStateForUndo',
                severity: 'low'
            });
        }
    }

    /**
     * Undoes the last operation
     * @throws {ValidationError} If no state to undo
     * @throws {FileSystemError} If state cannot be restored
     */
    async undo(): Promise<void> {
        try {
            const previousState = this.undoStack.pop();
            if (!previousState) {
                throw new ValidationError('No more actions to undo', {
                    isUserError: true
                });
            }
            
            // Save current state for redo
            this.redoStack.push(this.getCurrentState());
            
            // Restore previous state
            await this.storage.saveState(previousState)
                .catch(err => {
                    throw new FileSystemError(`Failed to restore previous state: ${err.message}`, {
                        originalError: err
                    });
                });
                
            // Notify listeners
            this._onDidChangeTree.fire(undefined);
        } catch (error) {
            if (error instanceof AppError) {
                if (error.isUserError) {
                    // For user errors like "nothing to undo", show a message
                    showErrorMessage(error);
                    return;
                }
                throw error;
            }
            throw wrapError(error, ErrorCode.FILESYSTEM_ERROR, 'Failed to undo last action');
        }
    }

    /**
     * Redoes the last undone operation
     * @throws {ValidationError} If no state to redo
     * @throws {FileSystemError} If state cannot be restored
     */
    async redo(): Promise<void> {
        try {
            const nextState = this.redoStack.pop();
            if (!nextState) {
                throw new ValidationError('No more actions to redo', {
                    isUserError: true
                });
            }
            
            // Save current state for undo
            this.undoStack.push(this.getCurrentState());
            
            // Restore next state
            await this.storage.saveState(nextState)
                .catch(err => {
                    throw new FileSystemError(`Failed to restore next state: ${err.message}`, {
                        originalError: err
                    });
                });
                
            // Notify listeners
            this._onDidChangeTree.fire(undefined);
        } catch (error) {
            if (error instanceof AppError) {
                if (error.isUserError) {
                    // For user errors like "nothing to redo", show a message
                    showErrorMessage(error);
                    return;
                }
                throw error;
            }
            throw wrapError(error, ErrorCode.FILESYSTEM_ERROR, 'Failed to redo action');
        }
    }

    /**
     * Finds a node by path
     * @param nodePath Path of the node to find
     * @param root Optional root node to search from
     * @returns The found node or undefined
     */
    private findNode(nodePath: string, root?: FileNode): FileNode | undefined {
        const normalizedPath = path.normalize(nodePath);
        const nodes = root ? [root] : this.getAllNodes();
        return nodes.find(node => path.normalize(node.path) === normalizedPath);
    }

    /**
     * Gets all nodes in the tree
     * @param root Optional root node to get nodes from
     * @returns Array of all nodes
     */
    private getAllNodes(root?: FileNode): ReadonlyArray<FileNode> {
        const nodes: FileNode[] = [];
        this.traverseNodes(node => nodes.push(node), root);
        return nodes;
    }

    /**
     * Traverses all nodes in the tree and calls a callback for each
     * @param callback Function to call for each node
     * @param root Optional root node to traverse from
     */
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

    /**
     * Gets all selected nodes
     * @returns Array of selected nodes
     */
    private getSelectedNodes(): ReadonlyArray<FileNode> {
        return this.getAllNodes().filter(node => node.checked);
    }

    /**
     * Gets the current state of the tree
     * @returns Current checklist state
     */
    private getCurrentState(): ChecklistState {
        return {
            nodes: this.getAllNodes(),
            filters: [],
            tags: new Set(this.getAllNodes().flatMap(n => n.tags)),
            lastSync: new Date(),
            version: '2.0.0'
        };
    }

    /**
     * Event fired when the tree changes
     */
    get onDidChangeTree(): vscode.Event<FileNode | undefined> {
        return this._onDidChangeTree.event;
    }

    /**
     * Event fired when selection changes
     */
    get onDidChangeSelection(): vscode.Event<ReadonlyArray<FileNode>> {
        return this._onDidChangeSelection.event;
    }
}

/**
 * Interface for persistent storage of checklist state
 */
export interface StorageProvider {
    saveState(state: ChecklistState): Promise<void>;
    loadState(): Promise<ChecklistState>;
    clearState(): Promise<void>;
    dispose?(): void;
}

/**
 * Implementation of storage provider using VSCode workspace state
 */
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

    /**
     * Serializes state to string for storage
     * @param state State to serialize
     * @returns JSON string representation
     * @throws {ValidationError} If state is invalid
     */
    private serializeState(state: ChecklistState): string {
        try {
            // Validate state before serializing
            if (!state || !state.nodes) {
                throw new ValidationError('Invalid state for serialization', {
                    context: { state }
                });
            }
            
            return JSON.stringify(state, (_, value) => {
                if (value instanceof Set) {
                    return {
                        __type: 'Set',
                        value: Array.from(value)
                    };
                }
                if (value instanceof Date) {
                    return { 
                        __type: 'Date', 
                        value: value.toISOString() 
                    };
                }
                if (value instanceof RegExp) {
                    return { 
                        __type: 'RegExp', 
                        source: value.source, 
                        flags: value.flags 
                    };
                }
                return value;
            });
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new ValidationError(`Failed to serialize state: ${(error as Error).message}`, {
                originalError: error as Error,
                context: { 
                    stateType: typeof state,
                    hasNodes: state && Array.isArray(state.nodes)
                }
            });
        }
    }

    /**
     * Deserializes state from string storage
     * @param data JSON string to deserialize
     * @returns Parsed ChecklistState
     * @throws {ValidationError} If data is corrupted or invalid
     */
    private deserializeState(data: string): ChecklistState {
        try {
            if (!data || typeof data !== 'string') {
                throw new ValidationError('Invalid data for deserialization');
            }
            
            const state = JSON.parse(data, (key, value) => {
                if (value && typeof value === 'object') {
                    if (value.__type === 'Date') {
                        return new Date(value.value);
                    }
                    if (value.__type === 'RegExp') {
                        return new RegExp(value.source, value.flags);
                    }
                    if (value.__type === 'Set') {
                        return new Set(value.value);
                    }
                    if (Array.isArray(value) && key === 'tags') {
                        return new Set(value);
                    }
                }
                return value;
            });
            
            // Validate deserialized state
            if (!this.isValidState(state)) {
                throw new ValidationError('Corrupted state data', {
                    context: { 
                        dataLength: data.length,
                        stateHasNodes: state && 'nodes' in state,
                        stateHasVersion: state && 'version' in state
                    }
                });
            }
            
            return state;
        } catch (error) {
            // Provide recovery for corrupted state
            logError(error, { 
                operation: 'deserializeState',
                dataLength: data?.length ?? 0,
                isJsonError: error instanceof SyntaxError
            });
            
            // Return empty state instead of failing
            return this.createEmptyState();
        }
    }
    
    /**
     * Validates a state object
     * @param state The state to validate
     * @returns True if the state is valid
     */
    private isValidState(state: any): state is ChecklistState {
        return (
            state &&
            typeof state === 'object' &&
            'nodes' in state &&
            Array.isArray(state.nodes) &&
            'version' in state &&
            typeof state.version === 'string' &&
            'lastSync' in state
        );
    }

    /**
     * Creates an empty state object
     * @returns A new empty ChecklistState
     */
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

/**
 * VSCode tree data provider for displaying the file checklist
 */
class ChecklistViewProvider implements vscode.TreeDataProvider<FileNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<FileNode | undefined>();

    constructor(private readonly treeManager: FileTreeManager) {
        // Utiliser treeManager pour s'abonner aux changements
        this.treeManager.onDidChangeTree(node => this._onDidChangeTreeData.fire(node));
    }

    /**
     * Creates a TreeItem from a FileNode
     * @param element FileNode to convert to TreeItem
     * @returns TreeItem for display
     */
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

    /**
     * Gets children of a node
     * @param element Parent node or undefined for root
     * @returns Children nodes or promise of children nodes
     */
    getChildren(element?: FileNode): vscode.ProviderResult<FileNode[]> {
        return element ? [...element.children || []] : [];
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

        /**
     * Adds an item to the checklist
     * @param path Path of the item to add
     * @throws {ValidationError} If path is invalid
     * @throws {FileSystemError} If file operations fail
     */
    async addItem(path: string): Promise<void> {
        try {
            // Validate path
            if (!path || typeof path !== 'string') {
                throw new ValidationError('Invalid path provided', {
                    context: { path }
                });
            }
            
            // Build the file tree
            const node = await this.treeManager.buildFileTree(path);
            
            // Load existing state
            const state = await this.storage.loadState().catch(err => {
                throw new FileSystemError(`Failed to load state: ${err.message}`, {
                    originalError: err,
                    context: { operation: 'addItem', path }
                });
            });
            
            // Check for duplicates
            if (state.nodes.some(existingNode => existingNode.path === path)) {
                throw new ValidationError(`Item already exists: ${path}`, {
                    isUserError: true,
                    context: { path }
                });
            }
            
            // Update state with new node
            const newState = {
                nodes: [...state.nodes, node],
                filters: state.filters,
                tags: state.tags,
                lastSync: new Date(),
                version: state.version
            };
            
            // Save updated state
            await this.storage.saveState(newState).catch(err => {
                throw new FileSystemError(`Failed to save state after adding item: ${err.message}`, {
                    originalError: err,
                    context: { operation: 'addItem', path }
                });
            });
        } catch (error) {
            if (error instanceof AppError) {
                // For user errors, show a message but don't rethrow
                if (error.isUserError) {
                    showErrorMessage(error);
                    return;
                }
                throw error;
            }
            throw wrapError(error, ErrorCode.FILESYSTEM_ERROR, `Failed to add item: ${path}`);
        }
    }

    /**
     * Gets all items in the checklist
     * @returns Array of item paths
     * @throws {FileSystemError} If state cannot be loaded
     */
    async getItems(): Promise<string[]> {
        try {
            const state = await this.storage.loadState();
            return state.nodes.map(node => node.path);
        } catch (error) {
            logError(error, { operation: 'getItems' });
            
            // Return empty array instead of failing
            return [];
        }
    }

    /**
     * Removes an item from the checklist
     * @param path Path of the item to remove
     * @throws {ValidationError} If path is invalid
     * @throws {NotFoundError} If item is not found
     * @throws {FileSystemError} If state operations fail
     */
    async removeItem(path: string): Promise<void> {
        try {
            // Validate path
            if (!path || typeof path !== 'string') {
                throw new ValidationError('Invalid path provided for removal', {
                    context: { path }
                });
            }
            
            // Load state
            const state = await this.storage.loadState().catch(err => {
                throw new FileSystemError(`Failed to load state for item removal: ${err.message}`, {
                    originalError: err,
                    context: { operation: 'removeItem', path }
                });
            });
            
            // Check if item exists
            if (!state.nodes.some(node => node.path === path)) {
                throw new NotFoundError(`Item not found: ${path}`, {
                    isUserError: true,
                    context: { path }
                });
            }
            
            // Remove the item
            state.nodes = state.nodes.filter(node => node.path !== path);
            
            // Save updated state
            await this.storage.saveState(state).catch(err => {
                throw new FileSystemError(`Failed to save state after item removal: ${err.message}`, {
                    originalError: err,
                    context: { operation: 'removeItem', path }
                });
            });
        } catch (error) {
            if (error instanceof AppError) {
                // For user errors, show a message but don't rethrow
                if (error.isUserError) {
                    showErrorMessage(error);
                    return;
                }
                throw error;
            }
            throw wrapError(error, ErrorCode.FILESYSTEM_ERROR, `Failed to remove item: ${path}`);
        }
    }

    private refresh(): void {
        this.viewProvider['_onDidChangeTreeData'].fire(undefined);
    }

    dispose(): void {
        this.storage.dispose();
    }
}

// Export classes

export {
    FileTreeManager,
    WorkspaceStorage,
    ChecklistViewProvider
};
