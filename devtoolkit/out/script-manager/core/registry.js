"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScriptRegistry = void 0;
const events_1 = require("events");
const types_1 = require("../types");
class ScriptRegistry extends events_1.EventEmitter {
    constructor() {
        super();
        this.scripts = new Map();
        this.categories = new Set();
        this.tags = new Set();
        this.scriptStatus = new Map();
    }
    static getInstance() {
        if (!ScriptRegistry.instance) {
            ScriptRegistry.instance = new ScriptRegistry();
        }
        return ScriptRegistry.instance;
    }
    async registerScript(scriptInfo) {
        this.scripts.set(scriptInfo.id, scriptInfo);
        this.categories.add(scriptInfo.category);
        if (scriptInfo.tags) {
            scriptInfo.tags.forEach(tag => this.tags.add(tag));
        }
        this.scriptStatus.set(scriptInfo.id, types_1.ScriptStatus.Idle);
        this.emit('script:registered', scriptInfo);
        this.emit('category:added', scriptInfo.category);
        scriptInfo.tags?.forEach(tag => this.emit('tag:added', tag));
    }
    async unregisterScript(scriptId) {
        const script = this.scripts.get(scriptId);
        if (script) {
            this.scripts.delete(scriptId);
            this.scriptStatus.delete(scriptId);
            this.emit('script:unregistered', scriptId);
            // Nettoyer les catégories et tags orphelins
            this.cleanupCategoriesAndTags();
        }
    }
    async updateScript(scriptId, updates) {
        const script = this.scripts.get(scriptId);
        if (script) {
            const updatedScript = { ...script, ...updates };
            this.scripts.set(scriptId, updatedScript);
            if (updates.category) {
                this.categories.add(updates.category);
                this.emit('category:added', updates.category);
            }
            if (updates.tags) {
                updates.tags.forEach(tag => {
                    this.tags.add(tag);
                    this.emit('tag:added', tag);
                });
            }
            this.emit('script:updated', updatedScript);
            this.cleanupCategoriesAndTags();
        }
    }
    updateScriptStatus(scriptId, status) {
        this.scriptStatus.set(scriptId, status);
        this.emit('script:status', scriptId, status);
    }
    getScript(scriptId) {
        return this.scripts.get(scriptId);
    }
    getAllScripts() {
        return Array.from(this.scripts.values());
    }
    getScriptsByCategory(category) {
        return this.getAllScripts().filter(script => script.category === category);
    }
    getScriptsByTag(tag) {
        return this.getAllScripts().filter(script => script.tags?.includes(tag));
    }
    getScriptStatus(scriptId) {
        return this.scriptStatus.get(scriptId) || types_1.ScriptStatus.Unknown;
    }
    getAllCategories() {
        return Array.from(this.categories);
    }
    getAllTags() {
        return Array.from(this.tags);
    }
    searchScripts(criteria) {
        return this.getAllScripts().filter(script => {
            const matchesCategory = !criteria.category || script.category === criteria.category;
            const matchesTags = !criteria.tags?.length ||
                criteria.tags.every(tag => script.tags?.includes(tag));
            const matchesQuery = !criteria.query ||
                script.name.toLowerCase().includes(criteria.query.toLowerCase()) ||
                script.description.toLowerCase().includes(criteria.query.toLowerCase());
            return matchesCategory && matchesTags && matchesQuery;
        });
    }
    cleanupCategoriesAndTags() {
        // Nettoyer les catégories non utilisées
        const usedCategories = new Set(this.getAllScripts().map(s => s.category));
        Array.from(this.categories).forEach(category => {
            if (!usedCategories.has(category)) {
                this.categories.delete(category);
            }
        });
        // Nettoyer les tags non utilisés
        const usedTags = new Set(this.getAllScripts()
            .flatMap(s => s.tags || []));
        Array.from(this.tags).forEach(tag => {
            if (!usedTags.has(tag)) {
                this.tags.delete(tag);
            }
        });
    }
}
exports.ScriptRegistry = ScriptRegistry;
//# sourceMappingURL=registry.js.map