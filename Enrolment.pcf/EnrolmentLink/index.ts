/*
 * Control: EnrolmentLink
 *
 * Virtual PCF field control. Acts as a thin bridge between the PCF
 * framework and the React component that owns rendering. Responsibilities
 * kept here:
 *   - read the bound lookup value on every updateView and hand it to the
 *     component;
 *   - resolve the code-app base URL from the vsi_ENcodeAppUrl environment
 *     variable (fetched once in init, same mechanism as the EnrolmentGrid
 *     and AgristabilityProgramSummary controls);
 *   - bridge link clicks: enrolment (vsi_participantprogramyear) records
 *     open in the external code app via navigation.openUrl, any other
 *     lookup target falls back to navigation.openForm;
 *   - bridge editing: when the column is editable, pick/change opens the
 *     native lookup dialog (context.utils.lookupObjects) and the chosen
 *     record is written back through getOutputs, so the control can
 *     satisfy mandatory columns just like the standard lookup.
 *
 * Layering:
 *   - index.ts (this file)                      : PCF lifecycle + side effects only;
 *   - components/EnrolmentLinkComponent.tsx     : all rendering.
 */

import * as React from "react";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import {
    EnrolmentLinkComponent,
    IEnrolmentLinkComponentProps,
} from "./components/EnrolmentLinkComponent";

// The enrolment entity (vsi_participantprogramyear) has been moved out of
// the model-driven app into a standalone code app. Its records must no
// longer open the (removed) Dataverse form; instead we deep-link into the
// code app, whose base URL lives in the vsi_ENcodeAppUrl environment
// variable, passing the vsi_participantprogramyearid as the `id` query
// parameter. Same mechanism as the EnrolmentGrid control.
const ENROLMENT_ENTITY = "vsi_participantprogramyear";
const ENVIRONMENT_VARIABLE_ENTITY = "environmentvariabledefinition";
const ENVIRONMENT_VARIABLE_VALUE_ENTITY = "environmentvariablevalue";
const ENROLMENT_APP_URL_SCHEMA_NAME = "vsi_ENcodeAppUrl";

export class EnrolmentLink
    implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private context: ComponentFramework.Context<IInputs>;
    private notifyOutputChanged: () => void;
    private enrolmentAppUrlPromise?: Promise<string | undefined>;
    /**
     * The value handed back via getOutputs. Re-synced from the bound raw
     * value at the top of every updateView (the platform calls getOutputs
     * BEFORE the follow-up updateView, so a pending pick/clear is never
     * overwritten); an empty array clears the column.
     */
    private outputValue?: ComponentFramework.LookupValue[];

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary
    ): void {
        this.context = context;
        this.notifyOutputChanged = notifyOutputChanged;

        // Resolve the code-app URL once up front so the first click doesn't
        // have to wait on two Web API round trips (and so the component can
        // render a real href for middle-click / open-in-new-tab).
        this.enrolmentAppUrlPromise = this.fetchEnrolmentAppUrl();
    }

    public updateView(
        context: ComponentFramework.Context<IInputs>
    ): React.ReactElement {
        this.context = context;

        const raw = context.parameters.enrolment.raw;
        const lookup = raw && raw.length > 0 ? raw[0] : undefined;
        this.outputValue = lookup ? [lookup] : [];

        // Editable only when the host hasn't disabled the control and field
        // security (when present) grants update rights.
        const security = context.parameters.enrolment.security;
        const canEdit =
            !context.mode.isControlDisabled &&
            (!security || security.editable);

        const props: IEnrolmentLinkComponentProps = {
            lookup: lookup
                ? {
                      id: lookup.id || "",
                      name: lookup.name || "",
                      entityType: lookup.entityType || "",
                  }
                : undefined,
            enrolmentEntity: ENROLMENT_ENTITY,
            tooltip: "Open enrolment app at this enrolment",
            canEdit: canEdit,
            getEnrolmentHref: (entityId: string) =>
                this.buildEnrolmentHref(entityId),
            onOpen: (entityType: string, entityId: string): void => {
                this.openRecord(entityType, entityId);
            },
            onPick: (): void => {
                void this.pickEnrolment();
            },
            onClear: (): void => {
                this.outputValue = [];
                this.notifyOutputChanged();
            },
        };

        return React.createElement(EnrolmentLinkComponent, props);
    }

    /**
     * Hand the picked / cleared lookup value back to the framework. An
     * empty array clears the column; the form's own requirement-level
     * validation then flags it when the column is mandatory.
     */
    public getOutputs(): IOutputs {
        return { enrolment: this.outputValue };
    }

    public destroy(): void {
        // Virtual controls unmount their React tree automatically when the
        // host removes them; no manual cleanup required here.
    }

    /**
     * Open the looked-up record. Enrolments go to the code app; anything
     * else (should the control ever be bound to another lookup) falls back
     * to the standard form.
     *
     * Deliberately does NOT fall back to openForm when the enrolment code
     * app URL cannot be resolved: the enrolment forms are being retired, so
     * surfacing them again would defeat the purpose. The failure is logged
     * instead.
     */
    private openRecord(entityName: string, entityId: string): void {
        if (!entityName || !entityId) {
            return;
        }
        if (entityName === ENROLMENT_ENTITY) {
            void this.openEnrolmentInCodeApp(entityId);
            return;
        }
        this.context.navigation
            .openForm({
                entityName: entityName,
                entityId: entityId,
            })
            .then(
                () => {
                    /* no-op on success */
                },
                (error: unknown) => {
                    console.error("EnrolmentLink: openForm failed", error);
                }
            );
    }

    /**
     * Open the native lookup dialog (same records experience as the
     * standard lookup control) and write the chosen record back through
     * notifyOutputChanged/getOutputs. A cancelled dialog rejects the
     * promise on some hosts, which we deliberately swallow.
     */
    private async pickEnrolment(): Promise<void> {
        try {
            const raw = this.context.parameters.enrolment.raw;
            const current = raw && raw.length > 0 ? raw[0] : undefined;
            const entityType = current?.entityType || ENROLMENT_ENTITY;
            const results = await this.context.utils.lookupObjects({
                allowMultiSelect: false,
                defaultEntityType: entityType,
                defaultViewId: "",
                entityTypes: [entityType],
                viewIds: [],
            });
            if (results && results.length > 0 && results[0]) {
                this.outputValue = [results[0]];
                this.notifyOutputChanged();
            }
        } catch (e) {
            // Dialog dismissed without a selection - nothing to do.
        }
    }

    private async openEnrolmentInCodeApp(entityId: string): Promise<void> {
        try {
            const href = await this.buildEnrolmentHref(entityId);
            if (!href) {
                console.error(
                    "EnrolmentLink: no code app URL configured (" +
                        ENROLMENT_APP_URL_SCHEMA_NAME +
                        "); cannot open enrolment " +
                        entityId
                );
                return;
            }
            this.context.navigation.openUrl(href);
        } catch (e) {
            console.error(
                "EnrolmentLink: failed to open enrolment in code app",
                e
            );
        }
    }

    /**
     * Build the full code-app deep link for one enrolment: the base URL
     * from the vsi_ENcodeAppUrl environment variable with the enrolment id
     * as the `id` query parameter, mirroring the links built by the
     * EnrolmentGrid control. Returns undefined when the variable is
     * absent/blank.
     */
    private async buildEnrolmentHref(
        entityId: string
    ): Promise<string | undefined> {
        if (!this.enrolmentAppUrlPromise) {
            this.enrolmentAppUrlPromise = this.fetchEnrolmentAppUrl();
        }
        const baseUrl = await this.enrolmentAppUrlPromise;
        if (!baseUrl) {
            return undefined;
        }
        const appUrl = new URL(baseUrl);
        appUrl.searchParams.set("id", entityId.replace(/[{}]/g, "").trim());
        appUrl.hash = "";
        return appUrl.toString();
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
            console.error("EnrolmentLink: failed to fetch code app URL", e);
            return undefined;
        }
    }
}
