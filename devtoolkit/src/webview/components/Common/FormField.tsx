import React from 'react';
import { Input } from './Input';
import { Select } from './Select';
import { Checkbox } from './Checkbox';
import './FormField.css';

/**
 * Common form field configuration interface
 */
export interface FieldConfig {
  /** Field name (used as form field key) */
  name: string;
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea' | 'radio' | 'custom';
  /** Display label */
  label: string;
  /** Help text description */
  description?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Default value */
  default?: any;
  /** Options for select, radio, etc. */
  options?: { value: string; label: string; disabled?: boolean }[];
  /** Validation rules */
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    message?: string;
  };
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether to show the field */
  hidden?: boolean;
  /** Custom render function for complex fields */
  renderField?: (props: FormFieldProps) => React.ReactNode;
}

/**
 * Form field props
 */
export interface FormFieldProps {
  /** Field configuration */
  field: FieldConfig;
  /** Current field value */
  value: any;
  /** Error message */
  error?: string;
  /** Callback when value changes */
  onChange: (value: any) => void;
  /** Callback when field is blurred */
  onBlur?: () => void;
  /** Additional CSS class */
  className?: string;
}

/**
 * FormField component
 * 
 * Renders the appropriate input control based on the field type configuration.
 * Acts as a bridge between field configuration and form UI components.
 * 
 * @example
 * ```tsx
 * <FormField
 *   field={{ 
 *     name: 'email', 
 *     type: 'string', 
 *     label: 'Email Address',
 *     required: true 
 *   }}
 *   value={email}
 *   onChange={setEmail}
 *   error={errors.email}
 * />
 * ```
 */
export const FormField: React.FC<FormFieldProps> = ({
  field,
  value,
  error,
  onChange,
  onBlur,
  className = '',
}) => {
  // If field has custom renderer, use it
  if (field.renderField) {
    return field.renderField({
      field,
      value,
      error,
      onChange,
      onBlur,
      className,
    });
  }

  // Handle hidden fields
  if (field.hidden) {
    return null;
  }

  // Description element (shared across field types)
  const Description = field.description ? (
    <div className="vscode-form-field__description" id={`${field.name}-description`}>
      {field.description}
    </div>
  ) : null;

  const fieldClassName = `vscode-form-field ${className}`;
  const describedBy = field.description ? `${field.name}-description` : undefined;

  // Render different field types
  switch (field.type) {
    case 'boolean':
      return (
        <div className="vscode-form-field-wrapper">
          <Checkbox
            id={field.name}
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            label={field.label}
            error={error}
            required={field.required}
            disabled={field.disabled}
            onBlur={onBlur}
            aria-describedby={describedBy}
            className={fieldClassName}
          />
          {Description}
        </div>
      );

    case 'select':
      return (
        <div className="vscode-form-field-wrapper">
          <Select
            id={field.name}
            value={String(value)}
            onChange={(val) => onChange(val)}
            options={field.options || []}
            label={field.label}
            error={error}
            required={field.required}
            disabled={field.disabled}
            onBlur={onBlur}
            aria-describedby={describedBy}
            className={fieldClassName}
            fullWidth
          />
          {Description}
        </div>
      );

    case 'number':
      return (
        <div className="vscode-form-field-wrapper">
          <Input
            id={field.name}
            type="number"
            value={value || ''}
            onChange={(e) => {
              const val = e.target.value;
              onChange(val === '' ? '' : Number(val));
            }}
            label={field.label}
            min={field.validation?.min}
            max={field.validation?.max}
            error={error}
            required={field.required}
            disabled={field.disabled}
            onBlur={onBlur}
            aria-describedby={describedBy}
            className={fieldClassName}
            fullWidth
          />
          {Description}
        </div>
      );

    case 'textarea':
      return (
        <div className="vscode-form-field-wrapper">
          <div className={error ? 'vscode-input-wrapper vscode-input-wrapper--error' : 'vscode-input-wrapper'}>
            {field.label && (
              <label htmlFor={field.name} className="vscode-input__label">
                {field.label}
                {field.required && <span className="vscode-input__required"> *</span>}
              </label>
            )}
            <textarea
              id={field.name}
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              className="vscode-textarea"
              rows={5}
              required={field.required}
              disabled={field.disabled}
              onBlur={onBlur}
              aria-invalid={!!error}
              aria-describedby={describedBy}
            />
            {error && <div className="vscode-input__message vscode-input__message--error">{error}</div>}
          </div>
          {Description}
        </div>
      );

    default: // string is the default type
      return (
        <div className="vscode-form-field-wrapper">
          <Input
            id={field.name}
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            label={field.label}
            error={error}
            required={field.required}
            disabled={field.disabled}
            onBlur={onBlur}
            aria-describedby={describedBy}
            className={fieldClassName}
            fullWidth
          />
          {Description}
        </div>
      );
  }
};
