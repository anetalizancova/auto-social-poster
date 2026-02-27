/**
 * Timezone Utilities
 * 
 * Standardizuje všechny datumové operace na Europe/Prague timezone.
 * Používá Intl.DateTimeFormat (built-in Node.js, žádné dependencies).
 */

const TIMEZONE = 'Europe/Prague';

/**
 * Získej aktuální čas v Prague timezone jako Date objekt.
 * Pozor: Date objekt interně drží UTC, ale tato funkce vrací Date
 * nastavenou tak, aby getHours/getMinutes odpovídaly Prague.
 */
export function nowInPrague(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: TIMEZONE })
  );
}

/**
 * Vytvoř datum v Prague timezone z komponent.
 * Vrací ISO string s korektním UTC offsetem pro Prague.
 * 
 * @example createPragueDate(2026, 2, 11, 10, 0) => "2026-02-11T10:00:00+01:00"
 */
export function createPragueDate(
  year: number,
  month: number,  // 1-12
  day: number,
  hours: number = 0,
  minutes: number = 0
): string {
  // Vytvoř "naivní" datum v UTC
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  
  // Zjisti offset pro Prague v tento den/čas
  const offsetMinutes = getPragueOffset(naiveUtc);
  
  // Posuň o offset aby lokální čas v Prague odpovídal zadaným hodinám
  const utcTime = new Date(naiveUtc.getTime() + offsetMinutes * 60 * 1000);
  
  // Formátuj s offsetem
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offsetMins = String(absOffset % 60).padStart(2, '0');
  
  const pad = (n: number) => String(n).padStart(2, '0');
  
  return `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00${sign}${offsetHours}:${offsetMins}`;
}

/**
 * Vytvoř ISO string s Prague timezone z existujícího Date objektu.
 * Převede UTC Date na Prague lokální čas a vrátí s offsetem.
 */
export function toPragueISO(date: Date): string {
  const pragueStr = date.toLocaleString('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Parse "MM/DD/YYYY, HH:MM:SS" format
  const match = pragueStr.match(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/);
  if (!match) return date.toISOString();
  
  const [, mm, dd, yyyy, hh, min, ss] = match;
  
  const offsetMinutes = getPragueOffset(date);
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetH = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const offsetM = String(absOffset % 60).padStart(2, '0');
  
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hh.padStart(2, '0')}:${min.padStart(2, '0')}:${ss.padStart(2, '0')}${sign}${offsetH}:${offsetM}`;
}

/**
 * Získej Prague UTC offset v minutách (záporný = východně od UTC).
 * CET = UTC+1 (offset = -60), CEST = UTC+2 (offset = -120)
 */
function getPragueOffset(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const pragueStr = date.toLocaleString('en-US', { timeZone: TIMEZONE });
  
  const utcDate = new Date(utcStr);
  const pragueDate = new Date(pragueStr);
  
  // Rozdíl v minutách (záporný pokud Prague je napřed)
  return (utcDate.getTime() - pragueDate.getTime()) / (60 * 1000);
}

/**
 * Parsuj datum s Prague timezone.
 * Akceptuje ISO stringy i naivní datumy (bez timezone -> předpokládá Prague).
 */
export function parsePragueDate(dateStr: string): Date {
  // Pokud má timezone offset, parsuj normálně
  if (/[+-]\d{2}:\d{2}$/.test(dateStr) || dateStr.endsWith('Z')) {
    return new Date(dateStr);
  }
  
  // Naivní datum -> předpokládej Prague timezone
  // Parsuj komponenty ručně aby se nepoužil lokální timezone
  const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hours, minutes] = match.map(Number);
    // Vytvoř UTC datum a posuň o Prague offset
    const naive = new Date(Date.UTC(year, month - 1, day, hours, minutes));
    const offset = getPragueOffset(naive);
    // Offset je záporný pro CET (+1), takže přičteme aby UTC odpovídalo
    return new Date(naive.getTime() + offset * 60 * 1000);
  }
  
  return new Date(dateStr);
}

/**
 * Formátuj datum česky v Prague timezone.
 * @example formatCzechDatePrague(date) => "úterý 11. února v 10:00"
 */
export function formatCzechDatePrague(date: Date, includeTime: boolean = true): string {
  const days = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
  const months = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
                  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  
  // Získej Prague-lokální komponenty
  const parts = new Intl.DateTimeFormat('cs-CZ', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  
  const dayNum = get('day');
  const monthIdx = parseInt(get('month')) - 1;
  const dayOfWeek = get('weekday');
  const hour = get('hour');
  const minute = get('minute');
  
  if (includeTime) {
    return `${dayOfWeek} ${dayNum}. ${months[monthIdx]} v ${hour}:${minute}`;
  }
  return `${dayOfWeek} ${dayNum}. ${months[monthIdx]}`;
}

/**
 * Vytvoř datum pro scheduling: konkrétní den + čas v Prague.
 * Vrací ISO string s offsetem.
 * 
 * @param baseDate - výchozí den (Date objekt)
 * @param daysToAdd - kolik dní přidat
 * @param timeStr - čas ve formátu "HH:MM"
 */
export function createScheduleDate(baseDate: Date, daysToAdd: number, timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // Získej Prague datum pro baseDate + daysToAdd
  const target = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const pragueParts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(target);
  
  const get = (type: string) => pragueParts.find(p => p.type === type)?.value || '';
  
  const year = parseInt(get('year'));
  const month = parseInt(get('month'));
  const day = parseInt(get('day'));
  
  return createPragueDate(year, month, day, hours, minutes);
}

export { TIMEZONE };
