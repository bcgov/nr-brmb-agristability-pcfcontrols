/*
 * Author: Jeroen Jonckheer
 * Demo harness entry.
 *
 * Mounts the REAL ReadOnlySubgridComponent with a mocked PCF dataset so a
 * headless browser (Playwright) can render and record the actual control -
 * no Dataverse environment required. esbuild bundles this (React, ReactDOM
 * and Fluent UI are bundled in, unlike the PCF build where they are platform
 * libraries).
 *
 * Gotchas handled:
 *   - the control's CSS is normally injected by the PCF runtime via the
 *     manifest; here we import it explicitly so the grid is styled;
 *   - Fluent UI font icons are registered so the header sort chevron and the
 *     dropdown menu icons render instead of empty boxes.
 */
import "../ReadOnlySubgrid/css/ReadOnlySubgrid.css";
import "./demo.styles.css";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { initializeIcons } from "@fluentui/react";
import { ReadOnlySubgridComponent } from "../ReadOnlySubgrid/components/ReadOnlySubgridComponent";
import { makeDataset, MockColumn, MockRecordSpec } from "../tests/mockDataset";

initializeIcons();

// Synthetic cursor overlay: Playwright's headless Chromium does NOT paint
// the OS mouse cursor into recorded frames, so without this every click in
// the demo looks like things happen by magic. We render an SVG arrow that
// follows mousemove events (driven by `page.mouse.move`) and briefly
// highlights on mousedown so clicks are visible too.
const DemoCursor: React.FC = () => {
    const ref = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        const move = (e: MouseEvent | PointerEvent) => {
            const el = ref.current;
            if (el) {
                el.style.transform =
                    "translate(" + e.clientX + "px," + e.clientY + "px)";
            }
        };
        const down = () => ref.current && ref.current.classList.add("is-press");
        const up = () => ref.current && ref.current.classList.remove("is-press");
        // CAPTURE phase on document: Fluent UI's ContextualMenu/Callout
        // sit in a Layer that handles pointer events for dismissal and can
        // stop propagation on the bubble phase - listening in the capture
        // phase guarantees we see every move regardless of overlays.
        // Also listen for pointermove as a redundant channel in case
        // mousemove dispatching is suppressed somewhere.
        const opts: AddEventListenerOptions = { capture: true };
        document.addEventListener("mousemove", move as EventListener, opts);
        document.addEventListener("pointermove", move as EventListener, opts);
        document.addEventListener("mousedown", down, opts);
        document.addEventListener("mouseup", up, opts);
        return () => {
            document.removeEventListener("mousemove", move as EventListener, opts);
            document.removeEventListener("pointermove", move as EventListener, opts);
            document.removeEventListener("mousedown", down, opts);
            document.removeEventListener("mouseup", up, opts);
        };
    }, []);
    return (
        <div ref={ref} className="demo-cursor" aria-hidden="true">
            <svg width="22" height="26" viewBox="0 0 22 26">
                <path
                    d="M2 2 L2 22 L7 17 L11 25 L14 24 L10 16 L17 16 Z"
                    fill="#000"
                    stroke="#fff"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
};

// Account and Contact are lookup columns (as in a typical model-driven view),
// so the control renders them as clickable links to the related record -
// exactly like the live grid. The remaining columns are plain text.
const COLUMNS: MockColumn[] = [
    { name: "account", displayName: "Account", order: 0, dataType: "Lookup.Simple", visualSizeFactor: 200 },
    { name: "contact", displayName: "Contact", order: 1, dataType: "Lookup.Simple", visualSizeFactor: 170 },
    { name: "city", displayName: "City", order: 2, dataType: "SingleLine.Text", visualSizeFactor: 130 },
    { name: "segment", displayName: "Segment", order: 3, dataType: "SingleLine.Text", visualSizeFactor: 130 },
    { name: "status", displayName: "Status", order: 4, dataType: "SingleLine.Text", visualSizeFactor: 110 },
    { name: "revenue", displayName: "Revenue", order: 5, dataType: "SingleLine.Text", visualSizeFactor: 110 },
];

// Build an EntityReference-shaped value for a lookup cell.
function ref(entity: string, id: string, name: string) {
    return { id: { guid: id }, entityType: entity, name: name };
}
function acct(id: string, name: string) {
    return ref("account", id, name);
}
function cont(id: string, name: string) {
    return ref("contact", id, name);
}

const BASE: MockRecordSpec[] = [
    { id: "r1",  formatted: { account: "Acme Industries",     contact: "Sanne Kuijpers",  city: "Gent",      segment: "Enterprise", status: "Active",   revenue: "€ 1.2M" }, raw: { account: acct("a1", "Acme Industries"),     contact: cont("c1", "Sanne Kuijpers") } },
    { id: "r2",  formatted: { account: "Globex Corporation",  contact: "Cas Kuijpers",    city: "Antwerpen", segment: "Mid-market", status: "Active",   revenue: "€ 840K" }, raw: { account: acct("a2", "Globex Corporation"),  contact: cont("c2", "Cas Kuijpers") } },
    { id: "r3",  formatted: { account: "Initech BV",          contact: "Noor Jansen",     city: "Brugge",    segment: "SMB",        status: "On hold",  revenue: "€ 220K" }, raw: { account: acct("a3", "Initech BV"),          contact: cont("c3", "Noor Jansen") } },
    { id: "r4",  formatted: { account: "Umbrella Health",     contact: "Olof Verhoeven",  city: "Brussel",   segment: "Enterprise", status: "Active",   revenue: "€ 3.4M" }, raw: { account: acct("a4", "Umbrella Health"),     contact: cont("c4", "Olof Verhoeven") } },
    { id: "r5",  formatted: { account: "Soylent Foods",       contact: "Lena Maes",       city: "Gent",      segment: "Mid-market", status: "Active",   revenue: "€ 610K" }, raw: { account: acct("a5", "Soylent Foods"),       contact: cont("c5", "Lena Maes") } },
    { id: "r6",  formatted: { account: "Stark Manufacturing", contact: "Tom Peeters",     city: "Antwerpen", segment: "Enterprise", status: "Active",   revenue: "€ 5.1M" }, raw: { account: acct("a6", "Stark Manufacturing"), contact: cont("c6", "Tom Peeters") } },
    { id: "r7",  formatted: { account: "Wayne Logistics",     contact: "Sara De Wit",     city: "Brugge",    segment: "Mid-market", status: "On hold",  revenue: "€ 970K" }, raw: { account: acct("a7", "Wayne Logistics"),     contact: cont("c7", "Sara De Wit") } },
    { id: "r8",  formatted: { account: "Hooli Cloud",         contact: "Jens Willems",    city: "Brussel",   segment: "Enterprise", status: "Active",   revenue: "€ 2.7M" }, raw: { account: acct("a8", "Hooli Cloud"),         contact: cont("c8", "Jens Willems") } },
    { id: "r9",  formatted: { account: "Pied Piper",          contact: "Ella Smets",      city: "Gent",      segment: "SMB",        status: "Active",   revenue: "€ 180K" }, raw: { account: acct("a9", "Pied Piper"),          contact: cont("c9", "Ella Smets") } },
    { id: "r10", formatted: { account: "Vandelay Imports",    contact: "Bram Claes",      city: "Antwerpen", segment: "Mid-market", status: "Active",   revenue: "€ 530K" }, raw: { account: acct("a10", "Vandelay Imports"),   contact: cont("c10", "Bram Claes") } },
    { id: "r11", formatted: { account: "Cyberdyne Systems",   contact: "Fleur Aerts",     city: "Brugge",    segment: "Enterprise", status: "Active",   revenue: "€ 4.2M" }, raw: { account: acct("a11", "Cyberdyne Systems"),  contact: cont("c11", "Fleur Aerts") } },
    { id: "r12", formatted: { account: "Wonka Industries",    contact: "Daan Mertens",    city: "Brussel",   segment: "SMB",        status: "On hold",  revenue: "€ 95K"  }, raw: { account: acct("a12", "Wonka Industries"),   contact: cont("c12", "Daan Mertens") } },
    { id: "r13", formatted: { account: "Aperture Science",    contact: "Lotte Janssens",  city: "Gent",      segment: "Enterprise", status: "Active",   revenue: "€ 6.8M" }, raw: { account: acct("a13", "Aperture Science"),   contact: cont("c13", "Lotte Janssens") } },
    { id: "r14", formatted: { account: "Tyrell Corporation",  contact: "Milan Peeters",   city: "Antwerpen", segment: "Mid-market", status: "Active",   revenue: "€ 1.9M" }, raw: { account: acct("a14", "Tyrell Corporation"), contact: cont("c14", "Milan Peeters") } },
];

const DemoApp: React.FC = () => {
    const [sort, setSort] = React.useState<{ name: string | null; desc: boolean }>({
        name: null,
        desc: false,
    });

    // Re-sort the mock records when the user picks a sort, mimicking the
    // server-side refresh the real control triggers via index.ts.
    const records = React.useMemo(() => {
        if (!sort.name) {
            return BASE;
        }
        const key = sort.name;
        const sorted = BASE.slice().sort((a, b) => {
            const av = a.formatted[key] || "";
            const bv = b.formatted[key] || "";
            return av.localeCompare(bv, undefined, { numeric: true });
        });
        return sort.desc ? sorted.reverse() : sorted;
    }, [sort]);

    const dataset = React.useMemo(
        () =>
            makeDataset({
                columns: COLUMNS,
                records,
                targetEntity: "account",
                paging: { pageSize: 100, totalResultCount: BASE.length, hasNextPage: false },
                sorting: sort.name
                    ? [{ name: sort.name, sortDirection: sort.desc ? 1 : 0 }]
                    : [],
            }),
        [records, sort]
    );

    return (
        <div className="demo-page">
            <div className="demo-frame">
                <div className="demo-titlebar">
                    <span className="demo-title">Accounts</span>
                </div>
                <div className="demo-grid">
                    <ReadOnlySubgridComponent
                        dataset={dataset}
                        width={900}
                        height={470}
                        onOpenRecord={() => undefined}
                        onLoadMore={() => undefined}
                        onSort={(name, desc) => setSort({ name, desc })}
                    />
                </div>
            </div>
            <DemoCursor />
        </div>
    );
};

ReactDOM.render(<DemoApp />, document.getElementById("root"));
