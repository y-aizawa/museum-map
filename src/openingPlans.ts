export type OpeningPlan = {
  kind: 'opening' | 'reopening'
  date?: string
  period?: string
}

type PlannedFacility = {
  operational_status: string
  opening_plan?: OpeningPlan | null
}

export function getOpeningPlan(facility: PlannedFacility): OpeningPlan | null {
  const plan = facility.opening_plan
  if (!plan || (!plan.date && !plan.period)) return null
  if (plan.kind === 'reopening' && facility.operational_status === 'suspended') return plan
  if (plan.kind === 'opening' && ['unknown', 'suspended'].includes(facility.operational_status)) return plan
  return null
}

export function matchesOperationalFilters(facility: PlannedFacility, operational: string[], includeOpeningPlans: boolean) {
  const plan = getOpeningPlan(facility)
  if (plan?.kind === 'opening') return includeOpeningPlans
  if (plan?.kind === 'reopening' && includeOpeningPlans) return true
  const displayStatus = facility.operational_status === 'unknown' ? 'active' : facility.operational_status
  return !operational.length || operational.includes(displayStatus)
}

export function openingPlanDate(plan: OpeningPlan) {
  if (plan.date) {
    const [year, month, day] = plan.date.split('-').map(Number)
    return `${year}年${month}月${day}日`
  }
  return plan.period || ''
}
