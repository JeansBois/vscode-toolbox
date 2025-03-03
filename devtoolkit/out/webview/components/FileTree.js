"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTree = void 0;
const messageHandler_1 = require("../utils/messageHandler");
class FileTree {
    constructor(containerId) {
        this.root = null;
        this.selectedFiles = new Set();
        this.fileFilter = [];
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        this.container = container;
        this.init();
    }
    init() {
        // Créer le conteneur de l'arbre
        const treeContainer = document.createElement('div');
        treeContainer.className = 'file-tree';
        this.container.appendChild(treeContainer);
        // Écouter les événements
        treeContainer.addEventListener('click', this.handleClick.bind(this));
    }
    setFileFilter(extensions) {
        this.fileFilter = extensions.map(ext => ext.toLowerCase());
        this.render();
    }
    updateFiles(root) {
        this.root = root;
        this.render();
    }
    render() {
        const treeContainer = this.container.querySelector('.file-tree');
        if (!treeContainer || !this.root)
            return;
        treeContainer.innerHTML = '';
        this.renderNode(this.root, treeContainer, 0);
    }
    renderNode(node, container, level) {
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
    getFileIcon(node) {
        if (node.type === 'directory') {
            return node.expanded ? 'folder-opened' : 'folder';
        }
        const extension = node.name.split('.').pop()?.toLowerCase();
        const iconMap = {
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
    isFileAllowed(filename) {
        if (this.fileFilter.length === 0)
            return true;
        const extension = filename.split('.').pop()?.toLowerCase();
        return extension ? this.fileFilter.includes(`.${extension}`) : false;
    }
    handleClick(event) {
        const target = event.target;
        const item = target.closest('.file-tree-item');
        if (!item)
            return;
        const path = item.getAttribute('data-path');
        if (!path)
            return;
        const action = target.getAttribute('data-action');
        if (action === 'toggle') {
            this.toggleNode(path);
        }
        else if (action === 'select') {
            const checkbox = target;
            this.toggleFileSelection(path, checkbox.checked);
        }
    }
    toggleNode(path) {
        const toggleNode = (node) => {
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
    toggleFileSelection(path, selected) {
        if (selected) {
            this.selectedFiles.add(path);
        }
        else {
            this.selectedFiles.delete(path);
        }
        // Notifier l'extension
        messageHandler_1.messageHandler.postMessage({
            type: 'file',
            action: selected ? 'select' : 'deselect',
            paths: [path]
        });
    }
    getSelectedFiles() {
        return Array.from(this.selectedFiles);
    }
    clearSelection() {
        this.selectedFiles.clear();
        this.render();
    }
    selectAll() {
        const selectAllInNode = (node) => {
            if (node.type === 'file' && this.isFileAllowed(node.name)) {
                this.selectedFiles.add(node.path);
            }
            node.children?.forEach(selectAllInNode);
        };
        if (this.root) {
            selectAllInNode(this.root);
            this.render();
            // Notifier l'extension
            messageHandler_1.messageHandler.postMessage({
                type: 'file',
                action: 'select',
                paths: Array.from(this.selectedFiles)
            });
        }
    }
}
exports.FileTree = FileTree;
//# sourceMappingURL=FileTree.js.map