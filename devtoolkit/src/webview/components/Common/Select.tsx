import React, { forwardRef, useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../../utils/themeContext';
import { FormControlBaseProps } from './Input';
import './Select.css';

/**
 * Select option interface
 */
export interface SelectOption {
  /** Option value (used internally) */
  value: string;
  /** Option label (displayed to user) */
  label: string;
  /** Optional group name for grouped options */
  group?: string;
  /** Whether the option is disabled */
  disabled?: boolean;
}

/**
 * Select component props
 */
export interface SelectProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>, FormControlBaseProps {
  /** Array of options to display */
  options: SelectOption[];
  /** Currently selected value */
  value?: string;
  /** Callback when value changes */
  onChange?: (value: string) => void;
  /** Placeholder text when no option is selected */
  placeholder?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether users can search/filter options */
  searchable?: boolean;
  /** Whether the field takes full width of container */
  fullWidth?: boolean;
  /** Maximum height of dropdown in pixels */
  maxDropdownHeight?: number;
  /** Whether to show select in error state */
  error?: string;
  /** Help text to display below the select */
  hint?: string;
}

/**
 * Select component
 * 
 * A dropdown select component with support for grouping, searching,
 * and keyboard navigation.
 * 
 * @example
 * ```tsx
 * <Select
 *   label="Country"
 *   options={[
 *     { value: 'us', label: 'United States' },
 *     { value: 'ca', label: 'Canada' },
 *     { value: 'mx', label: 'Mexico' }
 *   ]}
 *   value={country}
 *   onChange={setCountry}
 * />
 * ```
 */
export const Select = forwardRef<HTMLDivElement, SelectProps>(({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  error,
  hint,
  disabled = false,
  searchable = false,
  fullWidth = false,
  required = false,
  maxDropdownHeight = 250,
  id: providedId,
  className = '',
  ...props
}, ref) => {
  useTheme(); // Required hook call but theme value not directly used
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionsRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  // Generate unique ID if not provided
  const id = providedId || `select-${Math.random().toString(36).substr(2, 9)}`;
  const labelId = `${id}-label`;
  const listboxId = `${id}-listbox`;
  const ariaDescribedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  // Find the selected option
  const selectedOption = options.find(opt => opt.value === value);
  
  // Group options if needed
  const groupedOptions = options.reduce((acc, option) => {
    const group = option.group || '';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(option);
    return acc;
  }, {} as Record<string, SelectOption[]>);

  // Filter options based on search term
  const filteredOptions = Object.entries(groupedOptions).reduce((acc, [group, opts]) => {
    const filtered = opts.filter(opt => 
      opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[group] = filtered;
    }
    return acc;
  }, {} as Record<string, SelectOption[]>);

  // Convert grouped options to flat array for keyboard navigation
  const flattenedOptions = Object.values(filteredOptions).flat();

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedOptionIndex >= 0 && focusedOptionIndex < optionsRefs.current.length) {
      const focusedOption = optionsRefs.current[focusedOptionIndex];
      if (focusedOption && dropdownRef.current) {
        const dropdownRect = dropdownRef.current.getBoundingClientRect();
        const optionRect = focusedOption.getBoundingClientRect();
        
        // Check if the option is outside the visible area
        if (optionRect.bottom > dropdownRect.bottom) {
          // Below the visible area
          dropdownRef.current.scrollTop += optionRect.bottom - dropdownRect.bottom;
        } else if (optionRect.top < dropdownRect.top) {
          // Above the visible area
          dropdownRef.current.scrollTop -= dropdownRect.top - optionRect.top;
        }
      }
    }
  }, [focusedOptionIndex, isOpen]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Set up keyboard handling
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          setIsOpen(false);
          setSearchTerm('');
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusedOptionIndex(prev => 
            prev < flattenedOptions.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusedOptionIndex(prev => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          event.preventDefault();
          if (focusedOptionIndex >= 0 && focusedOptionIndex < flattenedOptions.length) {
            handleSelect(flattenedOptions[focusedOptionIndex]);
          }
          break;
        case 'Tab':
          setIsOpen(false);
          setSearchTerm('');
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, focusedOptionIndex, flattenedOptions]);

  // Reset focused option when options change
  useEffect(() => {
    if (isOpen) {
      setFocusedOptionIndex(
        flattenedOptions.findIndex(opt => opt.value === value) || 0
      );
    }
  }, [isOpen, flattenedOptions, value]);

  // Handle option selection
  const handleSelect = useCallback((option: SelectOption) => {
    if (option.disabled) return;
    
    onChange?.(option.value);
    setIsOpen(false);
    setSearchTerm('');
    
    // Return focus to the select trigger
    if (containerRef.current) {
      const trigger = containerRef.current.querySelector('.vscode-select__value');
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
    }
  }, [onChange]);

  // Toggle dropdown
  const toggleDropdown = () => {
    if (disabled) return;
    
    const newIsOpen = !isOpen;
    setIsOpen(newIsOpen);
    
    if (newIsOpen) {
      // Set initial focus when opening
      setFocusedOptionIndex(
        flattenedOptions.findIndex(opt => opt.value === value) || 0
      );
      
      if (searchable) {
        // Focus search input when dropdown opens with search
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    } else {
      setSearchTerm('');
    }
  };

  // Handle selection via keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    
    switch (e.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          
          // Set initial focus
          setFocusedOptionIndex(
            flattenedOptions.findIndex(opt => opt.value === value) || 0
          );
          
          if (searchable) {
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }
        break;
    }
  };

  // Classes
  const containerClass = `
    vscode-select-wrapper
    ${fullWidth ? 'vscode-select-wrapper--full-width' : ''}
    ${className}
  `.trim();
  
  const selectClass = `
    vscode-select
    ${isOpen ? 'vscode-select--open' : ''}
    ${error ? 'vscode-select--error' : ''}
    ${disabled ? 'vscode-select--disabled' : ''}
  `.trim();

  return (
    <div ref={containerRef} className={containerClass} {...props}>
      {label && (
        <label 
          id={labelId}
          className="vscode-select__label" 
          htmlFor={id}
        >
          {label}
          {required && <span className="vscode-select__required" aria-hidden="true"> *</span>}
        </label>
      )}
      
      <div
        ref={ref}
        id={id}
        className={selectClass}
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={ariaDescribedBy}
        tabIndex={disabled ? -1 : 0}
      >
        <div className="vscode-select__value">
          {searchable && isOpen ? (
            <input
              ref={inputRef}
              className="vscode-select__search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Search..."
              aria-controls={listboxId}
              autoComplete="off"
            />
          ) : (
            <span className={!selectedOption ? 'vscode-select__placeholder' : ''}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          )}
          <span 
            className={`codicon codicon-chevron-${isOpen ? 'up' : 'down'}`} 
            aria-hidden="true" 
          />
        </div>
        
        {isOpen && (
          <div 
            ref={dropdownRef}
            className="vscode-select__dropdown"
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            style={{ maxHeight: `${maxDropdownHeight}px` }}
          >
            {Object.entries(filteredOptions).map(([group, opts], groupIndex) => {
              let optionOffset = 0;
              // Calculate offset for this group
              if (groupIndex > 0) {
                for (let i = 0; i < groupIndex; i++) {
                  const prevGroup = Object.values(filteredOptions)[i];
                  optionOffset += prevGroup.length;
                }
              }
              
              return (
                <div key={group || 'default'} role="group" aria-label={group || undefined}>
                  {group && <div className="vscode-select__group-label">{group}</div>}
                  
                  {opts.map((option, index) => {
                    const absoluteIndex = optionOffset + index;
                    const isSelected = option.value === value;
                    const isFocused = absoluteIndex === focusedOptionIndex;
                    
                    return (
                      <div
                        ref={(el) => {
                          optionsRefs.current[absoluteIndex] = el;
                        }}
                        key={option.value}
                        className={`
                          vscode-select__option
                          ${isSelected ? 'vscode-select__option--selected' : ''}
                          ${option.disabled ? 'vscode-select__option--disabled' : ''}
                          ${isFocused ? 'vscode-select__option--focused' : ''}
                        `.trim()}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!option.disabled) {
                            handleSelect(option);
                          }
                        }}
                        onMouseEnter={() => {
                          if (!option.disabled) {
                            setFocusedOptionIndex(absoluteIndex);
                          }
                        }}
                      >
                        {option.label}
                        {isSelected && (
                          <span className="vscode-select__selected-icon" aria-hidden="true">
                            <span className="codicon codicon-check" />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            
            {Object.keys(filteredOptions).length === 0 && (
              <div className="vscode-select__no-results">
                No results found
              </div>
            )}
          </div>
        )}
      </div>
      
      {(error || hint) && (
        <div 
          className={`vscode-select__message ${error ? 'vscode-select__message--error' : ''}`}
          id={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        >
          {error || hint}
        </div>
      )}
    </div>
  );
});

Select.displayName = 'Select';
