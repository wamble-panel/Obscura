import type { LedgerType } from './types'
import type { IconName } from '@/components/icons'
import type { Lang } from './i18n'

/**
 * Money categories.
 *
 * Stored as plain text on ledger_entries, so this list can grow without a
 * migration and older entries keep whatever they were filed under. Grouped
 * because a flat list of twenty is worse to pick from than five groups of four.
 */

export type CategoryGroupKey =
  | 'income'
  | 'utilities'
  | 'premises'
  | 'people'
  | 'production'
  | 'business'
  | 'other'

export type Category = {
  key: string
  group: CategoryGroupKey
  en: string
  ar: string
}

export const CATEGORY_GROUPS: Record<
  CategoryGroupKey,
  { en: string; ar: string; icon: IconName; tint: string }
> = {
  income: { en: 'Income', ar: 'الإيرادات', icon: 'arrowDown', tint: '#0A6B4F' },
  utilities: { en: 'Utilities', ar: 'المرافق', icon: 'activity', tint: '#2563EB' },
  premises: { en: 'Premises', ar: 'المكان', icon: 'gauge', tint: '#8A7A4E' },
  people: { en: 'People', ar: 'الفريق', icon: 'team', tint: '#7C3AED' },
  production: { en: 'Production', ar: 'الإنتاج', icon: 'camera', tint: '#C4643F' },
  business: { en: 'Business', ar: 'الأعمال', icon: 'shield', tint: '#0A5648' },
  other: { en: 'Other', ar: 'أخرى', icon: 'dots', tint: '#64748B' },
}

export const CATEGORIES: Category[] = [
  // ---- money coming in --------------------------------------------------
  { key: 'Session', group: 'income', en: 'Studio session', ar: 'جلسة تصوير' },
  { key: 'Rental', group: 'income', en: 'Gear rental', ar: 'تأجير معدات' },
  { key: 'Invoice', group: 'income', en: 'Invoice payment', ar: 'سداد فاتورة' },
  { key: 'Project', group: 'income', en: 'Project / editing', ar: 'مشروع / مونتاج' },
  { key: 'Deposit', group: 'income', en: 'Deposit', ar: 'عربون' },
  { key: 'Refund In', group: 'income', en: 'Refund received', ar: 'مبلغ مسترد' },

  // ---- utilities --------------------------------------------------------
  { key: 'Electricity', group: 'utilities', en: 'Electricity', ar: 'الكهرباء' },
  { key: 'Water', group: 'utilities', en: 'Water', ar: 'المياه' },
  { key: 'Internet', group: 'utilities', en: 'Internet', ar: 'الإنترنت' },
  { key: 'Phone', group: 'utilities', en: 'Phone lines', ar: 'خطوط الهاتف' },
  { key: 'Gas', group: 'utilities', en: 'Gas', ar: 'الغاز' },
  { key: 'Utilities', group: 'utilities', en: 'Utilities (general)', ar: 'مرافق (عام)' },

  // ---- the space --------------------------------------------------------
  { key: 'Rent', group: 'premises', en: 'Studio rent', ar: 'إيجار الاستوديو' },
  { key: 'Cleaning', group: 'premises', en: 'Cleaning', ar: 'النظافة' },
  { key: 'Maintenance', group: 'premises', en: 'Maintenance & repairs', ar: 'الصيانة والإصلاح' },
  { key: 'Security', group: 'premises', en: 'Security', ar: 'الأمن' },
  { key: 'Furniture', group: 'premises', en: 'Furniture & fit-out', ar: 'الأثاث والتجهيز' },

  // ---- people -----------------------------------------------------------
  { key: 'Salary', group: 'people', en: 'Salary', ar: 'الرواتب' },
  { key: 'Freelancer', group: 'people', en: 'Freelancer', ar: 'مستقل' },
  { key: 'Bonus', group: 'people', en: 'Bonus', ar: 'مكافأة' },
  { key: 'Crew Food', group: 'people', en: 'Crew food & drinks', ar: 'طعام ومشروبات الطاقم' },

  // ---- making the work --------------------------------------------------
  { key: 'Gear', group: 'production', en: 'Gear purchase', ar: 'شراء معدات' },
  { key: 'Gear Repair', group: 'production', en: 'Gear repair', ar: 'إصلاح معدات' },
  { key: 'Gear Hire', group: 'production', en: 'Gear hired in', ar: 'استئجار معدات' },
  { key: 'Supplies', group: 'production', en: 'Supplies & consumables', ar: 'مستلزمات' },
  { key: 'Props', group: 'production', en: 'Props & set', ar: 'إكسسوارات وديكور' },
  { key: 'Transport', group: 'production', en: 'Transport & delivery', ar: 'النقل والتوصيل' },

  // ---- running the business ---------------------------------------------
  { key: 'Marketing', group: 'business', en: 'Marketing & ads', ar: 'التسويق والإعلان' },
  { key: 'Software', group: 'business', en: 'Software & subscriptions', ar: 'برامج واشتراكات' },
  { key: 'Insurance', group: 'business', en: 'Insurance', ar: 'التأمين' },
  { key: 'Tax', group: 'business', en: 'Tax', ar: 'الضرائب' },
  { key: 'Fees', group: 'business', en: 'Bank & transfer fees', ar: 'رسوم بنكية وتحويل' },
  { key: 'Legal', group: 'business', en: 'Legal & accounting', ar: 'قانوني ومحاسبة' },

  // ---- catch-all --------------------------------------------------------
  { key: 'Other', group: 'other', en: 'Other', ar: 'أخرى' },
]

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]))

/** Income uses the income group; expenses use everything else. */
export function categoriesFor(type: LedgerType): Category[] {
  return type === 'in'
    ? CATEGORIES.filter((c) => c.group === 'income' || c.key === 'Other')
    : CATEGORIES.filter((c) => c.group !== 'income')
}

export function categoryLabel(key: string, lang: Lang): string {
  const found = BY_KEY.get(key)
  if (!found) return key // an older entry filed under something no longer listed
  return lang === 'ar' ? found.ar : found.en
}

export function categoryGroup(key: string): CategoryGroupKey {
  return BY_KEY.get(key)?.group ?? 'other'
}

export function categoryTint(key: string): string {
  return CATEGORY_GROUPS[categoryGroup(key)].tint
}

export function groupLabel(group: CategoryGroupKey, lang: Lang): string {
  return lang === 'ar' ? CATEGORY_GROUPS[group].ar : CATEGORY_GROUPS[group].en
}

/** Groups in the order they should appear in a picker, for one ledger type. */
export function groupedCategories(
  type: LedgerType,
  lang: Lang,
): { group: CategoryGroupKey; label: string; items: Category[] }[] {
  const wanted = categoriesFor(type)
  const order: CategoryGroupKey[] =
    type === 'in'
      ? ['income', 'other']
      : ['utilities', 'premises', 'people', 'production', 'business', 'other']

  return order
    .map((group) => ({
      group,
      label: lang === 'ar' ? CATEGORY_GROUPS[group].ar : CATEGORY_GROUPS[group].en,
      items: wanted.filter((c) => c.group === group),
    }))
    .filter((g) => g.items.length > 0)
}
