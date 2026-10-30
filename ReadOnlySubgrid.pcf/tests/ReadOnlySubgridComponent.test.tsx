/*
 * Author: Jeroen Jonckheer
 * Render / interaction tests for ReadOnlySubgridComponent.
 *
 * These mount the real component (with a mocked dataset) in jsdom and
 * assert the behaviour a user actually sees and triggers: rows + footer,
 * empty / loading states, row-open navigation, lookup-link navigation
 * (with its stopPropagation so it does NOT also open the row), and the
 * eager-paging callback. They complement the pure gridLogic tests by
 * verifying the wiring between logic, FluentUI and the PCF callbacks.
 */
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReadOnlySubgridComponent } from "../ReadOnlySubgrid/components/ReadOnlySubgridComponent";
import { makeDataset } from "./mockDataset";

// Reusable column set: one text column + one lookup column.
const COLUMNS = [
    { name: "name", displayName: "Name", order: 0, dataType: "SingleLine.Text" },
    {
        name: "primarycontactid",
        displayName: "Contact",
        order: 1,
        dataType: "Lookup.Simple",
    },
];

function renderGrid(
    overrides: Partial<{
        onOpenRecord: jest.Mock;
        onLoadMore: jest.Mock;
        onSort: jest.Mock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dataset: any;
        width: number;
        height: number;
    }> = {}
) {
    const onOpenRecord = overrides.onOpenRecord || jest.fn();
    const onLoadMore = overrides.onLoadMore || jest.fn();
    const onSort = overrides.onSort || jest.fn();
    const dataset =
        overrides.dataset ||
        makeDataset({
            columns: COLUMNS,
            records: [
                {
                    id: "r1",
                    formatted: { name: "Acme", primarycontactid: "Jane Doe" },
                    raw: {
                        primarycontactid: {
                            id: { guid: "c1" },
                            entityType: "contact",
                            name: "Jane Doe",
                        },
                    },
                },
                {
                    id: "r2",
                    formatted: { name: "Globex", primarycontactid: "" },
                },
            ],
        });
    const utils = render(
        <ReadOnlySubgridComponent
            dataset={dataset}
            width={overrides.width !== undefined ? overrides.width : 800}
            height={overrides.height !== undefined ? overrides.height : 400}
            onOpenRecord={onOpenRecord}
            onLoadMore={onLoadMore}
            onSort={onSort}
        />
    );
    return { ...utils, onOpenRecord, onLoadMore, onSort, dataset };
}

describe("ReadOnlySubgridComponent", () => {
    it("renders the records and a footer row count", () => {
        renderGrid();
        expect(screen.getByText("Acme")).toBeInTheDocument();
        expect(screen.getByText("Globex")).toBeInTheDocument();
        // totalResultCount defaults to the record count (2) in the mock.
        expect(screen.getByText("Rows: 2")).toBeInTheDocument();
    });

    it("shows the empty state when there are no records", () => {
        const dataset = makeDataset({ columns: COLUMNS, records: [] });
        renderGrid({ dataset });
        expect(screen.getByText("Geen records")).toBeInTheDocument();
    });

    it("shows the loading state before the first records arrive", () => {
        const dataset = makeDataset({
            columns: COLUMNS,
            records: [],
            loading: true,
        });
        renderGrid({ dataset });
        expect(screen.getByText("Records laden")).toBeInTheDocument();
    });

    it("opens the row record on row click", () => {
        const { container, onOpenRecord } = renderGrid();
        const rows = container.querySelectorAll(".jj-readonly-subgrid-row");
        expect(rows.length).toBe(2);
        fireEvent.click(rows[0]);
        expect(onOpenRecord).toHaveBeenCalledWith("account", "r1");
    });

    it("opens the looked-up record on link click, not the row", () => {
        const { container, onOpenRecord } = renderGrid();
        const link = container.querySelector(
            ".jj-readonly-subgrid-link"
        ) as HTMLElement;
        expect(link).toBeTruthy();
        expect(link.textContent).toBe("Jane Doe");
        fireEvent.click(link);
        // Lookup target (contact / c1), and exactly once: the row handler
        // must not also fire because the link stops propagation.
        expect(onOpenRecord).toHaveBeenCalledTimes(1);
        expect(onOpenRecord).toHaveBeenCalledWith("contact", "c1");
    });

    it("eagerly requests more pages when the host page is small", () => {
        const dataset = makeDataset({
            columns: COLUMNS,
            records: [{ id: "r1", formatted: { name: "Acme" } }],
            paging: { pageSize: 4, hasNextPage: true, totalResultCount: 50 },
        });
        const { onLoadMore } = renderGrid({ dataset });
        expect(onLoadMore).toHaveBeenCalled();
    });

    it("does not page when there is no next page", () => {
        const dataset = makeDataset({
            columns: COLUMNS,
            records: [{ id: "r1", formatted: { name: "Acme" } }],
            paging: { pageSize: 4, hasNextPage: false },
        });
        const { onLoadMore } = renderGrid({ dataset });
        expect(onLoadMore).not.toHaveBeenCalled();
    });
});
