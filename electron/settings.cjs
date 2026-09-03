const DEFAULT_SETTINGS = Object.freeze({ transferBudget: 65000, maxWeeklyWage: 1000, formation: '4-3-2-1' });

function normalizeSettings(value) {
  if (value?.transferBudget === '' || value?.transferBudget === null || value?.transferBudget === undefined) throw new Error('Das Transferbudget muss eine gültige nicht-negative Zahl sein.');
  if (value?.maxWeeklyWage === '' || value?.maxWeeklyWage === null || value?.maxWeeklyWage === undefined) throw new Error('Das maximale Wochengehalt muss eine gültige nicht-negative Zahl sein.');
  const transferBudget = Number(value?.transferBudget);
  const maxWeeklyWage = Number(value?.maxWeeklyWage);
  const formation = String(value?.formation || '').trim();
  if (!Number.isFinite(transferBudget) || transferBudget < 0 || transferBudget > 1_000_000_000_000) throw new Error('Das Transferbudget muss eine gültige nicht-negative Zahl sein.');
  if (!Number.isFinite(maxWeeklyWage) || maxWeeklyWage < 0 || maxWeeklyWage > 1_000_000_000) throw new Error('Das maximale Wochengehalt muss eine gültige nicht-negative Zahl sein.');
  if (!formation || formation.length > 40) throw new Error('Bitte eine gültige Formation eingeben.');
  return { transferBudget, maxWeeklyWage, formation };
}
module.exports = { DEFAULT_SETTINGS, normalizeSettings };
