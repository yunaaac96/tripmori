/**
 * universalImporter.ts
 * Shared parsing logic for bulk-import in both ProjectHub (new project)
 * and Schedule (existing project). Supports the new Chinese-label format
 * ([TRANSPORT] / [HOTEL] / [EVENTS]) as well as the legacy English sections
 * ([FLIGHT] / [CAR] / [HOTEL] / [BOOKING] / [EVENT]) for backward compat.
 */

// ── Category aliases ──────────────────────────────────────────────────────────
export const CATEGORY_ALIASES: Record<string, string> = {
  attraction: 'attraction', 景點: 'attraction', 活動: 'attraction',
  food: 'food', 餐廳: 'food', 飲食: 'food', 用餐: 'food',
  transport: 'transport', 交通: 'transport',
  hotel: 'hotel', 住宿: 'hotel', 飯店: 'hotel',
  shopping: 'shopping', 購物: 'shopping',
  misc: 'misc', 其他: 'misc',
};

// ── Output types (aligned with Firestore schema) ──────────────────────────────
export interface ParsedFlight {
  id: string;
  direction: string;
  airline: string;
  flightNo: string;
  date: string;
  dep: { airport: string; name: string; time: string };
  arr: { airport: string; name: string; time: string };
  notes: string;
  costPerPerson: string;
}

export interface ParsedHotel {
  id: string;
  name: string;
  nameJa: string;
  address: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  totalCost: string;
  currency: string;
  costPerPerson: string;
  confirmCode: string;
  pin: string;
  notes: string;
  mapUrl: string;
}

export interface ParsedCar {
  company: string;
  carType: string;
  pickupLocation: string;
  pickupTime: string;
  returnLocation: string;
  returnTime: string;
  totalCost: string;
  currency: string;
  confirmCode: string;
  notes: string;
}

export interface ParsedEvent {
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  category: string;
  location: string;
  notes: string;
  mapUrl: string;
  cost: number;
  currency: string;
  travelTime: string;
}

export interface ParsedBooking {
  title: string;
  type: string;
  date: string;
  cost: string;
  currency: string;
  confirmCode: string;
  notes: string;
}

export interface ParseResult {
  flights: ParsedFlight[];
  hotels: ParsedHotel[];
  car: ParsedCar | null;
  events: ParsedEvent[];
  bookings: ParsedBooking[];
  errors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse "TPE 06:50" or "台北桃園機場 06:50" → { location, time } */
function parseLocationTime(val: string): { location: string; time: string } {
  const timeMatch = val.match(/(\d{1,2}:\d{2})\s*$/);
  if (!timeMatch) return { location: val.trim(), time: '' };
  const time = timeMatch[1].padStart(5, '0');
  const location = val.slice(0, val.lastIndexOf(timeMatch[1])).trim();
  return { location, time };
}

/** Split "TPE 台北桃園 06:50" → { airport, name, time } */
function parseFlightEndpoint(val: string): { airport: string; name: string; time: string } {
  const { location, time } = parseLocationTime(val);
  const parts = location.split(/\s+/);
  // If first token looks like an IATA code (2–4 uppercase letters)
  if (parts.length >= 2 && /^[A-Z]{2,4}$/.test(parts[0])) {
    return { airport: parts[0], name: parts.slice(1).join(' '), time };
  }
  return { airport: '', name: location, time };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Main parser ───────────────────────────────────────────────────────────────
export function parseUniversalImport(text: string, defaultCurrency = 'JPY'): ParseResult {
  const result: ParseResult = {
    flights: [], hotels: [], car: null, events: [], bookings: [], errors: [],
  };

  type RawSection = { type: string; data: Record<string, string>; csvLines: string[] };
  const sections: RawSection[] = [];
  let cur: RawSection | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Section header — [TRANSPORT], [HOTEL], [EVENTS], [FLIGHT], etc.
    const hdr = line.match(/^\[([^\]]+)\]$/);
    if (hdr) {
      if (cur) sections.push(cur);
      cur = { type: hdr[1].trim().toUpperCase(), data: {}, csvLines: [] };
      continue;
    }

    if (!cur) continue;

    // Key: value  OR  key = value
    const colonIdx = line.indexOf(':');
    const equalsIdx = line.indexOf('=');
    let sepIdx = -1;
    if (colonIdx > 0 && (equalsIdx < 0 || colonIdx < equalsIdx)) sepIdx = colonIdx;
    else if (equalsIdx > 0) sepIdx = equalsIdx;

    if (sepIdx > 0) {
      const key = line.slice(0, sepIdx).trim();
      const val = line.slice(sepIdx + 1).trim();
      cur.data[key] = val;
    } else if (cur.type === 'EVENTS' || cur.type === 'EVENT') {
      // CSV row inside [EVENTS]
      cur.csvLines.push(line);
    }
  }
  if (cur) sections.push(cur);

  let flightIdx = 0;
  let hotelIdx = 0;

  for (const sec of sections) {
    const { type, data: d, csvLines } = sec;

    // ── [TRANSPORT] — new Chinese-label format ──────────────────────────────
    if (type === 'TRANSPORT') {
      const rawType = (d['類型'] || d['type'] || '').toLowerCase();
      const isFlightType = /機票|飛機|航班|flight/i.test(rawType);
      const isCarType    = /租車|car|汽車|開車|charter|包車/i.test(rawType);

      if (isFlightType) {
        flightIdx++;
        const date = d['日期'] || d['date'] || '';
        if (date && !DATE_RE.test(date))
          result.errors.push(`[TRANSPORT] 第 ${flightIdx} 筆機票：日期格式錯誤（需 YYYY-MM-DD），目前為「${date}」`);

        const depRaw = d['出發'] || '';
        const arrRaw = d['到達'] || '';
        const dep = parseFlightEndpoint(depRaw);
        const arr = parseFlightEndpoint(arrRaw);

        result.flights.push({
          id: `f${flightIdx}`,
          direction: d['方向'] || d['direction'] || '去程',
          airline: d['名稱'] || d['name'] || '',
          flightNo: d['航班'] || d['flightNo'] || '',
          date,
          dep,
          arr,
          notes: d['備註'] || d['notes'] || '',
          costPerPerson: d['費用'] || d['cost'] || '',
        });

      } else if (isCarType) {
        const date = d['日期'] || d['date'] || '';
        const depRaw = d['出發'] || '';
        const arrRaw = d['到達'] || '';
        const { location: pickupLoc, time: pickupTime } = parseLocationTime(depRaw);
        const { location: returnLoc, time: returnTime } = parseLocationTime(arrRaw);

        result.car = {
          company:         d['名稱'] || d['公司'] || d['name'] || '',
          carType:         d['車型'] || d['carType'] || '',
          pickupLocation:  pickupLoc,
          pickupTime:      date && pickupTime ? `${date} ${pickupTime}` : depRaw,
          returnLocation:  returnLoc,
          returnTime:      date && returnTime ? `${date} ${returnTime}` : arrRaw,
          totalCost:       d['費用'] || d['cost'] || '',
          currency:        d['幣別'] || d['currency'] || defaultCurrency,
          confirmCode:     d['確認碼'] || d['confirmCode'] || '',
          notes:           d['備註'] || d['notes'] || '',
        };

      } else {
        // General transport → booking
        const date = d['日期'] || d['date'] || '';
        if (date && !DATE_RE.test(date))
          result.errors.push(`[TRANSPORT] 交通：日期格式錯誤（需 YYYY-MM-DD），目前為「${date}」`);
        result.bookings.push({
          title:       d['名稱'] || d['name'] || '',
          type:        'transport',
          date,
          cost:        d['費用'] || d['cost'] || '0',
          currency:    d['幣別'] || d['currency'] || defaultCurrency,
          confirmCode: d['確認碼'] || d['confirmCode'] || '',
          notes:       d['備註'] || d['notes'] || '',
        });
      }

    // ── [HOTEL] — works for both Chinese and English labels ─────────────────
    } else if (type === 'HOTEL') {
      hotelIdx++;
      const checkInVal  = d['入住'] || d['checkIn']  || '';
      const checkOutVal = d['退房'] || d['checkOut'] || '';

      const checkInDate  = checkInVal.split(/\s/)[0];
      const checkOutDate = checkOutVal.split(/\s/)[0];
      if (checkInDate && !DATE_RE.test(checkInDate))
        result.errors.push(`[HOTEL] 第 ${hotelIdx} 筆住宿：入住日期格式錯誤（需 YYYY-MM-DD），目前為「${checkInVal}」`);
      if (checkOutDate && !DATE_RE.test(checkOutDate))
        result.errors.push(`[HOTEL] 第 ${hotelIdx} 筆住宿：退房日期格式錯誤（需 YYYY-MM-DD），目前為「${checkOutVal}」`);

      result.hotels.push({
        id:          `h${hotelIdx}`,
        name:        d['名稱'] || d['name']        || '',
        nameJa:      d['日文名稱'] || d['nameJa']  || '',
        address:     d['地址'] || d['address']      || '',
        roomType:    d['房型'] || d['roomType']     || '',
        checkIn:     checkInVal,
        checkOut:    checkOutVal,
        totalCost:   d['費用'] || d['totalCost']   || '',
        currency:    d['幣別'] || d['currency']     || defaultCurrency,
        costPerPerson: d['每人費用'] || d['costPerPerson'] || '',
        confirmCode: d['確認碼'] || d['confirmCode'] || '',
        pin:         d['PIN']   || d['pin']          || '',
        notes:       d['備註']  || d['notes']         || '',
        mapUrl:      d['地圖']  || d['mapUrl']         || '',
      });

    // ── [EVENTS] / [EVENT] — CSV rows ────────────────────────────────────────
    } else if (type === 'EVENTS' || type === 'EVENT') {
      // Also accept key-value EVENT section (legacy Schedule format)
      if (csvLines.length === 0 && d['date']) {
        // Legacy key-value event
        const date = d['date'] || d['日期'] || '';
        if (date && !DATE_RE.test(date))
          result.errors.push(`[EVENT] 日期格式錯誤（需 YYYY-MM-DD），目前為「${date}」`);
        result.events.push({
          date,
          startTime:  d['time'] || d['startTime'] || d['時間'] || '',
          endTime:    d['endTime'] || '',
          title:      d['title'] || d['名稱'] || '',
          category:   CATEGORY_ALIASES[d['category'] || d['類別'] || ''] || 'misc',
          location:   d['location'] || d['地點'] || '',
          notes:      d['notes'] || d['備註'] || '',
          mapUrl:     d['mapUrl'] || '',
          cost:       d['cost'] ? Number(d['cost']) : 0,
          currency:   d['currency'] || defaultCurrency,
          travelTime: d['travelTime'] || '',
        });
      } else {
        // CSV rows
        csvLines.forEach((line, i) => {
          const parts = line.split(',').map(s => s.trim());
          if (parts.length < 3) {
            result.errors.push(`[EVENTS] 第 ${i + 1} 行格式不正確（至少需要：日期, 時間, 名稱）`);
            return;
          }
          const [date, time, title = '', catRaw = '', location = ''] = parts;
          if (!DATE_RE.test(date)) {
            result.errors.push(`[EVENTS] 第 ${i + 1} 行日期格式錯誤（需 YYYY-MM-DD），目前為「${date}」`);
            return;
          }
          result.events.push({
            date, startTime: time.padStart(5, '0'), endTime: '',
            title: title || '未命名行程',
            category: CATEGORY_ALIASES[catRaw] || 'misc',
            location, notes: '', mapUrl: '', cost: 0,
            currency: defaultCurrency, travelTime: '',
          });
        });
      }

    // ── Legacy sections (backward compat with Schedule's old format) ──────────
    } else if (type === 'FLIGHT') {
      flightIdx++;
      const date = d.date || '';
      if (date && !DATE_RE.test(date))
        result.errors.push(`[FLIGHT] 第 ${flightIdx} 筆：日期格式錯誤，目前為「${date}」`);
      result.flights.push({
        id: `f${flightIdx}`,
        direction:   d.direction || '去程',
        airline:     d.airline   || '',
        flightNo:    d.flightNo  || '',
        date,
        dep: { airport: d.depAirport || '', name: d.depName || '', time: d.depTime || '' },
        arr: { airport: d.arrAirport || '', name: d.arrName || '', time: d.arrTime || '' },
        notes:        d.notes        || '',
        costPerPerson: d.costPerPerson || '',
      });
    } else if (type === 'CAR') {
      result.car = {
        company:        d.company        || '',
        carType:        d.carType        || '',
        pickupLocation: d.pickupLocation || '',
        pickupTime:     d.pickupTime     || '',
        returnLocation: d.returnLocation || '',
        returnTime:     d.returnTime     || '',
        totalCost:      d.totalCost      || '',
        currency:       d.currency       || defaultCurrency,
        confirmCode:    d.confirmCode    || '',
        notes:          d.notes          || '',
      };
    } else if (type === 'BOOKING') {
      const date = d.date || '';
      if (date && !DATE_RE.test(date))
        result.errors.push(`[BOOKING] 日期格式錯誤，目前為「${date}」`);
      result.bookings.push({
        title:       d.title       || '',
        type:        d.type        || 'activity',
        date,
        cost:        d.cost        || '',
        currency:    d.currency    || defaultCurrency,
        confirmCode: d.confirmCode || '',
        notes:       d.notes       || '',
      });
    }
  }

  return result;
}

// ── Templates ─────────────────────────────────────────────────────────────────

export const UNIVERSAL_TEMPLATE = `[TRANSPORT]
類型: 機票
名稱:
日期: YYYY-MM-DD
出發: TPE 06:50
到達: OKA 09:20
費用:

[HOTEL]
名稱:
入住: YYYY-MM-DD 14:00
退房: YYYY-MM-DD 11:00
費用:
地址:

[EVENTS]
# 日期, 時間, 名稱, 類別, 地點
YYYY-MM-DD, 09:00, 景點名稱, 景點, 地點
YYYY-MM-DD, 12:00, 午餐, 餐廳, 餐廳名稱`;

export const UNIVERSAL_SAMPLE = `[TRANSPORT]
類型: 機票
名稱: 台灣虎航 IT230
日期: 2026-04-23
出發: TPE 06:50
到達: OKA 09:20
費用: 3500

[TRANSPORT]
類型: 機票
名稱: 台灣虎航 IT231
日期: 2026-04-26
出發: OKA 10:30
到達: TPE 12:00
費用: 3500

[HOTEL]
名稱: 沖繩北谷溫泉度假村
入住: 2026-04-23 14:00
退房: 2026-04-25 11:00
費用: 8000
地址: 沖繩縣中頭郡北谷町

[EVENTS]
# 日期, 時間, 名稱, 類別, 地點
2026-04-23, 09:00, 早餐, 餐廳, 飯店附近
2026-04-23, 10:30, 首里城, 景點, 首里城公園
2026-04-23, 13:00, 午餐, 餐廳, 牧志市場`;
