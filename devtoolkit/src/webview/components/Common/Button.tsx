import React, { forwardRef } from 'react';
import { useTheme } from '../../utils/themeContext';
import './Button.css';

/**
 * Button variants
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';

/**
 * Button sizes
 */
export type ButtonSize = 'small' | 'medium' | 'large';

/**
 * Button props interface
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button style variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Loading state - shows a spinner and disables the button */
  loading?: boolean;
  /** Icon element to display before button text */
  startIcon?: React.ReactNode;
  /** Icon element to display after button text */
  endIcon?: React.ReactNode;
  /** Whether to make the button take full width of its container */
  fullWidth?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Button component
 * 
 * A versatile button component with multiple variants, sizes, and states.
 * Includes proper accessibility attributes and loading states.
 * 
 * @example
 * ```tsx
 * <Button variant="primary" onClick={handleClick}>Click me</Button>
 * <Button variant="secondary" disabled>Disabled</Button>
 * <Button loading startIcon={<Icon />}>Loading</Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = 'primary',
  size = 'medium',
  loading = false,
  startIcon,
  endIcon,
  fullWidth = false,
  className = '',
  disabled,
  type = 'button',
  onClick,
  ...props
}, ref) => {
  useTheme(); // Required hook call but theme value not directly used
  
  // Combine all classes
  const buttonClass = `
    vscode-button
    vscode-button--${variant}
    vscode-button--${size}
    ${loading ? 'vscode-button--loading' : ''}
    ${fullWidth ? 'vscode-button--full-width' : ''}
    ${className}
  `.trim();

  // Handle click with loading state
  const handleClick = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    if (loading || disabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <button
      ref={ref}
      className={buttonClass}
      disabled={disabled || loading}
      type={type}
      onClick={handleClick}
      aria-busy={loading}
      {...props}
    >
      {loading && (
        <span className="vscode-button__spinner" aria-hidden="true">
          <span className="codicon codicon-loading codicon-modifier-spin" />
        </span>
      )}
      
      {!loading && startIcon && (
        <span className="vscode-button__icon vscode-button__icon--start" aria-hidden="true">
          {startIcon}
        </span>
      )}
      
      <span className="vscode-button__text">{children}</span>
      
      {!loading && endIcon && (
        <span className="vscode-button__icon vscode-button__icon--end" aria-hidden="true">
          {endIcon}
        </span>
      )}
    </button>
  );
});

Button.displayName = 'Button';
