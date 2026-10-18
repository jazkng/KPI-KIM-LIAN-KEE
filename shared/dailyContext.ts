export interface CalendarYear {
  year: number; region: string; sourceUrl: string; reviewedAt: string;
  days: { date: string; name: string; kind: 'public' | 'school' | 'festival' }[];
}
export interface DailyContext {
  date: string; fetchedAt: string; timezone: 'Asia/Kuala_Lumpur';
  window: { start: '16:30'; end: '21:00' };
  kind: 'forecast';
  weather: { label: string; rainMm: number; minC: number; maxC: number } | null;
  air: { pm25Mean: number; pm25Max: number; pm10Mean: number } | null;
  holidays: { status: 'ready' | 'unavailable'; names: string[]; sourceUrl: string | null };
  issues: string[];
  attribution: string;
}
