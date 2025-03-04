import { useState, useEffect, useCallback, useRef, RefObject } from 'react';
import { messageHandler, WebviewMessage } from './messageHandler';

// Since messageHandler doesn't have native subscribe/unsubscribe methods,
// we'll create a simple event system for our hooks
const eventSystem = {
    listeners: new Set<(message: any) => void>(),
    
    subscribe(listener: (message: any) => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    },
    
    unsubscribe(listener: (message: any) => void) {
        this.listeners.delete(listener);
    },
    
    publish(message: any) {
        this.listeners.forEach(listener => listener(message));
    }
};

// Set up a message listener when the module loads
window.addEventListener('message', (event) => {
    eventSystem.publish(event.data);
});

/**
 * Hook for interacting with the extension messaging system
 * @param messageTypes Message types to listen for
 * @returns Object with methods for sending messages and the latest received message
 */
export function useMessageHandler<T = any>(messageTypes: string[] = []) {
    const [lastMessage, setLastMessage] = useState<T | null>(null);
    
    useEffect(() => {
        const handleMessage = (message: any) => {
            if (messageTypes.length === 0 || messageTypes.includes(message.type)) {
                setLastMessage(message as T);
            }
        };
        
        // Subscribe to messages using our event system
        const unsubscribe = eventSystem.subscribe(handleMessage);
        
        // Cleanup subscription
        return unsubscribe;
    }, [messageTypes]);
    
    const sendMessage = useCallback((message: any) => {
        messageHandler.postMessage(message);
    }, []);
    
    return {
        lastMessage,
        sendMessage,
        notifySuccess: messageHandler.notifySuccess.bind(messageHandler),
        notifyError: messageHandler.notifyError.bind(messageHandler),
        notifyWarning: messageHandler.notifyWarning.bind(messageHandler)
    };
}

/**
 * Hook for managing selection state
 * @param initialSelection Initial selected items
 * @returns Object with selection state and methods to manipulate it
 */
export function useSelection<T extends string>(initialSelection: T[] = []) {
    const [selectedItems, setSelectedItems] = useState<Set<T>>(new Set(initialSelection));
    
    const isSelected = useCallback((item: T) => selectedItems.has(item), [selectedItems]);
    
    const toggleSelection = useCallback((item: T, selected?: boolean) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (selected === undefined) {
                if (newSet.has(item)) {
                    newSet.delete(item);
                } else {
                    newSet.add(item);
                }
            } else if (selected) {
                newSet.add(item);
            } else {
                newSet.delete(item);
            }
            return newSet;
        });
    }, []);
    
    const selectAll = useCallback((items: T[]) => {
        setSelectedItems(new Set(items));
    }, []);
    
    const clearSelection = useCallback(() => {
        setSelectedItems(new Set());
    }, []);
    
    return {
        selectedItems: Array.from(selectedItems),
        selectedItemsSet: selectedItems,
        isSelected,
        toggleSelection,
        selectAll,
        clearSelection
    };
}

/**
 * Hook for filtering items
 * @param items Array of items to filter
 * @param filterFn Function to determine if an item matches the filter
 * @returns Filtered items and methods to update the filter
 */
export function useFiltering<T>(
    items: T[],
    filterFn: (item: T, filter: string) => boolean
) {
    const [filter, setFilter] = useState('');
    
    const filteredItems = useCallback(() => {
        if (!filter) return items;
        return items.filter(item => filterFn(item, filter));
    }, [items, filter, filterFn]);
    
    return {
        filter,
        setFilter,
        filteredItems: filteredItems()
    };
}

/**
 * Hook for auto-scrolling behavior
 * @param deps Dependencies that should trigger scrolling
 * @returns An object containing a ref and auto-scroll state
 */
export function useAutoScroll(deps: any[] = []) {
    const ref = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    
    // Scroll to bottom when content changes
    useEffect(() => {
        if (autoScroll && ref.current) {
            ref.current.scrollTop = ref.current.scrollHeight;
        }
    }, [...deps, autoScroll]);
    
    // Handle scroll events to detect if user has manually scrolled up
    const handleScroll = useCallback(() => {
        if (!ref.current) return;
        
        const { scrollTop, scrollHeight, clientHeight } = ref.current;
        const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
        
        if (autoScroll !== isAtBottom) {
            setAutoScroll(isAtBottom);
        }
    }, [autoScroll]);
    
    return { ref, autoScroll, setAutoScroll, handleScroll };
}

/**
 * Hook for theme management
 * @returns Theme state and methods to change it
 */
export function useTheme() {
    const [theme, setTheme] = useState<'light' | 'dark' | 'high-contrast'>('dark');
    
    useEffect(() => {
        // Initialize theme from VSCode
        const handleThemeChange = (event: WebviewMessage) => {
            if (event.type === 'theme' && 'theme' in event) {
                setTheme(event.theme as 'light' | 'dark' | 'high-contrast');
            }
        };
        
        const unsubscribe = eventSystem.subscribe(handleThemeChange);
        
        // Request current theme from extension
        messageHandler.postMessage({ 
            type: 'request', 
            action: 'getTheme' 
        });
        
        return unsubscribe;
    }, []);
    
    return { theme, setTheme };
}

/**
 * Hook to detect clicks outside of a referenced element
 * @param callback Function to call when a click outside is detected
 * @returns Ref to attach to the element
 */
export function useOutsideClick<T extends HTMLElement = HTMLElement>(
    callback: () => void
): RefObject<T | null> {
    const ref = useRef<T>(null);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [callback]);
    
    return ref;
}
