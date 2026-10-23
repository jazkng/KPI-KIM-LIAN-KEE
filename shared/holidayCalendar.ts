export interface CalendarYear {
 year:number;region:string;sourceUrl:string;reviewedAt:string;
 days:{date:string;name:string;kind:'public'|'school'|'festival'}[];
}
export interface HolidaySummary {
 date:string;status:'ready'|'unavailable';names:string[];sourceUrl:string|null;reviewedAt:string|null;
}
