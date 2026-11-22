/* Optional rules for the NEW summaries only. Existing report calculations are unchanged.
 * Leave maps empty until you have agreed business/service commission rates.
 * Example rule (not active): { expected: true, expectedRate: 5, tolerancePoints: 0.5 }
 * Or a range: { expected: true, minRate: 4, maxRate: 6 }
 * Rates use invoice total as the base; service rules are blended by item value.
 */
window.RS_COMMISSION_INSIGHTS_CONFIG = Object.assign({
  businessRules: {},
  serviceRules: {},
  tolerancePoints: 0.5,
  checkServiceDetails: true,
  checkAgentDetails: true,
  commissionDueDateField: 'commissionDueDate',
  agreedDueDates: {}
}, window.RS_COMMISSION_INSIGHTS_CONFIG || {});
