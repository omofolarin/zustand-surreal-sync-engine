// Test setup file for Bun
// This file is loaded before running tests

// Global test configuration
globalThis.testTimeout = 10000; // 10 second timeout for tests

// Mock console methods for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Only show console output in verbose mode
if (!process.env.VERBOSE_TESTS) {
  console.log = () => {};
  console.warn = () => {};
  // Keep errors visible
}

// Cleanup function to restore console
globalThis.restoreConsole = () => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
};

// Test utilities
globalThis.sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));