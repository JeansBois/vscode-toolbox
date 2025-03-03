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
exports.Input = void 0;
const react_1 = __importStar(require("react"));
require("./Input.css");
exports.Input = (0, react_1.forwardRef)(({ label, error, hint, startIcon, endIcon, className = '', disabled, ...props }, ref) => {
    const inputWrapperClass = `
        vscode-input-wrapper
        ${error ? 'vscode-input-wrapper--error' : ''}
        ${disabled ? 'vscode-input-wrapper--disabled' : ''}
        ${className}
    `.trim();
    const inputClass = `
        vscode-input
        ${startIcon ? 'vscode-input--with-start-icon' : ''}
        ${endIcon ? 'vscode-input--with-end-icon' : ''}
    `.trim();
    return (react_1.default.createElement("div", { className: inputWrapperClass },
        label && (react_1.default.createElement("label", { className: "vscode-input__label" }, label)),
        react_1.default.createElement("div", { className: "vscode-input__container" },
            startIcon && (react_1.default.createElement("span", { className: "vscode-input__icon vscode-input__icon--start" }, startIcon)),
            react_1.default.createElement("input", { ref: ref, className: inputClass, disabled: disabled, ...props }),
            endIcon && (react_1.default.createElement("span", { className: "vscode-input__icon vscode-input__icon--end" }, endIcon))),
        (error || hint) && (react_1.default.createElement("span", { className: `vscode-input__message ${error ? 'vscode-input__message--error' : ''}` }, error || hint))));
});
exports.Input.displayName = 'Input';
//# sourceMappingURL=Input.js.map