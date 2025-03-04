import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * Theme token types for consistent styling across components
 */
export interface ThemeTokens {
  colors: {
    background: string;
    foreground: string;
    primary: string;
    primaryHover: string;
    secondary: string;
    secondaryHover: string;
    border: string;
    inputBackground: string;
    inputForeground: string;
    inputBorder: string;
    errorBackground: string;
    errorForeground: string;
    warningBackground: string;
    warningForeground: string;
    successBackground: string;
    successForeground: string;
    focusBorder: string;
    headerBackground: string;
    headerForeground: string;
    sidebarBackground: string;
    sidebarForeground: string;
    listActiveBackground: string;
    listActiveForeground: string;
    listHoverBackground: string;
  };
  spacing: {
    xxs: string;
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  typography: {
    fontFamily: string;
    fontSize: {
      small: string;
      base: string;
      large: string;
      heading: string;
    };
    fontWeight: {
      normal: number;
      medium: number;
      bold: number;
    };
    lineHeight: {
      tight: number;
      normal: number;
      relaxed: number;
    };
  };
  shape: {
    borderRadius: {
      small: string;
      medium: string;
      large: string;
    };
    borderWidth: {
      thin: string;
      medium: string;
      thick: string;
    };
  };
  shadows: {
    small: string;
    medium: string;
    large: string;
  };
  animation: {
    duration: {
      fast: string;
      normal: string;
      slow: string;
    };
    easing: {
      easeIn: string;
      easeOut: string;
      easeInOut: string;
    };
  };
}

/**
 * VS Code theme type
 */
export type VSCodeTheme = 'dark' | 'light' | 'high-contrast';

/**
 * Theme context type
 */
interface ThemeContextType {
  theme: ThemeTokens;
  vsCodeTheme: VSCodeTheme;
  setVSCodeTheme: (theme: VSCodeTheme) => void;
}

/**
 * Create theme context
 */
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Get CSS variable from document - for future direct CSS variable access if needed
 * Currently not used as we leverage VS Code's CSS variables directly
 * using the var() function in our theme tokens
 */
// const getCssVariable = (name: string): string => {
//   return getComputedStyle(document.documentElement).getPropertyValue(name) || '';
// };

/**
 * Create theme tokens based on VS Code theme
 */
const createThemeTokens = (vsCodeTheme: VSCodeTheme): ThemeTokens => {
  return {
    colors: {
      background: `var(--vscode-editor-background)`,
      foreground: `var(--vscode-editor-foreground)`,
      primary: `var(--vscode-button-background)`,
      primaryHover: `var(--vscode-button-hoverBackground)`,
      secondary: `var(--vscode-button-secondaryBackground)`,
      secondaryHover: `var(--vscode-button-secondaryHoverBackground)`,
      border: `var(--vscode-panel-border)`,
      inputBackground: `var(--vscode-input-background)`,
      inputForeground: `var(--vscode-input-foreground)`,
      inputBorder: `var(--vscode-input-border)`,
      errorBackground: `var(--vscode-inputValidation-errorBackground)`,
      errorForeground: `var(--vscode-errorForeground)`,
      warningBackground: `var(--vscode-inputValidation-warningBackground)`,
      warningForeground: `var(--vscode-editorWarning-foreground)`,
      successBackground: `var(--vscode-terminal-ansiGreen)`,
      successForeground: `var(--vscode-gitDecoration-addedResourceForeground)`,
      focusBorder: `var(--vscode-focusBorder)`,
      headerBackground: `var(--vscode-titleBar-activeBackground)`,
      headerForeground: `var(--vscode-titleBar-activeForeground)`,
      sidebarBackground: `var(--vscode-sideBar-background)`,
      sidebarForeground: `var(--vscode-sideBar-foreground)`,
      listActiveBackground: `var(--vscode-list-activeSelectionBackground)`,
      listActiveForeground: `var(--vscode-list-activeSelectionForeground)`,
      listHoverBackground: `var(--vscode-list-hoverBackground)`,
    },
    spacing: {
      xxs: '0.125rem', // 2px
      xs: '0.25rem',   // 4px
      sm: '0.5rem',    // 8px
      md: '1rem',      // 16px
      lg: '1.5rem',    // 24px
      xl: '2rem',      // 32px
      xxl: '3rem',     // 48px
    },
    typography: {
      fontFamily: `var(--vscode-font-family)`,
      fontSize: {
        small: '0.8125rem',     // 13px
        base: '0.875rem',       // 14px
        large: '1rem',          // 16px
        heading: '1.25rem',     // 20px
      },
      fontWeight: {
        normal: 400,
        medium: 500,
        bold: 700,
      },
      lineHeight: {
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.8,
      },
    },
    shape: {
      borderRadius: {
        small: '2px',
        medium: '4px',
        large: '8px',
      },
      borderWidth: {
        thin: '1px',
        medium: '2px',
        thick: '4px',
      },
    },
    shadows: {
      small: vsCodeTheme === 'high-contrast' 
        ? '0 0 0 1px var(--vscode-contrastBorder)' 
        : '0 1px 2px rgba(0, 0, 0, 0.15)',
      medium: vsCodeTheme === 'high-contrast' 
        ? '0 0 0 1px var(--vscode-contrastBorder)' 
        : '0 2px 4px rgba(0, 0, 0, 0.2)',
      large: vsCodeTheme === 'high-contrast' 
        ? '0 0 0 1px var(--vscode-contrastBorder)' 
        : '0 4px 8px rgba(0, 0, 0, 0.25)',
    },
    animation: {
      duration: {
        fast: '0.1s',
        normal: '0.2s',
        slow: '0.3s',
      },
      easing: {
        easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
        easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
        easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  };
};

/**
 * Detect VS Code theme from document body classes
 */
const detectVSCodeTheme = (): VSCodeTheme => {
  if (document.body.classList.contains('vscode-high-contrast')) {
    return 'high-contrast';
  } else if (document.body.classList.contains('vscode-dark')) {
    return 'dark';
  } else {
    return 'light';
  }
};

/**
 * Theme provider props
 */
interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Theme provider component
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [vsCodeTheme, setVSCodeTheme] = useState<VSCodeTheme>(detectVSCodeTheme());
  const [theme, setTheme] = useState<ThemeTokens>(createThemeTokens(vsCodeTheme));

  // Update theme tokens when VS Code theme changes
  useEffect(() => {
    const newTheme = createThemeTokens(vsCodeTheme);
    setTheme(newTheme);
    
    // Add theme class to body
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast');
    document.body.classList.add(`theme-${vsCodeTheme}`);
  }, [vsCodeTheme]);

  // Listen for VS Code theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const newTheme = detectVSCodeTheme();
      if (newTheme !== vsCodeTheme) {
        setVSCodeTheme(newTheme);
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [vsCodeTheme]);

  return (
    <ThemeContext.Provider value={{ theme, vsCodeTheme, setVSCodeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook to use the theme context
 */
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

/**
 * CSS-in-JS style helper functions
 */
export const createStyles = <T extends Record<string, React.CSSProperties>>(
  styles: T
): T => styles;
