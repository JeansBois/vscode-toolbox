import React, { useEffect } from 'react';
import { createFormContext, FormField as FormFieldDef, Validator } from '../../utils/formContext';
import { FormField } from './FormField';
import { FieldConfig } from './FormField';
import { FieldGroup } from './FieldGroup';
import './Form.css';

/**
 * Form group configuration
 */
export interface FormGroupConfig {
  /** Group title */
  title?: string;
  /** Group description */
  description?: string;
  /** Fields in this group */
  fields: FieldConfig[];
  /** Whether group is collapsible */
  collapsible?: boolean;
  /** Whether group is expanded by default (when collapsible) */
  defaultExpanded?: boolean;
}

/**
 * Form component props
 */
export interface FormProps<T extends Record<string, any>> {
  /** Initial values for the form */
  initialValues: T;
  /** Field configurations */
  fields?: FieldConfig[];
  /** Group configurations */
  groups?: FormGroupConfig[];
  /** Callback when form is submitted */
  onSubmit: (values: T) => void;
  /** Custom validator function for form */
  validate?: (values: T) => Record<string, string | undefined>;
  /* isSubmitting prop removed - unused */
  /** CSS class for the form */
  className?: string;
  /** Children components to render inside the form */
  children?: React.ReactNode;
}

/**
 * Create a typed form context for the form
 */
function createTypedFormContext<T extends Record<string, any>>() {
  return createFormContext<T>();
}

/**
 * Form component
 * 
 * A flexible form component that can handle both grouped and ungrouped fields,
 * with built-in validation and state management.
 * 
 * @example
 * ```tsx
 * <Form
 *   initialValues={{ name: '', email: '' }}
 *   fields={[
 *     { name: 'name', type: 'string', label: 'Name', required: true },
 *     { name: 'email', type: 'string', label: 'Email', required: true }
 *   ]}
 *   onSubmit={handleSubmit}
 * />
 * ```
 */
export function Form<T extends Record<string, any>>(props: FormProps<T>) {
  const { FormProvider, useForm } = createTypedFormContext<T>();
  
  const {
    initialValues,
    fields = [],
    groups = [],
    onSubmit,
    validate,
    className = '',
    children,
  } = props;
  
  // Convert field configs to form field definitions
  const formFields: FormFieldDef[] = [...fields, ...groups.flatMap(group => group.fields)].map(fieldConfig => {
    const validators: Validator[] = [];
    
    // Add required validator
    if (fieldConfig.required) {
      validators.push((value) => {
        if (value === undefined || value === null || value === '') {
          return 'This field is required';
        }
        return undefined;
      });
    }
    
    // Add validation from field config
    if (fieldConfig.validation) {
      if (fieldConfig.validation.pattern) {
        validators.push((value) => {
          if (typeof value === 'string') {
            const regex = new RegExp(fieldConfig.validation!.pattern!);
            if (!regex.test(value)) {
              return fieldConfig.validation!.message || 'Invalid format';
            }
          }
          return undefined;
        });
      }
      
      if (fieldConfig.validation.min !== undefined) {
        validators.push((value) => {
          if (typeof value === 'number' && value < fieldConfig.validation!.min!) {
            return `Minimum value is ${fieldConfig.validation!.min}`;
          }
          return undefined;
        });
      }
      
      if (fieldConfig.validation.max !== undefined) {
        validators.push((value) => {
          if (typeof value === 'number' && value > fieldConfig.validation!.max!) {
            return `Maximum value is ${fieldConfig.validation!.max}`;
          }
          return undefined;
        });
      }
    }
    
    return {
      name: fieldConfig.name,
      initialValue: fieldConfig.default,
      required: fieldConfig.required,
      validators,
    };
  });

  /**
   * Inner form component that uses the form context
   */
  const InnerForm = () => {
    const form = useForm();
    
    // Add custom validation if provided
    useEffect(() => {
      if (validate) {
        const errors = validate(form.values);
        Object.entries(errors).forEach(([key, error]) => {
          if (error) {
            form.setFieldTouched(key as keyof T, true);
          }
        });
      }
    }, [form.values, validate]);
    
    // Handle form submission
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      const isValid = form.validateForm();
      if (isValid) {
        onSubmit(form.values);
      }
    };
    
    return (
      <form className={`vscode-form ${className}`} onSubmit={handleSubmit} noValidate>
        {/* Render ungrouped fields */}
        {fields.length > 0 && (
          <div className="vscode-form__fields">
            {fields.map(field => (
              <FormField
                key={field.name}
                field={field}
                value={form.values[field.name]}
                error={form.errors[field.name]}
                onChange={(value) => form.setFieldValue(field.name, value)}
                onBlur={() => form.setFieldTouched(field.name)}
              />
            ))}
          </div>
        )}
        
        {/* Render grouped fields */}
        {groups.map((group, index) => (
          <FieldGroup
            key={index}
            title={group.title}
            description={group.description}
            collapsible={group.collapsible}
            defaultExpanded={group.defaultExpanded}
          >
            {group.fields.map(field => (
              <FormField
                key={field.name}
                field={field}
                value={form.values[field.name]}
                error={form.errors[field.name]}
                onChange={(value) => form.setFieldValue(field.name, value)}
                onBlur={() => form.setFieldTouched(field.name)}
              />
            ))}
          </FieldGroup>
        ))}
        
        {/* Render children (usually buttons) */}
        {children && (
          <div className="vscode-form__actions">
            {children}
          </div>
        )}
      </form>
    );
  };
  
  return (
    <FormProvider
      initialValues={initialValues}
      fields={formFields}
      onSubmit={onSubmit}
    >
      <InnerForm />
    </FormProvider>
  );
}
