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
exports.Checkbox = void 0;
const react_1 = __importStar(require("react"));
require("./Checkbox.css");
exports.Checkbox = (0, react_1.forwardRef)(({ label, indeterminate, error, className = '', disabled, checked, onChange, ...props }, ref) => {
    const checkboxRef = react_1.default.useRef(null);
    react_1.default.useEffect(() => {
        if (checkboxRef.current) {
            checkboxRef.current.indeterminate = indeterminate || false;
        }
    }, [indeterminate]);
    const handleRef = (element) => {
        checkboxRef.current = element;
        if (typeof ref === 'function') {
            ref(element);
        }
        else if (ref) {
            ref.current = element;
        }
    };
    const containerClass = `
        vscode-checkbox
        ${indeterminate ? 'vscode-checkbox--indeterminate' : ''}
        ${error ? 'vscode-checkbox--error' : ''}
        ${disabled ? 'vscode-checkbox--disabled' : ''}
        ${className}
    `.trim();
    return (react_1.default.createElement("label", { className: containerClass },
        react_1.default.createElement("div", { className: "vscode-checkbox__input-wrapper" },
            react_1.default.createElement("input", { ...props, type: "checkbox", ref: handleRef, checked: checked, disabled: disabled, onChange: onChange, className: "vscode-checkbox__input" }),
            react_1.default.createElement("span", { className: "vscode-checkbox__checkmark" },
                checked && !indeterminate && (react_1.default.createElement("span", { className: "codicon codicon-check" })),
                indeterminate && (react_1.default.createElement("span", { className: "codicon codicon-dash" })))),
        label && (react_1.default.createElement("span", { className: "vscode-checkbox__label" }, label)),
        error && (react_1.default.createElement("span", { className: "vscode-checkbox__error" }, error))));
});
exports.Checkbox.displayName = 'Checkbox';
//# sourceMappingURL=Checkbox.js.map