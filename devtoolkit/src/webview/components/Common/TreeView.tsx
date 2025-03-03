import React, { useState, useCallback } from 'react';
import { Checkbox } from './Checkbox';
import './TreeView.css';

export interface TreeNode {
    id: string;
    label: string;
    children?: TreeNode[];
    data?: any;
}

export interface TreeViewProps {
    nodes: TreeNode[];
    selectedIds: string[];
    expandedIds?: string[];
    onSelect?: (ids: string[]) => void;
    onExpand?: (id: string, expanded: boolean) => void;
    onDrop?: (sourceId: string, targetId: string) => void;
    renderIcon?: (node: TreeNode) => React.ReactNode;
    className?: string;
}

export const TreeView: React.FC<TreeViewProps> = ({
    nodes,
    selectedIds,
    expandedIds = [],
    onSelect,
    onExpand,
    onDrop,
    renderIcon,
    className = ''
}) => {
    const [draggedId, setDraggedId] = useState<string | null>(null);

    const handleSelect = useCallback((node: TreeNode, checked: boolean) => {
        if (!onSelect) return;

        const getChildIds = (node: TreeNode): string[] => {
            const ids = [node.id];
            if (node.children) {
                node.children.forEach(child => {
                    ids.push(...getChildIds(child));
                });
            }
            return ids;
        };

        const newSelectedIds = new Set(selectedIds);
        const affectedIds = getChildIds(node);

        if (checked) {
            affectedIds.forEach(id => newSelectedIds.add(id));
        } else {
            affectedIds.forEach(id => newSelectedIds.delete(id));
        }

        onSelect(Array.from(newSelectedIds));
    }, [selectedIds, onSelect]);

    const handleExpand = useCallback((node: TreeNode) => {
        onExpand?.(node.id, !expandedIds.includes(node.id));
    }, [expandedIds, onExpand]);

    const handleDragStart = (e: React.DragEvent, node: TreeNode) => {
        e.dataTransfer.setData('text/plain', node.id);
        setDraggedId(node.id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetNode: TreeNode) => {
        e.preventDefault();
        const sourceId = draggedId;
        setDraggedId(null);

        if (sourceId && sourceId !== targetNode.id) {
            onDrop?.(sourceId, targetNode.id);
        }
    };

    const renderNode = (node: TreeNode, depth: number = 0) => {
        const isExpanded = expandedIds.includes(node.id);
        const isSelected = selectedIds.includes(node.id);
        const hasChildren = node.children && node.children.length > 0;

        const allChildrenSelected = hasChildren && node.children!.every(
            child => selectedIds.includes(child.id)
        );
        const someChildrenSelected = hasChildren && node.children!.some(
            child => selectedIds.includes(child.id)
        );
        const indeterminate = !allChildrenSelected && someChildrenSelected;

        return (
            <div
                key={node.id}
                className={`
                    vscode-tree-item
                    ${hasChildren ? 'vscode-tree-item--parent' : ''}
                    ${isExpanded ? 'vscode-tree-item--expanded' : ''}
                    ${draggedId === node.id ? 'vscode-tree-item--dragging' : ''}
                `.trim()}
                style={{ paddingLeft: `${depth * 20}px` }}
                draggable={!!onDrop}
                onDragStart={(e) => handleDragStart(e, node)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, node)}
            >
                <div className="vscode-tree-item__content">
                    {hasChildren && (
                        <span
                            className={`
                                vscode-tree-item__arrow
                                codicon
                                codicon-chevron-${isExpanded ? 'down' : 'right'}
                            `.trim()}
                            onClick={() => handleExpand(node)}
                        />
                    )}
                    <Checkbox
                        checked={isSelected}
                        indeterminate={indeterminate}
                        onChange={(e) => handleSelect(node, e.target.checked)}
                    />
                    {renderIcon && (
                        <span className="vscode-tree-item__icon">
                            {renderIcon(node)}
                        </span>
                    )}
                    <span className="vscode-tree-item__label">{node.label}</span>
                </div>
                {hasChildren && isExpanded && (
                    <div className="vscode-tree-item__children">
                        {node.children!.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`vscode-tree ${className}`.trim()}>
            {nodes.map(node => renderNode(node))}
        </div>
    );
};
