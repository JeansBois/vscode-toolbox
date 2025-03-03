import React, { forwardRef } from 'react';
import './Input.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    startIcon?: React.ReactNode;
    endIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
    label,
    error,
    hint,
    startIcon,
    endIcon,
    className = '',
    disabled,
    ...props
}, ref) => {
    const inputWrapperClass = `
        vscode-input-wrapper
        ${error ? 'vscode-input-wrapper--error' : ''}
        ${disabled ? 'vscode-input-wrapper--disabled' : ''}
        ${className}
    `.trim();

    const inputClass = `
        vscode-input
        ${startIcon ? 'vscode-input--with-start-icon' : ''}
        ${endIcon ? 'vscode-input--with-end-icon' : ''}
    `.trim();

    return (
        <div className={inputWrapperClass}>
            {label && (
                <label className="vscode-input__label">
                    {label}
                </label>
            )}
            <div className="vscode-input__container">
                {startIcon && (
                    <span className="vscode-input__icon vscode-input__icon--start">
                        {startIcon}
                    </span>
                )}
                <input
                    ref={ref}
                    className={inputClass}
                    disabled={disabled}
                    {...props}
                />
                {endIcon && (
                    <span className="vscode-input__icon vscode-input__icon--end">
                        {endIcon}
                    </span>
                )}
            </div>
            {(error || hint) && (
                <span className={`vscode-input__message ${error ? 'vscode-input__message--error' : ''}`}>
                    {error || hint}
                </span>
            )}
        </div>
    );
});

Input.displayName = 'Input';
