import { useState, useRef, useEffect } from 'react';
import { FONT, inputStyle } from '../App';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol?: string;
}

// All ISO 4217 currencies + common travel currencies
export const ALL_CURRENCIES: CurrencyOption[] = [
  { code: 'TWD', name: '新台幣', symbol: 'NT$' },
  { code: 'JPY', name: '日圓', symbol: '¥' },
  { code: 'KRW', name: '韓圜', symbol: '₩' },
  { code: 'HKD', name: '港幣', symbol: 'HK$' },
  { code: 'MOP', name: '澳門幣', symbol: 'MOP$' },
  { code: 'CNY', name: '人民幣', symbol: '¥' },
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'EUR', name: '歐元', symbol: '€' },
  { code: 'GBP', name: '英鎊', symbol: '£' },
  { code: 'AUD', name: '澳幣', symbol: 'A$' },
  { code: 'NZD', name: '紐西蘭幣', symbol: 'NZ$' },
  { code: 'CAD', name: '加拿大幣', symbol: 'CA$' },
  { code: 'CHF', name: '瑞士法郎', symbol: 'Fr' },
  { code: 'SGD', name: '新加坡幣', symbol: 'S$' },
  { code: 'THB', name: '泰銖', symbol: '฿' },
  { code: 'MYR', name: '馬來幣', symbol: 'RM' },
  { code: 'VND', name: '越南盾', symbol: '₫' },
  { code: 'IDR', name: '印尼盾', symbol: 'Rp' },
  { code: 'PHP', name: '菲律賓比索', symbol: '₱' },
  { code: 'MMK', name: '緬甸元', symbol: 'K' },
  { code: 'KHR', name: '柬埔寨瑞爾', symbol: '៛' },
  { code: 'LAK', name: '寮國基普', symbol: '₭' },
  { code: 'BND', name: '汶萊幣', symbol: 'B$' },
  { code: 'INR', name: '印度盧比', symbol: '₹' },
  { code: 'PKR', name: '巴基斯坦盧比', symbol: '₨' },
  { code: 'BDT', name: '孟加拉塔卡', symbol: '৳' },
  { code: 'LKR', name: '斯里蘭卡盧比', symbol: '₨' },
  { code: 'NPR', name: '尼泊爾盧比', symbol: '₨' },
  { code: 'MVR', name: '馬爾地夫盧非亞', symbol: 'Rf' },
  { code: 'BTN', name: '不丹努扎姆', symbol: 'Nu' },
  { code: 'AED', name: '阿聯酋迪拉姆', symbol: 'د.إ' },
  { code: 'SAR', name: '沙烏地里亞爾', symbol: '﷼' },
  { code: 'QAR', name: '卡達里亞爾', symbol: '﷼' },
  { code: 'KWD', name: '科威特第納爾', symbol: 'KD' },
  { code: 'BHD', name: '巴林第納爾', symbol: 'BD' },
  { code: 'OMR', name: '阿曼里亞爾', symbol: '﷼' },
  { code: 'JOD', name: '約旦第納爾', symbol: 'JD' },
  { code: 'ILS', name: '以色列新謝克爾', symbol: '₪' },
  { code: 'TRY', name: '土耳其里拉', symbol: '₺' },
  { code: 'EGP', name: '埃及鎊', symbol: '£' },
  { code: 'MAD', name: '摩洛哥迪拉姆', symbol: 'MAD' },
  { code: 'TND', name: '突尼西亞第納爾', symbol: 'TD' },
  { code: 'ZAR', name: '南非蘭特', symbol: 'R' },
  { code: 'NGN', name: '奈及利亞奈拉', symbol: '₦' },
  { code: 'KES', name: '肯亞先令', symbol: 'KSh' },
  { code: 'ETB', name: '衣索比亞比爾', symbol: 'Br' },
  { code: 'GHS', name: '迦納塞地', symbol: '₵' },
  { code: 'UGX', name: '烏干達先令', symbol: 'USh' },
  { code: 'TZS', name: '坦尚尼亞先令', symbol: 'TSh' },
  { code: 'MXN', name: '墨西哥比索', symbol: '$' },
  { code: 'BRL', name: '巴西雷亞爾', symbol: 'R$' },
  { code: 'ARS', name: '阿根廷比索', symbol: '$' },
  { code: 'CLP', name: '智利比索', symbol: '$' },
  { code: 'COP', name: '哥倫比亞比索', symbol: '$' },
  { code: 'PEN', name: '秘魯索爾', symbol: 'S/' },
  { code: 'BOB', name: '玻利維亞玻利維亞諾', symbol: 'Bs.' },
  { code: 'UYU', name: '烏拉圭比索', symbol: '$U' },
  { code: 'PYG', name: '巴拉圭瓜拉尼', symbol: '₲' },
  { code: 'VES', name: '委內瑞拉玻利瓦', symbol: 'Bs.S' },
  { code: 'CRC', name: '哥斯大黎加科朗', symbol: '₡' },
  { code: 'GTQ', name: '瓜地馬拉格查爾', symbol: 'Q' },
  { code: 'HNL', name: '宏都拉斯倫皮拉', symbol: 'L' },
  { code: 'NIO', name: '尼加拉瓜科多巴', symbol: 'C$' },
  { code: 'DOP', name: '多明尼加比索', symbol: 'RD$' },
  { code: 'CUP', name: '古巴比索', symbol: '$' },
  { code: 'JMD', name: '牙買加幣', symbol: 'J$' },
  { code: 'TTD', name: '千里達托貝哥幣', symbol: 'TT$' },
  { code: 'BBD', name: '巴貝多幣', symbol: 'Bds$' },
  { code: 'NOK', name: '挪威克朗', symbol: 'kr' },
  { code: 'SEK', name: '瑞典克朗', symbol: 'kr' },
  { code: 'DKK', name: '丹麥克朗', symbol: 'kr' },
  { code: 'ISK', name: '冰島克朗', symbol: 'kr' },
  { code: 'CZK', name: '捷克克朗', symbol: 'Kč' },
  { code: 'HUF', name: '匈牙利福林', symbol: 'Ft' },
  { code: 'PLN', name: '波蘭茲羅提', symbol: 'zł' },
  { code: 'RON', name: '羅馬尼亞列伊', symbol: 'lei' },
  { code: 'HRK', name: '克羅埃西亞庫納', symbol: 'kn' },
  { code: 'BGN', name: '保加利亞列弗', symbol: 'лв' },
  { code: 'RSD', name: '塞爾維亞第納爾', symbol: 'din' },
  { code: 'UAH', name: '烏克蘭格里夫納', symbol: '₴' },
  { code: 'RUB', name: '俄羅斯盧布', symbol: '₽' },
  { code: 'GEL', name: '喬治亞拉里', symbol: '₾' },
  { code: 'AMD', name: '亞美尼亞德拉姆', symbol: '֏' },
  { code: 'AZN', name: '亞塞拜然馬納特', symbol: '₼' },
  { code: 'KZT', name: '哈薩克堅戈', symbol: '₸' },
  { code: 'UZS', name: '烏茲別克蘇姆', symbol: 'сум' },
  { code: 'MNT', name: '蒙古圖格里克', symbol: '₮' },
  { code: 'KGS', name: '吉爾吉斯索姆', symbol: 'лв' },
  { code: 'TJS', name: '塔吉克索莫尼', symbol: 'SM' },
  { code: 'TMT', name: '土庫曼馬納特', symbol: 'T' },
  { code: 'IRR', name: '伊朗里亞爾', symbol: '﷼' },
  { code: 'IQD', name: '伊拉克第納爾', symbol: 'ع.د' },
  { code: 'SYP', name: '敘利亞鎊', symbol: '£' },
  { code: 'LBP', name: '黎巴嫩鎊', symbol: '£' },
  { code: 'AFN', name: '阿富汗阿富汗尼', symbol: '؋' },
  { code: 'MKD', name: '北馬其頓第納爾', symbol: 'ден' },
  { code: 'ALL', name: '阿爾巴尼亞列克', symbol: 'L' },
  { code: 'BAM', name: '波士尼亞馬可', symbol: 'KM' },
  { code: 'MDL', name: '摩爾多瓦列伊', symbol: 'L' },
  { code: 'BYN', name: '白俄羅斯盧布', symbol: 'Br' },
  { code: 'LTL', name: '立陶宛立特', symbol: 'Lt' },
  { code: 'LVL', name: '拉脫維亞拉特', symbol: 'Ls' },
  { code: 'EEK', name: '愛沙尼亞克朗', symbol: 'kr' },
  { code: 'MZN', name: '莫三比克梅蒂卡爾', symbol: 'MT' },
  { code: 'ZMW', name: '尚比亞夸查', symbol: 'ZK' },
  { code: 'BWP', name: '波札那普拉', symbol: 'P' },
  { code: 'MWK', name: '馬拉威夸查', symbol: 'MK' },
  { code: 'ZWL', name: '辛巴威幣', symbol: '$' },
  { code: 'AOA', name: '安哥拉寬扎', symbol: 'Kz' },
  { code: 'XAF', name: '中非法郎', symbol: 'Fr' },
  { code: 'XOF', name: '西非法郎', symbol: 'Fr' },
  { code: 'DZD', name: '阿爾及利亞第納爾', symbol: 'دج' },
  { code: 'LYD', name: '利比亞第納爾', symbol: 'LD' },
  { code: 'SDG', name: '蘇丹鎊', symbol: 'ج.س.' },
  { code: 'SOS', name: '索馬利亞先令', symbol: 'Sh' },
  { code: 'RWF', name: '盧安達法郎', symbol: 'Fr' },
  { code: 'BIF', name: '蒲隆地法郎', symbol: 'Fr' },
  { code: 'CDF', name: '剛果法郎', symbol: 'Fr' },
  { code: 'MGA', name: '馬達加斯加阿里亞里', symbol: 'Ar' },
  { code: 'SCR', name: '塞席爾盧比', symbol: '₨' },
  { code: 'MUR', name: '模里西斯盧比', symbol: '₨' },
  { code: 'MRU', name: '茅利塔尼亞烏吉亞', symbol: 'UM' },
  { code: 'GMD', name: '甘比亞達拉西', symbol: 'D' },
  { code: 'GNF', name: '幾內亞法郎', symbol: 'Fr' },
  { code: 'SLL', name: '獅子山利昂', symbol: 'Le' },
  { code: 'LRD', name: '賴比瑞亞幣', symbol: '$' },
  { code: 'CVE', name: '維德角埃斯庫多', symbol: '$' },
  { code: 'STN', name: '聖多美普林西比多布拉', symbol: 'Db' },
  { code: 'KMF', name: '葛摩法郎', symbol: 'Fr' },
  { code: 'XPF', name: '太平洋法郎', symbol: 'Fr' },
  { code: 'PGK', name: '巴布亞紐幾內亞基那', symbol: 'K' },
  { code: 'SBD', name: '索羅門群島幣', symbol: '$' },
  { code: 'VUV', name: '萬那杜瓦圖', symbol: 'Vt' },
  { code: 'WST', name: '薩摩亞塔拉', symbol: 'T' },
  { code: 'TOP', name: '東加潘加', symbol: 'T$' },
  { code: 'FJD', name: '斐濟幣', symbol: '$' },
  { code: 'KPW', name: '北韓圜', symbol: '₩' },
  { code: 'TWD', name: '新台幣', symbol: 'NT$' },
];

// Deduplicate by code
const CURRENCIES: CurrencyOption[] = Array.from(
  new Map(ALL_CURRENCIES.map(c => [c.code, c])).values()
);

interface Props {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function CurrencySearch({ value, onChange, placeholder = '搜尋貨幣…', style }: Props) {
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = CURRENCIES.find(c => c.code === value);
  const q = query.trim().toUpperCase();
  const filtered = q
    ? CURRENCIES.filter(c =>
        c.code.includes(q) ||
        c.name.includes(query.trim()) ||
        (c.symbol && c.symbol.includes(query.trim()))
      ).slice(0, 10)
    : CURRENCIES.slice(0, 12); // show common ones when no query

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      {open ? (
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setQuery(''); }
            if (e.key === 'Enter' && filtered.length > 0) {
              onChange(filtered[0].code);
              setOpen(false); setQuery('');
            }
          }}
          placeholder={placeholder}
          style={{ ...inputStyle }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setOpen(true); setQuery(''); }}
          style={{ ...inputStyle, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--tm-input-bg)' } as React.CSSProperties}
        >
          <span>
            {selected
              ? `${selected.code}　${selected.name}${selected.symbol ? `　${selected.symbol}` : ''}`
              : <span style={{ color: '#aaa' }}>{placeholder}</span>
            }
          </span>
          <span style={{ fontSize: 12, opacity: 0.5 }}>▾</span>
        </button>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--tm-sheet-bg)', borderRadius: 12, boxShadow: '0 6px 24px rgba(107,92,78,0.18)',
          border: '1.5px solid var(--tm-card-border)', maxHeight: 220, overflowY: 'auto',
          marginTop: 4, fontFamily: FONT,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 16px', fontSize: 13, color: '#aaa' }}>找不到符合的貨幣</div>
          ) : (
            filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onMouseDown={e => { e.preventDefault(); onChange(c.code); setOpen(false); setQuery(''); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '9px 16px', border: 'none', background: c.code === value ? 'var(--tm-cream)' : 'transparent',
                  cursor: 'pointer', fontFamily: FONT, textAlign: 'left',
                  borderBottom: '1px solid var(--tm-card-border)',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: c.code === value ? 700 : 400, color: 'var(--tm-bark)' }}>
                  <strong>{c.code}</strong>　{c.name}
                </span>
                {c.symbol && <span style={{ fontSize: 13, opacity: 0.55 }}>{c.symbol}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
