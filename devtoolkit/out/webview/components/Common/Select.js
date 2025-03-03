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
exports.Select = void 0;
const react_1 = __importStar(require("react"));
require("./Select.css");
exports.Select = (0, react_1.forwardRef)(({ options, value, onChange, placeholder = 'Sélectionner...', label, error, disabled, searchable = false, className = '', ...props }, ref) => {
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const [searchTerm, setSearchTerm] = (0, react_1.useState)('');
    const containerRef = (0, react_1.useRef)(null);
    const inputRef = (0, react_1.useRef)(null);
    const selectedOption = options.find(opt => opt.value === value);
    // Grouper les options si nécessaire
    const groupedOptions = options.reduce((acc, option) => {
        const group = option.group || '';
        if (!acc[group]) {
            acc[group] = [];
        }
        acc[group].push(option);
        return acc;
    }, {});
    const filteredOptions = Object.entries(groupedOptions).reduce((acc, [group, opts]) => {
        const filtered = opts.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));
        if (filtered.length > 0) {
            acc[group] = filtered;
        }
        return acc;
    }, {});
    (0, react_1.useEffect)(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const handleSelect = (option) => {
        onChange?.(option.value);
        setIsOpen(false);
        setSearchTerm('');
    };
    const toggleDropdown = () => {
        if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen && searchable) {
                setTimeout(() => inputRef.current?.focus(), 0);
            }
        }
    };
    const containerClass = `
        vscode-select
        ${isOpen ? 'vscode-select--open' : ''}
        ${error ? 'vscode-select--error' : ''}
        ${disabled ? 'vscode-select--disabled' : ''}
        ${className}
    `.trim();
    return (react_1.default.createElement("div", { ref: containerRef, className: "vscode-select-wrapper", ...props },
        label && (react_1.default.createElement("label", { className: "vscode-select__label" }, label)),
        react_1.default.createElement("div", { ref: ref, className: containerClass, onClick: toggleDropdown },
            react_1.default.createElement("div", { className: "vscode-select__value" },
                searchable && isOpen ? (react_1.default.createElement("input", { ref: inputRef, className: "vscode-select__search", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), onClick: (e) => e.stopPropagation(), placeholder: "Rechercher..." })) : (react_1.default.createElement("span", { className: !selectedOption ? 'vscode-select__placeholder' : '' }, selectedOption ? selectedOption.label : placeholder)),
                react_1.default.createElement("span", { className: `codicon codicon-chevron-${isOpen ? 'up' : 'down'}` })),
            isOpen && (react_1.default.createElement("div", { className: "vscode-select__dropdown" },
                Object.entries(filteredOptions).map(([group, opts]) => (react_1.default.createElement("div", { key: group || 'default' },
                    group && react_1.default.createElement("div", { className: "vscode-select__group-label" }, group),
                    opts.map((option) => (react_1.default.createElement("div", { key: option.value, className: `
                                            vscode-select__option
                                            ${option.value === value ? 'vscode-select__option--selected' : ''}
                                        `.trim(), onClick: (e) => {
                            e.stopPropagation();
                            handleSelect(option);
                        } }, option.label)))))),
                Object.keys(filteredOptions).length === 0 && (react_1.default.createElement("div", { className: "vscode-select__no-results" }, "Aucun r\u00E9sultat"))))),
        error && (react_1.default.createElement("span", { className: "vscode-select__error" }, error))));
});
exports.Select.displayName = 'Select';
//# sourceMappingURL=Select.js.map