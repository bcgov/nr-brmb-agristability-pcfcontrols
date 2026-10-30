/*
 * Author: Jeroen Jonckheer
 * Control: EnrolmentGrid
 *
 * Virtual PCF dataset control. Acts as a thin bridge between the PCF
 * framework and the React component that owns rendering. Responsibilities
 * kept here:
 *   - relay the dataset context and allocated dimensions on every
 *     updateView so the component can re-layout on resize;
 *   - bridge row-open and lookup-link clicks to context.navigation.openForm,
 *     EXCEPT for enrolment (vsi_participantprogramyear) records, which open
 *     in the external code app (URL from the vsi_ENcodeAppUrl environment
 *     variable) because that entity's forms are removed from this app;
 *   - bridge paging requests to dataset.paging.loadNextPage();
 *   - bridge header-menu sort requests to dataset.sorting + refresh.
 *
 * No state-mutating dataset calls (setPageSize / refresh) happen during
 * updateView itself - those caused a freeze where the loading state
 * never resolved. Eager paging beyond the host's default page size is
 * driven from inside the React component via the loadNextPage callback.
 *
 * Layering:
 *   - index.ts (this file)          : PCF lifecycle + side effects only;
 *   - components/EnrolmentGridComponent.tsx : all rendering + UI state;
 *   - gridLogic.ts                  : pure data shaping, unit-tested.
 */

import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import {
    EnrolmentGridComponent,
    IEnrolmentGridComponentProps,
} from "./components/EnrolmentGridComponent";

// The enrolment entity (vsi_participantprogramyear) has been moved out of
// the model-driven app into a standalone code app. Its records must no
// longer open the (removed) Dataverse form; instead we deep-link into the
// code app, whose base URL lives in the vsi_ENcodeAppUrl environment
// variable, passing the vsi_participantprogramyearid as the `id` query
// parameter. Same mechanism as the AgristabilityProgramSummary control.
const ENROLMENT_ENTITY = "vsi_participantprogramyear";
const ENVIRONMENT_VARIABLE_ENTITY = "environmentvariabledefinition";
const ENVIRONMENT_VARIABLE_VALUE_ENTITY = "environmentvariablevalue";
const ENROLMENT_APP_URL_SCHEMA_NAME = "vsi_ENcodeAppUrl";

export class EnrolmentGrid
    implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private context: ComponentFramework.Context<IInputs>;
    private notifyOutputChanged: () => void;
    private enrolmentAppUrlPromise?: Promise<string | undefined>;

    /**
     * One-time setup. We opt into container-resize tracking so the host
     * re-invokes updateView (with fresh allocatedWidth/Height) whenever the
     * control's slot changes size, letting the component re-layout.
     */
    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary
    ): void {
        this.context = context;
        this.notifyOutputChanged = notifyOutputChanged;
        context.mode.trackContainerResize(true);

        // Resolve the code-app URL once up front so the first row click
        // doesn't have to wait on two Web API round trips.
        this.enrolmentAppUrlPromise = this.fetchEnrolmentAppUrl();
    }

    /**
     * Called on every data/size change. Builds the props (dataset, current
     * allocated dimensions, and the three callbacks) and returns the React
     * element; the React rendering is owned by the host for virtual controls.
     */
    public updateView(
        context: ComponentFramework.Context<IInputs>
    ): React.ReactElement {
        this.context = context;

        const dataset = context.parameters.dataset;

        const props: IEnrolmentGridComponentProps = {
            dataset: dataset,
            width: context.mode.allocatedWidth,
            height: context.mode.allocatedHeight,
            externalLinkEntity: ENROLMENT_ENTITY,
            externalLinkTooltip: "Open enrolment app at this enrolment",
            onOpenRecord: (entityName: string, entityId: string): void => {
                if (!entityName || !entityId) {
                    return;
                }
                // Enrolments no longer have a reachable form in this app;
                // route them to the code app instead of openForm.
                if (entityName === ENROLMENT_ENTITY) {
                    void this.openEnrolmentInCodeApp(entityId);
                    return;
                }
                context.navigation
                    .openForm({
                        entityName: entityName,
                        entityId: entityId,
                    })
                    .then(
                        () => {
                            /* no-op on success */
                        },
                        (error: unknown) => {
                            console.error(
                                "EnrolmentGrid: openForm failed",
                                error
                            );
                        }
                    );
            },
            onLoadMore: (): void => {
                if (
                    dataset &&
                    dataset.paging &&
                    dataset.paging.hasNextPage &&
                    !dataset.loading
                ) {
                    try {
                        dataset.paging.loadNextPage();
                    } catch (e) {
                        console.error(
                            "EnrolmentGrid: loadNextPage failed",
                            e
                        );
                    }
                }
            },
            onSort: (
                columnName: string,
                descending: boolean
            ): void => {
                try {
                    dataset.sorting.length = 0;
                    dataset.sorting.push({
                        name: columnName,
                        sortDirection: descending ? 1 : 0,
                    });
                    dataset.refresh();
                } catch (e) {
                    console.error("EnrolmentGrid: sort refresh failed", e);
                }
            },
        };

        return React.createElement(EnrolmentGridComponent, props);
    }

    /**
     * This control is read-only and binds no output properties, so there is
     * nothing to hand back to the framework.
     */
    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        // Virtual controls unmount their React tree automatically when the
        // host removes them; no manual cleanup required here.
    }

    /**
     * Open the code app at the given enrolment. The base URL comes from
     * the vsi_ENcodeAppUrl environment variable (fetched once in init);
     * the enrolment id is passed as the `id` query parameter, mirroring
     * the links built by the AgristabilityProgramSummary control.
     *
     * Deliberately does NOT fall back to openForm when the URL cannot be
     * resolved: the enrolment forms are being retired, so surfacing them
     * again would defeat the purpose. The failure is logged instead.
     */
    private async openEnrolmentInCodeApp(entityId: string): Promise<void> {
        try {
            if (!this.enrolmentAppUrlPromise) {
                this.enrolmentAppUrlPromise = this.fetchEnrolmentAppUrl();
            }
            const baseUrl = await this.enrolmentAppUrlPromise;
            if (!baseUrl) {
                console.error(
                    "EnrolmentGrid: no code app URL configured (" +
                        ENROLMENT_APP_URL_SCHEMA_NAME +
                        "); cannot open enrolment " +
                        entityId
                );
                return;
            }
            const appUrl = new URL(baseUrl);
            appUrl.searchParams.set(
                "id",
                entityId.replace(/[{}]/g, "").trim()
            );
            appUrl.hash = "";
            this.context.navigation.openUrl(appUrl.toString());
        } catch (e) {
            console.error(
                "EnrolmentGrid: failed to open enrolment in code app",
                e
            );
        }
    }

    /**
     * Resolve the code-app base URL from the vsi_ENcodeAppUrl environment
     * variable: current value when one exists, otherwise the definition's
     * default value. Returns undefined when the variable is absent/blank.
     */
    private async fetchEnrolmentAppUrl(): Promise<string | undefined> {
        try {
            const definitions = await this.context.webAPI.retrieveMultipleRecords(
                ENVIRONMENT_VARIABLE_ENTITY,
                `?$select=environmentvariabledefinitionid,defaultvalue&$filter=schemaname eq '${ENROLMENT_APP_URL_SCHEMA_NAME}'`
            );
            const definition = definitions.entities[0] as
                | Record<string, unknown>
                | undefined;
            if (!definition) {
                return undefined;
            }

            const definitionId =
                typeof definition.environmentvariabledefinitionid === "string"
                    ? definition.environmentvariabledefinitionid
                    : undefined;
            if (!definitionId) {
                return undefined;
            }
            const values = await this.context.webAPI.retrieveMultipleRecords(
                ENVIRONMENT_VARIABLE_VALUE_ENTITY,
                `?$select=value,modifiedon&$filter=_environmentvariabledefinitionid_value eq ${definitionId}&$orderby=modifiedon desc`
            );
            const currentRecord = values.entities[0] as
                | Record<string, unknown>
                | undefined;
            const currentValue = currentRecord?.value;
            const defaultValue = definition.defaultvalue;
            const url =
                typeof currentValue === "string" && currentValue.trim()
                    ? currentValue.trim()
                    : defaultValue;
            return typeof url === "string" && url.trim()
                ? url.trim()
                : undefined;
        } catch (e) {
            console.error(
                "EnrolmentGrid: failed to fetch code app URL",
                e
            );
            return undefined;
        }
    }
}
