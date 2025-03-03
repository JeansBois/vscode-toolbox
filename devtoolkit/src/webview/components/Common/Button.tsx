import React from 'react';
import './Button.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary';
    loading?: boolean;
    icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    loading = false,
    icon,
    className = '',
    disabled,
    ...props
}) => {
    const buttonClass = `
        vscode-button
        ${variant === 'primary' ? 'vscode-button--primary' : 'vscode-button--secondary'}
        ${loading ? 'vscode-button--loading' : ''}
        ${className}
    `.trim();

    return (
        <button
            className={buttonClass}
            disabled={disabled || loading}
            {...props}
        >
            {loading && (
                <span className="vscode-button__spinner">
                    <span className="codicon codicon-loading codicon-modifier-spin" />
                </span>
            )}
            {icon && !loading && (
                <span className="vscode-button__icon">{icon}</span>
            )}
            <span className="vscode-button__text">{children}</span>
        </button>
    );
};
