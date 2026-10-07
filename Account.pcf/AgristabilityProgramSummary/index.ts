import { IInputs, IOutputs } from "./generated/ManifestTypes";
import {
    ProgramSummary,
    IEnrolment,
    IBenefit,
    IProgramDataProvider,
    IProgramSummaryProps,
} from "./ProgramSummary";
import * as React from "react";

// Enrolment table (vsi_participantprogramyear). vsi_participantid is a lookup directly to account.
const ENROLMENT_ENTITY = "vsi_participantprogramyear";
const ENROLMENT_ACCOUNT_LOOKUP = "_vsi_participantid_value";
const ENROLMENT_QUERY = (accountId: string): string =>
    `?$select=vsi_participantprogramyearid,vsi_name,_vsi_programyearid_value` +
    `&$filter=${ENROLMENT_ACCOUNT_LOOKUP} eq ${accountId}` +
    `&$orderby=vsi_name desc`;

// Benefit table (vsi_benefit). vsi_participantprogramyearid is a lookup to the enrolment.
const BENEFIT_ENTITY = "vsi_benefit";
const BENEFIT_ENROLMENT_LOOKUP = "_vsi_participantprogramyearid_value";
const ENVIRONMENT_VARIABLE_ENTITY = "environmentvariabledefinition";
const ENVIRONMENT_VARIABLE_VALUE_ENTITY = "environmentvariablevalue";
const ENROLMENT_APP_URL_SCHEMA_NAME = "vsi_ENcodeAppUrl";
const BENEFIT_QUERY = (enrolmentId: string): string =>
    `?$select=vsi_benefitid,vsi_name,vsi_benefittype,createdon,` +
    `vsi_benefiteligibile,vsi_enrolmentpaid,vsi_formsreceived,vsi_showeligibilityflag,` +
    `vsi_benefitverified,vsi_pendingfinance,vsi_benefitcomplete,` +
    `vsi_adj18monthsafterfinal,vsi_adjhascompletedfinal` +
    `&$filter=${BENEFIT_ENROLMENT_LOOKUP} eq ${enrolmentId}` +
    `&$orderby=createdon desc`;

interface IContextInfo {
    entityId?: string;
    entityTypeName?: string;
    entityRecordName?: string;
}

export class AgristabilityProgramSummary implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private context: ComponentFramework.Context<IInputs>;
    private lastAccountId?: string;
    private contextVersion = 0;
    private provider: IProgramDataProvider;

    public init(
        context: ComponentFramework.Context<IInputs>,
        _notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
    ): void {
        this.context = context;
        context.mode.trackContainerResize(true);

        this.provider = {
            getAccountContext: () => this.getAccountContext(),
            fetchEnrolments: (accountId) => this.fetchEnrolments(accountId),
            fetchBenefits: (enrolmentId) => this.fetchBenefits(enrolmentId),
            fetchEnrolmentAppUrl: () => this.fetchEnrolmentAppUrl(),
        };
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        this.context = context;

        const currentAccountId = this.getAccountContext().accountId;
        if (currentAccountId !== this.lastAccountId) {
            this.lastAccountId = currentAccountId;
            this.contextVersion++;
        }

        const props: IProgramSummaryProps = {
            provider: this.provider,
            contextVersion: this.contextVersion,
        };

        return React.createElement(ProgramSummary, props);
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        // no-op
    }

    private getAccountContext(): { accountId?: string; accountName?: string } {
        const info = this.getContextInfo();
        let accountId = this.normalizeId(info?.entityId);
        let accountName = info?.entityRecordName;

        if (info?.entityTypeName && info.entityTypeName !== "account") {
            accountId = undefined;
            accountName = undefined;
        }
        accountId ??= this.normalizeId(this.context.parameters.testAccountId?.raw ?? undefined);
        return { accountId, accountName };
    }

    private async fetchEnrolments(accountId: string): Promise<IEnrolment[]> {
        const result = await this.context.webAPI.retrieveMultipleRecords(
            ENROLMENT_ENTITY,
            ENROLMENT_QUERY(accountId),
        );
        return result.entities.map((e) => ({
            id: String(e.vsi_participantprogramyearid ?? ""),
            name: String(e.vsi_name ?? ""),
            programYear: (e["_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? null,
        }));
    }

    private async fetchBenefits(enrolmentId: string): Promise<IBenefit[]> {
        const result = await this.context.webAPI.retrieveMultipleRecords(
            BENEFIT_ENTITY,
            BENEFIT_QUERY(enrolmentId),
        );
        return result.entities.map((b) => ({
            id: String(b.vsi_benefitid ?? ""),
            name: String(b.vsi_name ?? ""),
            type: (b["vsi_benefittype@OData.Community.Display.V1.FormattedValue"] as string | undefined) ?? null,
            createdOn: (b.createdon as string | undefined) ?? null,
            benefitEligible: (b.vsi_benefiteligibile as boolean | undefined) ?? null,
            enrolmentPaid: (b.vsi_enrolmentpaid as boolean | undefined) ?? null,
            formsReceived: (b.vsi_formsreceived as boolean | undefined) ?? null,
            showEligibilityFlag: (b.vsi_showeligibilityflag as boolean | undefined) ?? null,
            benefitVerified: (b.vsi_benefitverified as boolean | undefined) ?? null,
            pendingFinance: (b.vsi_pendingfinance as boolean | undefined) ?? null,
            benefitComplete: (b.vsi_benefitcomplete as boolean | undefined) ?? null,
            adjustmentAfter18Months: (b.vsi_adj18monthsafterfinal as boolean | undefined) ?? null,
            adjustmentHasCompletedFinal: (b.vsi_adjhascompletedfinal as boolean | undefined) ?? null,
        }));
    }

    private async fetchEnrolmentAppUrl(): Promise<string | undefined> {
        const definitions = await this.context.webAPI.retrieveMultipleRecords(
            ENVIRONMENT_VARIABLE_ENTITY,
            `?$select=environmentvariabledefinitionid,defaultvalue&$filter=schemaname eq '${ENROLMENT_APP_URL_SCHEMA_NAME}'`,
        );
        const definition = definitions.entities[0] as Record<string, unknown> | undefined;
        if (!definition) return undefined;

        const definitionId = typeof definition.environmentvariabledefinitionid === "string"
            ? definition.environmentvariabledefinitionid
            : undefined;
        if (!definitionId) return undefined;
        const values = await this.context.webAPI.retrieveMultipleRecords(
            ENVIRONMENT_VARIABLE_VALUE_ENTITY,
            `?$select=value,modifiedon&$filter=_environmentvariabledefinitionid_value eq ${definitionId}&$orderby=modifiedon desc`,
        );
        const currentRecord = values.entities[0] as Record<string, unknown> | undefined;
        const currentValue = currentRecord?.value;
        const defaultValue = definition.defaultvalue;
        const url = typeof currentValue === "string" && currentValue.trim()
            ? currentValue.trim()
            : defaultValue;
        return typeof url === "string" && url.trim() ? url.trim() : undefined;
    }

    private getContextInfo(): IContextInfo | undefined {
        // `contextInfo` is exposed on model-driven app hosts but not in the typed surface.
        const mode = this.context.mode as unknown as { contextInfo?: IContextInfo };
        return mode.contextInfo;
    }

    private normalizeId(id?: string): string | undefined {
        if (!id) return undefined;
        return id.replace(/[{}]/g, "").toLowerCase();
    }
}
