import * as React from 'react';
import {
  FluentProvider,
  webLightTheme,
  Spinner,
  Text,
  Dropdown,
  Option,
  MessageBar,
  MessageBarBody,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';

export interface IEnrolment {
  id: string;
  name: string;
  programYear?: string | null;
}

export interface IBenefit {
  id: string;
  name: string;
  type?: string | null;
  formsInFarmsUrl?: string | null;
  accountId?: string | null;
  createdOn?: string | null;
  benefitEligible?: boolean | null;
  enrolmentPaid?: boolean | null;
  formsReceived?: boolean | null;
  showEligibilityFlag?: boolean | null;
  benefitVerified?: boolean | null;
  pendingFinance?: boolean | null;
  benefitComplete?: boolean | null;
  adjustmentAfter18Months?: boolean | null;
  adjustmentHasCompletedFinal?: boolean | null;
}

export interface IProgramDataProvider {
  getAccountContext: () => { accountId?: string; accountName?: string };
  fetchEnrolments: (accountId: string) => Promise<IEnrolment[]>;
  fetchBenefits: (enrolmentId: string) => Promise<IBenefit[]>;
  fetchEnrolmentAppUrl: () => Promise<string | undefined>;
  fetchCoreAppConfig: () => Promise<{ appId: string; financeAppId: string; environmentUrl: string } | undefined>;
}

export interface IProgramSummaryProps {
  provider: IProgramDataProvider;
  /** Bumped by the host whenever the underlying account/form context changes so hooks re-run. */
  contextVersion: number;
}

const ChevronDown = (): React.ReactElement => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M15.35 7.35a.5.5 0 00-.7-.7L10 11.29 5.35 6.65a.5.5 0 10-.7.7l5 5a.5.5 0 00.7 0l5-5z" />
  </svg>
);

const ChevronUp = (): React.ReactElement => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M4.65 12.65a.5.5 0 00.7.7L10 8.71l4.65 4.64a.5.5 0 10.7-.7l-5-5a.5.5 0 00-.7 0l-5 5z" />
  </svg>
);

const LinkIcon = (): React.ReactElement => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M8.25 11.75l3.5-3.5M6.55 13.45l-1.1 1.1a3 3 0 01-4.24-4.24l3.18-3.18a3 3 0 014.24 0M13.45 6.55l1.1-1.1a3 3 0 014.24 4.24l-3.18 3.18a3 3 0 01-4.24 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const RedFlag = (): React.ReactElement => (
  <svg width="16" height="16" viewBox="0 0 20 20" aria-label="Eligibility flag">
    <path d="M4 3a.75.75 0 011.5 0v14a.75.75 0 01-1.5 0V3z" fill="#8a8886" />
    <path d="M5.5 3.5h10.2a.4.4 0 01.32.65l-2.4 2.95 2.4 2.95a.4.4 0 01-.32.65H5.5V3.5z" fill="#d13438" />
  </svg>
);

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
    fontFamily: tokens.fontFamilyBase,
  },
  dropdownRow: {
    display: 'flex',
    columnGap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  dropdownLabel: {
    minWidth: '120px',
  },
  slotGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    alignItems: 'flex-start',
  },
  slotCard: {
    flex: '0 0 280px',
    width: '280px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalM,
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
    boxSizing: 'border-box',
  },
  slotHeader: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    textTransform: 'uppercase',
    fontSize: tokens.fontSizeBase200,
    letterSpacing: '0.5px',
  },
  cardTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    wordBreak: 'break-word',
  },
  labelRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
  },
  linkedValue: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
  },
  appLink: {
    color: tokens.colorNeutralForeground2,
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    textDecorationLine: 'none',
  },
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
  },
  detailsBox: {
    paddingLeft: tokens.spacingHorizontalS,
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalXS,
  },
  toggleBtn: {
    minWidth: 'auto',
    padding: 0,
  },
  empty: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
  notRequested: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
  stateRow: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
  },
  stateLabel: {
    fontWeight: tokens.fontWeightSemibold,
  },
  stateValue: {
    marginLeft: 'auto',
  },
  yes: {
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  no: {
    color: '#d13438',
    fontWeight: tokens.fontWeightSemibold,
  },
});

type SlotKind = 'final' | 'interim' | 'adjustment-newest' | 'adjustment-older';

interface IBenefitSlot {
  label: string;
  kind: SlotKind;
  benefit?: IBenefit;
}

/** Categorize benefits into fixed slots: Final, Interim, Newest Adjustment, Older Adjustment. */
function categorizeBenefits(benefits: IBenefit[]): IBenefitSlot[] {
  const typed = (b: IBenefit): string => (b.type ?? '').toLowerCase();
  const final = benefits.find((b) => typed(b).includes('final'));
  const undetermined = benefits.find((b) => typed(b).includes('undetermined'));
  const interim = benefits.find((b) => typed(b).includes('interim'));
  const adjustments = benefits
    .filter((b) => typed(b).includes('adjustment'))
    .sort((a, b) => (b.createdOn ?? '').localeCompare(a.createdOn ?? ''));

  return [
    { label: final ? 'Final' : 'Final / Undetermined', kind: 'final', benefit: final ?? undetermined },
    { label: 'Interim', kind: 'interim', benefit: interim },
    { label: 'Newest Adjustment', kind: 'adjustment-newest', benefit: adjustments[0] },
    { label: 'Older Adjustment', kind: 'adjustment-older', benefit: adjustments[1] },
  ];
}

interface IBenefitCardProps {
  slot: IBenefitSlot;
  expandAll: boolean;
  expandSignal: number;
  enrolmentAppUrl?: string;
  enrolmentId?: string;
  coreAppConfig?: { appId: string; financeAppId: string; environmentUrl: string };
}

const YesNo: React.FC<{ value?: boolean | null }> = ({ value }) => {
  const styles = useStyles();
  if (value === true) return <Text className={styles.yes}>YES</Text>;
  if (value === false) return <Text className={styles.no}>NO</Text>;
  return <Text>N/A</Text>;
};

const BenefitCard: React.FC<IBenefitCardProps> = ({ slot, expandAll, expandSignal, enrolmentAppUrl, enrolmentId, coreAppConfig }) => {
  const styles = useStyles();
  const [showEligibility, setShowEligibility] = React.useState(false);
  const [showBenefitDetails, setShowBenefitDetails] = React.useState(false);
  const b = slot.benefit;

  React.useEffect(() => {
    setShowEligibility(expandAll);
    setShowBenefitDetails(expandAll);
  }, [expandSignal, expandAll]);

  const isAdjustment = slot.kind === 'adjustment-newest' || slot.kind === 'adjustment-older';
  const enrolmentAppHref = React.useMemo(() => {
    if (!enrolmentAppUrl || !enrolmentId) return undefined;
    const appUrl = new URL(enrolmentAppUrl);
    const normalizedEnrolmentId = enrolmentId.replace(/[{}]/g, '').trim();
    appUrl.searchParams.set('id', normalizedEnrolmentId);
    appUrl.hash = '';
    return appUrl.toString();
  }, [enrolmentAppUrl, enrolmentId]);
  const benefitRecordHref = React.useMemo(() => {
    if (!coreAppConfig || !b?.id) return undefined;
    const baseUrl = coreAppConfig.environmentUrl.replace(/\/+$/, '');
    const recordUrl = new URL(`${baseUrl}/main.aspx`);
    recordUrl.searchParams.set('appid', coreAppConfig.appId);
    recordUrl.searchParams.set('pagetype', 'entityrecord');
    recordUrl.searchParams.set('etn', 'vsi_benefit');
    recordUrl.searchParams.set('id', b.id.replace(/[{}]/g, '').trim());
    return recordUrl.toString();
  }, [b?.id, coreAppConfig]);
  const financeAccountHref = React.useMemo(() => {
    if (!coreAppConfig || !b?.accountId) return undefined;
    const baseUrl = coreAppConfig.environmentUrl.replace(/\/+$/, '');
    const recordUrl = new URL(`${baseUrl}/main.aspx`);
    recordUrl.searchParams.set('appid', coreAppConfig.financeAppId);
    recordUrl.searchParams.set('pagetype', 'entityrecord');
    recordUrl.searchParams.set('etn', 'account');
    recordUrl.searchParams.set('id', b.accountId.replace(/[{}]/g, '').trim());
    return recordUrl.toString();
  }, [b?.accountId, coreAppConfig]);
  const stateLabel = isAdjustment
    ? `State of Adjustment ${slot.kind === 'adjustment-newest' ? '1' : '2'}`
    : 'State of Benefit';

  return (
    <div className={styles.slotCard}>
      <Text className={styles.slotHeader}>{slot.label}</Text>
      {!b ? (
        <Text className={styles.notRequested}>Not Requested</Text>
      ) : (
        <>
          <Text className={styles.cardTitle}>{b.name || '(no name)'}</Text>

          <div className={styles.stateRow}>
            {b.showEligibilityFlag && <RedFlag />}
            <Text className={styles.stateLabel}>{stateLabel}</Text>
            <Text className={styles.stateValue}>
              {b.benefitEligible === true
                ? 'Eligible'
                : b.benefitEligible === false
                  ? 'Ineligible'
                  : 'N/A'}
            </Text>
          </div>

          <div className={styles.headerRow}>
            <Text>Eligibility Details</Text>
            <Button
              appearance="subtle"
              className={styles.toggleBtn}
              icon={showEligibility ? <ChevronUp /> : <ChevronDown />}
              onClick={() => setShowEligibility((v) => !v)}
              aria-label="Toggle eligibility details"
            />
          </div>
          {showEligibility && (
            <div className={styles.detailsBox}>
              {isAdjustment ? (
                <>
                  <div className={styles.labelRow}>
                    <Text>Final Processed:</Text>
                    <YesNo value={b.adjustmentHasCompletedFinal} />
                  </div>
                  <div className={styles.labelRow}>
                    <Text>18 months after Final:</Text>
                    <YesNo value={b.adjustmentAfter18Months} />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.labelRow}>
                    <Text>Enrolment Paid:</Text>
                    <div className={styles.linkedValue}>
                      <YesNo value={b.enrolmentPaid} />
                      {enrolmentAppHref && (
                        <a
                          className={styles.appLink}
                          href={enrolmentAppHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open enrolment app at this enrolment"
                          title="Open enrolment app at this enrolment"
                        >
                          <LinkIcon />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className={styles.labelRow}>
                    <Text>Forms Received:</Text>
                    <div className={styles.linkedValue}>
                      <YesNo value={b.formsReceived} />
                      {b.formsInFarmsUrl && (
                        <a
                          className={styles.appLink}
                          href={b.formsInFarmsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open form in FARMS"
                          title="Open form in FARMS"
                        >
                          <LinkIcon />
                        </a>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className={styles.headerRow}>
            <Text>Benefit Status Details</Text>
            <Button
              appearance="subtle"
              className={styles.toggleBtn}
              icon={showBenefitDetails ? <ChevronUp /> : <ChevronDown />}
              onClick={() => setShowBenefitDetails((v) => !v)}
              aria-label="Toggle benefit status details"
            />
          </div>
          {showBenefitDetails && (
            <div className={styles.detailsBox}>
              <div className={styles.labelRow}>
                <Text>Verified:</Text>
                <div className={styles.linkedValue}>
                  <YesNo value={b.benefitVerified} />
                  {b.formsInFarmsUrl && (
                    <a
                      className={styles.appLink}
                      href={b.formsInFarmsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open form in FARMS"
                      title="Open form in FARMS"
                    >
                      <LinkIcon />
                    </a>
                  )}
                </div>
              </div>
              <div className={styles.labelRow}>
                <Text>Pending Finance:</Text>
                <div className={styles.linkedValue}>
                  <YesNo value={b.pendingFinance} />
                  {financeAccountHref && (
                    <a
                      className={styles.appLink}
                      href={financeAccountHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open Account in Finance app"
                      title="Open Account in Finance app"
                    >
                      <LinkIcon />
                    </a>
                  )}
                </div>
              </div>
              <div className={styles.labelRow}>
                <Text>Benefit Complete:</Text>
                <div className={styles.linkedValue}>
                  <YesNo value={b.benefitComplete} />
                  {benefitRecordHref && (
                    <a
                      className={styles.appLink}
                      href={benefitRecordHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open Benefit record in model-driven app"
                      title="Open Benefit record in model-driven app"
                    >
                      <LinkIcon />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const ProgramSummary: React.FC<IProgramSummaryProps> = ({ provider, contextVersion }) => {
  const styles = useStyles();

  const [accountId, setAccountId] = React.useState<string | undefined>(undefined);
  const [enrolments, setEnrolments] = React.useState<IEnrolment[]>([]);
  const [selectedEnrolmentId, setSelectedEnrolmentId] = React.useState<string | undefined>(undefined);
  const [benefits, setBenefits] = React.useState<IBenefit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingBenefits, setLoadingBenefits] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [expandAll, setExpandAll] = React.useState(false);
  const [expandSignal, setExpandSignal] = React.useState(0);
  const [enrolmentAppUrl, setEnrolmentAppUrl] = React.useState<string | undefined>();
  const [coreAppConfig, setCoreAppConfig] = React.useState<{ appId: string; financeAppId: string; environmentUrl: string } | undefined>();

  React.useEffect(() => {
    let cancelled = false;
    const loadUrl = async (): Promise<void> => {
      try {
        const url = await provider.fetchEnrolmentAppUrl();
        if (!cancelled) setEnrolmentAppUrl(url);
      } catch {
        if (!cancelled) setEnrolmentAppUrl(undefined);
      }
    };
    void loadUrl();
    return () => {
      cancelled = true;
    };
  }, [provider]);

  React.useEffect(() => {
    let cancelled = false;
    const loadCoreAppConfig = async (): Promise<void> => {
      try {
        const config = await provider.fetchCoreAppConfig();
        if (!cancelled) setCoreAppConfig(config);
      } catch {
        if (!cancelled) setCoreAppConfig(undefined);
      }
    };
    void loadCoreAppConfig();
    return () => {
      cancelled = true;
    };
  }, [provider]);

  // Load enrolments whenever the host reports a new account/form context.
  React.useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(undefined);
      setEnrolments([]);
      setBenefits([]);
      setSelectedEnrolmentId(undefined);

      const { accountId: newAccountId } = provider.getAccountContext();
      setAccountId(newAccountId);

      if (!newAccountId) {
        setError('Unable to determine the current account id from the form context.');
        setLoading(false);
        return;
      }

      try {
        const rows = await provider.fetchEnrolments(newAccountId);
        if (cancelled) return;
        setEnrolments(rows);
        if (rows.length > 0) setSelectedEnrolmentId(rows[0].id);
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [provider, contextVersion]);

  // Load benefits for the selected enrolment.
  React.useEffect(() => {
    if (!selectedEnrolmentId) {
      setBenefits([]);
      return;
    }
    let cancelled = false;
    const run = async (): Promise<void> => {
      setLoadingBenefits(true);
      setBenefits([]);
      try {
        const rows = await provider.fetchBenefits(selectedEnrolmentId);
        if (!cancelled) setBenefits(rows);
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err));
      } finally {
        if (!cancelled) setLoadingBenefits(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [provider, selectedEnrolmentId]);

  const selectedEnrolment = React.useMemo(
    () => enrolments.find((e) => e.id === selectedEnrolmentId),
    [enrolments, selectedEnrolmentId],
  );

  const slots = React.useMemo(() => categorizeBenefits(benefits), [benefits]);

  return (
    <FluentProvider theme={webLightTheme}>
      <div className={styles.root}>
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}

        {loading ? (
          <Spinner size="small" label="Loading enrolments..." />
        ) : enrolments.length === 0 ? (
          !error && (
            <Text className={styles.empty}>
              {accountId ? 'No enrolments found for this account.' : 'No account context available.'}
            </Text>
          )
        ) : (
          <>
            <div className={styles.dropdownRow}>
              <Text className={styles.dropdownLabel} weight="semibold">Program Year</Text>
              <Dropdown
                placeholder="Select a program year"
                value={selectedEnrolment ? (selectedEnrolment.programYear ?? selectedEnrolment.name) : ''}
                selectedOptions={selectedEnrolmentId ? [selectedEnrolmentId] : []}
                onOptionSelect={(_, data) => {
                  if (data.optionValue) setSelectedEnrolmentId(data.optionValue);
                }}
              >
                {enrolments.map((e) => (
                  <Option key={e.id} value={e.id} text={e.programYear ?? e.name}>
                    {e.programYear ?? e.name}
                  </Option>
                ))}
              </Dropdown>
              <Button
                appearance="secondary"
                onClick={() => {
                  setExpandAll((v) => !v);
                  setExpandSignal((v) => v + 1);
                }}
              >
                {expandAll ? 'Collapse All' : 'Expand All'}
              </Button>
            </div>

            {selectedEnrolment && (
              loadingBenefits ? (
                <Spinner size="small" label="Loading benefits..." />
              ) : (
                <div className={styles.slotGrid}>
                  {slots.map((slot, i) => (
                    <BenefitCard
                      key={`${slot.label}-${i}`}
                      slot={slot}
                      expandAll={expandAll}
                      expandSignal={expandSignal}
                      enrolmentAppUrl={enrolmentAppUrl}
                      enrolmentId={selectedEnrolmentId}
                      coreAppConfig={coreAppConfig}
                    />
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>
    </FluentProvider>
  );
};

function extractErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  const anyErr = err as { message?: unknown; raw?: unknown; error?: { message?: unknown } };
  if (typeof anyErr.message === 'string' && anyErr.message.length > 0) return anyErr.message;
  if (anyErr.error && typeof anyErr.error.message === 'string') return anyErr.error.message;
  if (typeof anyErr.raw === 'string') return anyErr.raw;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}
