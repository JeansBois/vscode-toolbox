"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Button = void 0;
const react_1 = __importDefault(require("react"));
require("./Button.css");
const Button = ({ children, variant = 'primary', loading = false, icon, className = '', disabled, ...props }) => {
    const buttonClass = `
        vscode-button
        ${variant === 'primary' ? 'vscode-button--primary' : 'vscode-button--secondary'}
        ${loading ? 'vscode-button--loading' : ''}
        ${className}
    `.trim();
    return (react_1.default.createElement("button", { className: buttonClass, disabled: disabled || loading, ...props },
        loading && (react_1.default.createElement("span", { className: "vscode-button__spinner" },
            react_1.default.createElement("span", { className: "codicon codicon-loading codicon-modifier-spin" }))),
        icon && !loading && (react_1.default.createElement("span", { className: "vscode-button__icon" }, icon)),
        react_1.default.createElement("span", { className: "vscode-button__text" }, children)));
};
exports.Button = Button;
//# sourceMappingURL=Button.js.map