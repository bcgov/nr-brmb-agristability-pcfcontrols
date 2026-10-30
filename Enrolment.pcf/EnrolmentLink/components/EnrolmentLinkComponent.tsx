/*
 * Component: EnrolmentLinkComponent
 *
 * Pure rendering for the EnrolmentLink field control. Shows the bound
 * lookup's display name as a hyperlink styled to match the standard
 * model-driven lookup field.
 *
 * Editing: when the host reports the column as editable (canEdit), the
 * component also behaves like a minimal lookup input so it can satisfy
 * mandatory columns:
 *   - empty value  -> a "Look for Enrolment" box that opens the native
 *                     lookup dialog (via onPick);
 *   - filled value -> the link plus a clear (X) and a search button to
 *                     remove / change the selection.
 * When canEdit is false the control is display-only: the link for a value,
 * the familiar "---" placeholder when empty.
 *
 * For enrolment records the component also resolves the real code-app
 * href asynchronously (via getEnrolmentHref) so middle-click /
 * open-in-new-tab work natively; the left-click itself is always routed
 * through onOpen so the host (index.ts) decides between the code app and
 * openForm.
 */

import * as React from "react";

/** The bound lookup value, reduced to the three fields rendering needs. */
export interface IEnrolmentLookupValue {
    id: string;
    name: string;
    entityType: string;
}

export interface IEnrolmentLinkComponentProps {
    /** Current lookup value, or undefined when the column is empty. */
    lookup?: IEnrolmentLookupValue;
    /** Logical name of the enrolment entity (vsi_participantprogramyear). */
    enrolmentEntity: string;
    /** Hover tooltip for enrolment links. */
    tooltip: string;
    /** Whether the column is editable (not disabled / field-secured). */
    canEdit: boolean;
    /** Resolve the code-app deep link for an enrolment id (may be undefined). */
    getEnrolmentHref: (entityId: string) => Promise<string | undefined>;
    /** Open the record (code app for enrolments, openForm otherwise). */
    onOpen: (entityType: string, entityId: string) => void;
    /** Open the native lookup dialog to pick / change the enrolment. */
    onPick: () => void;
    /** Clear the current selection. */
    onClear: () => void;
}

/** Chain-link glyph, identical to the one in EnrolmentGrid / AgristabilityProgramSummary. */
const LinkIcon = (): JSX.Element => (
    <svg
        className="brmb-enrolment-link-icon"
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
    >
        <path
            d="M8.25 11.75l3.5-3.5M6.55 13.45l-1.1 1.1a3 3 0 01-4.24-4.24l3.18-3.18a3 3 0 014.24 0M13.45 6.55l1.1-1.1a3 3 0 014.24 4.24l-3.18 3.18a3 3 0 01-4.24 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
        />
    </svg>
);

/** Magnifier glyph matching the Fluent "Search" icon on standard lookups
 *  (mirrored so the handle points bottom-left, like the native control). */
const SearchIcon = (): JSX.Element => (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
            transform="matrix(-1 0 0 1 20 0)"
            d="M8.5 3a5.5 5.5 0 014.23 9.02l4.12 4.13a.75.75 0 01-1.06 1.06l-4.13-4.12A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z"
        />
    </svg>
);

/** Dismiss (X) glyph matching the clear button on standard lookups. */
const ClearIcon = (): JSX.Element => (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4.09 4.22l.06-.07a.75.75 0 01.98-.07l.08.07L10 8.94l4.79-4.8a.75.75 0 111.06 1.07L11.06 10l4.79 4.79a.75.75 0 01-1.06 1.06L10 11.06l-4.79 4.79a.75.75 0 01-1.06-1.06L8.94 10 4.15 5.21a.75.75 0 01-.06-.99z" />
    </svg>
);

export const EnrolmentLinkComponent: React.FC<IEnrolmentLinkComponentProps> = (
    props
) => {
    const {
        lookup,
        enrolmentEntity,
        tooltip,
        canEdit,
        getEnrolmentHref,
        onOpen,
        onPick,
        onClear,
    } = props;

    const isEnrolment = !!lookup && lookup.entityType === enrolmentEntity;

    // Resolve the real href for enrolment links so the anchor supports
    // middle-click / ctrl+click natively. Guarded against unmount and
    // against the lookup changing while the fetch is in flight.
    const [href, setHref] = React.useState<string | undefined>(undefined);
    React.useEffect(() => {
        let cancelled = false;
        setHref(undefined);
        if (lookup && isEnrolment) {
            getEnrolmentHref(lookup.id).then(
                (resolved) => {
                    if (!cancelled) {
                        setHref(resolved);
                    }
                },
                () => {
                    /* resolution failures are logged by the provider */
                }
            );
        }
        return () => {
            cancelled = true;
        };
    }, [lookup?.id, isEnrolment]);

    // ---- Empty value ------------------------------------------------------
    if (!lookup || !lookup.id) {
        if (!canEdit) {
            return <span className="brmb-enrolment-link-empty">---</span>;
        }
        return (
            <button
                type="button"
                className="brmb-enrolment-lookup-pick"
                onClick={onPick}
                aria-label="Look for Enrolment"
            >
                <span className="brmb-enrolment-lookup-placeholder">
                    ---
                </span>
                <SearchIcon />
            </button>
        );
    }

    // ---- Filled value -----------------------------------------------------
    const onClick = (e: React.MouseEvent<HTMLAnchorElement>): void => {
        // Only intercept plain left-clicks; let the browser handle
        // middle-click and modifier-clicks through the real href.
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) {
            return;
        }
        e.preventDefault();
        onOpen(lookup.entityType, lookup.id);
    };

    const link = (
        <a
            className="brmb-enrolment-link"
            href={href || "#"}
            target="_blank"
            rel="noopener noreferrer"
            title={isEnrolment ? tooltip : lookup.name}
            onClick={onClick}
        >
            <LinkIcon />
            <span className="brmb-enrolment-link-text">
                {lookup.name || "(no name)"}
            </span>
        </a>
    );

    if (!canEdit) {
        return link;
    }

    return (
        <div className="brmb-enrolment-lookup">
            {link}
            <button
                type="button"
                className="brmb-enrolment-lookup-btn"
                onClick={onClear}
                aria-label="Remove Enrolment"
                title="Remove"
            >
                <ClearIcon />
            </button>
            <button
                type="button"
                className="brmb-enrolment-lookup-btn"
                onClick={onPick}
                aria-label="Search for a different Enrolment"
                title="Change"
            >
                <SearchIcon />
            </button>
        </div>
    );
};
