export type ComponentScheduleNote = {
  scope: string
  text: string
  valid_from?: string
  valid_through?: string
}

type Facility = {
  schedule_display?: 'official_site_only'
  operational_status: string
  opening_plan?: { kind: string } | null
  component_schedule_notes?: ComponentScheduleNote[]
}

// Component guidance is supplemental. Never promote it to facility-wide or today's hours.
export function currentComponentScheduleNotes(facility: Facility, date: string): ComponentScheduleNote[] {
  if (facility.schedule_display === 'official_site_only') return []
  if (facility.operational_status !== 'active' || facility.opening_plan) return []
  return (facility.component_schedule_notes || []).filter(note =>
    Boolean(note.scope.trim() && note.text.trim())
    && (!note.valid_from || date >= note.valid_from)
    && (!note.valid_through || date <= note.valid_through))
}

export function appendComponentScheduleNotes(root: HTMLElement, notes: ComponentScheduleNote[]) {
  for (const note of notes) {
    const section = document.createElement('div')
    section.className = 'popup-notice popup-component-hours'
    const heading = document.createElement('b')
    heading.textContent = note.scope
    const text = document.createElement('p')
    text.textContent = note.text
    section.append(heading, text)
    root.append(section)
  }
}
