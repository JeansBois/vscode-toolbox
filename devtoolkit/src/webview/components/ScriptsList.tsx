import React, { useState, useMemo } from 'react';
import { Button } from './Common/Button';
import { Select } from './Common/Select';
import './ScriptsList.css';

export interface ScriptItem {
    id: string;
    name: string;
    description: string;
    category: string;
    path: string;
}

export interface ScriptsListProps {
    scripts: ScriptItem[];
    onScriptSelect: (script: ScriptItem) => void;
    onScriptRun: (script: ScriptItem) => void;
    loading?: boolean;
    selectedScript?: ScriptItem;
}

export const ScriptsList: React.FC<ScriptsListProps> = ({
    scripts,
    onScriptSelect,
    onScriptRun,
    loading = false,
    selectedScript
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // Extraire les catégories uniques
    const categories = useMemo(() => {
        const uniqueCategories = new Set(scripts.map(script => script.category));
        return Array.from(uniqueCategories).map(category => ({
            value: category,
            label: category
        }));
    }, [scripts]);

    // Filtrer les scripts
    const filteredScripts = useMemo(() => {
        return scripts.filter(script => {
            const matchesSearch = searchTerm === '' || 
                script.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                script.description.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesCategory = selectedCategory === '' || 
                script.category === selectedCategory;

            return matchesSearch && matchesCategory;
        });
    }, [scripts, searchTerm, selectedCategory]);

    return (
        <div className="scripts-list">
            <div className="scripts-list__header">
                <h2 className="scripts-list__title">Scripts</h2>
                <div className="scripts-list__filters">
                    <input
                        type="text"
                        className="scripts-list__search"
                        placeholder="Rechercher un script..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <Select
                        options={[
                            { value: '', label: 'Toutes les catégories' },
                            ...categories
                        ]}
                        value={selectedCategory}
                        onChange={setSelectedCategory}
                        placeholder="Filtrer par catégorie"
                        className="scripts-list__category-filter"
                    />
                </div>
            </div>
            <div className="scripts-list__content">
                {filteredScripts.length === 0 ? (
                    <div className="scripts-list__empty">
                        Aucun script trouvé
                    </div>
                ) : (
                    filteredScripts.map(script => (
                        <div
                            key={script.id}
                            className={`
                                scripts-list__item
                                ${selectedScript?.id === script.id ? 'scripts-list__item--selected' : ''}
                            `.trim()}
                            onClick={() => onScriptSelect(script)}
                        >
                            <div className="scripts-list__item-header">
                                <span className="scripts-list__item-name">
                                    {script.name}
                                </span>
                                <Button
                                    variant="secondary"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onScriptRun(script);
                                    }}
                                    disabled={loading}
                                    icon={<span className="codicon codicon-play" />}
                                >
                                    Exécuter
                                </Button>
                            </div>
                            <p className="scripts-list__item-description">
                                {script.description}
                            </p>
                            <div className="scripts-list__item-meta">
                                <span className="scripts-list__item-category">
                                    {script.category}
                                </span>
                                <span className="scripts-list__item-path">
                                    {script.path}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
