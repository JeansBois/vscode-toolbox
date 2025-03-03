"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScriptsList = void 0;
const messageHandler_1 = require("../utils/messageHandler");
class ScriptsList {
    constructor(containerId) {
        this.scripts = [];
        this.selectedScriptId = null;
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with id ${containerId} not found`);
        }
        this.container = container;
        this.init();
    }
    init() {
        // Créer la barre de recherche
        this.createSearchBar();
        // Créer la liste des scripts
        const listContainer = document.createElement('div');
        listContainer.className = 'scripts-list';
        this.container.appendChild(listContainer);
        // Écouter les événements de sélection
        listContainer.addEventListener('click', this.handleScriptClick.bind(this));
    }
    createSearchBar() {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'search';
        this.searchInput.placeholder = 'Rechercher des scripts...';
        this.searchInput.className = 'search-input';
        this.searchInput.addEventListener('input', () => {
            this.filterScripts(this.searchInput.value);
        });
        searchContainer.appendChild(this.searchInput);
        this.container.appendChild(searchContainer);
    }
    filterScripts(query) {
        const normalizedQuery = query.toLowerCase();
        const listContainer = this.container.querySelector('.scripts-list');
        if (!listContainer)
            return;
        Array.from(listContainer.children).forEach((item) => {
            if (item instanceof HTMLElement) {
                const title = item.querySelector('.script-item-title')?.textContent || '';
                const description = item.querySelector('.script-item-description')?.textContent || '';
                const tags = item.getAttribute('data-tags') || '';
                const isMatch = title.toLowerCase().includes(normalizedQuery) ||
                    description.toLowerCase().includes(normalizedQuery) ||
                    tags.toLowerCase().includes(normalizedQuery);
                item.style.display = isMatch ? '' : 'none';
            }
        });
    }
    updateScripts(scripts) {
        this.scripts = scripts;
        this.render();
    }
    render() {
        const listContainer = this.container.querySelector('.scripts-list');
        if (!listContainer)
            return;
        listContainer.innerHTML = '';
        this.scripts.forEach(script => {
            const scriptElement = this.createScriptElement(script);
            listContainer.appendChild(scriptElement);
        });
    }
    createScriptElement(script) {
        const element = document.createElement('div');
        element.className = 'script-item';
        element.setAttribute('data-script-id', script.script_info.id);
        element.setAttribute('data-tags', (script.script_info.tags || []).join(' '));
        if (script.script_info.id === this.selectedScriptId) {
            element.classList.add('selected');
        }
        element.innerHTML = `
            <div class="script-item-icon">
                <!-- Icône basée sur la catégorie -->
                <span class="codicon codicon-${this.getCategoryIcon(script.script_info.category)}"></span>
            </div>
            <div class="script-item-content">
                <div class="script-item-title">${script.script_info.name}</div>
                <div class="script-item-description">${script.script_info.description}</div>
                <div class="script-item-meta">
                    ${this.createTags(script.script_info.tags || [])}
                    <span class="script-item-version">v${script.script_info.version}</span>
                </div>
            </div>
        `;
        return element;
    }
    getCategoryIcon(category) {
        const iconMap = {
            'analysis': 'graph',
            'utility': 'tools',
            'development': 'code',
            'testing': 'beaker',
            'deployment': 'rocket',
            'default': 'terminal'
        };
        return iconMap[category.toLowerCase()] || iconMap.default;
    }
    createTags(tags) {
        return tags
            .map(tag => `<span class="badge">${tag}</span>`)
            .join('');
    }
    handleScriptClick(event) {
        const scriptItem = event.target.closest('.script-item');
        if (!scriptItem)
            return;
        const scriptId = scriptItem.getAttribute('data-script-id');
        if (!scriptId)
            return;
        // Mettre à jour la sélection
        this.setSelectedScript(scriptId);
        // Notifier l'extension
        messageHandler_1.messageHandler.postMessage({
            type: 'script',
            action: 'select',
            scriptId
        });
    }
    setSelectedScript(scriptId) {
        // Supprimer la sélection précédente
        const previousSelected = this.container.querySelector('.script-item.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }
        this.selectedScriptId = scriptId;
        if (scriptId) {
            const newSelected = this.container.querySelector(`.script-item[data-script-id="${scriptId}"]`);
            if (newSelected) {
                newSelected.classList.add('selected');
                newSelected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }
    getSelectedScriptId() {
        return this.selectedScriptId;
    }
    getSelectedScript() {
        return this.scripts.find(s => s.script_info.id === this.selectedScriptId);
    }
}
exports.ScriptsList = ScriptsList;
//# sourceMappingURL=ScriptsList.js.map