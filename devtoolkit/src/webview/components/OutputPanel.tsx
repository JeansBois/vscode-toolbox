import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { JSX } from 'react/jsx-runtime';
import { messageHandler } from '../utils/messageHandler';
import './OutputPanel.css';

/**
 * Log entry interface for the OutputPanel
 */
interface LogEntry {
    text: string;
    type: 'info' | 'error' | 'warning' | 'success';
    timestamp: number;
}

/**
 * Props for the internal React component
 */
interface OutputPanelComponentProps {
    lines: LogEntry[];
    filterLevel: Set<string>;
    autoScroll: boolean;
    onToggleAutoScroll: (enabled: boolean) => void;
    onFilterChange: (type: string, enabled: boolean) => void;
    onClear: () => void;
    onCopy: () => void;
}

/**
 * Internal React component for displaying the output panel
 */
const OutputPanelComponent: React.FC<OutputPanelComponentProps> = ({
    lines,
    filterLevel,
    autoScroll,
    onToggleAutoScroll,
    onFilterChange,
    onClear,
    onCopy
}) => {
    const contentRef = useRef<HTMLDivElement>(null);
    
    // Auto-scrolling effect
    useEffect(() => {
        if (autoScroll && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [lines, autoScroll]);
    
    // Handle scroll event to detect if user has manually scrolled
    const handleScroll = useCallback(() => {
        if (!contentRef.current) return;
        
        const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
        const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
        
        if (autoScroll !== isAtBottom) {
            onToggleAutoScroll(isAtBottom);
        }
    }, [autoScroll, onToggleAutoScroll]);
    
    // Format timestamp
    const formatTimestamp = useCallback((timestamp: number): string => {
        return new Date(timestamp).toLocaleTimeString();
    }, []);
    
    // Filter visible log entries
    const filteredLines = lines.filter(line => filterLevel.has(line.type));
    
    return (
        <div className="output-panel">
            {/* Toolbar */}
            <div className="output-toolbar">
                {/* Clear button */}
                <button 
                    className="toolbar-button" 
                    title="Effacer la sortie"
                    onClick={onClear}
                >
                    <span className="codicon codicon-clear-all"></span>
                </button>
                
                {/* Copy button */}
                <button 
                    className="toolbar-button" 
                    title="Copier la sortie"
                    onClick={onCopy}
                >
                    <span className="codicon codicon-copy"></span>
                </button>
                
                {/* Log type filters */}
                <div className="filter-container">
                    {['info', 'error', 'warning', 'success'].map(type => (
                        <React.Fragment key={type}>
                            <input
                                type="checkbox"
                                id={`filter-${type}`}
                                checked={filterLevel.has(type)}
                                onChange={(e) => onFilterChange(type, e.target.checked)}
                            />
                            <label 
                                htmlFor={`filter-${type}`}
                                className={`filter-label filter-${type}`}
                            >
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </label>
                        </React.Fragment>
                    ))}
                </div>
                
                {/* Auto-scroll toggle */}
                <button 
                    className={`toolbar-button ${autoScroll ? 'active' : ''}`}
                    title="Activer/désactiver le défilement automatique"
                    onClick={() => onToggleAutoScroll(!autoScroll)}
                >
                    <span className="codicon codicon-scroll-mode"></span>
                </button>
            </div>
            
            {/* Content area */}
            <div 
                ref={contentRef}
                className="output-content"
                onScroll={handleScroll}
            >
                {filteredLines.length === 0 ? (
                    <div className="empty-output">Aucune sortie à afficher</div>
                ) : (
                    filteredLines.map((line, index) => (
                        <div 
                            key={index} 
                            className={`output-line output-${line.type}`}
                        >
                            <span className="output-timestamp">
                                {formatTimestamp(line.timestamp)}
                            </span>
                            <span className="output-text">
                                {line.text}
                            </span>
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
export class OutputPanel {
    private container: HTMLElement;
    private content!: HTMLElement;
    private toolbar!: HTMLElement;
    private lines: LogEntry[] = [];
    private autoScroll: boolean = true;
    private filterLevel: Set<string> = new Set(['info', 'error', 'warning', 'success']);
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
        rootElement.className = 'output-panel-root';
        this.container.appendChild(rootElement);
        
        // Create references to DOM elements for backward compatibility
        this.content = document.createElement('div');
        this.toolbar = document.createElement('div');
        
        // Initial render
        this.render();
    }

    /**
     * Toggle auto-scroll behavior
     */
    private handleToggleAutoScroll = (enabled: boolean): void => {
        this.autoScroll = enabled;
        this.render();
    };

    /**
     * Handle filter level change
     */
    private handleFilterChange = (type: string, enabled: boolean): void => {
        if (enabled) {
            this.filterLevel.add(type);
        } else {
            this.filterLevel.delete(type);
        }
        this.render();
    };

    /**
     * Handle copy to clipboard
     */
    private handleCopy = async (): Promise<void> => {
        const text = this.lines
            .filter(line => this.filterLevel.has(line.type))
            .map(line => `[${new Date(line.timestamp).toLocaleTimeString()}] ${line.text}`)
            .join('\n');

        try {
            await navigator.clipboard.writeText(text);
            messageHandler.notifySuccess('Sortie copiée dans le presse-papiers');
        } catch (error) {
            messageHandler.notifyError('Error copying to clipboard');
        }
    };

    /**
     * Append a new line to the output
     */
    public appendLine(text: string, type: LogEntry['type'] = 'info'): void {
        const line: LogEntry = {
            text,
            type,
            timestamp: Date.now()
        };

        this.lines.push(line);
        this.render();
    }

    /**
     * Clear all output lines
     */
    public clear(): void {
        this.lines = [];
        this.render();
    }

    /**
     * Scroll to the bottom of the output
     */
    private scrollToBottom(): void {
        // This is now handled by the React component
        this.render();
    }

    /**
     * Set the theme for the output panel
     */
    public setTheme(theme: 'dark' | 'light' | 'high-contrast'): void {
        this.container.setAttribute('data-theme', theme);
    }

    /**
     * Add an info log message
     */
    public log(message: string): void {
        this.appendLine(message, 'info');
    }

    /**
     * Add an error log message
     */
    public error(message: string): void {
        this.appendLine(message, 'error');
    }

    /**
     * Add a warning log message
     */
    public warning(message: string): void {
        this.appendLine(message, 'warning');
    }

    /**
     * Add a success log message
     */
    public success(message: string): void {
        this.appendLine(message, 'success');
    }

    /**
     * Render the React component
     */
    private render(): void {
        const rootElement = this.container.querySelector('.output-panel-root');
        if (!rootElement) return;
        
        // Create root if it doesn't exist yet
        if (!this.reactRoot) {
            this.reactRoot = createRoot(rootElement);
        }
        
        this.reactRoot.render(
            <OutputPanelComponent
                lines={this.lines}
                filterLevel={this.filterLevel}
                autoScroll={this.autoScroll}
                onToggleAutoScroll={this.handleToggleAutoScroll}
                onFilterChange={this.handleFilterChange}
                onClear={() => this.clear()}
                onCopy={this.handleCopy}
            />
        );
    }
}
