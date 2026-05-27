export const DISCREPANCIES_CHANGED_EVENT = 'discrepancies:changed';

export const notifyDiscrepanciesChanged = () => {
  window.dispatchEvent(new Event(DISCREPANCIES_CHANGED_EVENT));
};
