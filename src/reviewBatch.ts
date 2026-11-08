export type ReviewBatch = { id: string; label: string; facility_ids: string[] }

export function reviewScope<T extends { id: string }>(items: T[], requested: string | null, batches: ReviewBatch[]) {
  if (requested === null) return { items, batch: null, error: '' }
  const batch = batches.find(item => item.id === requested)
  if (!batch) return { items: [] as T[], batch: null, error: '指定された確認バッチがありません。' }
  const ids = new Set(batch.facility_ids)
  if (ids.size !== batch.facility_ids.length || batch.facility_ids.some(id => !items.some(item => item.id === id))) {
    return { items: [] as T[], batch: null, error: '確認バッチの施設データが一致しません。' }
  }
  return { items: items.filter(item => ids.has(item.id)), batch, error: '' }
}
