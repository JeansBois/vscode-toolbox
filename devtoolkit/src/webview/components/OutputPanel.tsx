import React, { useRef, useEffect } from 'react';
import './OutputPanel.css';

export type LogLevel = 'info' | 'success' | 'warning' | 'error';

interface LogEntry {
    message: string;
    level: LogLevel;
    timestamp: Date;
}

export interface OutputPanelProps {
    logs: LogEntry[];
    autoScroll?: boolean;
    maxHeight?: string;
    className?: string;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({
    logs,
    autoScroll = true,
    maxHeight = '300px',
    className = ''
}) => {
    const outputRef = useRef<HTMLDivElement>(null);
    const isAutoScrolling = useRef(true);

    useEffect(() => {
        if (autoScroll && isAutoScrolling.current && outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const handleScroll = () => {
        if (!outputRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
        const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 50;
        isAutoScrolling.current = isAtBottom;
    };

    const formatTimestamp = (date: Date) => {
        return date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const getLogIcon = (level: LogLevel) => {
        switch (level) {
            case 'success':
                return 'codicon-check';
            case 'warning':
                return 'codicon-warning';
            case 'error':
                return 'codicon-error';
            default:
                return 'codicon-info';
        }
    };

    const clearOutput = () => {
        // Cette fonction sera implémentée par le parent via les props
        console.log('Effacer la sortie');
    };

    return (
        <div className={`output-panel ${className}`.trim()}>
            <div className="output-panel__header">
                <h2 className="output-panel__title">Sortie</h2>
                <button
                    className="output-panel__clear-button"
                    onClick={clearOutput}
                    title="Effacer la sortie"
                >
                    <span className="codicon codicon-clear-all" />
                </button>
            </div>
            <div
                ref={outputRef}
                className="output-panel__content"
                style={{ maxHeight }}
                onScroll={handleScroll}
            >
                {logs.length === 0 ? (
                    <div className="output-panel__empty">
                        Aucune sortie disponible
                    </div>
                ) : (
                    logs.map((log, index) => (
                        <div
                            key={index}
                            className={`
                                output-panel__log-entry
                                output-panel__log-entry--${log.level}
                            `.trim()}
                        >
                            <span className="output-panel__log-timestamp">
                                {formatTimestamp(log.timestamp)}
                            </span>
                            <span className={`
                                output-panel__log-icon
                                codicon
                                ${getLogIcon(log.level)}
                            `.trim()} />
                            <span className="output-panel__log-message">
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>
            {!isAutoScrolling.current && logs.length > 0 && (
                <button
                    className="output-panel__scroll-button"
                    onClick={() => {
                        if (outputRef.current) {
                            outputRef.current.scrollTop = outputRef.current.scrollHeight;
                            isAutoScrolling.current = true;
                        }
                    }}
                    title="Défiler jusqu'en bas"
                >
                    <span className="codicon codicon-chevron-down" />
                </button>
            )}
        </div>
    );
};

// Méthodes utilitaires exportées
export const createLogEntry = (
    message: string,
    level: LogLevel = 'info'
): LogEntry => ({
    message,
    level,
    timestamp: new Date()
});

export const formatOutput = (output: string): LogEntry[] => {
    return output.split('\n').map(line => {
        // Détecter le niveau de log basé sur le contenu
        let level: LogLevel = 'info';
        if (line.toLowerCase().includes('error')) {
            level = 'error';
        } else if (line.toLowerCase().includes('warning')) {
            level = 'warning';
        } else if (line.toLowerCase().includes('success')) {
            level = 'success';
        }

        return createLogEntry(line, level);
    });
};
