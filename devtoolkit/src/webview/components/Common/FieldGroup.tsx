import React from 'react';
import './FieldGroup.css';

/**
 * FieldGroup props
 */
export interface FieldGroupProps {
  /** Title of the field group */
  title?: string;
  /** Description of the field group */
  description?: string;
  /** Children components */
  children: React.ReactNode;
  /** Optional CSS class name */
  className?: string;
  /** Whether the group is collapsible */
  collapsible?: boolean;
  /** Whether the group is expanded by default (when collapsible) */
  defaultExpanded?: boolean;
}

/**
 * FieldGroup component
 * 
 * Groups related form fields with an optional title and description.
 * Can be made collapsible for complex forms.
 * 
 * @example
 * ```tsx
 * <FieldGroup title="Personal Information" description="Contact details">
 *   <Input label="Name" />
 *   <Input label="Email" type="email" />
 * </FieldGroup>
 * ```
 */
export const FieldGroup: React.FC<FieldGroupProps> = ({
  title,
  description,
  children,
  className = '',
  collapsible = false,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const contentId = React.useId();
  const headerId = React.useId();

  const toggleExpanded = () => {
    if (collapsible) {
      setExpanded(!expanded);
    }
  };

  const groupClass = `
    vscode-field-group
    ${collapsible ? 'vscode-field-group--collapsible' : ''}
    ${collapsible && !expanded ? 'vscode-field-group--collapsed' : ''}
    ${className}
  `.trim();

  return (
    <div className={groupClass}>
      {title && (
        <div 
          className="vscode-field-group__header"
          onClick={toggleExpanded}
          id={headerId}
          aria-expanded={collapsible ? expanded : undefined}
          aria-controls={collapsible ? contentId : undefined}
        >
          <div className="vscode-field-group__title-container">
            {collapsible && (
              <span 
                className={`vscode-field-group__toggle codicon codicon-chevron-${expanded ? 'down' : 'right'}`}
                aria-hidden="true"
              />
            )}
            <h3 className="vscode-field-group__title">{title}</h3>
          </div>
          {description && (
            <p className="vscode-field-group__description">{description}</p>
          )}
        </div>
      )}
      <div 
        className="vscode-field-group__content"
        id={collapsible ? contentId : undefined}
        aria-labelledby={collapsible ? headerId : undefined}
        role={collapsible ? 'region' : undefined}
      >
        {children}
      </div>
    </div>
  );
};
