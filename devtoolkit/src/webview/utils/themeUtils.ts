import { useEffect } from 'react';
import { useTheme } from './hooks';

/**
 * CSS variable mapping for theme properties
 */
export interface ThemeVars {
    // Colors
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    surfaceColor: string;
    textColor: string;
    accentColor: string;
    errorColor: string;
    warningColor: string;
    successColor: string;
    infoColor: string;
    
    // Sizing
    borderRadius: string;
    spacing: string;
    
    // Typography
    fontFamily: string;
    fontSize: string;
    
    // Transitions
    transitionDuration: string;
}

/**
 * Theme definitions for light, dark, and high-contrast modes
 */
export const themeDefinitions: Record<string, ThemeVars> = {
    light: {
        primaryColor: '#007acc',
        secondaryColor: '#5f5f5f',
        backgroundColor: '#f3f3f3',
        surfaceColor: '#ffffff',
        textColor: '#333333',
        accentColor: '#0066b5',
        errorColor: '#d83b01',
        warningColor: '#ffb900',
        successColor: '#107c10',
        infoColor: '#0078d4',
        
        borderRadius: '3px',
        spacing: '8px',
        
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '14px',
        
        transitionDuration: '0.2s'
    },
    dark: {
        primaryColor: '#0e639c',
        secondaryColor: '#818181',
        backgroundColor: '#1e1e1e',
        surfaceColor: '#252526',
        textColor: '#cccccc',
        accentColor: '#3794ff',
        errorColor: '#f48771',
        warningColor: '#cca700',
        successColor: '#89d185',
        infoColor: '#75beff',
        
        borderRadius: '3px',
        spacing: '8px',
        
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '14px',
        
        transitionDuration: '0.2s'
    },
    'high-contrast': {
        primaryColor: '#0e70c0',
        secondaryColor: '#d4d4d4',
        backgroundColor: '#000000',
        surfaceColor: '#111111',
        textColor: '#ffffff',
        accentColor: '#3b99fc',
        errorColor: '#f88070',
        warningColor: '#e9d585',
        successColor: '#89d185',
        infoColor: '#75beff',
        
        borderRadius: '0',
        spacing: '8px',
        
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '14px',
        
        transitionDuration: '0'
    }
};

/**
 * Apply the current theme to the document root element
 * @param theme The current theme (light, dark, or high-contrast)
 */
export function applyTheme(theme: 'light' | 'dark' | 'high-contrast'): void {
    const themeVars = themeDefinitions[theme];
    
    if (!themeVars) {
        console.error(`Unknown theme: ${theme}`);
        return;
    }
    
    const root = document.documentElement;
    
    // Apply CSS variables
    Object.entries(themeVars).forEach(([key, value]) => {
        // Convert camelCase to kebab-case for CSS variables
        const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        root.style.setProperty(`--${cssVar}`, value);
    });
    
    // Add theme class to body
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-high-contrast');
    document.body.classList.add(`theme-${theme}`);
    
    // Update data-vscode-theme attribute for VS Code compatibility
    document.body.setAttribute('data-vscode-theme', theme);
}

/**
 * Hook to automatically apply the current theme
 * This can be used at the root component level to handle theme changes
 */
export function useThemeEffect(): void {
    const { theme } = useTheme();
    
    useEffect(() => {
        applyTheme(theme);
    }, [theme]);
}

/**
 * Calculate a color with different opacity
 * @param color Base color in hex or rgb format
 * @param opacity Opacity value (0-1)
 * @returns Color with opacity applied
 */
export function withOpacity(color: string, opacity: number): string {
    // Handle hex colors
    if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    
    // Handle rgb/rgba colors
    if (color.startsWith('rgb')) {
        if (color.startsWith('rgba')) {
            // Replace existing opacity
            return color.replace(/rgba\((.+?), [\d.]+\)/, `rgba($1, ${opacity})`);
        }
        // Convert rgb to rgba
        return color.replace(/rgb\((.+?)\)/, `rgba($1, ${opacity})`);
    }
    
    return color;
}

/**
 * Get a CSS variable value from the current theme
 * @param name Variable name (without the -- prefix)
 * @returns CSS variable reference
 */
export function getCssVar(name: string): string {
    return `var(--${name})`;
}

/**
 * Apply different styles based on the current theme
 * @param theme Current theme
 * @param styles Object containing styles for each theme
 * @returns Style for the current theme or default style
 */
export function getThemeStyle<T>(
    theme: 'light' | 'dark' | 'high-contrast',
    styles: { light?: T; dark?: T; 'high-contrast'?: T; default: T }
): T {
    return styles[theme] || styles.default;
}
