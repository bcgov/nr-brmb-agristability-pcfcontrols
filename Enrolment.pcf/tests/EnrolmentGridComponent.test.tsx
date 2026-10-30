/*
 * Author: Jeroen Jonckheer
 * Render / interaction tests for EnrolmentGridComponent.
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
import { EnrolmentGridComponent } from "../EnrolmentGrid/components/EnrolmentGridComponent";
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
        externalLinkEntity: string;
        externalLinkTooltip: string;
        enableSelection: boolean;
        onSelectionChanged: jest.Mock;
    }> = {}
) {
    const onOpenRecord = overrides.onOpenRecord || jest.fn();
    const onLoadMore = overrides.onLoadMore || jest.fn();
    const onSort = overrides.onSort || jest.fn();
    const onSelectionChanged = overrides.onSelectionChanged || jest.fn();
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
        <EnrolmentGridComponent
            dataset={dataset}
            width={overrides.width !== undefined ? overrides.width : 800}
            height={overrides.height !== undefined ? overrides.height : 400}
            onOpenRecord={onOpenRecord}
            onLoadMore={onLoadMore}
            onSort={onSort}
            externalLinkEntity={overrides.externalLinkEntity}
            externalLinkTooltip={overrides.externalLinkTooltip}
            enableSelection={overrides.enableSelection}
            onSelectionChanged={onSelectionChanged}
        />
    );
    return { ...utils, onOpenRecord, onLoadMore, onSort, onSelectionChanged, dataset };
}

describe("EnrolmentGridComponent", () => {
    it("renders the records and a footer row count", () => {
        renderGrid();
        expect(screen.getByText("Acme")).toBeInTheDocument();
        expect(screen.getByText("Globex")).toBeInTheDocument();
        // totalResultCount defaults to the record count (2) in the mock.
        expect(screen.getByText("Rows: 2")).toBeInTheDocument();
    });

    it("shows the empty state with column headers when there are no records", () => {
        const dataset = makeDataset({ columns: COLUMNS, records: [] });
        renderGrid({ dataset });
        expect(
            screen.getByText("We didn't find anything to show here")
        ).toBeInTheDocument();
        // Column headers stay visible, matching the standard grid.
        expect(screen.getByText("Name")).toBeInTheDocument();
        expect(screen.getByText("Contact")).toBeInTheDocument();
    });

    it("shows the loading state before the first records arrive", () => {
        const dataset = makeDataset({
            columns: COLUMNS,
            records: [],
            loading: true,
        });
        renderGrid({ dataset });
        expect(screen.getByText("Loading records")).toBeInTheDocument();
    });

    it("opens the row record on row click", () => {
        const { container, onOpenRecord } = renderGrid();
        const rows = container.querySelectorAll(".brmb-enrolment-grid-row");
        expect(rows.length).toBe(2);
        fireEvent.click(rows[0]);
        expect(onOpenRecord).toHaveBeenCalledWith("account", "r1");
    });

    it("opens the looked-up record on link click, not the row", () => {
        const { container, onOpenRecord } = renderGrid();
        const link = container.querySelector(
            ".brmb-enrolment-grid-link"
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

    it("shows the external-app link icon with its tooltip on matching rows", () => {
        const { container, onOpenRecord } = renderGrid({
            // Mock rows resolve to the "account" entity; mark it external.
            externalLinkEntity: "account",
            externalLinkTooltip: "Open enrolment app at this enrolment",
        });
        const icons = container.querySelectorAll(
            ".brmb-enrolment-grid-applink"
        );
        // One icon per row, in the first column only.
        expect(icons.length).toBe(2);
        expect(icons[0].getAttribute("title")).toBe(
            "Open enrolment app at this enrolment"
        );
        // Clicking the icon opens the row's record exactly once (the icon
        // stops propagation so the row handler does not also fire).
        fireEvent.click(icons[0]);
        expect(onOpenRecord).toHaveBeenCalledTimes(1);
        expect(onOpenRecord).toHaveBeenCalledWith("account", "r1");
    });

    it("renders no external-app link icon when the entity does not match", () => {
        const { container } = renderGrid({
            externalLinkEntity: "some_other_entity",
        });
        expect(
            container.querySelectorAll(".brmb-enrolment-grid-applink").length
        ).toBe(0);
        // The first-column text still renders normally.
        expect(screen.getByText("Acme")).toBeInTheDocument();
    });

    it("shows the icon beside lookup links that target the external entity", () => {
        const { container, onOpenRecord } = renderGrid({
            // Rows are "account"; only the contact LOOKUP targets the
            // external entity here, so the icon sits beside that link.
            externalLinkEntity: "contact",
            externalLinkTooltip: "Open enrolment app at this enrolment",
        });
        const icons = container.querySelectorAll(
            ".brmb-enrolment-grid-applink"
        );
        // Only row 1 has a contact lookup value; row 2's is empty.
        expect(icons.length).toBe(1);
        expect(icons[0].getAttribute("title")).toBe(
            "Open enrolment app at this enrolment"
        );
        fireEvent.click(icons[0]);
        expect(onOpenRecord).toHaveBeenCalledTimes(1);
        expect(onOpenRecord).toHaveBeenCalledWith("contact", "c1");
    });

    describe("with enableSelection (command-bar variant)", () => {
        it("selects on row click instead of opening the record", () => {
            const { container, onOpenRecord, onSelectionChanged } = renderGrid({
                enableSelection: true,
            });
            const row = container.querySelector(".ms-DetailsRow") as HTMLElement;
            expect(row).toBeTruthy();
            fireEvent.click(row);
            expect(onOpenRecord).not.toHaveBeenCalled();
            expect(onSelectionChanged).toHaveBeenCalled();
            const lastCall =
                onSelectionChanged.mock.calls[
                    onSelectionChanged.mock.calls.length - 1
                ][0];
            expect(lastCall).toEqual(["r1"]);
        });

        it("opens the record from the first-column link without selecting", () => {
            const { container, onOpenRecord } = renderGrid({
                enableSelection: true,
            });
            // First column cell of the first row holds the record-open link.
            const firstCellLink = container.querySelector(
                ".ms-DetailsRow-cell .brmb-enrolment-grid-link"
            ) as HTMLElement;
            expect(firstCellLink).toBeTruthy();
            expect(firstCellLink.textContent).toBe("Acme");
            fireEvent.click(firstCellLink);
            expect(onOpenRecord).toHaveBeenCalledTimes(1);
            expect(onOpenRecord).toHaveBeenCalledWith("account", "r1");
        });

        it("still routes lookup links to the looked-up record", () => {
            const { container, onOpenRecord } = renderGrid({
                enableSelection: true,
            });
            const links = container.querySelectorAll(
                ".brmb-enrolment-grid-link"
            );
            // Row 1: primary link (Acme) + lookup link (Jane Doe);
            // Row 2: primary link (Globex), empty lookup renders no link.
            const lookupLink = Array.from(links).find(
                (l) => l.textContent === "Jane Doe"
            ) as HTMLElement;
            expect(lookupLink).toBeTruthy();
            fireEvent.click(lookupLink);
            expect(onOpenRecord).toHaveBeenCalledTimes(1);
            expect(onOpenRecord).toHaveBeenCalledWith("contact", "c1");
        });

        it("renders row checkboxes and a select-all that selects every row", () => {
            const { container, onSelectionChanged } = renderGrid({
                enableSelection: true,
            });
            // One checkbox per row plus the header's select-all.
            const boxes = container.querySelectorAll(
                ".brmb-enrolment-grid-checkbox"
            );
            expect(boxes.length).toBe(3);
            const selectAll = container.querySelector(
                ".ms-DetailsHeader [role='checkbox']"
            ) as HTMLElement;
            expect(selectAll).toBeTruthy();
            fireEvent.click(selectAll);
            const lastCall =
                onSelectionChanged.mock.calls[
                    onSelectionChanged.mock.calls.length - 1
                ][0];
            expect(lastCall).toEqual(["r1", "r2"]);
        });

        it("renders no checkboxes when selection is disabled", () => {
            const { container } = renderGrid();
            expect(
                container.querySelectorAll(".brmb-enrolment-grid-checkbox")
                    .length
            ).toBe(0);
        });
    });
});
