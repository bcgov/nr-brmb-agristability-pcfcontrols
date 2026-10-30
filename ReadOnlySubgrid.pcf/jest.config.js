/*
 * Author: Jeroen Jonckheer
 * Jest configuration for the ReadOnlySubgrid control.
 *
 * Tests live under tests/ (NOT under ReadOnlySubgrid/) on purpose: the
 * PCF build's tsconfig includes "ReadOnlySubgrid/**" and would otherwise
 * try to compile the test files and their jest types into the bundle.
 * Keeping tests outside that tree keeps the two pipelines independent.
 *
 * Production code under ReadOnlySubgrid/ is compiled by ts-jest using
 * tsconfig.test.json (CommonJS + jest/node ambient types), so the same
 * gridLogic.ts that ships in the bundle is exercised verbatim by the
 * unit tests.
 */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "jsdom",
    // ts-jest compiles TS/TSX on the fly using this tsconfig.
    transform: {
        "^.+\\.(ts|tsx)$": [
            "ts-jest",
            { tsconfig: "<rootDir>/tsconfig.test.json" },
        ],
    },
    roots: ["<rootDir>/tests", "<rootDir>/ReadOnlySubgrid"],
    testMatch: ["**/tests/**/*.test.(ts|tsx)"],
    // FluentUI v8's @fluentui/date-time-utilities ships an "exports" map
    // that omits the very lib-commonjs subpaths its own commonjs build
    // require()s. Jest 29 honours "exports" and so refuses those (existing)
    // files. We map the deep path straight to the file to bypass the gate.
    // This never affects production: the PCF webpack bundle resolves these
    // at build time, not through Node's exports resolution.
    moduleNameMapper: {
        "^@fluentui/date-time-utilities/lib-commonjs/(.*)$":
            "<rootDir>/node_modules/@fluentui/date-time-utilities/lib-commonjs/$1",
    },
    // Polyfills (matchMedia, ResizeObserver) + jest-dom matchers.
    setupFilesAfterEnv: ["<rootDir>/tests/setupTests.ts"],
    // Speeds up compile; our code does not rely on cross-file type
    // checking at test time (the PCF build + lint cover that).
    clearMocks: true,
};
