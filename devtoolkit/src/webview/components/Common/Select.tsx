import React, { forwardRef, useState, useRef, useEffect } from 'react';
import './Select.css';

export interface SelectOption {
    value: string;
    label: string;
    group?: string;
}

export interface SelectProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
    options: SelectOption[];
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    label?: string;
    error?: string;
    disabled?: boolean;
    searchable?: boolean;
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(({
    options,
    value,
    onChange,
    placeholder = 'Sélectionner...',
    label,
    error,
    disabled,
    searchable = false,
    className = '',
    ...props
}, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(opt => opt.value === value);
    
    // Grouper les options si nécessaire
    const groupedOptions = options.reduce((acc, option) => {
        const group = option.group || '';
        if (!acc[group]) {
            acc[group] = [];
        }
        acc[group].push(option);
        return acc;
    }, {} as Record<string, SelectOption[]>);

    const filteredOptions = Object.entries(groupedOptions).reduce((acc, [group, opts]) => {
        const filtered = opts.filter(opt => 
            opt.label.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (filtered.length > 0) {
            acc[group] = filtered;
        }
        return acc;
    }, {} as Record<string, SelectOption[]>);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (option: SelectOption) => {
        onChange?.(option.value);
        setIsOpen(false);
        setSearchTerm('');
    };

    const toggleDropdown = () => {
        if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen && searchable) {
                setTimeout(() => inputRef.current?.focus(), 0);
            }
        }
    };

    const containerClass = `
        vscode-select
        ${isOpen ? 'vscode-select--open' : ''}
        ${error ? 'vscode-select--error' : ''}
        ${disabled ? 'vscode-select--disabled' : ''}
        ${className}
    `.trim();

    return (
        <div ref={containerRef} className="vscode-select-wrapper" {...props}>
            {label && (
                <label className="vscode-select__label">
                    {label}
                </label>
            )}
            <div
                ref={ref}
                className={containerClass}
                onClick={toggleDropdown}
            >
                <div className="vscode-select__value">
                    {searchable && isOpen ? (
                        <input
                            ref={inputRef}
                            className="vscode-select__search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Rechercher..."
                        />
                    ) : (
                        <span className={!selectedOption ? 'vscode-select__placeholder' : ''}>
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                    )}
                    <span className={`codicon codicon-chevron-${isOpen ? 'up' : 'down'}`} />
                </div>
                {isOpen && (
                    <div className="vscode-select__dropdown">
                        {Object.entries(filteredOptions).map(([group, opts]) => (
                            <div key={group || 'default'}>
                                {group && <div className="vscode-select__group-label">{group}</div>}
                                {opts.map((option) => (
                                    <div
                                        key={option.value}
                                        className={`
                                            vscode-select__option
                                            ${option.value === value ? 'vscode-select__option--selected' : ''}
                                        `.trim()}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelect(option);
                                        }}
                                    >
                                        {option.label}
                                    </div>
                                ))}
                            </div>
                        ))}
                        {Object.keys(filteredOptions).length === 0 && (
                            <div className="vscode-select__no-results">
                                Aucun résultat
                            </div>
                        )}
                    </div>
                )}
            </div>
            {error && (
                <span className="vscode-select__error">
                    {error}
                </span>
            )}
        </div>
    );
});

Select.displayName = 'Select';
