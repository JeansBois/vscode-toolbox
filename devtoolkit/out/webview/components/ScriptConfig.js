"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScriptConfig = void 0;
const react_1 = __importStar(require("react"));
const Input_1 = require("./Common/Input");
const Select_1 = require("./Common/Select");
const Button_1 = require("./Common/Button");
require("./ScriptConfig.css");
const ScriptConfig = ({ config, onSave, onRun, onCancel, loading = false, className = '' }) => {
    const [values, setValues] = (0, react_1.useState)({});
    const [errors, setErrors] = (0, react_1.useState)({});
    const [isDirty, setIsDirty] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (config) {
            // Initialiser les valeurs avec les valeurs par défaut
            const defaultValues = config.fields.reduce((acc, field) => {
                acc[field.name] = field.default !== undefined ? field.default : '';
                return acc;
            }, {});
            setValues(defaultValues);
            setErrors({});
            setIsDirty(false);
        }
    }, [config]);
    if (!config) {
        return (react_1.default.createElement("div", { className: `script-config script-config--empty ${className}`.trim() },
            react_1.default.createElement("p", null, "S\u00E9lectionnez un script pour voir sa configuration")));
    }
    const validateField = (field, value) => {
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
    const handleChange = (name, value) => {
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
        const newErrors = {};
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
    const renderField = (field) => {
        switch (field.type) {
            case 'boolean':
                return (react_1.default.createElement(Select_1.Select, { key: field.name, label: field.label, value: String(values[field.name]), onChange: (value) => handleChange(field.name, value === 'true'), error: errors[field.name], options: [
                        { value: 'true', label: 'Oui' },
                        { value: 'false', label: 'Non' }
                    ] }));
            case 'select':
                return (react_1.default.createElement(Select_1.Select, { key: field.name, label: field.label, value: values[field.name], onChange: (value) => handleChange(field.name, value), error: errors[field.name], options: field.options || [] }));
            case 'number':
                return (react_1.default.createElement(Input_1.Input, { key: field.name, type: "number", label: field.label, value: values[field.name], onChange: (e) => handleChange(field.name, e.target.value), error: errors[field.name] }));
            default:
                return (react_1.default.createElement(Input_1.Input, { key: field.name, type: "text", label: field.label, value: values[field.name], onChange: (e) => handleChange(field.name, e.target.value), error: errors[field.name] }));
        }
    };
    return (react_1.default.createElement("div", { className: `script-config ${className}`.trim() },
        react_1.default.createElement("div", { className: "script-config__header" },
            react_1.default.createElement("h2", { className: "script-config__title" }, config.name),
            react_1.default.createElement("p", { className: "script-config__description" }, config.description)),
        react_1.default.createElement("div", { className: "script-config__content" }, config.fields.map(field => (react_1.default.createElement("div", { key: field.name, className: "script-config__field" },
            renderField(field),
            field.description && (react_1.default.createElement("p", { className: "script-config__field-description" }, field.description)))))),
        react_1.default.createElement("div", { className: "script-config__actions" },
            react_1.default.createElement(Button_1.Button, { variant: "primary", onClick: onRun, disabled: loading || Object.keys(errors).length > 0, loading: loading, icon: react_1.default.createElement("span", { className: "codicon codicon-play" }) }, "Ex\u00E9cuter"),
            react_1.default.createElement(Button_1.Button, { variant: "secondary", onClick: handleSave, disabled: !isDirty || loading }, "Sauvegarder"),
            react_1.default.createElement(Button_1.Button, { variant: "secondary", onClick: onCancel, disabled: loading }, "Annuler"))));
};
exports.ScriptConfig = ScriptConfig;
//# sourceMappingURL=ScriptConfig.js.map