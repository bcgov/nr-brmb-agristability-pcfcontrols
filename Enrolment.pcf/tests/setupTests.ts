/*
 * Author: Jeroen Jonckheer
 * Jest setup: runs once before each test file.
 *
 * Provides the two browser APIs that FluentUI v8 touches on render but
 * that jsdom does not implement, and registers the @testing-library
 * jest-dom matchers (toBeInTheDocument, etc.). Without the polyfills,
 * mounting a DetailsList throws in jsdom.
 */
import "@testing-library/jest-dom";
import { setIconOptions } from "@fluentui/react";

// FluentUI's font icons are never registered in jsdom, which would spam
// "icon X was used but not registered" warnings on every header render.
// Silencing them keeps the test output focused on real failures.
setIconOptions({ disableWarnings: true });

// FluentUI's responsive helpers call matchMedia; jsdom has no impl.
if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: jest.fn(), // deprecated API, still referenced
            removeListener: jest.fn(),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            dispatchEvent: jest.fn(),
        }),
    });
}

// DetailsList's virtualization/resize paths reference ResizeObserver.
if (!(window as unknown as { ResizeObserver?: unknown }).ResizeObserver) {
    class ResizeObserverStub {
        public observe(): void {
            /* no-op */
        }
        public unobserve(): void {
            /* no-op */
        }
        public disconnect(): void {
            /* no-op */
        }
    }
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver =
        ResizeObserverStub;
}
