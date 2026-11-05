import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AttributionControl, LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import dataset from './data/museums.json'
import { getOpeningPlan, matchesOperationalFilters, openingPlanDate } from './openingPlans'
import type { OpeningPlan } from './openingPlans'
import categoryDefinitions from './data/categories.json'
import { SAMPLE_EXHIBITIONS_BY_FACILITY, SHOW_SAMPLE_EXHIBITIONS } from './data/sampleExhibitions'

type OperationalStatus = 'active' | 'suspended' | 'closed' | 'unknown'
type PublicationStatus = 'normal' | 'hold' | 'out_of_scope'
type CategoryGroup = 'art' | 'history' | 'science' | 'industry' | 'transport' | 'literature' | 'manga' | 'performing' | 'sports' | 'zoo' | 'aquarium' | 'botanical' | 'other'
type MuseumCategory = 'registered_museum' | 'designated_facility' | 'museum_like_candidate'
type VisitFilter = 'any' | 'open_now' | 'open_today'
type ExhibitionFilter = 'any' | 'ongoing' | 'starts_30' | 'ends_14' | 'on_date'
type SheetLevel = 0 | 1 | 2

type Exhibition = {
  title: string
  start_date?: string
  end_date?: string
  status?: 'ongoing' | 'upcoming'
  official_url?: string
  is_sample?: boolean
}

type WeeklyScheduleRule = {
  days: string[]
  weeks?: number[]
  open: string
  close: string
  last_admission?: string
}

type Facility = {
  id: string
  name: string
  short_name: string
  aliases: string[]
  category: string
  categories: string[]
  topics: string[]
  primary_category: CategoryGroup
  subcategories?: CategoryGroup[]
  museum_categories: MuseumCategory[]
  operational_status: OperationalStatus
  opening_plan?: OpeningPlan | null
  schedule_summary: string
  schedule_applicability: string
  schedule?: {
    applicability?: string
    valid_from?: string
    valid_through?: string
    holiday_rule?: string
    weekly?: WeeklyScheduleRule[]
  } | null
  reservation: string
  status_note: string
  address: string
  latitude: number
  longitude: number
  official_url: string
  publication_status?: PublicationStatus
  special_exhibitions?: Exhibition[]
  image_url?: string
}

type Filters = {
  operational: OperationalStatus[]
  includeOpeningPlans: boolean
  publication: PublicationStatus[]
  categories: CategoryGroup[]
  includeSubcategories: boolean
  museumCategories: MuseumCategory[]
  visit: VisitFilter
  exhibition: ExhibitionFilter
  exhibitionDate: string
}

type Coordinate = { latitude: number; longitude: number }

function distanceKm(left: Coordinate, right: Coordinate) {
  const radians = (value: number) => value * Math.PI / 180
  const a = Math.sin(radians(right.latitude - left.latitude) / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude))
    * Math.sin(radians(right.longitude - left.longitude) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)))
}

type BoundsValue = { west: number; south: number; east: number; north: number; center: Coordinate }

const facilities = (dataset.facilities as Facility[]).map(facility => ({
  ...facility,
  special_exhibitions: SHOW_SAMPLE_EXHIBITIONS
    ? [...(facility.special_exhibitions || []), ...(SAMPLE_EXHIBITIONS_BY_FACILITY[facility.name] || [])]
    : facility.special_exhibitions,
}))
setWorkerUrl(new URL(`${import.meta.env.BASE_URL}maplibre-gl-worker.mjs`, window.location.href).toString())
const INITIAL_FILTERS: Filters = {
  operational: ['active', 'unknown'],
  includeOpeningPlans: false,
  publication: ['normal', 'out_of_scope'],
  categories: [],
  includeSubcategories: true,
  museumCategories: [],
  visit: 'any',
  exhibition: 'any',
  exhibitionDate: '',
}
const ALL_FILTERS: Filters = { operational: [], includeOpeningPlans: true, publication: [], categories: [], includeSubcategories: true, museumCategories: [], visit: 'any', exhibition: 'any', exhibitionDate: '' }

const operationalLabels: Record<OperationalStatus, string> = {
  active: '運営中',
  suspended: '休止中',
  closed: '閉館済み',
  unknown: '現況未確認',
}

const publicationLabels: Record<PublicationStatus, string> = {
  normal: '通常掲載',
  hold: '保留',
  out_of_scope: '掲載対象外（開発用）',
}

const museumCategoryValues: MuseumCategory[] = ['registered_museum', 'designated_facility', 'museum_like_candidate']
const museumCategoryLabels: Record<MuseumCategory, string> = {
  registered_museum: '登録博物館',
  designated_facility: '指定施設',
  museum_like_candidate: '博物館類似施設（候補）',
}

const categoryGroups = categoryDefinitions.map(category => category.id as CategoryGroup)
const categoryLabels = Object.fromEntries(categoryDefinitions.map(category => [category.id, category.label])) as Record<CategoryGroup, string>
const categorySymbols = Object.fromEntries(categoryDefinitions.map(category => [category.id, category.symbol])) as Record<CategoryGroup, string>
const categoryColors = Object.fromEntries(categoryDefinitions.map(category => [category.id, category.color])) as Record<CategoryGroup, string>
const categoryStyle = (category: CategoryGroup) => ({ '--pin': categoryColors[category] }) as CSSProperties

const cloneFilters = (value: Filters): Filters => ({
  ...value,
  operational: [...value.operational],
  publication: [...value.publication],
  categories: [...value.categories],
  museumCategories: [...value.museumCategories],
})

const sameValues = <T extends string>(left: T[], right: T[]) =>
  left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index])

function getCategoryGroup(facility: Facility): CategoryGroup {
  return categoryGroups.includes(facility.primary_category) ? facility.primary_category : 'other'
}

function getPublicationStatus(facility: Facility): PublicationStatus {
  return facility.publication_status === 'hold' || facility.publication_status === 'out_of_scope'
    ? facility.publication_status : 'normal'
}

function todayInTokyo() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function weekdayCodeInTokyo() {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(new Date())
  return ({ Mon: 'mo', Tue: 'tu', Wed: 'we', Thu: 'th', Fri: 'fr', Sat: 'sa', Sun: 'su' } as Record<string, string>)[weekday]
}

function weeklyRuleTime(rule: WeeklyScheduleRule) {
  return `${rule.open}–${rule.close}${rule.last_admission ? `（最終入館 ${rule.last_admission}）` : ''}`
}

function weeklyDayLabel(rule: WeeklyScheduleRule, names: Record<string, string>) {
  const days = rule.days.map(day => names[day] || day).join('・')
  return rule.weeks?.length ? `第${rule.weeks.join('・')}${days}` : days
}

function datePlus(days: number) {
  const date = new Date(`${todayInTokyo()}T00:00:00+09:00`)
  date.setDate(date.getDate() + days)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function exhibitionMatches(facility: Facility, filter: ExhibitionFilter, date: string) {
  if (filter === 'any') return true
  const exhibitions = facility.special_exhibitions
  if (!exhibitions?.length) return false
  const today = todayInTokyo()
  return exhibitions.some(item => {
    if (!item.start_date || !item.end_date) return false
    if (filter === 'ongoing') return item.start_date <= today && today <= item.end_date
    if (filter === 'starts_30') return today <= item.start_date && item.start_date <= datePlus(30)
    if (filter === 'ends_14') return today <= item.end_date && item.end_date <= datePlus(14)
    return Boolean(date) && item.start_date <= date && date <= item.end_date
  })
}

function matchesFilters(facility: Facility, filters: Filters) {
  if (!matchesOperationalFilters(facility, filters.operational, filters.includeOpeningPlans)) return false
  if (filters.visit !== 'any' && getOpeningPlan(facility)) return false
  if (filters.publication.length && !filters.publication.includes(getPublicationStatus(facility))) return false
  const categories = filters.includeSubcategories
    ? [getCategoryGroup(facility), ...(facility.subcategories || [])]
    : [getCategoryGroup(facility)]
  if (filters.categories.length && !filters.categories.some(category => categories.includes(category))) return false
  if (filters.museumCategories.length && !filters.museumCategories.some(category => facility.museum_categories.includes(category))) return false
  // visit_state is a dated 2026-11-01 sample, so it is intentionally not used for current-time assertions.
  if (filters.visit !== 'any') return false
  return exhibitionMatches(facility, filters.exhibition, filters.exhibitionDate)
}

function isInBounds(facility: Facility, bounds: BoundsValue | null) {
  if (!bounds) return true
  return facility.longitude >= bounds.west && facility.longitude <= bounds.east
    && facility.latitude >= bounds.south && facility.latitude <= bounds.north
}

function displayCategories(facility: Facility) {
  const primary = getCategoryGroup(facility)
  return [...new Set([primary, ...(facility.subcategories || [])])]
    .filter(category => categoryGroups.includes(category))
    .map(category => categoryLabels[category])
}

function displayMuseumCategories(facility: Facility) {
  return museumCategoryValues
    .filter(category => facility.museum_categories.includes(category))
    .map(category => museumCategoryLabels[category])
}

type ScheduleDisplay = { today: string; regular: string; closed: string; details: string }

function closureDisplay(value: string) {
  if (value === '休館日は公式カレンダーをご確認ください') return value
  const cleaned = value.split(/入場料|観覧料|入館料|料金|最寄り駅|アクセス|交通案内|お問い合わせ|お問合せ|Instagram|facebook|twitter|Copyright|PAGE TOP|###|主催|共催|会場|会期|開館時間|営業時間|施設紹介|見る・参加する/i)[0]
    .replace(/^(?:休館日等|休館日|休園日|定休日)\s*[:：]?\s*/, '').trim()
  if (!cleaned || cleaned.length > 160 || /\.\.\.|…|https?:|wordlim|/.test(cleaned)) return '休館日は公式カレンダーをご確認ください'
  return cleaned
}

function scheduleDisplay(facility: Facility): ScheduleDisplay {
  const unavailable = Boolean(getOpeningPlan(facility)) || facility.operational_status === 'closed' || facility.operational_status === 'suspended'
  if (unavailable) return { today: '—', regular: '—', closed: '—', details: '' }
  const structured = facility.schedule
  const date = todayInTokyo()
  if (structured?.valid_from && date < structured.valid_from || structured?.valid_through && date > structured.valid_through) {
    return { today: '—', regular: '—', closed: '—', details: '' }
  }
  if (structured?.weekly?.length && ['current_baseline', 'current_exhibition'].includes(facility.schedule_applicability)) {
    const days: Record<string, string> = { mo: '月', tu: '火', we: '水', th: '木', fr: '金', sa: '土', su: '日' }
    const lines = structured.weekly.map(rule => `${weeklyDayLabel(rule, days)} ${weeklyRuleTime(rule)}`)
    const week = Math.ceil(Number(date.slice(-2)) / 7)
    const todayRules = structured.weekly.filter(rule => rule.days.includes(weekdayCodeInTokyo()) && (!rule.weeks?.length || rule.weeks.includes(week)))
    const today = todayRules.length ? todayRules.map(rule => `${rule.open}–${rule.close}`).join('／') : '休館日'
    const closed = facility.schedule_summary.split(/[。]/).filter(clause => /休館|休園|定休/.test(clause)).join('。')
    return { today, regular: lines.length <= 2 ? lines.join('／') : lines[0] + ' ほか', closed: closed || '—', details: [...lines, structured.holiday_rule || ''].filter(Boolean).join('\n') }
  }
  const currentSchedule = ['current_baseline', 'current_exhibition', 'reservation_calendar'].includes(facility.schedule_applicability)
  const summary = currentSchedule && facility.schedule_summary !== '未確認'
    ? facility.schedule_summary
      .replace('月曜休館の原則と祝日例外は別途公式カレンダー照合待ち', '月曜休館（祝日は公式カレンダーをご確認ください）')
      .trim()
    : ''
  const reservationSlots = facility.reservation === 'required' || facility.schedule_applicability === 'reservation_calendar'
  if (!summary) return { today: reservationSlots ? '予約枠による' : '—', regular: reservationSlots ? '予約枠による' : '—', closed: structured?.holiday_rule || '—', details: '' }
  const sentences = summary.split('。').map(value => value.trim()).filter(Boolean)
  const closureClauses = summary.split(/[。、]/).map(value => value.trim()).filter(value => /休館|休園|年末年始|定休/.test(value))
  const regularClauses = (sentences[0] || '').split('、').map(value => value.trim()).filter(value => value && !/休館|休園|年末年始|定休/.test(value))
  const regular = reservationSlots ? '予約枠による' : `${regularClauses.join('、')}${regularClauses.length ? '。' : ''}`
  return {
    today: reservationSlots ? '予約枠による' : '—',
    regular: regular || '—',
    closed: closureClauses.length ? `${closureClauses.join('、')}。` : '—',
    details: sentences.length > 1 || reservationSlots ? summary : '',
  }
}

function conditionTags(facility: Facility) {
  if (facility.operational_status === 'closed' || facility.operational_status === 'suspended') return []
  const labels: Record<string, string> = {
    required: '要予約',
    'not_required_up_to_15;required_16_or_more': '16名以上は要予約',
    required_group_children_only: '子ども団体は要予約',
    group_visit_requires_inquiry: '団体利用は要問合せ',
    ticket_conditions_require_check: 'チケット条件は公式サイトで確認',
    'same_day_ticket;program_capacity_applies': 'プログラムは定員あり',
    'exhibition_free;architecture_separate_ticket': '建築倉庫は別途チケット',
    'optional;advance_discount': '事前購入で割引',
  }
  return labels[facility.reservation] ? [labels[facility.reservation]] : []
}

function formatExhibitionPeriod(exhibition: Exhibition) {
  const format = (value?: string, includeYear = true) => {
    if (!value) return ''
    const [year, month, day] = value.split('-').map(Number)
    return `${includeYear ? `${year}年` : ''}${month}月${day}日`
  }
  if (!exhibition.start_date && !exhibition.end_date) return '—'
  const sameYear = exhibition.start_date?.slice(0, 4) === exhibition.end_date?.slice(0, 4)
  return `${format(exhibition.start_date)}–${format(exhibition.end_date, !sameYear)}`
}

function publicNotice(facility: Facility) {
  if (facility.operational_status === 'closed') return ''
  if (facility.operational_status === 'unknown') return ''
  if (facility.operational_status === 'suspended') {
    const note = facility.status_note
    if (/保存修理工事/.test(note)) return '保存修理工事のため'
    if (/総合改修/.test(note)) return '総合改修のため'
    if (/大規模改修/.test(note)) return '大規模改修のため'
    if (/設備工事/.test(note)) return '設備工事のため'
    if (/耐震性/.test(note)) return '耐震性確認のため'
    if (/機能移転準備/.test(note)) return '機能移転準備のため'
    if (/リニューアル/.test(note)) return 'リニューアルのため'
    if (/改修/.test(note)) return '改修のため'
    return ''
  }
  return ''
}

function exhibitionPhase(exhibition: Exhibition) {
  if (exhibition.status === 'ongoing') return '開催中'
  if (exhibition.status === 'upcoming') return '開催予定'
  const today = todayInTokyo()
  if (exhibition.start_date && exhibition.end_date && exhibition.start_date <= today && today <= exhibition.end_date) return '開催中'
  if (exhibition.start_date && exhibition.start_date > today) return '開催予定'
  return ''
}

function googleMapsUrl(facility: Facility) {
  const query = [facility.name, facility.address, `${facility.latitude},${facility.longitude}`].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return mobile
}

type IconName = 'building' | 'search' | 'list' | 'sliders' | 'close' | 'chevron' | 'info' | 'external' | 'calendar' | 'refresh'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    building: <><path d="M4 21V9l8-5 8 5v12M9 21v-5h6v5M8 10h.01M12 10h.01M16 10h.01" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
    sliders: <><path d="M4 7h16M7 12h10M10 17h4" /><circle cx="8" cy="7" r="1" /><circle cx="16" cy="12" r="1" /><circle cx="12" cy="17" r="1" /></>,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6H5V6h6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.7-1L20 12M4 12l2.2 5a7 7 0 0 0 11.7-1" /></>,
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props}>{children}</button>
}

function buildPopup(facility: Facility, outsideFilters: boolean) {
  const root = document.createElement('div')
  root.className = 'map-popup'
  if (facility.image_url) {
    const image = document.createElement('img')
    image.src = facility.image_url
    image.alt = ''
    root.append(image)
  }
  const top = document.createElement('div')
  top.className = 'popup-topline'
  top.textContent = [...displayCategories(facility), ...(getPublicationStatus(facility) === 'out_of_scope' ? ['掲載対象外'] : [])].join('｜')
  const title = document.createElement('strong')
  title.className = 'popup-title'
  title.textContent = facility.name
  root.append(top)
  const museumCategories = displayMuseumCategories(facility)
  if (museumCategories.length) {
    const museumCategoryRow = document.createElement('div')
    museumCategoryRow.className = 'popup-museum-categories'
    const label = document.createElement('span')
    label.textContent = '博物館区分'
    museumCategoryRow.append(label)
    museumCategories.forEach(value => {
      const category = document.createElement('b')
      category.textContent = value
      museumCategoryRow.append(category)
    })
    root.append(museumCategoryRow)
  }
  root.append(title)
  const schedule = scheduleDisplay(facility)
  const scheduleElement = document.createElement('div')
  scheduleElement.className = 'popup-schedule'
  const hoursHeading = document.createElement('h3')
  const openingPlan = getOpeningPlan(facility)
  const inactive = facility.operational_status === 'suspended' || facility.operational_status === 'closed'
  hoursHeading.textContent = openingPlan ? (openingPlan.kind === 'opening' ? '開館予定' : '再開予定') : '本日の開館時間'
  const hoursBox = document.createElement('div')
  hoursBox.className = 'popup-hours-box'
  const todayHours = document.createElement('strong')
  todayHours.className = 'popup-today-hours'
  if (inactive) todayHours.classList.add('popup-facility-status')
  todayHours.textContent = facility.operational_status === 'closed' ? '閉館済み'
    : facility.operational_status === 'suspended' ? '休館中'
    : openingPlan ? openingPlanDate(openingPlan)
    : schedule.today !== '—' ? schedule.today : '公式サイトでご確認ください'
  if (schedule.today === '—' && !openingPlan && !inactive) todayHours.classList.add('popup-hours-message')
  if (openingPlan && !inactive) {
    const state = document.createElement('span')
    state.className = 'popup-plan-state'
    state.textContent = openingPlan.kind === 'opening' ? '開館前' : '休館中'
    hoursBox.append(state)
  }
  hoursBox.append(todayHours)
  if (openingPlan && inactive) {
    const plan = document.createElement('span')
    plan.className = 'popup-status-detail'
    plan.textContent = `${openingPlanDate(openingPlan)} 再開予定`
    hoursBox.append(plan)
  }
  if (!inactive && (schedule.details || schedule.regular !== '—' || schedule.closed !== '—')) {
    const details = document.createElement('details')
    const summary = document.createElement('summary')
    summary.textContent = '曜日別の時間・休館日'
    const content = document.createElement('dl')
    const addRow = (label: string, value: string) => {
      if (!value || value === '—') return
      const key = document.createElement('dt')
      key.textContent = label
      const valueElement = document.createElement('dd')
      valueElement.textContent = value
      content.append(key, valueElement)
    }
    const structured = facility.schedule
    if (structured?.weekly?.length) {
      const dayNames: Record<string, string> = { mo: '月', tu: '火', we: '水', th: '木', fr: '金', sa: '土', su: '日' }
      structured.weekly.forEach(rule => {
        addRow(weeklyDayLabel(rule, dayNames), `${rule.open}–${rule.close}`)
        if (rule.last_admission) addRow('最終入館', rule.last_admission)
      })
      const closure = structured.holiday_rule || schedule.closed
      if (closure && closure !== '—') addRow('休館日', closureDisplay(closure))
    } else {
      addRow('通常時間', schedule.regular)
      if (schedule.closed !== '—') addRow('休館日', closureDisplay(schedule.closed))
      if (schedule.details !== schedule.regular) addRow('補足', schedule.details)
    }
    details.append(summary, content)
    hoursBox.append(details)
  }
  if (!inactive) scheduleElement.append(hoursHeading)
  scheduleElement.append(hoursBox)
  root.append(scheduleElement)
  const tags = conditionTags(facility)
  if (tags.length) {
    const tagRow = document.createElement('div')
    tagRow.className = 'popup-condition-tags'
    tags.forEach(value => {
      const tag = document.createElement('span')
      tag.textContent = value
      tagRow.append(tag)
    })
    root.append(tagRow)
  }
  const noticeText = publicNotice(facility)
  if (noticeText) {
    const notice = document.createElement('div')
    notice.className = `popup-notice ${facility.operational_status}`
    notice.textContent = noticeText
    root.append(notice)
  }
  if (outsideFilters) {
    const note = document.createElement('div')
    note.className = 'popup-filter-note'
    note.textContent = '現在のフィルター条件外の施設です'
    root.append(note)
  }
  const visibleExhibitions = (facility.special_exhibitions || [])
    .filter(exhibition => !exhibition.end_date || exhibition.end_date >= todayInTokyo())
    .sort((left, right) => Number(exhibitionPhase(right) === '開催中') - Number(exhibitionPhase(left) === '開催中')
      || (left.start_date || '').localeCompare(right.start_date || ''))
  if (visibleExhibitions.length) {
    const exhibitionSection = document.createElement('div')
    exhibitionSection.className = 'popup-exhibitions'
    const exhibitionHeading = document.createElement('b')
    exhibitionHeading.className = 'popup-exhibition-heading'
    exhibitionHeading.textContent = '特別展'
    exhibitionSection.append(exhibitionHeading)
    visibleExhibitions
      .map((exhibition, index) => ({ exhibition, index, phase: exhibitionPhase(exhibition) }))
      .sort((left, right) => Number(right.phase === '開催中') - Number(left.phase === '開催中') || left.index - right.index)
      .forEach(({ exhibition, phase }) => {
      const item = document.createElement('div')
      item.className = phase === '開催予定' ? 'exhibition-upcoming' : 'exhibition-ongoing'
      const state = document.createElement('em')
      state.textContent = phase || '特別展'
      if (exhibition.is_sample) {
        const sample = document.createElement('small')
        sample.textContent = 'サンプル'
        state.append(sample)
      }
      const name = document.createElement('strong')
      name.textContent = exhibition.title
      const dates = document.createElement('span')
      dates.textContent = `会期：${formatExhibitionPeriod(exhibition)}`
      item.append(state, name)
      item.append(dates)
      if (exhibition.official_url) {
        const exhibitionLink = document.createElement('a')
        exhibitionLink.href = exhibition.official_url
        exhibitionLink.target = '_blank'
        exhibitionLink.rel = 'noreferrer'
        exhibitionLink.textContent = '展覧会公式サイト'
        item.append(exhibitionLink)
      }
      exhibitionSection.append(item)
      })
    root.append(exhibitionSection)
  }
  const links = document.createElement('div')
  links.className = 'popup-links'
  if (facility.official_url) {
    const official = document.createElement('a')
    official.href = facility.official_url
    official.target = '_blank'
    official.rel = 'noreferrer'
    official.textContent = '公式サイト'
    links.append(official)
  }
  const google = document.createElement('a')
  google.href = googleMapsUrl(facility)
  google.target = '_blank'
  google.rel = 'noreferrer'
  google.textContent = 'Googleマップで開く'
  links.append(google)
  root.append(links)
  return root
}

function MapCanvas({ items, selectedId, temporaryId, layoutKey, mobile, onSelect, onBounds, onErrorChange }: {
  items: Facility[]
  selectedId: string | null
  temporaryId: string | null
  layoutKey: string
  mobile: boolean
  onSelect: (facility: Facility | null) => void
  onBounds: (bounds: BoundsValue) => void
  onErrorChange: (error: boolean) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, Marker>())
  const popupRef = useRef<Popup | null>(null)
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const publishBounds = useCallback(() => {
    const bounds = mapRef.current?.getBounds()
    if (!bounds) return
    const center = mapRef.current!.getCenter()
    onBounds({ center: { latitude: center.lat, longitude: center.lng }, west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() })
  }, [onBounds])

  useEffect(() => {
    if (!containerRef.current) return
    setLoading(true)
    setError(false)
    onErrorChange(false)
    const map = new MapLibreMap({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [139.63, 35.68],
      zoom: 9.25,
      bearing: 0,
      pitch: 0,
      minZoom: 4,
      maxZoom: 18,
      minPitch: 0,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      localIdeographFontFamily: "'Noto Sans JP', sans-serif",
      attributionControl: false,
    })
    map.dragRotate.disable()
    map.touchPitch.disable()
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new AttributionControl({ compact: true, customAttribution: `<a href="${import.meta.env.BASE_URL}sources.html" target="_blank" rel="noopener noreferrer">施設データの出典</a>` }), 'bottom-left')
    mapRef.current = map
    let styleReady = false
    let failureTimer = 0
    map.on('style.load', () => {
      styleReady = true
      window.clearTimeout(failureTimer)
      setLoading(false)
      setError(false)
      onErrorChange(false)
      const mainland = facilities.filter(item => item.latitude > 34.8 && item.longitude > 138 && item.longitude < 141)
      if (mainland.length) {
        const bounds = mainland.reduce((value, item) => value.extend([item.longitude, item.latitude]), new LngLatBounds())
        const compact = window.matchMedia('(max-width: 760px)').matches
        map.fitBounds(bounds, { padding: { top: compact ? 125 : 105, right: 65, bottom: compact ? 95 : 75, left: 65 }, maxZoom: 10, duration: 0 })
      }
      const paint = (id: string, property: Parameters<MapLibreMap['setPaintProperty']>[1], value: string | number) => {
        if (map.getLayer(id)) map.setPaintProperty(id, property, value)
      }
      paint('background', 'background-color', '#f7f4e9')
      paint('park', 'fill-color', '#dcebd8')
      paint('landcover_wood', 'fill-color', '#d7e7d3')
      paint('landuse_residential', 'fill-color', '#f1efe7')
      paint('water', 'fill-color', '#cfe8ed')
      paint('waterway', 'line-color', '#b8dce3')
      paint('building', 'fill-color', '#e8e3d8')
      ;['highway_path', 'highway_minor', 'highway_major_inner', 'highway_motorway_inner', 'tunnel_motorway_inner', 'highway_motorway_bridge_inner'].forEach(id => paint(id, 'line-color', '#ffffff'))
      ;['highway_major_casing', 'highway_motorway_casing', 'tunnel_motorway_casing', 'highway_motorway_bridge_casing'].forEach(id => paint(id, 'line-color', '#d8ddda'))
      map.getStyle().layers.forEach(layer => {
        if (layer.type === 'symbol') {
          paint(layer.id, 'text-color', '#59645f')
          paint(layer.id, 'text-halo-color', '#fbfaf4')
          paint(layer.id, 'text-halo-width', 1)
        }
        if (layer.type === 'symbol' && layer.layout?.['text-field'] && !/shield/.test(layer.id)) {
          try {
            map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ja'], ['get', 'name:nonlatin'], ['get', 'name'], ['get', 'name:latin'], ['get', 'name_en']])
          } catch { /* Some symbol layers do not expose name fields. */ }
        }
      })
      paint('label_state', 'text-opacity', .58)
      if (map.getLayer('label_state')) map.setLayoutProperty('label_state', 'text-size', 12)
      ;['label_city', 'label_city_capital'].forEach(id => paint(id, 'text-opacity', .82))
      publishBounds()
    })
    map.on('moveend', publishBounds)
    map.on('click', event => {
      if ((event.originalEvent.target as HTMLElement).closest('.museum-marker-anchor')) return
      const popup = popupRef.current
      popupRef.current = null
      popup?.remove()
      onSelect(null)
    })
    map.on('error', event => {
      const message = String(event.error?.message || '')
      if (!styleReady && /style|fetch|worker/i.test(message)) {
        setLoading(false)
        setError(true)
        onErrorChange(true)
      }
    })
    failureTimer = window.setTimeout(() => {
      if (!styleReady) {
        setLoading(false)
        setError(true)
        onErrorChange(true)
      }
    }, 12000)
    return () => {
      window.clearTimeout(failureTimer)
      const popup = popupRef.current
      popupRef.current = null
      popup?.remove()
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
  }, [retry, onSelect, onErrorChange, publishBounds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || loading) return
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current.clear()
    items.forEach(facility => {
      const element = document.createElement('div')
      element.className = 'museum-marker-anchor'
      const pin = document.createElement('button')
      pin.type = 'button'
      pin.className = `museum-pin category-${getCategoryGroup(facility)}`
      pin.style.setProperty('--pin', categoryColors[getCategoryGroup(facility)])
      pin.setAttribute('aria-label', `${facility.name}、${getOpeningPlan(facility)?.kind === 'opening' ? '開館予定' : operationalLabels[facility.operational_status]}`)
      const symbol = document.createElement('span')
      symbol.textContent = categorySymbols[getCategoryGroup(facility)]
      pin.append(symbol)
      element.append(pin)
      const marker = new Marker({
        element,
        anchor: 'bottom',
        offset: [0, 0],
        subpixelPositioning: true,
      })
        .setLngLat([facility.longitude, facility.latitude])
        .addTo(map)
      pin.addEventListener('click', event => {
        event.stopPropagation()
        onSelect(facility)
      })
      markersRef.current.set(facility.id, marker)
    })
  }, [items, loading, onSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) {
      markersRef.current.forEach(value => {
        value.getElement().classList.remove('selected')
        value.getElement().querySelector('.museum-pin')?.classList.remove('selected')
      })
      const popup = popupRef.current
      popupRef.current = null
      popup?.remove()
      return
    }
    const facility = facilities.find(item => item.id === selectedId)
    const marker = markersRef.current.get(selectedId)
    if (!facility || !marker) return
    markersRef.current.forEach((value, id) => {
      const active = id === selectedId
      value.getElement().classList.toggle('selected', active)
      value.getElement().querySelector('.museum-pin')?.classList.toggle('selected', active)
    })
    const previousPopup = popupRef.current
    popupRef.current = null
    previousPopup?.remove()
    if (mobile) return
    const popupContent = buildPopup(facility, temporaryId === facility.id)
    const popup = new Popup({ closeButton: true, closeOnClick: true, offset: 28, maxWidth: '410px', focusAfterOpen: false })
      .setLngLat([facility.longitude, facility.latitude])
      .setDOMContent(popupContent)
      .addTo(map)
    popupRef.current = popup
    // Mobile details live in FacilityList; this popup is desktop-only.
    const fitPopup = () => {
      if (popupRef.current !== popup) return
      const height = map.getContainer().clientHeight
      const top = 105
      const bottom = 45
      const point = map.project([facility.longitude, facility.latitude])
      const width = map.getContainer().clientWidth
      const bubbleWidth = popup.getElement().offsetWidth
      const rightSpace = width - 60 - point.x
      const leftSpace = point.x - 16
      const sideways = Math.max(rightSpace, leftSpace) >= bubbleWidth + 28
      const tip = popup.getElement().querySelector<HTMLElement>('.maplibregl-popup-tip')
      if (sideways) {
        popup.options.anchor = rightSpace >= bubbleWidth + 28 ? 'left' : 'right'
        popupContent.style.maxHeight = `${Math.max(80, Math.min(620, height - top - bottom))}px`
        const bubbleHeight = popup.getElement().offsetHeight
        const center = Math.max(top + bubbleHeight / 2, Math.min(point.y, height - bottom - bubbleHeight / 2))
        const shift = center - point.y
        popup.setOffset([popup.options.anchor === 'left' ? 28 : -28, shift])
        if (tip) tip.style.transform = `translateY(${Math.max(-bubbleHeight / 2 + 24, Math.min(bubbleHeight / 2 - 24, -shift))}px)`
        return
      }
      popup.options.anchor = undefined
      if (tip) tip.style.transform = ''
      const available = Math.max(point.y - top, height - bottom - point.y) - 40
      popupContent.style.maxHeight = `${Math.max(80, Math.min(520, available))}px`
      popup.setOffset(28)
      popup.setPadding({ top, bottom, left: 16, right: 60 })
    }
    const frame = requestAnimationFrame(fitPopup)
    const observer = new ResizeObserver(fitPopup)
    observer.observe(popupContent)
    map.on('move', fitPopup)
    map.on('resize', fitPopup)
    window.visualViewport?.addEventListener('resize', fitPopup)
    popup.on('close', () => {
      if (popupRef.current !== popup) return
      popupRef.current = null
      onSelect(null)
    })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      map.off('move', fitPopup)
      map.off('resize', fitPopup)
      window.visualViewport?.removeEventListener('resize', fitPopup)
    }
  }, [selectedId, temporaryId, items, mobile, onSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const timer = window.setTimeout(() => {
      map.resize()
      publishBounds()
    }, 320)
    return () => window.clearTimeout(timer)
  }, [layoutKey, publishBounds])

  return (
    <div className="map-canvas">
      <div ref={containerRef} className="map-surface" aria-label="東京のミュージアム地図" />
      {loading && <div className="map-loading"><span />地図を読み込んでいます</div>}
      {error && (
        <div className="map-error" role="alert">
          <Icon name="info" size={24} />
          <strong>地図を読み込めませんでした</strong>
          <span>通信状態を確認して、もう一度お試しください。</span>
          <Button onClick={() => setRetry(value => value + 1)}><Icon name="refresh" size={16} />再試行</Button>
        </div>
      )}
    </div>
  )
}

function CheckboxGroup<T extends string>({ values, selected, labels, onChange }: {
  values: T[]
  selected: T[]
  labels: Record<T, string>
  onChange: (values: T[]) => void
}) {
  return <div className="filter-checks">{values.map(value => (
    <Button key={value} className={selected.includes(value) ? 'selected' : ''} onClick={() => onChange(selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value])}>
      <span>{selected.includes(value) ? '✓' : ''}</span>{labels[value]}
    </Button>
  ))}</div>
}

function RadioGroup<T extends string>({ values, selected, labels, onChange }: {
  values: T[]
  selected: T
  labels: Record<T, string>
  onChange: (value: T) => void
}) {
  return <div className="filter-radios">{values.map(value => (
    <Button key={value} className={selected === value ? 'selected' : ''} onClick={() => onChange(value)}>
      <span>{selected === value && <i />}</span>{labels[value]}
    </Button>
  ))}</div>
}

function FilterPanel({ draft, onChange, onClose, onApply }: {
  draft: Filters
  onChange: (value: Filters) => void
  onClose: () => void
  onApply: () => void
}) {
  const visitLabels: Record<VisitFilter, string> = { any: '指定なし', open_now: '今開いている', open_today: '本日開館' }
  const exhibitionLabels: Record<ExhibitionFilter, string> = {
    any: '指定なし', ongoing: '開催中', starts_30: '今後30日以内に開始', ends_14: '今後14日以内に終了', on_date: '指定日に開催',
  }
  return (
    <aside className="filter-panel" aria-label="施設フィルター">
      <header><div><small>表示条件を編集</small><h2>フィルター</h2></div><Button onClick={onClose} aria-label="閉じる"><Icon name="close" /></Button></header>
      <div className="filter-scroll">
        <section><h3>運営状態 <small>複数選択</small></h3><CheckboxGroup values={['active', 'suspended', 'closed', 'unknown']} selected={draft.operational} labels={operationalLabels} onChange={operational => onChange({ ...draft, operational })} /><label className="opening-plan-toggle"><input type="checkbox" checked={draft.includeOpeningPlans} onChange={event => onChange({ ...draft, includeOpeningPlans: event.target.checked })} />開館・再開予定も表示</label><p className="filter-help">予定が公表されている館も表示します。通常の休館日・営業時間外とは別の条件です。</p></section>
        <section><h3>掲載状態 <small>複数選択</small></h3><CheckboxGroup values={['normal', 'hold', 'out_of_scope']} selected={draft.publication} labels={publicationLabels} onChange={publication => onChange({ ...draft, publication })} /><p className="filter-help">開発中の確認用に、掲載対象外の施設も表示できます。運営状態とは別の条件です。</p></section>
        <section><h3>カテゴリ <small>複数選択</small></h3><CheckboxGroup values={categoryGroups} selected={draft.categories} labels={categoryLabels} onChange={categories => onChange({ ...draft, categories })} /><label className="filter-subcategory-option"><input type="checkbox" checked={draft.includeSubcategories} onChange={event => onChange({ ...draft, includeSubcategories: event.target.checked })} /><span aria-hidden="true">{draft.includeSubcategories ? '✓' : ''}</span><span><b>サブカテゴリも含める</b><small>オフにすると主カテゴリだけで絞り込みます</small></span></label></section>
        <section><h3>博物館区分 <small>複数選択</small></h3><CheckboxGroup values={museumCategoryValues} selected={draft.museumCategories} labels={museumCategoryLabels} onChange={museumCategories => onChange({ ...draft, museumCategories })} /><p className="filter-help">登録博物館・指定施設は文化庁名簿による区分です。それ以外は情報源を問わず博物館類似施設の候補として表示し、制度上の区分を確定したものではありません。</p></section>
        <section><h3>本日の訪問条件 <small>単一選択</small></h3><RadioGroup values={['any', 'open_now', 'open_today']} selected={draft.visit} labels={visitLabels} onChange={visit => onChange({ ...draft, visit })} /><p className="filter-help">現在日時で安全に判定できる営業時間データのみ対象にします。</p></section>
        <section><h3>特別展 <small>単一選択</small></h3><RadioGroup values={['any', 'ongoing', 'starts_30', 'ends_14', 'on_date']} selected={draft.exhibition} labels={exhibitionLabels} onChange={exhibition => onChange({ ...draft, exhibition })} />{draft.exhibition === 'on_date' && <input className="date-input" type="date" value={draft.exhibitionDate} onChange={event => onChange({ ...draft, exhibitionDate: event.target.value })} />}</section>
      </div>
      <footer>
        <Button onClick={() => onChange(cloneFilters(INITIAL_FILTERS))}>初期状態に戻す</Button>
        <Button onClick={() => onChange(cloneFilters(ALL_FILTERS))}>すべて表示</Button>
        <Button className="apply" onClick={onApply}>適用</Button>
      </footer>
    </aside>
  )
}

function FacilityCard({ facility, selected, exhibitionFilter, onSelect }: {
  facility: Facility
  selected: boolean
  exhibitionFilter: ExhibitionFilter
  onSelect: () => void
}) {
  const exhibitions = (facility.special_exhibitions || [])
    .filter(item => !item.end_date || item.end_date >= todayInTokyo())
    .sort((left, right) =>
    Number(exhibitionPhase(right) === '開催中') - Number(exhibitionPhase(left) === '開催中')
    || (left.start_date || '').localeCompare(right.start_date || ''))
  const openingPlan = getOpeningPlan(facility)
  const schedule = scheduleDisplay(facility)
  const notice = publicNotice(facility)
  const categories = displayCategories(facility).join('｜')
  return (
    <article data-facility-id={facility.id} className={`list-card ${selected ? 'selected' : ''}`} onClick={event => {
      if (!(event.target as HTMLElement).closest('a, button, details')) onSelect()
    }}>
      {facility.image_url && <img src={facility.image_url} alt="" />}
      <h3><button className="list-card-title" onClick={onSelect} aria-pressed={selected}>{facility.name}</button><span className="list-card-arrow" aria-hidden="true">›</span></h3>
      <div className="list-card-classifications">
        <div className="list-card-meta"><span className={`category-symbol category-${getCategoryGroup(facility)}`} style={categoryStyle(getCategoryGroup(facility))}>{categorySymbols[getCategoryGroup(facility)]}</span><span>{categories}{getPublicationStatus(facility) === 'out_of_scope' && '｜掲載対象外'}</span></div>
        <div className="list-museum-categories">{displayMuseumCategories(facility).map(category => <span key={category}>{category}</span>)}</div>
      </div>
      {facility.address && <div className="list-card-address">{facility.address}</div>}
      <div className={`list-schedule ${openingPlan ? 'list-opening-plan' : ''} ${['suspended', 'closed'].includes(facility.operational_status) ? 'list-inactive' : ''}`}>
        {['suspended', 'closed'].includes(facility.operational_status) ? <>
          <p>{facility.operational_status === 'closed' ? '閉館済み' : '休館中'}</p>
          {openingPlan && <span className="list-status-detail">｜{openingPlanDate(openingPlan)}再開予定</span>}
        </> : <div><span>{openingPlan ? '開館予定' : '本日'}</span><p>{openingPlan ? openingPlanDate(openingPlan) : schedule.today !== '—' ? schedule.today : '公式サイトでご確認ください'}</p></div>}
      </div>
      {notice && <div className={`list-notice ${facility.operational_status}`}>{notice}</div>}
      {exhibitions.slice(0, 2).map(item => <div className={`card-exhibition ${exhibitionPhase(item) === '開催予定' ? 'exhibition-upcoming' : 'exhibition-ongoing'} ${exhibitionFilter !== 'any' ? 'featured' : ''}`} key={item.title}><em>{exhibitionPhase(item) || '特別展'}{item.is_sample && <small>サンプル</small>}</em><b>{item.title}</b><span>会期：{formatExhibitionPeriod(item)}</span></div>)}
      {exhibitions.length > 2 && <Button className="list-exhibition-more" onClick={onSelect}>ほか{exhibitions.length - 2}件を詳細で見る</Button>}
    </article>
  )
}

function FacilityList({ items, selectedId, selectedFacility, canGoBack, outsideFilters, onBack, onDetailClose, stale, mobile, sheetLevel, exhibitionFilter, onSheetLevel, onRefresh, onReset, onClose, onSelect }: {
  items: Facility[]
  selectedId: string | null
  selectedFacility?: Facility
  canGoBack: boolean
  outsideFilters: boolean
  onBack: () => void
  onDetailClose: () => void
  stale: boolean
  mobile: boolean
  sheetLevel: SheetLevel
  exhibitionFilter: ExhibitionFilter
  onSheetLevel: (level: SheetLevel) => void
  onRefresh: () => void
  onReset: () => void
  onClose: () => void
  onSelect: (facility: Facility) => void
}) {
  const listScroll = useRef<HTMLDivElement>(null)
  const detailHost = useRef<HTMLDivElement>(null)
  const savedScroll = useRef(0)
  const showDetail = mobile && Boolean(selectedFacility)
  useEffect(() => {
    if (!detailHost.current) return
    detailHost.current.replaceChildren(...(selectedFacility ? [buildPopup(selectedFacility, outsideFilters)] : []))
    detailHost.current.scrollTop = 0
  }, [selectedFacility, outsideFilters])
  useEffect(() => {
    if (showDetail) return
    const frame = requestAnimationFrame(() => { if (listScroll.current) listScroll.current.scrollTop = savedScroll.current })
    return () => cancelAnimationFrame(frame)
  }, [showDetail])
  const dragStart = useRef<number | null>(null)
  const onPointerUp = (event: React.PointerEvent) => {
    if (dragStart.current === null) return
    const delta = event.clientY - dragStart.current
    if (delta < -35) onSheetLevel(Math.min(2, sheetLevel + 1) as SheetLevel)
    if (delta > 35) onSheetLevel(Math.max(0, sheetLevel - 1) as SheetLevel)
    dragStart.current = null
  }
  return (
    <aside className={`facility-panel ${mobile ? `sheet-level-${sheetLevel}` : ''}`}>
      <header className="list-header" onPointerDown={event => {
        if ((event.target as HTMLElement).closest('button')) return
        dragStart.current = event.clientY
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerUp={onPointerUp} onPointerCancel={() => { dragStart.current = null }}>
        {mobile && <span className="sheet-grip" />}
        {showDetail ? <><Button className="sheet-back" onClick={onBack}>{canGoBack ? '‹ 一覧に戻る' : '‹ 一覧を表示'}</Button><Button onClick={onDetailClose} aria-label="施設情報を閉じる"><Icon name="close" /></Button></> : <><div><small>地図の中央から近い順</small><h2>この範囲の施設 <b>{items.length}</b></h2></div>
        {!mobile && <Button onClick={onClose} aria-label="一覧を閉じる"><Icon name="close" /></Button>}
        {mobile && <Button className="list-collapse" onClick={() => onSheetLevel(0)} aria-label="一覧を折りたたむ"><Icon name="chevron" /></Button>}</>}
      </header>
      {stale && !showDetail && <Button className="refresh-area" onClick={onRefresh}><Icon name="refresh" size={16} />この範囲で一覧を更新</Button>}
      <div className="list-scroll" ref={listScroll} style={showDetail ? { display: 'none' } : undefined} onScroll={event => { if (!showDetail) savedScroll.current = event.currentTarget.scrollTop }}>
        {items.length ? items.map(facility => <FacilityCard key={facility.id} facility={facility} selected={selectedId === facility.id} exhibitionFilter={exhibitionFilter} onSelect={() => onSelect(facility)} />) : (
          <div className="list-empty"><Icon name="info" size={25} /><strong>この範囲には条件に一致する施設がありません</strong><Button onClick={onReset}>初期条件に戻す</Button></div>
        )}
      </div>
      <div className="sheet-detail" ref={detailHost} hidden={!showDetail} />
    </aside>
  )
}

function App() {
  const mobile = useIsMobile()
  const [filters, setFilters] = useState<Filters>(() => cloneFilters(INITIAL_FILTERS))
  const [draft, setDraft] = useState<Filters>(() => cloneFilters(INITIAL_FILTERS))
  const [filterOpen, setFilterOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [sheetLevel, setSheetLevel] = useState<SheetLevel>(0)
  const previousListLevel = useRef<SheetLevel>(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectionOrigin, setSelectionOrigin] = useState<'map' | 'list' | 'search'>('map')
  const [temporaryId, setTemporaryId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [liveBounds, setLiveBounds] = useState<BoundsValue | null>(null)
  const liveBoundsRef = useRef<BoundsValue | null>(null)
  const [listBounds, setListBounds] = useState<BoundsValue | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [mapError, setMapError] = useState(false)

  const filtered = useMemo(() => facilities.filter(item => matchesFilters(item, filters)), [filters])
  const visible = useMemo(() => {
    if (!temporaryId || filtered.some(item => item.id === temporaryId)) return filtered
    const temporary = facilities.find(item => item.id === temporaryId)
    return temporary ? [...filtered, temporary] : filtered
  }, [filtered, temporaryId])
  const distanceOrigin = useMemo<Coordinate>(() => {
    const bounds = listBounds || liveBounds
    return bounds ? bounds.center
      : { latitude: 35.68, longitude: 139.63 }
  }, [listBounds, liveBounds])
  const listItems = useMemo(() => filtered.filter(item => isInBounds(item, listBounds))
    .sort((left, right) => distanceKm(distanceOrigin, left) - distanceKm(distanceOrigin, right)
      || left.name.localeCompare(right.name, 'ja')), [filtered, listBounds, distanceOrigin])
  const currentRangeCount = useMemo(() => filtered.filter(item => isInBounds(item, liveBounds)).length, [filtered, liveBounds])
  const suggestions = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return []
    return facilities.filter(item => [item.name, item.short_name, ...item.aliases].some(value => value.toLowerCase().includes(text))).slice(0, 8)
  }, [query])
  const boundsStale = useMemo(() => {
    if (!liveBounds || !listBounds) return false
    return Math.max(Math.abs(liveBounds.west - listBounds.west), Math.abs(liveBounds.east - listBounds.east), Math.abs(liveBounds.north - listBounds.north), Math.abs(liveBounds.south - listBounds.south)) > .01
  }, [liveBounds, listBounds])

  const handleBounds = useCallback((bounds: BoundsValue) => {
    liveBoundsRef.current = bounds
    setLiveBounds(bounds)
  }, [])
  const handleSelect = useCallback((facility: Facility | null) => {
    setSelectionOrigin('map')
    setSelectedId(facility?.id || null)
    if (mobile) {
      if (facility) previousListLevel.current = 1
      setSheetLevel(facility ? 1 : 0)
    }
  }, [mobile])
  const handleMapError = useCallback((value: boolean) => setMapError(value), [])

  const openList = () => {
    if (listOpen && !mobile) {
      setListOpen(false)
      return
    }
    setListOpen(true)
    if (mobile) {
      setSelectedId(null)
      setListBounds(liveBoundsRef.current)
      setSheetLevel(1)
    } else {
      window.setTimeout(() => setListBounds(liveBoundsRef.current), 360)
    }
  }
  const showListFromDetail = () => {
    setSelectedId(null)
    if (selectionOrigin === 'list') {
      setSheetLevel(previousListLevel.current)
      if (!listBounds) setListBounds(liveBoundsRef.current)
    } else {
      setSheetLevel(1)
      setListBounds(liveBoundsRef.current)
      setTemporaryId(null)
    }
  }
  const selectFromList = (facility: Facility) => {
    setSelectionOrigin('list')
    previousListLevel.current = sheetLevel || 1
    setTemporaryId(null)
    setSelectedId(facility.id)
  }
  const selectSearch = (facility: Facility) => {
    setSelectionOrigin('search')
    setQuery(facility.name)
    setSuggestionsOpen(false)
    setTemporaryId(matchesFilters(facility, filters) ? null : facility.id)
    setSelectedId(facility.id)
    if (mobile) { previousListLevel.current = 1; setListBounds(liveBoundsRef.current); setSheetLevel(1) }
  }
  const openFilters = () => {
    setDraft(cloneFilters(filters))
    setFilterOpen(true)
    if (mobile) setSelectedId(null)
  }
  const applyFilters = () => {
    setFilters(cloneFilters(draft))
    setTemporaryId(null)
    setFilterOpen(false)
  }
  const initialReset = () => {
    setFilters(cloneFilters(INITIAL_FILTERS))
    setTemporaryId(null)
  }

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; remove: () => void }[] = []
    if (!sameValues(filters.operational, INITIAL_FILTERS.operational)) chips.push({
      key: 'operational',
      label: `運営状態: ${filters.operational.map(value => operationalLabels[value]).join('・') || 'すべて'}`,
      remove: () => setFilters(current => ({ ...current, operational: [...INITIAL_FILTERS.operational] })),
    })
    if (filters.includeOpeningPlans) chips.push({ key: 'opening-plans', label: '開館・再開予定も表示', remove: () => setFilters(current => ({ ...current, includeOpeningPlans: false })) })
    if (!sameValues(filters.publication, INITIAL_FILTERS.publication)) chips.push({
      key: 'publication',
      label: `掲載: ${filters.publication.map(value => publicationLabels[value]).join('・') || 'すべて'}`,
      remove: () => setFilters(current => ({ ...current, publication: [...INITIAL_FILTERS.publication] })),
    })
    filters.categories.forEach(value => chips.push({ key: `c-${value}`, label: categoryLabels[value], remove: () => setFilters(current => ({ ...current, categories: current.categories.filter(item => item !== value) })) }))
    if (filters.categories.length && filters.includeSubcategories) chips.push({ key: 'include-subcategories', label: 'サブカテゴリ含む', remove: () => setFilters(current => ({ ...current, includeSubcategories: false })) })
    filters.museumCategories.forEach(value => chips.push({ key: `mc-${value}`, label: museumCategoryLabels[value], remove: () => setFilters(current => ({ ...current, museumCategories: current.museumCategories.filter(item => item !== value) })) }))
    if (filters.visit !== 'any') chips.push({ key: 'visit', label: filters.visit === 'open_now' ? '今開いている' : '本日開館', remove: () => setFilters(current => ({ ...current, visit: 'any' })) })
    if (filters.exhibition !== 'any') chips.push({ key: 'exhibition', label: '特別展条件', remove: () => setFilters(current => ({ ...current, exhibition: 'any', exhibitionDate: '' })) })
    return chips
  }, [filters])

  const effectiveListOpen = mobile ? true : listOpen
  const layoutKey = `${listOpen}-${sheetLevel}`

  return (
    <main className={`app-shell ${listOpen && !mobile ? 'desktop-list-open' : ''}`}>
      <div className="top-bar">
        <div className="logo-panel"><span><Icon name="building" size={19} /></span><div><strong>TOKYO MUSEUM MAP</strong><small>東京のミュージアムを発見する</small></div></div>
        <div className="top-actions">
          <div className="facility-search">
            <Icon name="search" size={18} />
            <input value={query} onFocus={() => setSuggestionsOpen(true)} onChange={event => { setQuery(event.target.value); setSuggestionsOpen(true); if (!event.target.value) setTemporaryId(null) }} placeholder="施設名を検索" aria-label="施設名を検索" />
            {query && <Button onClick={() => { setQuery(''); setSuggestionsOpen(false); setTemporaryId(null) }} aria-label="検索を消去"><Icon name="close" size={15} /></Button>}
            {suggestionsOpen && query && <div className="search-suggestions">{suggestions.length ? suggestions.map(item => <Button key={item.id} onClick={() => selectSearch(item)}><span className={`category-symbol category-${getCategoryGroup(item)}`} style={categoryStyle(getCategoryGroup(item))}>{categorySymbols[getCategoryGroup(item)]}</span><div><strong>{item.name}</strong>{item.aliases.length > 0 && <small>{item.aliases.join('・')}</small>}</div></Button>) : <p>一致する施設がありません</p>}</div>}
          </div>
          {!mobile && <Button className={`toolbar-button ${listOpen ? 'active' : ''}`} onClick={openList}><Icon name="list" size={18} />一覧 {listOpen ? listItems.length : currentRangeCount}件</Button>}
          <Button className={`toolbar-button ${activeChips.length ? 'active' : ''}`} onClick={openFilters}><Icon name="sliders" size={18} />フィルター{activeChips.length > 0 && <b>{activeChips.length}</b>}</Button>
        </div>
      </div>
      {activeChips.length > 0 && <div className="active-chips">{activeChips.map(chip => <Button key={chip.key} onClick={chip.remove}>{chip.label}<Icon name="close" size={12} /></Button>)}</div>}

      <section className="map-area">
        <MapCanvas items={visible} selectedId={filterOpen ? null : selectedId} temporaryId={temporaryId} layoutKey={layoutKey} mobile={mobile} onSelect={handleSelect} onBounds={handleBounds} onErrorChange={handleMapError} />
        {!mapError && <svg className="map-center-target" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path d="M12 4v16M4 12h16" stroke="white" strokeWidth="4" strokeLinecap="round" />
          <path d="M12 4v16M4 12h16" stroke="#687671" strokeWidth="1.5" strokeLinecap="round" />
        </svg>}
      </section>

      {!mapError && <div className={`map-legend ${legendOpen ? 'open' : ''}`}>
        <Button onClick={() => setLegendOpen(value => !value)}><span>凡例</span><Icon name="chevron" size={14} /></Button>
        {legendOpen && <div>{categoryGroups.map(category => (
          <span key={category}><i className={`legend-pin category-${category}`} style={categoryStyle(category)}>{categorySymbols[category]}</i>{categoryLabels[category]}</span>
        ))}</div>}
      </div>}

      {effectiveListOpen && !filterOpen && <FacilityList items={listItems} selectedId={selectedId} selectedFacility={mobile ? facilities.find(item => item.id === selectedId) : undefined} canGoBack={selectionOrigin === 'list'} outsideFilters={Boolean(temporaryId && temporaryId === selectedId)} onBack={showListFromDetail} onDetailClose={() => { setSelectedId(null); setSheetLevel(0) }} stale={boundsStale} mobile={mobile} sheetLevel={sheetLevel} exhibitionFilter={filters.exhibition} onSheetLevel={level => { setSheetLevel(level); if (level === 0) setSelectedId(null); if (!listBounds) setListBounds(liveBoundsRef.current) }} onRefresh={() => setListBounds(liveBoundsRef.current)} onReset={initialReset} onClose={() => setListOpen(false)} onSelect={selectFromList} />}
      {mobile && !selectedId && !filterOpen && sheetLevel === 0 && <Button className="mobile-list-peek" onClick={openList}><span /><div>この範囲の施設 <b>{currentRangeCount}</b></div><Icon name="chevron" size={16} /></Button>}

      {filterOpen && <FilterPanel draft={draft} onChange={setDraft} onClose={() => setFilterOpen(false)} onApply={applyFilters} />}
      {filtered.length === 0 && !filterOpen && <div className="zero-state"><strong>この範囲には条件に一致する施設がありません</strong><Button onClick={initialReset}>初期条件に戻す</Button></div>}
    </main>
  )
}

export default App
