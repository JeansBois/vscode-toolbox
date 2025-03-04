import React, { forwardRef, useState, InputHTMLAttributes } from 'react';
import { useTheme } from '../../utils/themeContext';
import './Input.css';

/**
 * Common form control base props shared across form components
 */
export interface FormControlBaseProps {
  /** Input label */
  label?: string;
  /** Error message to display */
  error?: string;
  /** Helper text to display below the input */
  hint?: string;
  /** Whether the field is required */
  required?: boolean;
  /** ID for the input, auto-generated if not provided */
  id?: string;
}

/**
 * Input component props
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FormControlBaseProps {
  /** Icon to display at the start of the input */
  startIcon?: React.ReactNode;
  /** Icon to display at the end of the input */
  endIcon?: React.ReactNode;
  /** Whether the field takes the full width of its container */
  fullWidth?: boolean;
  /** Content to display after the input (like units) */
  adornment?: React.ReactNode;
  /** Shows a clear button when the input has a value */
  clearable?: boolean;
  /** Callback when clear button is clicked */
  onClear?: () => void;
}

/**
 * Input component
 * 
 * A versatile input component with support for various input types,
 * icons, validation states, and accessibility features.
 * 
 * @example
 * ```tsx
 * <Input 
 *   label="Username" 
 *   required 
 *   startIcon={<UserIcon />} 
 *   placeholder="Enter username"
 * />
 * <Input
 *   type="password"
 *   label="Password"
 *   error="Password must be at least 8 characters"
 * />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  startIcon,
  endIcon,
  required = false,
  disabled = false,
  fullWidth = false,
  adornment,
  clearable = false,
  onClear,
  className = '',
  id: providedId,
  type = 'text',
  onChange,
  onFocus,
  onBlur,
  value,
  defaultValue,
  ...props
}, ref) => {
  useTheme(); // Required hook call but theme value not directly used
  const [focused, setFocused] = useState(false);
  const [inputValue, setInputValue] = useState(value || defaultValue || '');
  
  // Generate unique ID if not provided
  const id = providedId || `input-${Math.random().toString(36).substr(2, 9)}`;
  const ariaDescribedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  
  // Determine if the input has a value (for showing clear button)
  const hasValue = inputValue !== '';
  
  // Combine container classes
  const containerClass = `
    vscode-input-wrapper
    ${error ? 'vscode-input-wrapper--error' : ''}
    ${disabled ? 'vscode-input-wrapper--disabled' : ''}
    ${focused ? 'vscode-input-wrapper--focused' : ''}
    ${fullWidth ? 'vscode-input-wrapper--full-width' : ''}
    ${className}
  `.trim();
  
  // Combine input classes
  const inputClass = `
    vscode-input
    ${startIcon ? 'vscode-input--with-start-icon' : ''}
    ${(endIcon || (clearable && hasValue)) ? 'vscode-input--with-end-icon' : ''}
    ${adornment ? 'vscode-input--with-adornment' : ''}
  `.trim();

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    onChange?.(e);
  };

  // Handle focus
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    onFocus?.(e);
  };

  // Handle blur
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    onBlur?.(e);
  };

  // Handle clear button click
  const handleClear = () => {
    setInputValue('');
    onClear?.();
    
    // Create a synthetic change event
    const inputEl = document.getElementById(id) as HTMLInputElement;
    if (inputEl) {
      const event = Object.create(new Event('change', { bubbles: true }));
      Object.defineProperty(event, 'target', { writable: false, value: { value: '', id } });
      onChange?.(event as unknown as React.ChangeEvent<HTMLInputElement>);
      inputEl.focus();
    }
  };

  return (
    <div className={containerClass}>
      {label && (
        <label 
          htmlFor={id} 
          className="vscode-input__label"
        >
          {label}
          {required && <span className="vscode-input__required" aria-hidden="true"> *</span>}
        </label>
      )}
      
      <div className="vscode-input__container">
        {startIcon && (
          <span className="vscode-input__icon vscode-input__icon--start" aria-hidden="true">
            {startIcon}
          </span>
        )}
        
        <input
          ref={ref}
          id={id}
          className={inputClass}
          type={type}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={ariaDescribedBy}
          aria-required={required}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          value={value}
          defaultValue={defaultValue}
          {...props}
        />
        
        {clearable && hasValue && !disabled && (
          <button 
            type="button"
            className="vscode-input__clear-button"
            aria-label="Clear input"
            onClick={handleClear}
            tabIndex={-1}
          >
            <span className="codicon codicon-close" aria-hidden="true" />
          </button>
        )}
        
        {endIcon && !clearable && (
          <span className="vscode-input__icon vscode-input__icon--end" aria-hidden="true">
            {endIcon}
          </span>
        )}
        
        {adornment && (
          <span className="vscode-input__adornment">
            {adornment}
          </span>
        )}
      </div>
      
      {(error || hint) && (
        <div 
          className={`vscode-input__message ${error ? 'vscode-input__message--error' : ''}`}
          id={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        >
          {error || hint}
        </div>
      )}
    </div>
  );
});

Input.displayName = 'Input';
