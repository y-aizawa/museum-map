export type SampleExhibition = {
  title: string
  start_date: string
  end_date: string
  status: 'ongoing' | 'upcoming'
  is_sample: true
}

export const SHOW_SAMPLE_EXHIBITIONS = false

const tokyoDate = (offsetDays: number) => {
  const now = new Date()
  const tokyoToday = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const date = new Date(`${tokyoToday}T00:00:00+09:00`)
  date.setDate(date.getDate() + offsetDays)
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export const SAMPLE_EXHIBITIONS_BY_FACILITY: Record<string, SampleExhibition[]> = {
  東京国立近代美術館: [
    {
      title: '光と形のコレクション展',
      start_date: tokyoDate(-12),
      end_date: tokyoDate(24),
      status: 'ongoing',
      is_sample: true,
    },
  ],
  サントリー美術館: [
    {
      title: '暮らしを彩る工芸のかたち',
      start_date: tokyoDate(10),
      end_date: tokyoDate(52),
      status: 'upcoming',
      is_sample: true,
    },
  ],
  'WHAT Museum': [
    {
      title: '都市と建築をめぐる想像力',
      start_date: tokyoDate(-18),
      end_date: tokyoDate(18),
      status: 'ongoing',
      is_sample: true,
    },
    {
      title: 'これからの暮らしと建築を考えるための長いタイトルを持つ展覧会',
      start_date: tokyoDate(20),
      end_date: tokyoDate(68),
      status: 'upcoming',
      is_sample: true,
    },
  ],
}
