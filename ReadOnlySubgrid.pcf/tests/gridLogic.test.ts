/*
 * Author: Jeroen Jonckheer
 * Unit tests for ReadOnlySubgrid/gridLogic.ts.
 *
 * gridLogic is pure, so these tests need no React and no DOM. They cover
 * the happy path plus the defensive edge cases the production code is
 * built to survive (missing columns, malformed lookups, hostile records,
 * empty datasets, filter/sort/group boundaries).
 */
import {
    applyTextFilters,
    buildGridItems,
    computeOuterHeight,
    computeVisualRows,
    DEFAULT_COLUMN_WIDTH,
    DEFAULT_VISUAL_ROWS,
    EMPTY_GROUP_LABEL,
    extractLookupRefs,
    FOOTER_HEIGHT,
    formatRowsLabel,
    groupItems,
    HORIZONTAL_SCROLLBAR_HEIGHT,
    IGridItem,
    isLookupColumn,
    MAX_VISUAL_ROWS,
    MIN_COLUMN_WIDTH,
    moveColumnInOrder,
    orderVisibleColumns,
    resolveColumnWidth,
    resolveTotalCount,
} from "../ReadOnlySubgrid/gridLogic";
import { makeDataset } from "./mockDataset";

// Small helper to fabricate IGridItems for the filter/group tests.
function item(key: string, values: Record<string, string>): IGridItem {
    return {
        key,
        _entityName: "account",
        _entityId: key,
        _refs: {},
        ...values,
    };
}

describe("isLookupColumn", () => {
    it("recognises every Lookup.* variant", () => {
        expect(isLookupColumn("Lookup.Simple")).toBe(true);
        expect(isLookupColumn("Lookup.Customer")).toBe(true);
        expect(isLookupColumn("Lookup.Owner")).toBe(true);
        expect(isLookupColumn("Lookup.PartyList")).toBe(true);
    });

    it("rejects non-lookup and undefined dataTypes", () => {
        expect(isLookupColumn("SingleLine.Text")).toBe(false);
        expect(isLookupColumn("Whole.None")).toBe(false);
        expect(isLookupColumn("")).toBe(false);
        expect(isLookupColumn(undefined)).toBe(false);
        // Must anchor at index 0, not merely contain "Lookup".
        expect(isLookupColumn("MyLookupThing")).toBe(false);
    });
});

describe("resolveColumnWidth", () => {
    it("honours a view width at or above the minimum", () => {
        expect(resolveColumnWidth(200)).toBe(200);
        expect(resolveColumnWidth(MIN_COLUMN_WIDTH)).toBe(MIN_COLUMN_WIDTH);
    });

    it("falls back to default for undefined / zero / sub-minimum", () => {
        expect(resolveColumnWidth(undefined)).toBe(DEFAULT_COLUMN_WIDTH);
        expect(resolveColumnWidth(0)).toBe(DEFAULT_COLUMN_WIDTH);
        expect(resolveColumnWidth(MIN_COLUMN_WIDTH - 1)).toBe(
            DEFAULT_COLUMN_WIDTH
        );
    });
});

describe("orderVisibleColumns", () => {
    const cols = [
        { name: "c", displayName: "C", order: 2, isHidden: false },
        { name: "a", displayName: "A", order: 0, isHidden: false },
        { name: "b", displayName: "B", order: 1, isHidden: false },
        { name: "secret", displayName: "S", order: 3, isHidden: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;

    it("sorts by order and drops hidden columns when no user order", () => {
        const result = orderVisibleColumns(cols, null);
        expect(result.map((c) => c.name)).toEqual(["a", "b", "c"]);
    });

    it("applies a user order and appends unlisted columns", () => {
        const result = orderVisibleColumns(cols, ["c", "a"]);
        // c, a first (as listed), then b (unlisted) appended.
        expect(result.map((c) => c.name)).toEqual(["c", "a", "b"]);
    });

    it("ignores names in the user order that no longer exist", () => {
        const result = orderVisibleColumns(cols, ["ghost", "b"]);
        expect(result.map((c) => c.name)).toEqual(["b", "a", "c"]);
    });

    it("handles an undefined column list", () => {
        expect(orderVisibleColumns(undefined, null)).toEqual([]);
    });
});

describe("moveColumnInOrder", () => {
    it("moves left and right", () => {
        expect(moveColumnInOrder(["a", "b", "c"], "b", "left")).toEqual([
            "b",
            "a",
            "c",
        ]);
        expect(moveColumnInOrder(["a", "b", "c"], "b", "right")).toEqual([
            "a",
            "c",
            "b",
        ]);
    });

    it("returns null at the edges and for unknown columns", () => {
        expect(moveColumnInOrder(["a", "b"], "a", "left")).toBeNull();
        expect(moveColumnInOrder(["a", "b"], "b", "right")).toBeNull();
        expect(moveColumnInOrder(["a", "b"], "z", "left")).toBeNull();
    });

    it("does not mutate the input array", () => {
        const input = ["a", "b", "c"];
        moveColumnInOrder(input, "b", "left");
        expect(input).toEqual(["a", "b", "c"]);
    });
});

describe("extractLookupRefs", () => {
    it("extracts a single EntityReference with string id", () => {
        const refs = extractLookupRefs({
            id: "11111111-1111-1111-1111-111111111111",
            entityType: "contact",
            name: "Jane",
        });
        expect(refs).toEqual([
            {
                id: "11111111-1111-1111-1111-111111111111",
                entityName: "contact",
                name: "Jane",
            },
        ]);
    });

    it("unwraps a { guid } id and reads etn / LogicalName fallbacks", () => {
        expect(
            extractLookupRefs({ id: { guid: "g1" }, etn: "account", name: "A" })
        ).toEqual([{ id: "g1", entityName: "account", name: "A" }]);
        expect(
            extractLookupRefs({
                id: "g2",
                LogicalName: "lead",
                formattedValue: "L",
            })
        ).toEqual([{ id: "g2", entityName: "lead", name: "L" }]);
    });

    it("flattens arrays (PartyList) and skips unusable entries", () => {
        const refs = extractLookupRefs([
            { id: "a", entityType: "contact", name: "X" },
            { id: "b" }, // no entity type -> skipped
            null,
            { entityType: "account" }, // no id -> skipped
            { id: "c", entityType: "lead", name: "Y" },
        ]);
        expect(refs.map((r) => r.id)).toEqual(["a", "c"]);
    });

    it("returns [] for null / primitives / empty object", () => {
        expect(extractLookupRefs(null)).toEqual([]);
        expect(extractLookupRefs(undefined)).toEqual([]);
        expect(extractLookupRefs("str")).toEqual([]);
        expect(extractLookupRefs(42)).toEqual([]);
        expect(extractLookupRefs({})).toEqual([]);
    });
});

describe("buildGridItems", () => {
    it("builds one row per record with formatted cell values", () => {
        const ds = makeDataset({
            columns: [
                { name: "name", displayName: "Name", order: 0, dataType: "SingleLine.Text" },
                { name: "city", displayName: "City", order: 1, dataType: "SingleLine.Text" },
            ],
            records: [
                { id: "r1", formatted: { name: "Acme", city: "Gent" } },
                { id: "r2", formatted: { name: "Globex", city: "Brugge" } },
            ],
        });
        const items = buildGridItems(ds);
        expect(items).toHaveLength(2);
        expect(items[0].key).toBe("r1");
        expect(items[0].name).toBe("Acme");
        expect(items[0]._entityName).toBe("account");
        expect(items[1].city).toBe("Brugge");
    });

    it("resolves lookup refs into _refs for lookup columns", () => {
        const ds = makeDataset({
            columns: [
                { name: "primarycontactid", displayName: "Contact", order: 0, dataType: "Lookup.Simple" },
            ],
            records: [
                {
                    id: "r1",
                    formatted: { primarycontactid: "Jane Doe" },
                    raw: {
                        primarycontactid: {
                            id: { guid: "c1" },
                            entityType: "contact",
                            name: "Jane Doe",
                        },
                    },
                },
            ],
        });
        const items = buildGridItems(ds);
        expect(items[0]._refs.primarycontactid).toEqual([
            { id: "c1", entityName: "contact", name: "Jane Doe" },
        ]);
    });

    it("returns an empty array for a dataset with no records", () => {
        const ds = makeDataset({
            columns: [
                { name: "name", displayName: "Name", order: 0, dataType: "SingleLine.Text" },
            ],
            records: [],
        });
        expect(buildGridItems(ds)).toEqual([]);
    });

    it("skips a record whose getFormattedValue throws, without aborting the rest", () => {
        const ds = makeDataset({
            columns: [
                { name: "name", displayName: "Name", order: 0, dataType: "SingleLine.Text" },
            ],
            records: [
                { id: "ok", formatted: { name: "Fine" } },
                { id: "bad", formatted: { name: "Boom" } },
            ],
        });
        // Make the "bad" record throw on read.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ds.records["bad"] as any).getFormattedValue = () => {
            throw new Error("boom");
        };
        // A column read throwing is caught per-cell, so the row still
        // appears with an empty cell rather than disappearing.
        const items = buildGridItems(ds);
        expect(items.map((i) => i.key)).toEqual(["ok", "bad"]);
        expect(items[1].name).toBe("");
    });
});

describe("applyTextFilters", () => {
    const items = [
        item("1", { name: "Acme", city: "Gent" }),
        item("2", { name: "Globex", city: "Gent" }),
        item("3", { name: "Initech", city: "Brugge" }),
    ];

    it("returns the same reference when no filters are active", () => {
        expect(applyTextFilters(items, {})).toBe(items);
        expect(applyTextFilters(items, { name: "" })).toBe(items);
    });

    it("filters case-insensitively on contains", () => {
        expect(applyTextFilters(items, { name: "ac" }).map((i) => i.key)).toEqual([
            "1",
        ]);
    });

    it("ANDs multiple active filters", () => {
        const res = applyTextFilters(items, { city: "gent", name: "glob" });
        expect(res.map((i) => i.key)).toEqual(["2"]);
    });

    it("returns [] when nothing matches", () => {
        expect(applyTextFilters(items, { name: "zzz" })).toEqual([]);
    });
});

describe("groupItems", () => {
    const items = [
        item("1", { city: "Gent" }),
        item("2", { city: "Brugge" }),
        item("3", { city: "Gent" }),
        item("4", { city: "" }),
    ];

    it("passes through untouched when groupByColumn is null", () => {
        const res = groupItems(items, null);
        expect(res.groups).toBeUndefined();
        expect(res.orderedItems).toBe(items);
    });

    it("sorts by value and produces contiguous groups with counts", () => {
        const res = groupItems(items, "city");
        // Sorted: "" , Brugge, Gent, Gent
        expect(res.orderedItems.map((i) => i.key)).toEqual(["4", "2", "1", "3"]);
        const summary = (res.groups || []).map((g) => [g.name, g.count]);
        expect(summary).toEqual([
            [EMPTY_GROUP_LABEL, 1],
            ["Brugge", 1],
            ["Gent", 2],
        ]);
    });

    it("handles an empty list", () => {
        const res = groupItems([], "city");
        expect(res.orderedItems).toEqual([]);
        expect(res.groups).toEqual([]);
    });

    it("keeps a genuine '(leeg)' value separate from truly empty cells", () => {
        // Runs are detected on the raw value, so an empty cell only ever
        // groups with other empties even if a real value equals the label.
        const data = [
            item("a", { city: "" }),
            item("b", { city: EMPTY_GROUP_LABEL }),
            item("c", { city: "" }),
        ];
        const res = groupItems(data, "city");
        expect(res.groups).toHaveLength(2);
        // "" sorts before "(leeg)": empties (2) then the literal value (1);
        // both are displayed under the same label.
        expect((res.groups || []).map((g) => [g.name, g.count])).toEqual([
            [EMPTY_GROUP_LABEL, 2],
            [EMPTY_GROUP_LABEL, 1],
        ]);
    });
});

describe("computeVisualRows", () => {
    it("uses the page size when within range", () => {
        expect(computeVisualRows(10)).toBe(10);
    });
    it("falls back to the default for zero / negative", () => {
        expect(computeVisualRows(0)).toBe(DEFAULT_VISUAL_ROWS);
        expect(computeVisualRows(-5)).toBe(DEFAULT_VISUAL_ROWS);
    });
    it("caps at the maximum", () => {
        expect(computeVisualRows(9999)).toBe(MAX_VISUAL_ROWS);
    });
});

describe("computeOuterHeight", () => {
    it("returns the natural content height when no host height is given", () => {
        // header 42 + 4 rows * 42 + scrollbar + footer
        const expected = 42 + 4 * 42 + HORIZONTAL_SCROLLBAR_HEIGHT + FOOTER_HEIGHT;
        expect(computeOuterHeight(0, 4, 42, 42)).toBe(expected);
    });

    it("never exceeds a positive host-allocated height", () => {
        expect(computeOuterHeight(100, 25, 42, 42)).toBe(100);
    });

    it("uses measured row/header heights when supplied", () => {
        const expected = 50 + 2 * 46 + HORIZONTAL_SCROLLBAR_HEIGHT + FOOTER_HEIGHT;
        expect(computeOuterHeight(0, 2, 50, 46)).toBe(expected);
    });
});

describe("resolveTotalCount", () => {
    it("prefers the server total when valid", () => {
        const ds = makeDataset({
            columns: [],
            records: [{ id: "r1", formatted: {} }],
            paging: { totalResultCount: 137 },
        });
        expect(resolveTotalCount(ds, 1)).toBe(137);
    });

    it("falls back to the loaded count when the server total is absent/negative", () => {
        const ds = makeDataset({
            columns: [],
            records: [{ id: "r1", formatted: {} }],
            paging: { totalResultCount: -1 },
        });
        expect(resolveTotalCount(ds, 12)).toBe(12);
    });
});

describe("formatRowsLabel", () => {
    it("shows a plain count when nothing is filtered out", () => {
        expect(formatRowsLabel(10, 10)).toBe("Rows: 10");
    });
    it("shows 'F of N' while filtering", () => {
        expect(formatRowsLabel(3, 10)).toBe("Rows: 3 of 10");
    });
});
