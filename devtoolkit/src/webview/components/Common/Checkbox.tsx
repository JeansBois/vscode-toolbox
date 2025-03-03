import React, { forwardRef } from 'react';
import './Checkbox.css';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label?: string;
    indeterminate?: boolean;
    error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({
    label,
    indeterminate,
    error,
    className = '',
    disabled,
    checked,
    onChange,
    ...props
}, ref) => {
    const checkboxRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (checkboxRef.current) {
            checkboxRef.current.indeterminate = indeterminate || false;
        }
    }, [indeterminate]);

    const handleRef = (element: HTMLInputElement | null) => {
        checkboxRef.current = element;
        if (typeof ref === 'function') {
            ref(element);
        } else if (ref) {
            ref.current = element;
        }
    };

    const containerClass = `
        vscode-checkbox
        ${indeterminate ? 'vscode-checkbox--indeterminate' : ''}
        ${error ? 'vscode-checkbox--error' : ''}
        ${disabled ? 'vscode-checkbox--disabled' : ''}
        ${className}
    `.trim();

    return (
        <label className={containerClass}>
            <div className="vscode-checkbox__input-wrapper">
                <input
                    {...props}
                    type="checkbox"
                    ref={handleRef}
                    checked={checked}
                    disabled={disabled}
                    onChange={onChange}
                    className="vscode-checkbox__input"
                />
                <span className="vscode-checkbox__checkmark">
                    {checked && !indeterminate && (
                        <span className="codicon codicon-check" />
                    )}
                    {indeterminate && (
                        <span className="codicon codicon-dash" />
                    )}
                </span>
            </div>
            {label && (
                <span className="vscode-checkbox__label">
                    {label}
                </span>
            )}
            {error && (
                <span className="vscode-checkbox__error">
                    {error}
                </span>
            )}
        </label>
    );
});

Checkbox.displayName = 'Checkbox';
