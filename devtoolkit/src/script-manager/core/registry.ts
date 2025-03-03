import { EventEmitter } from 'events';
import {
    ScriptInfo,
    ScriptStatus,
} from '../types';


export class ScriptRegistry extends EventEmitter {
    private scripts: Map<string, ScriptInfo>;
    private categories: Set<string>;
    private tags: Set<string>;
    private scriptStatus: Map<string, ScriptStatus>;
    private static instance: ScriptRegistry;

    private constructor() {
        super();
        this.scripts = new Map();
        this.categories = new Set();
        this.tags = new Set();
        this.scriptStatus = new Map();
    }

    public static getInstance(): ScriptRegistry {
        if (!ScriptRegistry.instance) {
            ScriptRegistry.instance = new ScriptRegistry();
        }
        return ScriptRegistry.instance;
    }

    public async registerScript(scriptInfo: ScriptInfo): Promise<void> {
        this.scripts.set(scriptInfo.id, scriptInfo);
        this.categories.add(scriptInfo.category);
        if (scriptInfo.tags) {
            scriptInfo.tags.forEach(tag => this.tags.add(tag));
        }
        this.scriptStatus.set(scriptInfo.id, ScriptStatus.Idle);
        
        this.emit('script:registered', scriptInfo);
        this.emit('category:added', scriptInfo.category);
        scriptInfo.tags?.forEach(tag => this.emit('tag:added', tag));
    }

    public async unregisterScript(scriptId: string): Promise<void> {
        const script = this.scripts.get(scriptId);
        if (script) {
            this.scripts.delete(scriptId);
            this.scriptStatus.delete(scriptId);
            this.emit('script:unregistered', scriptId);

            // Nettoyer les catégories et tags orphelins
            this.cleanupCategoriesAndTags();
        }
    }

    public async updateScript(scriptId: string, updates: Partial<ScriptInfo>): Promise<void> {
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

    public updateScriptStatus(scriptId: string, status: ScriptStatus): void {
        this.scriptStatus.set(scriptId, status);
        this.emit('script:status', scriptId, status);
    }

    public getScript(scriptId: string): ScriptInfo | undefined {
        return this.scripts.get(scriptId);
    }

    public getAllScripts(): ScriptInfo[] {
        return Array.from(this.scripts.values());
    }

    public getScriptsByCategory(category: string): ScriptInfo[] {
        return this.getAllScripts().filter(script => script.category === category);
    }

    public getScriptsByTag(tag: string): ScriptInfo[] {
        return this.getAllScripts().filter(
            script => script.tags?.includes(tag)
        );
    }

    public getScriptStatus(scriptId: string): ScriptStatus {
        return this.scriptStatus.get(scriptId) || ScriptStatus.Unknown;
    }

    public getAllCategories(): string[] {
        return Array.from(this.categories);
    }

    public getAllTags(): string[] {
        return Array.from(this.tags);
    }

    public searchScripts(criteria: {
        category?: string;
        tags?: string[];
        query?: string;
    }): ScriptInfo[] {
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

    private cleanupCategoriesAndTags(): void {
        // Nettoyer les catégories non utilisées
        const usedCategories = new Set(this.getAllScripts().map(s => s.category));
        Array.from(this.categories).forEach(category => {
            if (!usedCategories.has(category)) {
                this.categories.delete(category);
            }
        });

        // Nettoyer les tags non utilisés
        const usedTags = new Set(
            this.getAllScripts()
                .flatMap(s => s.tags || [])
        );
        Array.from(this.tags).forEach(tag => {
            if (!usedTags.has(tag)) {
                this.tags.delete(tag);
            }
        });
    }
}
