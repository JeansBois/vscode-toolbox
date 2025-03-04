import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * Validation function for a field value
 */
export type Validator<T = any> = (value: T) => string | undefined;

/**
 * Form field definition with validation
 */
export interface FormField<T = any> {
  name: string;
  initialValue?: T;
  required?: boolean;
  validators?: Validator<T>[];
}

/**
 * Form context type definition with generic value type
 */
export interface FormContextType<T extends Record<string, any>> {
  // Form state
  values: T;
  errors: Record<keyof T, string | undefined>;
  touched: Record<keyof T, boolean>;
  isDirty: boolean;
  isValid: boolean;
  
  // Field methods
  setFieldValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setFieldTouched: <K extends keyof T>(field: K, isTouched?: boolean) => void;
  getFieldProps: <K extends keyof T>(field: K) => {
    value: T[K];
    onChange: (value: T[K]) => void;
    onBlur: () => void;
    error: string | undefined;
  };
  
  // Form methods
  validateField: <K extends keyof T>(field: K) => string | undefined;
  validateForm: () => boolean;
  resetForm: (newValues?: Partial<T>) => void;
  submitForm: () => void;
}

/**
 * Form provider props
 */
interface FormProviderProps<T extends Record<string, any>> {
  initialValues: T;
  fields: FormField[];
  onSubmit: (values: T) => void;
  children: React.ReactNode;
}

/**
 * Create a form context with generic type
 */
export function createFormContext<T extends Record<string, any>>() {
  const FormContext = createContext<FormContextType<T> | undefined>(undefined);

  /**
   * Form provider component
   */
  const FormProvider: React.FC<FormProviderProps<T>> = ({ 
    initialValues, 
    fields, 
    onSubmit, 
    children 
  }) => {
    const [values, setValues] = useState<T>(initialValues);
    const [errors, setErrors] = useState<Record<keyof T, string | undefined>>({} as Record<keyof T, string | undefined>);
    const [touched, setTouched] = useState<Record<keyof T, boolean>>({} as Record<keyof T, boolean>);
    const [isDirty, setIsDirty] = useState(false);

    // Get field definition by name
    const getFieldDef = useCallback((name: string): FormField | undefined => {
      return fields.find(field => field.name === name);
    }, [fields]);

    // Validate a single field
    const validateField = useCallback(<K extends keyof T>(field: K): string | undefined => {
      const value = values[field];
      const fieldDef = getFieldDef(field as string);
      
      if (!fieldDef) return undefined;
      
      // Check required constraint
      if (fieldDef.required && (value === undefined || value === null || value === '')) {
        return 'This field is required';
      }
      
      // Run custom validators
      if (fieldDef.validators && fieldDef.validators.length > 0) {
        for (const validator of fieldDef.validators) {
          const error = validator(value);
          if (error) return error;
        }
      }
      
      return undefined;
    }, [values, getFieldDef]);

    // Validate all form fields
    const validateForm = useCallback((): boolean => {
      const newErrors: Record<keyof T, string | undefined> = {} as Record<keyof T, string | undefined>;
      let isValid = true;
      
      Object.keys(values).forEach(key => {
        const field = key as keyof T;
        const error = validateField(field);
        newErrors[field] = error;
        if (error) isValid = false;
      });
      
      setErrors(newErrors);
      return isValid;
    }, [values, validateField]);

    // Set field value with validation
    const setFieldValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
      setValues(prev => {
        const newValues = { ...prev, [field]: value };
        return newValues;
      });
      
      setErrors(prev => ({
        ...prev,
        [field]: validateField(field)
      }));
      
      setIsDirty(true);
    }, [validateField]);

    // Mark field as touched
    const setFieldTouched = useCallback(<K extends keyof T>(field: K, isTouched: boolean = true) => {
      setTouched(prev => ({
        ...prev,
        [field]: isTouched
      }));
      
      // Validate on touch
      if (isTouched) {
        setErrors(prev => ({
          ...prev,
          [field]: validateField(field)
        }));
      }
    }, [validateField]);

    // Get props for form field
    const getFieldProps = useCallback(<K extends keyof T>(field: K) => {
      return {
        value: values[field],
        onChange: (value: T[K]) => setFieldValue(field, value),
        onBlur: () => setFieldTouched(field),
        error: errors[field]
      };
    }, [values, errors, setFieldValue, setFieldTouched]);

    // Reset form
    const resetForm = useCallback((newValues?: Partial<T>) => {
      setValues(() => ({
        ...initialValues,
        ...newValues
      }));
      setErrors({} as Record<keyof T, string | undefined>);
      setTouched({} as Record<keyof T, boolean>);
      setIsDirty(false);
    }, [initialValues]);

    // Submit form
    const submitForm = useCallback(() => {
      const isValid = validateForm();
      if (isValid) {
        onSubmit(values);
        setIsDirty(false);
      }
    }, [validateForm, values, onSubmit]);

    // Check if form is currently valid
    const isValid = Object.values(errors).every(error => !error);

    const contextValue: FormContextType<T> = {
      values,
      errors,
      touched,
      isDirty,
      isValid,
      setFieldValue,
      setFieldTouched,
      getFieldProps,
      validateField,
      validateForm,
      resetForm,
      submitForm
    };

    return (
      <FormContext.Provider value={contextValue}>
        {children}
      </FormContext.Provider>
    );
  };

  /**
   * Hook to use the form context
   */
  const useForm = (): FormContextType<T> => {
    const context = useContext(FormContext);
    if (!context) {
      throw new Error('useForm must be used within a FormProvider');
    }
    return context;
  };

  return { FormProvider, useForm };
}

/**
 * Create common validators
 */
export const validators = {
  required: (message = 'This field is required'): Validator => 
    value => (!value && value !== false && value !== 0) ? message : undefined,
    
  min: (min: number, message?: string): Validator<number> => 
    value => (value < min) ? (message || `Value must be at least ${min}`) : undefined,
    
  max: (max: number, message?: string): Validator<number> => 
    value => (value > max) ? (message || `Value must be at most ${max}`) : undefined,
    
  pattern: (pattern: RegExp, message = 'Invalid format'): Validator<string> => 
    value => !pattern.test(value) ? message : undefined,
    
  email: (message = 'Invalid email address'): Validator<string> => 
    value => !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value) ? message : undefined
};
