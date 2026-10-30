/*
 * Author: Jeroen Jonckheer
 * Module: gridLogic
 *
 * Pure, framework-agnostic logic for the ReadOnlySubgrid control.
 *
 * Everything in this file is a plain function or constant with no
 * dependency on React, FluentUI or the DOM. The only external types it
 * touches are the ComponentFramework dataset types (a global ambient
 * namespace provided by @types/powerapps-component-framework), and even
 * those are consumed read-only.
 *
 * Why this module exists
 * ----------------------
 * The React component (components/ReadOnlySubgridComponent.tsx) used to
 * carry all of this logic inline inside useMemo hooks. Pulling the pure
 * parts out here has two concrete benefits:
 *
 *   1. Testability. These functions can be unit-tested directly with a
 *      mocked dataset, without rendering React or booting a browser.
 *      See tests/gridLogic.test.ts.
 *
 *   2. Extensibility. A future contributor can change *what* the grid
 *      computes (sorting, grouping, filtering, sizing) here in one
 *      isolated place, and change *how* it is rendered in the component,
 *      without the two concerns bleeding into each other.
 *
 * Contract rule for this file: keep it pure. No React imports, no DOM
 * access, no dataset mutations (no setPageSize / refresh / loadNextPage
 * calls). Side effects belong in index.ts (PCF bridge) or in the
 * component (rendering + event wiring).
 */

// ---------------------------------------------------------------------------
// Layout / sizing constants
// ---------------------------------------------------------------------------
//
// These describe the grid's geometry. They are shared between the pure
// height/width math here and the rendering component, so they live in
// one place to avoid drift.

/** Smallest width (px) a column may ever shrink to, by drag or dialog. */
export const MIN_COLUMN_WIDTH = 60;

/** Fallback column width (px) when the view definition specifies none. */
export const DEFAULT_COLUMN_WIDTH = 120;

/**
 * Row and header pitch (px). Calibrated against the standard Power Apps
 * modern read-only grid, which renders its AG Grid rows/header inline at
 * height:42px with a 42px translateY pitch (no inter-row gap). The
 * component measures the *actual* rendered heights after mount and
 * overrides these whenever a different font / DPI produces another size,
 * so these are starting estimates, not hard guarantees.
 */
export const HEADER_HEIGHT = 42;
export const ROW_HEIGHT = 42;

/** Height (px) of the footer band that shows the row count. */
export const FOOTER_HEIGHT = 28;

/**
 * Native browser scrollbar thickness (px). The Power Apps modern grid
 * uses native scrollbars (verified at 18px in DevTools); we reserve the
 * same amount in the outer-height math so the visible body bounds line
 * up exactly with the scrollbar.
 */
export const NATIVE_SCROLLBAR_SIZE = 18;
export const HORIZONTAL_SCROLLBAR_HEIGHT = NATIVE_SCROLLBAR_SIZE;

/**
 * Visible-row bounds. The host often initialises the page size to the
 * subgrid's "Number of rows" property (as low as 4). We bound the grid
 * height to that many rows so the body scrolls instead of growing to fit
 * every loaded record. MAX is a safety cap for hosts that report a huge
 * page size.
 */
export const DEFAULT_VISUAL_ROWS = 4;
export const MAX_VISUAL_ROWS = 25;

/**
 * How many records to eagerly page in before relying on scroll-driven
 * paging. With only the host's tiny default page loaded, the body never
 * overflows, so the scroll handler can never fire; we proactively pull
 * pages up to this many records to make the rest reachable.
 */
export const EAGER_LOAD_TARGET = 100;

/** Scroll distance (px) from the bottom at which we request the next page. */
export const PAGING_SCROLL_THRESHOLD = 80;

/** Group header label used when the grouped column value is empty. */
export const EMPTY_GROUP_LABEL = "(leeg)";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single resolved lookup target extracted from a lookup/owner/partylist
 * cell. `name` is the display text; `entityName` + `id` are what we hand
 * to navigation.openForm to open the looked-up record.
 */
export interface ILookupRef {
    id: string;
    entityName: string;
    name: string;
}

/**
 * One row of the grid, shaped for FluentUI's DetailsList.
 *
 * DetailsList resolves a cell by reading item[column.fieldName], so every
 * visible column name is present as a string-valued key holding the
 * record's formatted value. The underscore-prefixed keys are our own
 * side channel:
 *   - key / _entityId : the record id (GUID)
 *   - _entityName     : logical name of the row's entity (for openForm)
 *   - _refs           : per-column resolved lookup targets (for links)
 *
 * The index signature is `unknown` so the string cell values and the
 * structured _refs map can coexist on the same object; callers narrow
 * with a cast at the point of use.
 */
export interface IGridItem {
    key: string;
    _entityName: string;
    _entityId: string;
    _refs: Record<string, ILookupRef[]>;
    [columnName: string]: unknown;
}

/** Sort direction as carried in component state. */
export interface ISortState {
    name: string | null;
    descending: boolean;
}

// Convenience aliases for the ambient ComponentFramework types so the
// signatures below stay readable.
type DataSet = ComponentFramework.PropertyTypes.DataSet;
type DataSetColumn = ComponentFramework.PropertyHelper.DataSetApi.Column;

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

/**
 * True when a column's PCF dataType denotes a lookup-style column.
 *
 * FluentUI/PCF expose lookup variants as dataType strings that all begin
 * with "Lookup." (Lookup.Simple, Lookup.Customer, Lookup.Owner,
 * Lookup.Regarding, Lookup.PartyList). We treat them uniformly: their
 * cells render as clickable links.
 */
export function isLookupColumn(dataType: string | undefined): boolean {
    return !!(dataType && dataType.indexOf("Lookup") === 0);
}

/**
 * Resolve the render width (px) for a column from its view definition.
 *
 * PCF exposes the configured per-column width via Column.visualSizeFactor
 * (in pixels, despite the "factor" naming). We honour it verbatim when it
 * is a sane number; a 0 / undefined / sub-minimum value usually means the
 * view did not specify a width, so we fall back to DEFAULT_COLUMN_WIDTH to
 * keep the column legible.
 *
 * We intentionally do NOT auto-distribute widths across the container.
 * That would fight the view definition. If the total exceeds the
 * container the body scrolls horizontally; if it is smaller the columns
 * simply leave whitespace on the right: matching the standard grid.
 */
export function resolveColumnWidth(visualSizeFactor: number | undefined): number {
    return typeof visualSizeFactor === "number" && visualSizeFactor >= MIN_COLUMN_WIDTH
        ? visualSizeFactor
        : DEFAULT_COLUMN_WIDTH;
}

/**
 * Produce the ordered list of visible columns.
 *
 * Base order comes from the view (Column.order ascending), with hidden
 * columns dropped. If the user has reordered columns (via Move left /
 * Move right), `columnOrder` holds the desired name sequence; we honour
 * it, then append any columns not mentioned in it (e.g. newly arrived
 * columns) in their base order so nothing silently disappears.
 *
 * @param columns     Raw dataset.columns (may be undefined).
 * @param columnOrder User-chosen name order, or null for "use view order".
 */
export function orderVisibleColumns(
    columns: DataSetColumn[] | undefined,
    columnOrder: string[] | null
): DataSetColumn[] {
    const cols = (columns || [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .filter((c) => !c.isHidden);
    if (!columnOrder) {
        return cols;
    }
    const byName = new Map(cols.map((c) => [c.name, c]));
    const reordered: DataSetColumn[] = [];
    for (const name of columnOrder) {
        const c = byName.get(name);
        if (c) {
            reordered.push(c);
            byName.delete(name);
        }
    }
    // Columns present in the data but absent from the saved order get
    // appended so they remain reachable.
    for (const c of byName.values()) {
        reordered.push(c);
    }
    return reordered;
}

/**
 * Move one column one position left or right within an order array.
 *
 * Returns a NEW array with the swap applied, or null when the move is a
 * no-op (column not found, or already at the relevant edge). Returning
 * null lets the caller skip a needless state update.
 *
 * @param currentOrder The current column-name order.
 * @param columnName   Column to move.
 * @param direction    "left" (towards index 0) or "right".
 */
export function moveColumnInOrder(
    currentOrder: string[],
    columnName: string,
    direction: "left" | "right"
): string[] | null {
    const idx = currentOrder.indexOf(columnName);
    if (idx === -1) {
        return null;
    }
    const target = direction === "left" ? idx - 1 : idx + 1;
    if (target < 0 || target >= currentOrder.length) {
        return null;
    }
    const next = currentOrder.slice();
    const tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    return next;
}

// ---------------------------------------------------------------------------
// Lookup extraction
// ---------------------------------------------------------------------------

/**
 * Extract { id, entityName, name } triples from a raw dataset.getValue
 * return for a lookup column.
 *
 * The PCF runtime returns several shapes across versions and lookup
 * kinds: a single EntityReference object, an array of them (PartyList),
 * an `id` that is either a plain string or a `{ guid }` wrapper, and an
 * entity-type carried under any of etn / entityType / LogicalName /
 * logicalName. This walker tolerates all of them and silently ignores
 * anything it cannot resolve to a usable (id + entityName) pair.
 *
 * Defensive on purpose: a single malformed cell must never throw and
 * tear down the whole grid render.
 */
export function extractLookupRefs(raw: unknown): ILookupRef[] {
    const out: ILookupRef[] = [];
    const visit = (v: unknown): void => {
        if (!v) {
            return;
        }
        if (Array.isArray(v)) {
            for (const item of v) {
                visit(item);
            }
            return;
        }
        if (typeof v !== "object") {
            return;
        }
        const obj = v as Record<string, unknown>;
        const idVal = obj.id;
        let id: string | null = null;
        if (typeof idVal === "string") {
            id = idVal;
        } else if (
            idVal &&
            typeof idVal === "object" &&
            typeof (idVal as { guid?: unknown }).guid === "string"
        ) {
            id = (idVal as { guid: string }).guid;
        }
        const etn =
            (obj.etn as string | undefined) ||
            (obj.entityType as string | undefined) ||
            (obj.LogicalName as string | undefined) ||
            (obj.logicalName as string | undefined);
        const name =
            (obj.name as string | undefined) ||
            (obj.formattedValue as string | undefined) ||
            "";
        if (id && etn) {
            out.push({
                id: String(id),
                entityName: String(etn),
                name: String(name),
            });
        }
    };
    visit(raw);
    return out;
}

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------

/**
 * Build the full list of grid rows from the dataset.
 *
 * For every record id (in the dataset's sorted order) we create one
 * IGridItem holding the formatted value of each column plus, for lookup
 * columns, the resolved link targets in `_refs`.
 *
 * Robustness: each record and each column read is wrapped so that one
 * hostile record or unreadable column cannot abort the whole build. A
 * failed row is logged and skipped; a failed cell is left empty. This
 * mirrors the "never let one bad row blank the grid" guarantee the
 * standard grid also provides.
 *
 * Pure with respect to the dataset: it only *reads* records, never
 * triggers paging or refresh.
 */
export function buildGridItems(dataset: DataSet): IGridItem[] {
    const ids = dataset.sortedRecordIds || [];
    const targetEntity =
        typeof dataset.getTargetEntityType === "function"
            ? dataset.getTargetEntityType()
            : "";
    const result: IGridItem[] = [];

    for (let i = 0; i < ids.length; i++) {
        const recordId = ids[i];
        try {
            const record = dataset.records[recordId];
            if (!record) {
                continue;
            }

            // Prefer the per-record named reference for the entity name
            // (handles polymorphic / activity-party datasets where rows
            // may differ in type); fall back to the dataset target.
            let entityName = targetEntity;
            try {
                const ref =
                    typeof record.getNamedReference === "function"
                        ? record.getNamedReference()
                        : null;
                if (ref) {
                    const refAny = ref as {
                        entityName?: string;
                        etn?: string;
                    };
                    entityName = refAny.entityName || refAny.etn || targetEntity;
                }
            } catch (e) {
                // Keep targetEntity on failure.
            }

            const refs: Record<string, ILookupRef[]> = {};
            const item: IGridItem = {
                key: recordId,
                _entityName: entityName,
                _entityId: recordId,
                _refs: refs,
            };

            for (const c of dataset.columns || []) {
                // Formatted (display) value drives the visible cell text.
                let formatted = "";
                try {
                    const f = record.getFormattedValue(c.name);
                    formatted = f == null ? "" : f;
                } catch (e) {
                    // Unreadable column - leave the cell empty.
                }
                item[c.name] = formatted;

                // For lookups, also resolve the navigable targets.
                if (isLookupColumn(c.dataType)) {
                    try {
                        const raw = record.getValue(c.name);
                        const extracted = extractLookupRefs(raw);
                        if (extracted.length > 0) {
                            refs[c.name] = extracted;
                        }
                    } catch (e) {
                        // Unreadable lookup - fall through to text only.
                    }
                }
            }

            result.push(item);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error("ReadOnlySubgrid: failed to build row " + recordId, e);
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Apply the active client-side "contains" filters to the rows.
 *
 * `filters` maps columnName -> search text. Empty/whitespace entries are
 * ignored. A row passes only if EVERY active filter matches (logical
 * AND), comparing case-insensitively against the column's formatted
 * value. When no filters are active the original array is returned
 * unchanged (same reference) so callers can cheaply skip work.
 *
 * Filtering is intentionally client-side and operates on the already
 * formatted text, matching what the user sees in the cell.
 */
export function applyTextFilters(
    items: IGridItem[],
    filters: Record<string, string>
): IGridItem[] {
    const activeFilters: Array<[string, string]> = [];
    for (const k of Object.keys(filters)) {
        const v = filters[k];
        if (v && v.length > 0) {
            activeFilters.push([k, v.toLowerCase()]);
        }
    }
    if (activeFilters.length === 0) {
        return items;
    }
    return items.filter((item) => {
        for (const pair of activeFilters) {
            const cell = item[pair[0]] as string | undefined;
            if (!cell || cell.toLowerCase().indexOf(pair[1]) === -1) {
                return false;
            }
        }
        return true;
    });
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * The DetailsList grouping shape. Mirrors FluentUI's IGroup minimally so
 * gridLogic stays free of a FluentUI import; the component passes these
 * straight through as IGroup[].
 */
export interface IGridGroup {
    key: string;
    name: string;
    startIndex: number;
    count: number;
}

/**
 * Group rows by a single column for the "Group by" feature.
 *
 * When `groupByColumn` is null the input is returned untouched with no
 * groups. Otherwise rows are sorted by the grouped column's formatted
 * value (locale-aware) and consecutive runs of equal values become one
 * group. The returned `orderedItems` is the sorted array that the
 * groups' startIndex/count refer into, so the two must always be used
 * together.
 */
export function groupItems(
    items: IGridItem[],
    groupByColumn: string | null
): { orderedItems: IGridItem[]; groups: IGridGroup[] | undefined } {
    if (!groupByColumn) {
        return { orderedItems: items, groups: undefined };
    }

    const sorted = items.slice().sort((a, b) => {
        const va = (a[groupByColumn] as string) || "";
        const vb = (b[groupByColumn] as string) || "";
        return va.localeCompare(vb);
    });

    const groups: IGridGroup[] = [];
    let start = 0;
    // Detect runs by the RAW cell value ("" for empty), and use
    // EMPTY_GROUP_LABEL only as the *displayed* name. If the label were used
    // as the comparison key, a genuine value that happened to equal the label
    // would merge with the empty group. currentRaw === null means "no group
    // open yet" (raw is always a string, never null).
    let currentRaw: string | null = null;

    for (let i = 0; i < sorted.length; i++) {
        const raw = (sorted[i][groupByColumn] as string) || "";
        if (currentRaw === null) {
            currentRaw = raw;
            start = 0;
        } else if (raw !== currentRaw) {
            groups.push({
                key: "g-" + groups.length,
                name: currentRaw || EMPTY_GROUP_LABEL,
                startIndex: start,
                count: i - start,
            });
            start = i;
            currentRaw = raw;
        }
    }
    if (currentRaw !== null) {
        groups.push({
            key: "g-" + groups.length,
            name: currentRaw || EMPTY_GROUP_LABEL,
            startIndex: start,
            count: sorted.length - start,
        });
    }

    return { orderedItems: sorted, groups };
}

// ---------------------------------------------------------------------------
// Sizing math
// ---------------------------------------------------------------------------

/**
 * Clamp the host's reported page size into the visible-row range.
 *
 * The host's "Number of rows" comes through dataset.paging.pageSize. We
 * bound it to [1, MAX_VISUAL_ROWS] and fall back to DEFAULT_VISUAL_ROWS
 * when the host reports nothing useful. This decides how many rows the
 * grid is tall enough to show before the body starts scrolling.
 */
export function computeVisualRows(pageSize: number): number {
    return Math.max(
        1,
        Math.min(MAX_VISUAL_ROWS, pageSize > 0 ? pageSize : DEFAULT_VISUAL_ROWS)
    );
}

/**
 * Compute the grid's outer height (px).
 *
 * The natural (content) height is: header + N rows + horizontal
 * scrollbar gutter + footer. When the host allocates a concrete height
 * we never exceed it (so the grid fits its host slot and the body
 * scrolls); when the host reports 0/unknown we use the natural height.
 *
 * @param allocatedHeight Host-allocated height (context.mode.allocatedHeight); <= 0 means unknown.
 * @param visualRows      Result of computeVisualRows.
 * @param headerHeight    Effective header height (measured or HEADER_HEIGHT).
 * @param rowHeight       Effective row height (measured or ROW_HEIGHT).
 */
export function computeOuterHeight(
    allocatedHeight: number,
    visualRows: number,
    headerHeight: number,
    rowHeight: number
): number {
    const contentHeight =
        headerHeight +
        visualRows * rowHeight +
        HORIZONTAL_SCROLLBAR_HEIGHT +
        FOOTER_HEIGHT;
    return allocatedHeight > 0
        ? Math.min(allocatedHeight, contentHeight)
        : contentHeight;
}

/**
 * Resolve the total record count for the footer.
 *
 * Prefer the server-reported dataset.paging.totalResultCount when it is a
 * valid non-negative number (it reflects the full result set, not just
 * the loaded page); otherwise fall back to the number of rows we have
 * actually built.
 */
export function resolveTotalCount(dataset: DataSet, loadedCount: number): number {
    const pagingAny = dataset.paging as unknown as {
        totalResultCount?: number;
    };
    return typeof pagingAny.totalResultCount === "number" &&
        pagingAny.totalResultCount >= 0
        ? pagingAny.totalResultCount
        : loadedCount;
}

/**
 * Build the footer row-count label.
 *
 * Shows "Rows: N" normally, or "Rows: F of N" while a client-side filter
 * is narrowing the set (F filtered out of N total).
 */
export function formatRowsLabel(filteredCount: number, totalCount: number): string {
    return filteredCount === totalCount
        ? "Rows: " + totalCount
        : "Rows: " + filteredCount + " of " + totalCount;
}
