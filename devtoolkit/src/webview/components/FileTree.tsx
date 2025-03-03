import React, { useState, useCallback, useMemo } from 'react';
import { TreeView, TreeNode } from './Common/TreeView';
import './FileTree.css';

interface FileNode {
    path: string;
    name: string;
    type: 'file' | 'directory';
    children?: FileNode[];
}

export interface FileTreeProps {
    files: FileNode[];
    selectedPaths: string[];
    onSelectionChange: (paths: string[]) => void;
    className?: string;
}

export const FileTree: React.FC<FileTreeProps> = ({
    files,
    selectedPaths,
    onSelectionChange,
    className = ''
}) => {
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // Convertir les FileNode en TreeNode
    const convertToTreeNodes = useCallback((nodes: FileNode[]): TreeNode[] => {
        return nodes.map(node => ({
            id: node.path,
            label: node.name,
            children: node.children ? convertToTreeNodes(node.children) : undefined,
            data: { type: node.type }
        }));
    }, []);

    // Filtrer les nœuds en fonction du terme de recherche
    const filterNodes = useCallback((nodes: FileNode[], term: string): FileNode[] => {
        if (!term) return nodes;

        return nodes.reduce<FileNode[]>((acc, node) => {
            const matchesSearch = node.name.toLowerCase().includes(term.toLowerCase());
            
            if (node.children) {
                const filteredChildren = filterNodes(node.children, term);
                if (filteredChildren.length > 0) {
                    acc.push({
                        ...node,
                        children: filteredChildren
                    });
                    return acc;
                }
            }

            if (matchesSearch) {
                acc.push(node);
            }

            return acc;
        }, []);
    }, []);

    // Nœuds filtrés et convertis
    const treeNodes = useMemo(() => {
        const filteredFiles = filterNodes(files, searchTerm);
        return convertToTreeNodes(filteredFiles);
    }, [files, searchTerm, convertToTreeNodes, filterNodes]);

    // Gérer l'expansion des nœuds
    const handleExpand = useCallback((id: string, expanded: boolean) => {
        setExpandedIds(prev => {
            if (expanded) {
                return [...prev, id];
            } else {
                return prev.filter(expandedId => expandedId !== id);
            }
        });
    }, []);

    // Gérer le glisser-déposer
    const handleDrop = useCallback((sourceId: string, targetId: string) => {
        // Implémenter la logique de réorganisation des fichiers ici
        console.log('Déplacement de', sourceId, 'vers', targetId);
    }, []);

    // Rendre l'icône appropriée pour chaque type de fichier
    const renderIcon = useCallback((node: TreeNode) => {
        const type = node.data?.type;
        return (
            <span className={`
                codicon
                ${type === 'directory' ? 'codicon-folder' : 'codicon-file'}
            `.trim()} />
        );
    }, []);

    return (
        <div className={`file-tree ${className}`.trim()}>
            <div className="file-tree__header">
                <h2 className="file-tree__title">Fichiers</h2>
                <input
                    type="text"
                    className="file-tree__search"
                    placeholder="Rechercher des fichiers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="file-tree__content">
                {treeNodes.length === 0 ? (
                    <div className="file-tree__empty">
                        {searchTerm ? 'Aucun fichier trouvé' : 'Aucun fichier disponible'}
                    </div>
                ) : (
                    <TreeView
                        nodes={treeNodes}
                        selectedIds={selectedPaths}
                        expandedIds={expandedIds}
                        onSelect={onSelectionChange}
                        onExpand={handleExpand}
                        onDrop={handleDrop}
                        renderIcon={renderIcon}
                    />
                )}
            </div>
        </div>
    );
};
