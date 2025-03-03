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
exports.TreeView = void 0;
const react_1 = __importStar(require("react"));
const Checkbox_1 = require("./Checkbox");
require("./TreeView.css");
const TreeView = ({ nodes, selectedIds, expandedIds = [], onSelect, onExpand, onDrop, renderIcon, className = '' }) => {
    const [draggedId, setDraggedId] = (0, react_1.useState)(null);
    const handleSelect = (0, react_1.useCallback)((node, checked) => {
        if (!onSelect)
            return;
        const getChildIds = (node) => {
            const ids = [node.id];
            if (node.children) {
                node.children.forEach(child => {
                    ids.push(...getChildIds(child));
                });
            }
            return ids;
        };
        const newSelectedIds = new Set(selectedIds);
        const affectedIds = getChildIds(node);
        if (checked) {
            affectedIds.forEach(id => newSelectedIds.add(id));
        }
        else {
            affectedIds.forEach(id => newSelectedIds.delete(id));
        }
        onSelect(Array.from(newSelectedIds));
    }, [selectedIds, onSelect]);
    const handleExpand = (0, react_1.useCallback)((node) => {
        onExpand?.(node.id, !expandedIds.includes(node.id));
    }, [expandedIds, onExpand]);
    const handleDragStart = (e, node) => {
        e.dataTransfer.setData('text/plain', node.id);
        setDraggedId(node.id);
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    const handleDrop = (e, targetNode) => {
        e.preventDefault();
        const sourceId = draggedId;
        setDraggedId(null);
        if (sourceId && sourceId !== targetNode.id) {
            onDrop?.(sourceId, targetNode.id);
        }
    };
    const renderNode = (node, depth = 0) => {
        const isExpanded = expandedIds.includes(node.id);
        const isSelected = selectedIds.includes(node.id);
        const hasChildren = node.children && node.children.length > 0;
        const allChildrenSelected = hasChildren && node.children.every(child => selectedIds.includes(child.id));
        const someChildrenSelected = hasChildren && node.children.some(child => selectedIds.includes(child.id));
        const indeterminate = !allChildrenSelected && someChildrenSelected;
        return (react_1.default.createElement("div", { key: node.id, className: `
                    vscode-tree-item
                    ${hasChildren ? 'vscode-tree-item--parent' : ''}
                    ${isExpanded ? 'vscode-tree-item--expanded' : ''}
                    ${draggedId === node.id ? 'vscode-tree-item--dragging' : ''}
                `.trim(), style: { paddingLeft: `${depth * 20}px` }, draggable: !!onDrop, onDragStart: (e) => handleDragStart(e, node), onDragOver: handleDragOver, onDrop: (e) => handleDrop(e, node) },
            react_1.default.createElement("div", { className: "vscode-tree-item__content" },
                hasChildren && (react_1.default.createElement("span", { className: `
                                vscode-tree-item__arrow
                                codicon
                                codicon-chevron-${isExpanded ? 'down' : 'right'}
                            `.trim(), onClick: () => handleExpand(node) })),
                react_1.default.createElement(Checkbox_1.Checkbox, { checked: isSelected, indeterminate: indeterminate, onChange: (e) => handleSelect(node, e.target.checked) }),
                renderIcon && (react_1.default.createElement("span", { className: "vscode-tree-item__icon" }, renderIcon(node))),
                react_1.default.createElement("span", { className: "vscode-tree-item__label" }, node.label)),
            hasChildren && isExpanded && (react_1.default.createElement("div", { className: "vscode-tree-item__children" }, node.children.map(child => renderNode(child, depth + 1))))));
    };
    return (react_1.default.createElement("div", { className: `vscode-tree ${className}`.trim() }, nodes.map(node => renderNode(node))));
};
exports.TreeView = TreeView;
//# sourceMappingURL=TreeView.js.map