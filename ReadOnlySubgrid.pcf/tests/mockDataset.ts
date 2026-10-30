/*
 * Author: Jeroen Jonckheer
 * Test helper: builds a fake ComponentFramework dataset.
 *
 * The PCF dataset interface is large; production code only touches a
 * narrow slice of it (columns, sortedRecordIds, records, paging, sorting,
 * getTargetEntityType, loading). This factory implements exactly that
 * slice and casts the result to the real type so tests can feed it to
 * gridLogic and the component without dragging in the whole framework.
 *
 * Keep this in sync with the dataset members gridLogic.ts / the component
 * actually read: if you start using a new dataset member in production,
 * add it here too so the tests exercise the same surface.
 */

/** Column shape accepted by the factory (a subset of the PCF Column). */
export interface MockColumn {
    name: string;
    displayName: string;
    order: number;
    dataType: string;
    /** Defaults to false. */
    isHidden?: boolean;
    /** View-configured pixel width; omit to leave undefined. */
    visualSizeFactor?: number;
}

/**
 * Per-record values. `formatted` maps columnName -> display string;
 * `raw` maps columnName -> the value getValue should return (used for
 * lookup columns). `entityName` overrides the row's logical name via
 * getNamedReference (defaults to the dataset target).
 */
export interface MockRecordSpec {
    id: string;
    formatted: Record<string, string>;
    raw?: Record<string, unknown>;
    entityName?: string;
}

export interface MockDatasetConfig {
    columns: MockColumn[];
    records: MockRecordSpec[];
    targetEntity?: string;
    loading?: boolean;
    paging?: {
        pageSize?: number;
        totalResultCount?: number;
        hasNextPage?: boolean;
        loadNextPage?: () => void;
    };
    sorting?: Array<{ name: string; sortDirection: number }>;
    /** Optional spy for dataset.refresh so tests can assert sort wiring. */
    refresh?: () => void;
}

/**
 * Build a dataset-like object. Returned as the real DataSet type so it
 * drops straight into production signatures; internally it is just the
 * minimal slice described above.
 */
export function makeDataset(
    config: MockDatasetConfig
): ComponentFramework.PropertyTypes.DataSet {
    const target = config.targetEntity || "account";

    const columns = config.columns.map((c) => ({
        name: c.name,
        displayName: c.displayName,
        order: c.order,
        dataType: c.dataType,
        alias: c.name,
        visualSizeFactor: c.visualSizeFactor as number,
        isHidden: !!c.isHidden,
    }));

    const records: Record<string, unknown> = {};
    const sortedRecordIds: string[] = [];
    for (const spec of config.records) {
        sortedRecordIds.push(spec.id);
        records[spec.id] = {
            getRecordId: () => spec.id,
            getFormattedValue: (name: string) =>
                spec.formatted[name] !== undefined ? spec.formatted[name] : "",
            getValue: (name: string) =>
                spec.raw && name in spec.raw ? spec.raw[name] : null,
            getNamedReference: () => ({
                id: { guid: spec.id },
                entityName: spec.entityName || target,
            }),
        };
    }

    const dataset = {
        columns,
        sortedRecordIds,
        records,
        loading: !!config.loading,
        error: false,
        errorMessage: "",
        getTargetEntityType: () => target,
        getTitle: () => "Mock",
        refresh: config.refresh || (() => undefined),
        sorting: config.sorting ? config.sorting.slice() : [],
        filtering: {},
        linking: {},
        paging: {
            pageSize:
                config.paging && typeof config.paging.pageSize === "number"
                    ? config.paging.pageSize
                    : 25,
            totalResultCount:
                config.paging &&
                typeof config.paging.totalResultCount === "number"
                    ? config.paging.totalResultCount
                    : config.records.length,
            hasNextPage: !!(config.paging && config.paging.hasNextPage),
            hasPreviousPage: false,
            loadNextPage:
                (config.paging && config.paging.loadNextPage) ||
                (() => undefined),
            loadPreviousPage: () => undefined,
            reset: () => undefined,
            setPageSize: () => undefined,
        },
    };

    return dataset as unknown as ComponentFramework.PropertyTypes.DataSet;
}
