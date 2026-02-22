/**
 * Performance Optimization Utilities
 * 
 * Centralized utilities for optimizing provider portal performance
 */

import { useMemo, useCallback, RefObject } from 'react';

/**
 * Debounce function for API calls and user input
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for scroll and resize events
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Memoize expensive computations
 */
export function useMemoizedValue<T>(
  computeFn: () => T,
  deps: React.DependencyList
): T {
  return useMemo(computeFn, deps);
}

/**
 * Create a stable callback reference
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList
): T {
  return useCallback(callback, deps) as T;
}

/**
 * Intersection Observer for lazy loading
 */
export function useIntersectionObserver(
  elementRef: RefObject<Element>,
  options: IntersectionObserverInit = {}
) {
  const [isIntersecting, setIsIntersecting] = React.useState(false);
  
  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, {
      threshold: 0.1,
      ...options,
    });
    
    observer.observe(element);
    
    return () => {
      observer.disconnect();
    };
  }, [elementRef, options]);
  
  return isIntersecting;
}

/**
 * Request deduplication cache
 */
class RequestCache {
  private cache = new Map<string, Promise<any>>();
  private timestamps = new Map<string, number>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    const timestamp = this.timestamps.get(key);
    
    // Return cached promise if still valid
    if (cached && timestamp && Date.now() - timestamp < this.TTL) {
      return cached;
    }
    
    // Create new request
    const promise = fetcher().finally(() => {
      // Remove from cache after completion
      setTimeout(() => {
        this.cache.delete(key);
        this.timestamps.delete(key);
      }, this.TTL);
    });
    
    this.cache.set(key, promise);
    this.timestamps.set(key, Date.now());
    
    return promise;
  }

  invalidate(key: string) {
    this.cache.delete(key);
    this.timestamps.delete(key);
  }

  clear() {
    this.cache.clear();
    this.timestamps.clear();
  }
}

export const requestCache = new RequestCache();

/**
 * Virtual scrolling utilities
 */
export function calculateVirtualScrollRange(
  containerHeight: number,
  itemHeight: number,
  scrollTop: number,
  totalItems: number,
  overscan: number = 5
) {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    totalItems - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );
  
  const visibleItems = endIndex - startIndex + 1;
  const offsetY = startIndex * itemHeight;
  
  return {
    startIndex,
    endIndex,
    visibleItems,
    offsetY,
  };
}

/**
 * Batch state updates to reduce re-renders
 */
export function useBatchedUpdates() {
  const updatesRef = React.useRef<(() => void)[]>([]);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const batchUpdate = useCallback((update: () => void) => {
    updatesRef.current.push(update);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      const updates = [...updatesRef.current];
      updatesRef.current = [];
      updates.forEach(update => update());
    }, 0);
  }, []);
  
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return batchUpdate;
}

// Add React import
import React from 'react';
