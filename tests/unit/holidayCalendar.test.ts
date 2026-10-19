import {describe,it,expect,vi} from 'vitest';
import {createHolidayReader,validDate,validateCalendar} from '../../server/holidays/calendar';
const calendar={year:2026,region:'MY-14',sourceUrl:'https://www.kabinet.gov.my/hari-kelepasan-am/',reviewedAt:'2026-10-19',days:[{date:'2026-12-25',name:'圣诞节',kind:'public'}]};
describe('annual holiday calendar without weather automation',()=>{
 it.each(['2026-02-30','invalid','../file'])('rejects invalid date %s',date=>expect(validDate(date)).toBe(false));
 it('matches a holiday and caches the whole year once',async()=>{const load=vi.fn(async()=>calendar),read=createHolidayReader(load,'MY-14');expect((await read('2026-12-25')).names).toEqual(['圣诞节']);expect((await read('2026-12-26')).names).toEqual([]);expect(load).toHaveBeenCalledTimes(1);});
 it('does not use a different year or state',()=>{expect(()=>validateCalendar(calendar,2027,'MY-14')).toThrow();expect(()=>validateCalendar(calendar,2026,'MY-10')).toThrow();});
 it('does not mislabel missing or empty calendars as no holiday',async()=>{const read=createHolidayReader(async()=>({...calendar,days:[]}), 'MY-14');expect((await read('2026-12-25')).status).toBe('unavailable');});
 it('can read a year after an earlier missing-file error',async()=>{const load=vi.fn().mockRejectedValueOnce(new Error('missing')).mockResolvedValue(calendar),read=createHolidayReader(load,'MY-14');expect((await read('2026-12-25')).status).toBe('unavailable');expect((await read('2026-12-25')).status).toBe('ready');});
 it('rejects path-like regions',()=>expect(()=>createHolidayReader(async()=>calendar,'../MY-14')).toThrow());
});
