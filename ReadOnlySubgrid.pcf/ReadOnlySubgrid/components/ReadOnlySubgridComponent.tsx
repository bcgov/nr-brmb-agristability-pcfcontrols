/*
 * Author: Jeroen Jonckheer
 * Component: ReadOnlySubgridComponent
 *
 * FluentUI DetailsList rendering for the ReadOnlySubgrid PCF control.
 *
 * This file owns everything visual and interactive; all *pure* data
 * shaping (row building, filtering, grouping, sizing math, column
 * ordering) lives in ../gridLogic.ts and is imported here. Keeping the
 * split lets the logic be unit-tested without React and lets this file
 * stay focused on layout and event wiring.
 *
 * Responsibilities
 * ----------------
 *   - read columns from dataset metadata, respecting the view's order +
 *     displayName, plus optional user reordering (Move left / Move right);
 *   - format cells via record.getFormattedValue;
 *   - render lookup columns as blue links that open the looked-up record
 *     (the link click stops propagation so it opens the related record
 *     WITHOUT also firing the row's open-this-record handler; clicking
 *     anywhere else on the row still opens the row's own record);
 *   - size columns from the view's visualSizeFactor, with drag-resize and
 *     a "Column width" dialog;
 *   - per-column dropdown: A→Z / Z→A (server-side sort via dataset.refresh),
 *     Group by / Ungroup, Filter by (client-side contains), Column width,
 *     Move left / Move right;
 *   - lazily page in more records as the user scrolls near the bottom,
 *     and eagerly pre-page past the host's tiny default page size;
 *   - footer with the (optionally filtered) row count;
 *   - neutral empty / loading states.
 *
 * Layout model
 * ------------
 *   - outer  : flex column, fixed (host-bounded) height, overflow hidden;
 *   - header : its own DetailsList (rows hidden) so the body's native
 *              vertical scrollbar starts BELOW the header, matching the
 *              standard Power Apps modern grid;
 *   - body   : a second DetailsList (header hidden) in an overflow:auto
 *              div with native scrollbars; its scrollLeft is mirrored onto
 *              the header so the two stay horizontally in lock-step;
 *   - footer : fixed-height row-count band pinned to the bottom.
 *
 * No command bar, toolbar, or New/Add/Delete actions are rendered: this
 * control deliberately replaces the editable subgrid with a read-only view.
 */

import * as React from "react";
import {
    Callout,
    ColumnActionsMode,
    ConstrainMode,
    ContextualMenu,
    DefaultButton,
    DetailsList,
    DetailsListLayoutMode,
    Dialog,
    DialogFooter,
    DialogType,
    DirectionalHint,
    IColumn,
    IContextualMenuItem,
    IDetailsListProps,
    IDetailsRowProps,
    IGroup,
    PrimaryButton,
    SelectionMode,
    Spinner,
    SpinnerSize,
    Stack,
    Text,
    TextField,
} from "@fluentui/react";
import {
    applyTextFilters,
    buildGridItems,
    computeOuterHeight,
    computeVisualRows,
    EAGER_LOAD_TARGET,
    formatRowsLabel,
    FOOTER_HEIGHT,
    groupItems,
    HEADER_HEIGHT,
    HORIZONTAL_SCROLLBAR_HEIGHT,
    IGridItem,
    ILookupRef,
    isLookupColumn,
    MIN_COLUMN_WIDTH,
    moveColumnInOrder,
    orderVisibleColumns,
    PAGING_SCROLL_THRESHOLD,
    resolveColumnWidth,
    resolveTotalCount,
    ROW_HEIGHT,
} from "../gridLogic";

/**
 * Props handed down from index.ts on every updateView. The three
 * callbacks are the control's only mutating channels back into the PCF
 * runtime (open a record, page in more data, change server-side sort);
 * the component itself never mutates the dataset directly.
 */
export interface IReadOnlySubgridComponentProps {
    dataset: ComponentFramework.PropertyTypes.DataSet;
    width: number;
    height: number;
    onOpenRecord: (entityName: string, entityId: string) => void;
    onLoadMore: () => void;
    onSort: (columnName: string, descending: boolean) => void;
}

export const ReadOnlySubgridComponent: React.FC<IReadOnlySubgridComponentProps> = (
    props
) => {
    const { dataset, width, height, onOpenRecord, onLoadMore, onSort } = props;

    // ---- State --------------------------------------------------------------
    //
    // userWidths    : per-column width overrides from drag-resize / dialog.
    // sortState     : currently active sort (seeded from dataset.sorting).
    // columnOrder   : user reordering of columns; null = use the view order.
    // filters       : per-column client-side "contains" text.
    // groupByColumn : the single column the grid is grouped by, or null.
    // menuState     : which column's header dropdown is open + its anchor.
    // filterCallout : which column's filter popover is open + its anchor.
    // widthDialog   : the open "Column width" dialog state, or null.
    const [userWidths, setUserWidths] = React.useState<Record<string, number>>(
        {}
    );
    const [sortState, setSortState] = React.useState<{
        name: string | null;
        descending: boolean;
    }>({
        name:
            dataset.sorting && dataset.sorting.length > 0
                ? dataset.sorting[0].name
                : null,
        descending:
            dataset.sorting &&
            dataset.sorting.length > 0 &&
            dataset.sorting[0].sortDirection === 1,
    });
    const [columnOrder, setColumnOrder] = React.useState<string[] | null>(null);
    const [filters, setFilters] = React.useState<Record<string, string>>({});
    const [groupByColumn, setGroupByColumn] = React.useState<string | null>(
        null
    );
    const [menuState, setMenuState] = React.useState<{
        column: string;
        target: HTMLElement;
    } | null>(null);
    const [filterCallout, setFilterCallout] = React.useState<{
        column: string;
        target: HTMLElement;
    } | null>(null);
    const [widthDialog, setWidthDialog] = React.useState<{
        column: string;
        current: number;
    } | null>(null);

    // ---- Visible columns (respecting user reorder) --------------------------
    const baseColumns = React.useMemo(
        () => orderVisibleColumns(dataset.columns, columnOrder),
        [dataset.columns, columnOrder]
    );

    // ---- Widths from the view definition -----------------------------------
    // One resolved width per visible column (see resolveColumnWidth). User
    // overrides in `userWidths` take precedence when building IColumn[].
    const distributedWidths = React.useMemo(() => {
        const result: Record<string, number> = {};
        baseColumns.forEach((c) => {
            result[c.name] = resolveColumnWidth(c.visualSizeFactor);
        });
        return result;
    }, [baseColumns]);

    // ---- Move / sort helpers ------------------------------------------------
    const moveColumn = React.useCallback(
        (columnName: string, direction: "left" | "right") => {
            const current =
                columnOrder !== null
                    ? columnOrder
                    : baseColumns.map((c) => c.name);
            const next = moveColumnInOrder(current, columnName, direction);
            if (next) {
                setColumnOrder(next);
            }
        },
        [columnOrder, baseColumns]
    );

    const sortByMenu = React.useCallback(
        (columnName: string, descending: boolean) => {
            // Reflect the choice locally for the header chevron, then ask
            // index.ts to apply it server-side via dataset.sorting + refresh.
            setSortState({ name: columnName, descending: descending });
            onSort(columnName, descending);
        },
        [onSort]
    );

    const handleColumnResize = React.useCallback(
        (column?: IColumn, newWidth?: number) => {
            if (!column || !column.key || typeof newWidth !== "number") {
                return;
            }
            const key = column.key;
            setUserWidths((prev) => ({ ...prev, [key]: newWidth }));
        },
        []
    );

    const handleColumnClick = React.useCallback(
        (ev: React.MouseEvent<HTMLElement>, column: IColumn): void => {
            if (!column.key) {
                return;
            }
            setMenuState({
                column: column.key,
                target: ev.currentTarget as HTMLElement,
            });
        },
        []
    );

    // ---- Header dropdown menu items -----------------------------------------
    // Built per-column when its dropdown opens. Every item closes the menu
    // after acting. "Filter by" is special: it must hand its anchor element
    // to the filter callout, so it reads menuState.target before clearing.
    const buildMenuItems = (columnName: string): IContextualMenuItem[] => {
        const isGrouped = groupByColumn === columnName;
        const hasFilter = !!filters[columnName];
        return [
            {
                key: "asc",
                text: "A to Z",
                iconProps: { iconName: "SortUp" },
                onClick: () => {
                    sortByMenu(columnName, false);
                    setMenuState(null);
                },
            },
            {
                key: "desc",
                text: "Z to A",
                iconProps: { iconName: "SortDown" },
                onClick: () => {
                    sortByMenu(columnName, true);
                    setMenuState(null);
                },
            },
            {
                key: "group",
                text: isGrouped ? "Ungroup" : "Group by",
                iconProps: { iconName: "GroupedList" },
                onClick: () => {
                    setGroupByColumn(isGrouped ? null : columnName);
                    setMenuState(null);
                },
            },
            {
                key: "filter",
                text: hasFilter ? "Edit filter" : "Filter by",
                iconProps: { iconName: "Filter" },
                onClick: () => {
                    const target = menuState ? menuState.target : null;
                    setMenuState(null);
                    if (target) {
                        setFilterCallout({
                            column: columnName,
                            target: target,
                        });
                    }
                },
            },
            {
                key: "width",
                text: "Column width",
                iconProps: { iconName: "Width" },
                onClick: () => {
                    const cur =
                        userWidths[columnName] !== undefined
                            ? userWidths[columnName]
                            : distributedWidths[columnName] || MIN_COLUMN_WIDTH;
                    setMenuState(null);
                    setWidthDialog({ column: columnName, current: cur });
                },
            },
            {
                key: "moveLeft",
                text: "Move left",
                iconProps: { iconName: "Back" },
                onClick: () => {
                    moveColumn(columnName, "left");
                    setMenuState(null);
                },
            },
            {
                key: "moveRight",
                text: "Move right",
                iconProps: { iconName: "Forward" },
                onClick: () => {
                    moveColumn(columnName, "right");
                    setMenuState(null);
                },
            },
        ];
    };

    // ---- Lookup cell renderer ----------------------------------------------
    // Renders each resolved lookup target as a clickable link. The link's
    // click/keydown stop propagation so opening the *looked-up* record does
    // not also trigger the row-level "open this record" handler. PartyList
    // and multi-value lookups render several links separated by "; ".
    const renderLookupCell = React.useCallback(
        (columnName: string, item?: IGridItem): JSX.Element | null => {
            if (!item) {
                return null;
            }
            const refs: ILookupRef[] =
                (item._refs && item._refs[columnName]) || [];
            const text = (item[columnName] as string) || "";
            if (refs.length === 0) {
                return <span>{text}</span>;
            }
            return (
                <span>
                    {refs.map((r, i) => {
                        const handleLinkClick = (
                            e: React.MouseEvent<HTMLAnchorElement>
                        ): void => {
                            e.stopPropagation();
                            e.preventDefault();
                            onOpenRecord(r.entityName, r.id);
                        };
                        const handleLinkKey = (
                            e: React.KeyboardEvent<HTMLAnchorElement>
                        ): void => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                e.preventDefault();
                                onOpenRecord(r.entityName, r.id);
                            }
                        };
                        return (
                            <React.Fragment
                                key={r.entityName + "-" + r.id + "-" + i}
                            >
                                {i > 0 ? <span>{"; "}</span> : null}
                                <a
                                    className="jj-readonly-subgrid-link"
                                    role="link"
                                    tabIndex={0}
                                    onClick={handleLinkClick}
                                    onKeyDown={handleLinkKey}
                                >
                                    {r.name || text}
                                </a>
                            </React.Fragment>
                        );
                    })}
                </span>
            );
        },
        [onOpenRecord]
    );

    // ---- Build FluentUI IColumn[] -------------------------------------------
    // Translates our ordered dataset columns into DetailsList column defs,
    // wiring width (user override or view width), sort/filter/group flags
    // for the header affordances, the dropdown trigger, and: for lookup
    // columns only: the custom link renderer.
    const columns: IColumn[] = React.useMemo(() => {
        return baseColumns.map<IColumn>((c) => {
            const w =
                userWidths[c.name] !== undefined
                    ? userWidths[c.name]
                    : distributedWidths[c.name] || MIN_COLUMN_WIDTH;
            const isSorted = sortState.name === c.name;
            const isLookup = isLookupColumn(c.dataType);
            const colName = c.name;
            const def: IColumn = {
                key: c.name,
                name: c.displayName,
                fieldName: c.name,
                minWidth: MIN_COLUMN_WIDTH,
                maxWidth: w,
                currentWidth: w,
                isResizable: true,
                isSorted: isSorted,
                isSortedDescending: isSorted ? sortState.descending : false,
                isFiltered: !!filters[c.name],
                isGrouped: groupByColumn === c.name,
                columnActionsMode: ColumnActionsMode.hasDropdown,
                onColumnClick: handleColumnClick,
                data: c,
            };
            if (isLookup) {
                def.onRender = (item?: IGridItem) =>
                    renderLookupCell(colName, item);
            }
            return def;
        });
    }, [
        baseColumns,
        userWidths,
        distributedWidths,
        sortState,
        filters,
        groupByColumn,
        handleColumnClick,
        renderLookupCell,
    ]);

    // ---- Rows ---------------------------------------------------------------
    // Pure transform of the dataset into renderable rows (see gridLogic).
    const allItems: IGridItem[] = React.useMemo(
        () => buildGridItems(dataset),
        [dataset.sortedRecordIds, dataset.records, dataset.columns]
    );

    // ---- Eager paging -------------------------------------------------------
    //
    // The subgrid host often starts with pageSize equal to the "Number of
    // rows" property (as low as 4). With so few records the body never
    // overflows, so the scroll handler can never fire and the rest stay
    // unreachable. We compensate by proactively pulling pages until we hit
    // EAGER_LOAD_TARGET or run out. onLoadMore uses loadNextPage (additive),
    // never setPageSize, which previously caused a never-resolving load.
    const hasNextPage =
        dataset.paging && dataset.paging.hasNextPage ? true : false;
    React.useEffect(() => {
        if (
            !dataset.loading &&
            hasNextPage &&
            allItems.length > 0 &&
            allItems.length < EAGER_LOAD_TARGET
        ) {
            onLoadMore();
        }
    }, [allItems.length, dataset.loading, hasNextPage, onLoadMore]);

    // ---- Filter then group --------------------------------------------------
    const filteredItems = React.useMemo(
        () => applyTextFilters(allItems, filters),
        [allItems, filters]
    );

    const { orderedItems, groups } = React.useMemo<{
        orderedItems: IGridItem[];
        groups: IGroup[] | undefined;
    }>(
        () => groupItems(filteredItems, groupByColumn),
        [filteredItems, groupByColumn]
    );

    // ---- Row rendering (click / Enter opens the record) ---------------------
    const onRenderRow: IDetailsListProps["onRenderRow"] = (
        rowProps?: IDetailsRowProps,
        defaultRender?: (p?: IDetailsRowProps) => JSX.Element | null
    ) => {
        if (!rowProps || !defaultRender) {
            return null;
        }
        const item = rowProps.item as IGridItem;
        const handleClick = (): void => {
            onOpenRecord(item._entityName, item._entityId);
        };
        const handleKeyDown = (
            ev: React.KeyboardEvent<HTMLDivElement>
        ): void => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onOpenRecord(item._entityName, item._entityId);
            }
        };
        return (
            <div
                role="link"
                tabIndex={0}
                className="jj-readonly-subgrid-row"
                onClick={handleClick}
                onKeyDown={handleKeyDown}
            >
                {defaultRender(rowProps)}
            </div>
        );
    };

    // ---- Dynamic row / header measurement -----------------------------------
    //
    // HEADER_HEIGHT / ROW_HEIGHT are starting estimates. After the
    // DetailsList mounts we read the actual rendered heights from the DOM
    // and use those for the outer-height math, so a future Fluent update or
    // a custom user font that shifts the rendered size by a few px still
    // lands the layout on a clean row boundary instead of clipping. In a
    // non-layout environment (e.g. jsdom) offsetHeight is 0, so the
    // estimates are kept: which is exactly what we want for tests.
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const [measured, setMeasured] = React.useState<{
        row: number;
        header: number;
    } | null>(null);
    React.useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }
        const headerEl = root.querySelector(
            ".ms-DetailsHeader"
        ) as HTMLElement | null;
        const rowEl = root.querySelector(
            ".ms-DetailsRow"
        ) as HTMLElement | null;
        const h = headerEl ? headerEl.offsetHeight : 0;
        const r = rowEl ? rowEl.offsetHeight : 0;
        if (h > 0 && r > 0) {
            setMeasured((prev) => {
                if (prev && prev.row === r && prev.header === h) {
                    return prev;
                }
                return { row: r, header: h };
            });
        }
    }, [allItems.length, baseColumns.length, dataset.loading]);

    // ---- Effective dimensions ----------------------------------------------
    // visualRows derives from the host page size; the outer height is bounded
    // by those rows so the body scrolls instead of the grid growing to fit
    // every loaded record. Measured heights override the estimates when known.
    const pageSize =
        dataset.paging && typeof dataset.paging.pageSize === "number"
            ? dataset.paging.pageSize
            : 0;
    const visualRows = computeVisualRows(pageSize);
    const effectiveHeaderHeight =
        measured && measured.header > 0 ? measured.header : HEADER_HEIGHT;
    const effectiveRowHeight =
        measured && measured.row > 0 ? measured.row : ROW_HEIGHT;
    const effectiveHeight = computeOuterHeight(
        height,
        visualRows,
        effectiveHeaderHeight,
        effectiveRowHeight
    );

    // ---- Scroll handling: header lock-step + bottom paging ------------------
    //
    // The header lives in its own overflow:hidden div above the body; the
    // body has native scrollbars. We mirror the body's scrollLeft onto the
    // header so they scroll together horizontally, and trigger onLoadMore
    // when the user scrolls within PAGING_SCROLL_THRESHOLD of the bottom.
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const headerAreaRef = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        const body = scrollRef.current;
        if (!body) {
            return;
        }
        const handler = (): void => {
            const header = headerAreaRef.current;
            if (header) {
                header.scrollLeft = body.scrollLeft;
            }
            if (
                dataset.paging &&
                dataset.paging.hasNextPage &&
                !dataset.loading
            ) {
                const distance =
                    body.scrollHeight - (body.scrollTop + body.clientHeight);
                if (distance < PAGING_SCROLL_THRESHOLD) {
                    onLoadMore();
                }
            }
        };
        body.addEventListener("scroll", handler);
        return () => {
            body.removeEventListener("scroll", handler);
        };
    }, [
        dataset.paging,
        dataset.paging && dataset.paging.hasNextPage,
        dataset.loading,
        onLoadMore,
    ]);

    // ---- Layout styles ------------------------------------------------------
    const outerStyle: React.CSSProperties = {
        width: width > 0 ? width : "100%",
        height: effectiveHeight,
        backgroundColor: "#ffffff",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
    };
    // Header area above the body so the body's native vertical scrollbar
    // starts below the header. overflow:hidden hides the header's own
    // scrollbar while still letting us scroll it programmatically.
    const headerAreaStyle: React.CSSProperties = {
        flex: "0 0 auto",
        height: effectiveHeaderHeight,
        overflow: "hidden",
        position: "relative",
        backgroundColor: "#ffffff",
    };
    const bodyStyle: React.CSSProperties = {
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        position: "relative",
        backgroundColor: "#ffffff",
    };
    const footerStyle: React.CSSProperties = {
        flex: "0 0 " + FOOTER_HEIGHT + "px",
        height: FOOTER_HEIGHT,
        boxSizing: "border-box",
        padding: "4px 12px",
        borderTop: "1px solid #edebe9",
        backgroundColor: "#ffffff",
        color: "#605e5c",
        fontSize: 12,
        display: "flex",
        alignItems: "center",
    };

    // ---- Footer row count ---------------------------------------------------
    const totalCount = resolveTotalCount(dataset, allItems.length);
    const filteredCount = filteredItems.length;
    const rowsLabel = formatRowsLabel(filteredCount, totalCount);

    // ---- Empty / loading state ----------------------------------------------
    const isLoadingInitial = dataset.loading && allItems.length === 0;
    const isEmpty = !dataset.loading && filteredItems.length === 0;

    return (
        <div ref={rootRef} style={outerStyle}>
            {isLoadingInitial ? (
                <div style={bodyStyle}>
                    <Stack
                        horizontalAlign="center"
                        verticalAlign="center"
                        styles={{ root: { height: "100%", padding: 24 } }}
                    >
                        <Spinner
                            size={SpinnerSize.medium}
                            label="Records laden"
                        />
                    </Stack>
                </div>
            ) : isEmpty ? (
                <div style={bodyStyle}>
                    <Stack
                        horizontalAlign="center"
                        verticalAlign="center"
                        styles={{ root: { height: "100%", padding: 24 } }}
                    >
                        <Text
                            variant="medium"
                            styles={{ root: { color: "#605e5c" } }}
                        >
                            Geen records
                        </Text>
                    </Stack>
                </div>
            ) : (
                <React.Fragment>
                    {/* Header-only DetailsList: rows hidden via contentWrapper
                        display:none; sits in its own scroll-synced area. */}
                    <div
                        ref={headerAreaRef}
                        style={headerAreaStyle}
                        className="jj-readonly-subgrid-header-area"
                    >
                        <DetailsList
                            items={[]}
                            columns={columns}
                            setKey="jj-readonly-subgrid-header"
                            selectionMode={SelectionMode.none}
                            layoutMode={DetailsListLayoutMode.fixedColumns}
                            constrainMode={ConstrainMode.unconstrained}
                            isHeaderVisible={true}
                            compact={false}
                            onColumnResize={handleColumnResize}
                            onShouldVirtualize={() => false}
                            styles={{
                                root: { backgroundColor: "#ffffff" },
                                contentWrapper: { display: "none" },
                            }}
                        />
                    </div>
                    {/* Body-only DetailsList: header hidden; native scrollbars
                        provide vertical/horizontal scroll. */}
                    <div
                        ref={scrollRef}
                        style={bodyStyle}
                        className="jj-readonly-subgrid-body"
                    >
                        <DetailsList
                            items={orderedItems}
                            groups={groups}
                            columns={columns}
                            setKey="jj-readonly-subgrid-rows"
                            selectionMode={SelectionMode.none}
                            layoutMode={DetailsListLayoutMode.fixedColumns}
                            constrainMode={ConstrainMode.unconstrained}
                            isHeaderVisible={false}
                            compact={false}
                            onRenderRow={onRenderRow}
                            onShouldVirtualize={() => false}
                            styles={{
                                root: { backgroundColor: "#ffffff" },
                            }}
                        />
                        {/* Inline spinner when paging additional records in. */}
                        {dataset.loading && allItems.length > 0 ? (
                            <Stack
                                horizontalAlign="center"
                                styles={{ root: { padding: 8 } }}
                            >
                                <Spinner size={SpinnerSize.small} />
                            </Stack>
                        ) : null}
                    </div>
                </React.Fragment>
            )}
            <div style={footerStyle}>{rowsLabel}</div>

            {/* Header dropdown menu (sort / group / filter / width / move). */}
            {menuState ? (
                <ContextualMenu
                    target={menuState.target}
                    items={buildMenuItems(menuState.column)}
                    onDismiss={() => setMenuState(null)}
                    directionalHint={DirectionalHint.bottomLeftEdge}
                />
            ) : null}

            {/* Client-side "contains" filter popover for one column. */}
            {filterCallout ? (
                <Callout
                    target={filterCallout.target}
                    onDismiss={() => setFilterCallout(null)}
                    directionalHint={DirectionalHint.bottomLeftEdge}
                    setInitialFocus={true}
                    styles={{ root: { padding: 0 } }}
                >
                    <Stack
                        tokens={{ childrenGap: 8 }}
                        styles={{ root: { padding: 12, minWidth: 240 } }}
                    >
                        <Text
                            variant="mediumPlus"
                            styles={{ root: { fontWeight: 600 } }}
                        >
                            Filter
                        </Text>
                        <TextField
                            label="Bevat"
                            placeholder="typ om te filteren"
                            value={filters[filterCallout.column] || ""}
                            onChange={(_ev, v) => {
                                const col = filterCallout.column;
                                setFilters((prev) => ({
                                    ...prev,
                                    [col]: v || "",
                                }));
                            }}
                            styles={{ field: { backgroundColor: "#ffffff" } }}
                        />
                        <Stack
                            horizontal
                            tokens={{ childrenGap: 8 }}
                            horizontalAlign="end"
                        >
                            <DefaultButton
                                text="Wissen"
                                onClick={() => {
                                    const col = filterCallout.column;
                                    setFilters((prev) => {
                                        const next = { ...prev };
                                        delete next[col];
                                        return next;
                                    });
                                    setFilterCallout(null);
                                }}
                            />
                            <PrimaryButton
                                text="Klaar"
                                onClick={() => setFilterCallout(null)}
                            />
                        </Stack>
                    </Stack>
                </Callout>
            ) : null}

            {/* "Column width" dialog: numeric px entry, clamped to the min. */}
            {widthDialog ? (
                <Dialog
                    hidden={false}
                    onDismiss={() => setWidthDialog(null)}
                    dialogContentProps={{
                        type: DialogType.normal,
                        title: "Kolombreedte",
                        subText: "Breedte in pixels",
                    }}
                >
                    <TextField
                        type="number"
                        value={String(widthDialog.current)}
                        onChange={(_ev, v) => {
                            const parsed = parseInt(v || "0", 10);
                            if (!isNaN(parsed)) {
                                setWidthDialog({
                                    column: widthDialog.column,
                                    current: parsed,
                                });
                            }
                        }}
                        styles={{ field: { backgroundColor: "#ffffff" } }}
                    />
                    <DialogFooter>
                        <PrimaryButton
                            text="Toepassen"
                            onClick={() => {
                                const col = widthDialog.column;
                                const value = Math.max(
                                    MIN_COLUMN_WIDTH,
                                    widthDialog.current
                                );
                                setUserWidths((prev) => ({
                                    ...prev,
                                    [col]: value,
                                }));
                                setWidthDialog(null);
                            }}
                        />
                        <DefaultButton
                            text="Annuleren"
                            onClick={() => setWidthDialog(null)}
                        />
                    </DialogFooter>
                </Dialog>
            ) : null}
        </div>
    );
};
