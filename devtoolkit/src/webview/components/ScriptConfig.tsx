import React, { useState, useEffect } from 'react';
import { Input } from './Common/Input';
import { Select } from './Common/Select';
import { Button } from './Common/Button';
import './ScriptConfig.css';

interface ConfigField {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    label: string;
    description?: string;
    required?: boolean;
    default?: any;
    options?: { value: string; label: string }[]; // Pour le type 'select'
    validation?: {
        pattern?: string;
        min?: number;
        max?: number;
        message?: string;
    };
}

interface ScriptConfig {
    id: string;
    name: string;
    description: string;
    fields: ConfigField[];
}

export interface ScriptConfigProps {
    config?: ScriptConfig;
    onSave: (values: Record<string, any>) => void;
    onRun: () => void;
    onCancel: () => void;
    loading?: boolean;
    className?: string;
}

export const ScriptConfig: React.FC<ScriptConfigProps> = ({
    config,
    onSave,
    onRun,
    onCancel,
    loading = false,
    className = ''
}) => {
    const [values, setValues] = useState<Record<string, any>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (config) {
            // Initialiser les valeurs avec les valeurs par défaut
            const defaultValues = config.fields.reduce((acc, field) => {
                acc[field.name] = field.default !== undefined ? field.default : '';
                return acc;
            }, {} as Record<string, any>);
            setValues(defaultValues);
            setErrors({});
            setIsDirty(false);
        }
    }, [config]);

    if (!config) {
        return (
            <div className={`script-config script-config--empty ${className}`.trim()}>
                <p>Sélectionnez un script pour voir sa configuration</p>
            </div>
        );
    }

    const validateField = (field: ConfigField, value: any): string => {
        if (field.required && !value && value !== false) {
            return 'Ce champ est requis';
        }

        if (field.validation) {
            if (field.type === 'number') {
                const numValue = Number(value);
                if (field.validation.min !== undefined && numValue < field.validation.min) {
                    return `La valeur minimale est ${field.validation.min}`;
                }
                if (field.validation.max !== undefined && numValue > field.validation.max) {
                    return `La valeur maximale est ${field.validation.max}`;
                }
            }

            if (field.validation.pattern && typeof value === 'string') {
                const regex = new RegExp(field.validation.pattern);
                if (!regex.test(value)) {
                    return field.validation.message || 'Format invalide';
                }
            }
        }

        return '';
    };

    const handleChange = (name: string, value: any) => {
        setValues(prev => ({ ...prev, [name]: value }));
        setIsDirty(true);

        const field = config.fields.find(f => f.name === name);
        if (field) {
            const error = validateField(field, value);
            setErrors(prev => ({
                ...prev,
                [name]: error
            }));
        }
    };

    const handleSave = () => {
        const newErrors: Record<string, string> = {};
        let hasErrors = false;

        config.fields.forEach(field => {
            const error = validateField(field, values[field.name]);
            if (error) {
                newErrors[field.name] = error;
                hasErrors = true;
            }
        });

        setErrors(newErrors);

        if (!hasErrors) {
            onSave(values);
            setIsDirty(false);
        }
    };

    const renderField = (field: ConfigField) => {
        switch (field.type) {
            case 'boolean':
                return (
                    <Select
                        key={field.name}
                        label={field.label}
                        value={String(values[field.name])}
                        onChange={(value) => handleChange(field.name, value === 'true')}
                        error={errors[field.name]}
                        options={[
                            { value: 'true', label: 'Oui' },
                            { value: 'false', label: 'Non' }
                        ]}
                    />
                );
            case 'select':
                return (
                    <Select
                        key={field.name}
                        label={field.label}
                        value={values[field.name]}
                        onChange={(value) => handleChange(field.name, value)}
                        error={errors[field.name]}
                        options={field.options || []}
                    />
                );
            case 'number':
                return (
                    <Input
                        key={field.name}
                        type="number"
                        label={field.label}
                        value={values[field.name]}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        error={errors[field.name]}
                    />
                );
            default:
                return (
                    <Input
                        key={field.name}
                        type="text"
                        label={field.label}
                        value={values[field.name]}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        error={errors[field.name]}
                    />
                );
        }
    };

    return (
        <div className={`script-config ${className}`.trim()}>
            <div className="script-config__header">
                <h2 className="script-config__title">{config.name}</h2>
                <p className="script-config__description">{config.description}</p>
            </div>
            <div className="script-config__content">
                {config.fields.map(field => (
                    <div key={field.name} className="script-config__field">
                        {renderField(field)}
                        {field.description && (
                            <p className="script-config__field-description">
                                {field.description}
                            </p>
                        )}
                    </div>
                ))}
            </div>
            <div className="script-config__actions">
                <Button
                    variant="primary"
                    onClick={onRun}
                    disabled={loading || Object.keys(errors).length > 0}
                    loading={loading}
                    icon={<span className="codicon codicon-play" />}
                >
                    Exécuter
                </Button>
                <Button
                    variant="secondary"
                    onClick={handleSave}
                    disabled={!isDirty || loading}
                >
                    Sauvegarder
                </Button>
                <Button
                    variant="secondary"
                    onClick={onCancel}
                    disabled={loading}
                >
                    Annuler
                </Button>
            </div>
        </div>
    );
};
