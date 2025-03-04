import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { JSX } from 'react/jsx-runtime';
import { messageHandler } from '../utils/messageHandler';
import { ScriptManifest } from '../../script-manager/types';
import './ScriptsList.css';

/**
 * Script item interface for the React component
 */
export interface ScriptItem {
    id: string;
    name: string;
    description: string;
    category: string;
    version: string;
    tags?: string[];
}

/**
 * Props for the internal ScriptsListComponent
 */
interface ScriptsListComponentProps {
    scripts: ScriptItem[];
    selectedScriptId: string | null;
    onScriptSelect: (scriptId: string) => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
}

/**
 * Internal React component for displaying the scripts list
 */
const ScriptsListComponent: React.FC<ScriptsListComponentProps> = ({
    scripts,
    selectedScriptId,
    onScriptSelect,
    searchTerm,
    onSearchChange
}) => {
    // Filter scripts based on search term
    const filteredScripts = useMemo(() => {
        const normalizedQuery = searchTerm.toLowerCase();
        return scripts.filter(script => {
            const nameMatch = script.name.toLowerCase().includes(normalizedQuery);
            const descMatch = script.description.toLowerCase().includes(normalizedQuery);
            const tagMatch = script.tags?.some(tag => 
                tag.toLowerCase().includes(normalizedQuery)
            ) || false;
            
            return nameMatch || descMatch || tagMatch;
        });
    }, [scripts, searchTerm]);

    // Get category icon for script
    const getCategoryIcon = useCallback((category: string): string => {
        const iconMap: Record<string, string> = {
            'analysis': 'graph',
            'utility': 'tools',
            'development': 'code',
            'testing': 'beaker',
            'deployment': 'rocket',
            'default': 'terminal'
        };

        return iconMap[category.toLowerCase()] || iconMap.default;
    }, []);

    // Create tag elements
    const renderTags = useCallback((tags: string[] = []): JSX.Element => {
        return (
            <div className="script-item-tags">
                {tags.map((tag, index) => (
                    <span key={index} className="badge">{tag}</span>
                ))}
            </div>
        );
    }, []);

    return (
        <div className="scripts-list-container">
            {/* Search bar */}
            <div className="search-container">
                <input
                    type="search"
                    placeholder="Rechercher des scripts..."
                    className="search-input"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>
            
            {/* Scripts list */}
            <div className="scripts-list">
                {filteredScripts.length === 0 ? (
                    <div className="no-scripts-message">Aucun script trouvé</div>
                ) : (
                    filteredScripts.map(script => (
                        <div 
                            key={script.id}
                            className={`script-item ${script.id === selectedScriptId ? 'selected' : ''}`}
                            onClick={() => onScriptSelect(script.id)}
                            data-script-id={script.id}
                            data-tags={(script.tags || []).join(' ')}
                        >
                            <div className="script-item-icon">
                                <span className={`codicon codicon-${getCategoryIcon(script.category)}`}></span>
                            </div>
                            <div className="script-item-content">
                                <div className="script-item-title">{script.name}</div>
                                <div className="script-item-description">{script.description}</div>
                                <div className="script-item-meta">
                                    {renderTags(script.tags)}
                                    <span className="script-item-version">v{script.version}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

/**
 * Class-based adapter that maintains the original API while using React internally
 */
export class ScriptsList {
    private container: HTMLElement;
    private scripts: ScriptManifest[] = [];
    private selectedScriptId: string | null = null;
    private searchTerm: string = '';
    private root: Root | null = null;
    
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
        rootElement.className = 'scripts-list-root';
        this.container.appendChild(rootElement);
        
        // Initial render
        this.render();
    }

    /**
     * Map ScriptManifest to ScriptItem for the React component
     */
    private mapToScriptItems(scripts: ScriptManifest[]): ScriptItem[] {
        return scripts.map(script => ({
            id: script.script_info.id,
            name: script.script_info.name,
            description: script.script_info.description,
            category: script.script_info.category,
            version: script.script_info.version,
            tags: script.script_info.tags
        }));
    }

    /**
     * Handle script selection
     */
    private handleScriptSelect = (scriptId: string): void => {
        // Update selection
        this.setSelectedScript(scriptId);

        // Notify extension
        messageHandler.postMessage({
            type: 'script',
            action: 'select',
            scriptId
        });
    };

    /**
     * Handle search input change
     */
    private handleSearchChange = (term: string): void => {
        this.searchTerm = term;
        this.render();
    };

    /**
     * Filter scripts (maintained for backward compatibility)
     */
    private filterScripts(query: string): void {
        this.searchTerm = query;
        this.render();
    }

    /**
     * Update scripts list
     */
    public updateScripts(scripts: ScriptManifest[]): void {
        this.scripts = scripts;
        this.render();
    }

    /**
     * Set selected script
     */
    public setSelectedScript(scriptId: string | null): void {
        this.selectedScriptId = scriptId;
        this.render();
        
        // Scroll selected item into view
        if (scriptId) {
            setTimeout(() => {
                const selectedElement = this.container.querySelector(
                    `.script-item[data-script-id="${scriptId}"]`
                );
                if (selectedElement) {
                    selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 0);
        }
    }

    /**
     * Get selected script ID
     */
    public getSelectedScriptId(): string | null {
        return this.selectedScriptId;
    }

    /**
     * Get selected script
     */
    public getSelectedScript(): ScriptManifest | undefined {
        return this.scripts.find(s => s.script_info.id === this.selectedScriptId);
    }

    /**
     * Render the React component
     */
    private render(): void {
        const scriptItems = this.mapToScriptItems(this.scripts);
        const rootElement = this.container.querySelector('.scripts-list-root');
        
        if (!rootElement) return;
        
        // Create root if it doesn't exist yet
        if (!this.root) {
            this.root = createRoot(rootElement);
        }
        
        this.root.render(
            <ScriptsListComponent
                scripts={scriptItems}
                selectedScriptId={this.selectedScriptId}
                onScriptSelect={this.handleScriptSelect}
                searchTerm={this.searchTerm}
                onSearchChange={this.handleSearchChange}
            />
        );
    }
}
