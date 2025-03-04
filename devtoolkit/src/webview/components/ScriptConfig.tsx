import React, { useState, useEffect } from 'react';
import { Form } from './Common/Form';
import { Button } from './Common/Button';
import { FieldConfig } from './Common/FormField';
import { useTheme } from '../utils/themeContext';
import './ScriptConfig.css';

/**
 * Script config field definition
 */
export interface ConfigField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  options?: { value: string; label: string }[];
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    message?: string;
  };
}

/**
 * Script configuration interface
 */
export interface ScriptConfig {
  id: string;
  name: string;
  description: string;
  fields: ConfigField[];
}

/**
 * Script config component props
 */
export interface ScriptConfigProps {
  /** Script configuration */
  config?: ScriptConfig;
  /** Save handler */
  onSave: (values: Record<string, any>) => void;
  /** Run script handler */
  onRun: () => void;
  /** Cancel handler */
  onCancel: () => void;
  /** Loading state */
  loading?: boolean;
  /** Additional class name */
  className?: string;
}

/**
 * ScriptConfig Component
 * 
 * This component displays and manages the configuration for a selected script,
 * handling form validation, state, and submission.
 */
export const ScriptConfig: React.FC<ScriptConfigProps> = ({
  config,
  onSave,
  onRun,
  onCancel,
  loading = false,
  className = ''
}) => {
  useTheme(); // Required hook call but theme value not directly used
  const [isDirty, setIsDirty] = useState(false);
  const [values, setValues] = useState<Record<string, any>>({});

  // Convert config fields to FieldConfig format
  const mapConfigToFormFields = (config?: ScriptConfig): FieldConfig[] => {
    if (!config) return [];
    
    return config.fields.map(field => ({
      name: field.name,
      type: field.type,
      label: field.label,
      description: field.description,
      required: field.required,
      default: field.default,
      options: field.options,
      validation: field.validation,
    }));
  };

  // Create form fields from config
  const formFields = mapConfigToFormFields(config);
  
  // Generate initial values from field defaults
  useEffect(() => {
    if (config) {
      const initialValues = config.fields.reduce((acc, field) => {
        acc[field.name] = field.default !== undefined ? field.default : '';
        return acc;
      }, {} as Record<string, any>);
      
      setValues(initialValues);
      setIsDirty(false);
    }
  }, [config]);

  // Handle form submission
  const handleSave = (formValues: Record<string, any>) => {
    onSave(formValues);
    setIsDirty(false);
  };
  
  // handleFormChange is removed as it's not being used anywhere

  // If no config is selected, show placeholder
  if (!config) {
    return (
      <div className={`script-config script-config--empty ${className}`.trim()}>
        <p>Select a script to view its configuration</p>
      </div>
    );
  }

  return (
    <div className={`script-config ${className}`.trim()}>
      <div className="script-config__header">
        <h2 className="script-config__title">{config.name}</h2>
        <p className="script-config__description">{config.description}</p>
      </div>
      
      <div className="script-config__content">
        <Form
          initialValues={values}
          fields={formFields}
          onSubmit={handleSave}
        >
          <div className="script-config__actions">
            <Button
              variant="primary"
              onClick={() => {
                // Run with current values
                onRun();
              }}
              disabled={loading || Object.keys(values).length === 0}
              loading={loading}
              startIcon={<span className="codicon codicon-play" />}
              type="button"
            >
              Execute
            </Button>
            
            <Button
              variant="secondary"
              onClick={() => {
                // Only save if form is dirty
                if (isDirty) {
                  handleSave(values);
                }
              }}
              disabled={!isDirty || loading}
              type="button"
            >
              Save
            </Button>
            
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={loading}
              type="button"
            >
              Cancel
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
};
