import { messageHandler } from '../utils/messageHandler';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
    selected?: boolean;
    expanded?: boolean;
}

export class FileTree {
    private container: HTMLElement;
    private root: FileNode | null = null;
    private selectedFiles: Set<string> = new Set();
    private fileFilter: string[] = [];

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        this.container = container;
        this.init();
    }

    private init(): void {
        // Créer le conteneur de l'arbre
        const treeContainer = document.createElement('div');
        treeContainer.className = 'file-tree';
        this.container.appendChild(treeContainer);

        // Écouter les événements
        treeContainer.addEventListener('click', this.handleClick.bind(this));
    }

    public setFileFilter(extensions: string[]): void {
        this.fileFilter = extensions.map(ext => ext.toLowerCase());
        this.render();
    }

    public updateFiles(root: FileNode): void {
        this.root = root;
        this.render();
    }

    private render(): void {
        const treeContainer = this.container.querySelector('.file-tree') as HTMLElement;
        if (!treeContainer || !this.root) return;

        treeContainer.innerHTML = '';
        this.renderNode(this.root, treeContainer, 0);
    }

    private renderNode(node: FileNode, container: HTMLElement, level: number): void {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'file-tree-item';
        itemContainer.setAttribute('data-path', node.path);
        itemContainer.style.paddingLeft = `${level * 20}px`;

        // Ajouter l'indentation
        if (level > 0) {
            const indent = document.createElement('div');
            indent.className = 'file-tree-indent';
            itemContainer.appendChild(indent);
        }

        // Ajouter le toggle pour les dossiers
        if (node.type === 'directory') {
            const toggle = document.createElement('div');
            toggle.className = 'file-tree-toggle';
            toggle.innerHTML = node.expanded ? '▼' : '▶';
            toggle.setAttribute('data-action', 'toggle');
            itemContainer.appendChild(toggle);
        }

        // Ajouter la case à cocher pour les fichiers
        if (node.type === 'file' && this.isFileAllowed(node.name)) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'file-tree-checkbox';
            checkbox.checked = this.selectedFiles.has(node.path);
            checkbox.setAttribute('data-action', 'select');
            itemContainer.appendChild(checkbox);
        }

        // Ajouter l'icône
        const icon = document.createElement('span');
        icon.className = `codicon codicon-${this.getFileIcon(node)}`;
        itemContainer.appendChild(icon);

        // Ajouter le label
        const label = document.createElement('span');
        label.className = 'file-tree-label';
        label.textContent = node.name;
        itemContainer.appendChild(label);

        container.appendChild(itemContainer);

        // Rendre les enfants si c'est un dossier et qu'il est étendu
        if (node.type === 'directory' && node.expanded && node.children) {
            const childContainer = document.createElement('div');
            childContainer.className = 'file-tree-children';
            container.appendChild(childContainer);

            node.children.forEach(child => {
                this.renderNode(child, childContainer, level + 1);
            });
        }
    }

    private getFileIcon(node: FileNode): string {
        if (node.type === 'directory') {
            return node.expanded ? 'folder-opened' : 'folder';
        }

        const extension = node.name.split('.').pop()?.toLowerCase();
        const iconMap: Record<string, string> = {
            'py': 'symbol-misc',
            'js': 'symbol-misc',
            'ts': 'symbol-misc',
            'json': 'json',
            'md': 'markdown',
            'txt': 'text-size',
            'default': 'file'
        };

        return iconMap[extension || 'default'] || iconMap.default;
    }

    private isFileAllowed(filename: string): boolean {
        if (this.fileFilter.length === 0) return true;
        const extension = filename.split('.').pop()?.toLowerCase();
        return extension ? this.fileFilter.includes(`.${extension}`) : false;
    }

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

    private toggleNode(path: string): void {
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
    }

    private toggleFileSelection(path: string, selected: boolean): void {
        if (selected) {
            this.selectedFiles.add(path);
        } else {
            this.selectedFiles.delete(path);
        }

        // Notifier l'extension
        messageHandler.postMessage({
            type: 'file',
            action: selected ? 'select' : 'deselect',
            paths: [path]
        });
    }

    public getSelectedFiles(): string[] {
        return Array.from(this.selectedFiles);
    }

    public clearSelection(): void {
        this.selectedFiles.clear();
        this.render();
    }

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

            // Notifier l'extension
            messageHandler.postMessage({
                type: 'file',
                action: 'select',
                paths: Array.from(this.selectedFiles)
            });
        }
    }
}
