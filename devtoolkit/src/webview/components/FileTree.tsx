import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { JSX } from 'react/jsx-runtime';
import { messageHandler } from '../utils/messageHandler';
import './FileTree.css';

/**
 * Node structure for file system representation
 */
interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
    selected?: boolean;
    expanded?: boolean;
}

/**
 * Props for internal FileTreeComponent
 */
interface FileTreeComponentProps {
    root: FileNode | null;
    selectedFiles: Set<string>;
    fileFilter: string[];
    onFileSelect: (path: string, selected: boolean) => void;
    onToggleNode: (path: string) => void;
}

/**
 * Internal React component for file tree visualization
 */
const FileTreeComponent: React.FC<FileTreeComponentProps> = ({
    root,
    selectedFiles,
    fileFilter,
    onFileSelect,
    onToggleNode
}) => {
    // Function to check if a file should be displayed based on filter
    const isFileAllowed = useCallback((filename: string): boolean => {
        if (fileFilter.length === 0) return true;
        const extension = filename.split('.').pop()?.toLowerCase();
        return extension ? fileFilter.includes(`.${extension}`) : false;
    }, [fileFilter]);

    // Get appropriate icon for file or directory
    const getFileIcon = useCallback((node: FileNode): string => {
        if (node.type === 'directory') {
            return node.expanded ? 'folder-opened' : 'folder';
        }

        const extension = node.name.split('.').pop()?.toLowerCase() || '';
        const iconMap: Record<string, string> = {
            'py': 'symbol-misc',
            'js': 'symbol-misc',
            'ts': 'symbol-misc',
            'json': 'json',
            'md': 'markdown',
            'txt': 'text-size',
            'default': 'file'
        };

        return iconMap[extension] || iconMap.default;
    }, []);

    // Recursive function to render tree nodes
    const renderNode = useCallback((node: FileNode, level: number): JSX.Element => {
        const indentStyle = { paddingLeft: `${level * 20}px` };
        
        return (
            <React.Fragment key={node.path}>
                <div 
                    className="file-tree-item" 
                    data-path={node.path}
                    style={indentStyle}
                >
                    {/* Indentation (for nested levels) */}
                    {level > 0 && (
                        <div className="file-tree-indent"></div>
                    )}
                    
                    {/* Toggle button for directories */}
                    {node.type === 'directory' && (
                        <div 
                            className="file-tree-toggle"
                            data-action="toggle"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleNode(node.path);
                            }}
                        >
                            {node.expanded ? '▼' : '▶'}
                        </div>
                    )}
                    
                    {/* Checkbox for file selection */}
                    {node.type === 'file' && isFileAllowed(node.name) && (
                        <input 
                            type="checkbox" 
                            className="file-tree-checkbox"
                            checked={selectedFiles.has(node.path)}
                            data-action="select"
                            onChange={(e) => {
                                onFileSelect(node.path, e.target.checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                    
                    {/* File/directory icon */}
                    <span className={`codicon codicon-${getFileIcon(node)}`}></span>
                    
                    {/* Label */}
                    <span className="file-tree-label">{node.name}</span>
                </div>
                
                {/* Render children if directory is expanded */}
                {node.type === 'directory' && node.expanded && node.children && (
                    <div className="file-tree-children">
                        {node.children.map(child => renderNode(child, level + 1))}
                    </div>
                )}
            </React.Fragment>
        );
    }, [selectedFiles, isFileAllowed, getFileIcon, onFileSelect, onToggleNode]);

    return (
        <div className="file-tree-container">
            {root ? (
                <div className="file-tree">
                    {renderNode(root, 0)}
                </div>
            ) : (
                <div className="file-tree-empty">No files available</div>
            )}
        </div>
    );
};

/**
 * Class-based adapter that maintains the original API while using React internally
 */
export class FileTree {
    private container: HTMLElement;
    private root: FileNode | null = null;
    private selectedFiles: Set<string> = new Set();
    private fileFilter: string[] = [];
    private reactRoot: Root | null = null;

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        this.container = container;
        this.init();
    }

    private init(): void {
        // Create root element for React
        const rootElement = document.createElement('div');
        rootElement.className = 'file-tree-root';
        this.container.appendChild(rootElement);
        
        // Initial render
        this.render();
    }

    /**
     * Set file extensions filter
     */
    public setFileFilter(extensions: string[]): void {
        this.fileFilter = extensions.map(ext => ext.toLowerCase());
        this.render();
    }

    /**
     * Update files structure
     */
    public updateFiles(root: FileNode): void {
        this.root = root;
        this.render();
    }

    /**
     * Handle node expansion toggle
     */
    private toggleNode = (path: string): void => {
        const toggleNode = (node: FileNode): boolean => {
            if (node.path === path) {
                node.expanded = !node.expanded;
                return true;
            }
            if (node.children) {
                return node.children.some(toggleNode);
            }
            return false;
        };

        if (this.root && toggleNode(this.root)) {
            this.render();
        }
    };

    /**
     * Handle file selection
     */
    private toggleFileSelection = (path: string, selected: boolean): void => {
        if (selected) {
            this.selectedFiles.add(path);
        } else {
            this.selectedFiles.delete(path);
        }

        // Notify extension
        messageHandler.postMessage({
            type: 'file',
            action: selected ? 'select' : 'deselect',
            paths: [path]
        });
        
        this.render();
    };

    /**
     * Handle click events (for backward compatibility)
     */
    private handleClick(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        const item = target.closest('.file-tree-item');
        if (!item) return;

        const path = item.getAttribute('data-path');
        if (!path) return;

        const action = target.getAttribute('data-action');
        if (action === 'toggle') {
            this.toggleNode(path);
        } else if (action === 'select') {
            const checkbox = target as HTMLInputElement;
            this.toggleFileSelection(path, checkbox.checked);
        }
    }

    /**
     * Get array of selected file paths
     */
    public getSelectedFiles(): string[] {
        return Array.from(this.selectedFiles);
    }

    /**
     * Clear all selections
     */
    public clearSelection(): void {
        this.selectedFiles.clear();
        this.render();
    }

    /**
     * Select all files that match the current filter
     */
    public selectAll(): void {
        const selectAllInNode = (node: FileNode) => {
            if (node.type === 'file' && this.isFileAllowed(node.name)) {
                this.selectedFiles.add(node.path);
            }
            node.children?.forEach(selectAllInNode);
        };

        if (this.root) {
            selectAllInNode(this.root);
            this.render();

            // Notify extension
            messageHandler.postMessage({
                type: 'file',
                action: 'select',
                paths: Array.from(this.selectedFiles)
            });
        }
    }

    /**
     * Check if a file should be displayed based on filter
     */
    private isFileAllowed(filename: string): boolean {
        if (this.fileFilter.length === 0) return true;
        const extension = filename.split('.').pop()?.toLowerCase();
        return extension ? this.fileFilter.includes(`.${extension}`) : false;
    }

    /**
     * Render the React component
     */
    private render(): void {
        const rootElement = this.container.querySelector('.file-tree-root');
        if (!rootElement) return;
        
        // Create root if it doesn't exist yet
        if (!this.reactRoot) {
            this.reactRoot = createRoot(rootElement);
        }
        
        this.reactRoot.render(
            <FileTreeComponent
                root={this.root}
                selectedFiles={this.selectedFiles}
                fileFilter={this.fileFilter}
                onFileSelect={this.toggleFileSelection}
                onToggleNode={this.toggleNode}
            />
        );
    }
}
