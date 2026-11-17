// Product illustrations, drawn by hand as flat SVG on a 200 x 200 tile.
// The 2020 listings and their photos lived in Firebase and are gone, so the
// demo ships its own pictures. They are plain strings (no React) so the same
// module can export files from Node.

const INK = '#23262e';
const RED = '#e8553d';
const GREEN = '#2f7d5b';
const GREEN_D = '#256549';
const GREEN_L = '#3a936c';
const YELLOW = '#f6c945';
const PURPLE = '#6c4cf1';
const WOOD = '#c98a4b';
const WOOD_D = '#6b4423';
const STEEL = '#c9ccd3';
const STEEL_L = '#e4e6ea';
const STEEL_D = '#8d919b';
const CREAM = '#f4f1e8';
const BLUE = '#2a6f97';

interface Art {
  bg: string;
  body: string;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const f = (n: number) => Math.round(n * 10) / 10;

function keys(): string {
  let out = '';
  const accents = new Set(['0-0', '2-8', '1-4']);
  for (const r of range(3))
    for (const c of range(9))
      out += `<rect x="${38 + c * 14}" y="${88 + r * 14}" width="11" height="10" rx="2.5" fill="${accents.has(`${r}-${c}`) ? RED : CREAM}"/>`;
  return out;
}

function typeKeys(): string {
  let out = '';
  for (const c of range(7)) out += `<circle cx="${67 + c * 11}" cy="121" r="3.6" fill="${CREAM}"/>`;
  for (const c of range(8)) out += `<circle cx="${61.5 + c * 11}" cy="132" r="3.6" fill="${CREAM}"/>`;
  return out;
}

function ball(): string {
  const cx = 100;
  const cy = 104;
  const pt = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [f(cx + r * Math.cos(a)), f(cy + r * Math.sin(a))] as const;
  };
  const penta = range(5).map((i) => pt(17, i * 72));
  let out = `<circle cx="${cx}" cy="${cy}" r="46" fill="#fff" stroke="${INK}" stroke-width="4"/>`;
  out += `<clipPath id="ballclip"><circle cx="${cx}" cy="${cy}" r="44"/></clipPath><g clip-path="url(#ballclip)">`;
  for (const i of range(5)) {
    const [x1, y1] = penta[i]!;
    const [x2, y2] = pt(34, i * 72);
    out += `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`;
    // the patch that sits on the rim past each seam
    const a = pt(34, i * 72);
    const b = pt(50, i * 72 - 20);
    const c = pt(50, i * 72 + 20);
    out += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}Z" fill="${INK}"/>`;
  }
  out += `</g><path d="M${penta.map((p) => p.join(' ')).join('L')}Z" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  return out;
}

const ARTS: Record<string, Art> = {
  bike: {
    bg: '#dff3e4',
    body: `
      <g fill="none" stroke="${INK}" stroke-width="5"><circle cx="56" cy="128" r="30"/><circle cx="144" cy="128" r="30"/></g>
      <g fill="none" stroke="${STEEL_D}" stroke-width="1.5"><path d="M56 98v60M26 128h60M35 107l42 42M77 107l-42 42M144 98v60M114 128h60M123 107l42 42M165 107l-42 42"/></g>
      <path d="M56 128L86 80H128L144 128M86 80L104 128H56M104 128L128 80" fill="none" stroke="${RED}" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M86 80L82 68M128 80L124 62" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M72 67H94" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
      <path d="M124 62L138 58Q146 58 144 68" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="104" cy="128" r="7" fill="${INK}"/><path d="M104 128L114 140" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="56" cy="128" r="4" fill="${INK}"/><circle cx="144" cy="128" r="4" fill="${INK}"/>`,
  },
  tent: {
    bg: '#e3ecfb',
    body: `
      <circle cx="150" cy="52" r="14" fill="${YELLOW}"/>
      <path d="M100 58L164 152H36Z" fill="#f2a23a"/>
      <path d="M100 58L164 152H118Z" fill="#d98524"/>
      <path d="M100 78L118 152H82Z" fill="${INK}"/>
      <path d="M100 78L100 152H82Z" fill="#3c4150"/>
      <path d="M100 58V50" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <path d="M36 152L22 160M164 152L178 160" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M24 152H176" stroke="${GREEN}" stroke-width="5" stroke-linecap="round"/>`,
  },
  skateboard: {
    bg: '#fde8d8',
    body: `
      <g transform="rotate(-14 100 108)">
        <rect x="50" y="106" width="22" height="8" rx="2" fill="${STEEL_D}"/><rect x="128" y="106" width="22" height="8" rx="2" fill="${STEEL_D}"/>
        <path d="M26 86Q32 102 48 102H152Q168 102 174 86" fill="none" stroke="${PURPLE}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M84 102H116" stroke="${YELLOW}" stroke-width="11"/>
        <circle cx="61" cy="122" r="10" fill="${CREAM}" stroke="${INK}" stroke-width="4"/><circle cx="139" cy="122" r="10" fill="${CREAM}" stroke="${INK}" stroke-width="4"/>
        <circle cx="61" cy="122" r="2.5" fill="${INK}"/><circle cx="139" cy="122" r="2.5" fill="${INK}"/>
      </g>`,
  },
  backpack: {
    bg: '#e6f4d9',
    body: `
      <path d="M84 62Q100 34 116 62" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <rect x="48" y="92" width="16" height="50" rx="8" fill="${GREEN_D}"/><rect x="136" y="92" width="16" height="50" rx="8" fill="${GREEN_D}"/>
      <rect x="58" y="56" width="84" height="106" rx="26" fill="${GREEN}"/>
      <path d="M58 92H142" stroke="${GREEN_D}" stroke-width="4"/>
      <rect x="72" y="108" width="56" height="42" rx="10" fill="${GREEN_L}"/>
      <path d="M80 120H120" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 6"/>
      <rect x="92" y="70" width="16" height="12" rx="3" fill="${YELLOW}"/>`,
  },
  camera: {
    bg: '#f3e6f7',
    body: `
      <rect x="82" y="58" width="36" height="20" rx="5" fill="${STEEL}"/>
      <rect x="130" y="64" width="16" height="10" rx="3" fill="${RED}"/>
      <rect x="42" y="72" width="116" height="76" rx="10" fill="${INK}"/>
      <path d="M42 82Q42 72 52 72H148Q158 72 158 82V92H42Z" fill="${STEEL}"/>
      <circle cx="100" cy="116" r="28" fill="${STEEL}"/><circle cx="100" cy="116" r="22" fill="#3a3f4b"/><circle cx="100" cy="116" r="14" fill="#14161c"/>
      <circle cx="100" cy="116" r="7" fill="#4b6cf0" opacity=".55"/><circle cx="94" cy="110" r="3.5" fill="#fff" opacity=".8"/>
      <rect x="52" y="78" width="14" height="8" rx="2" fill="${INK}"/>`,
  },
  keyboard: {
    bg: '#e2f0f5',
    body: `
      <path d="M148 80Q150 56 170 50" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
      <rect x="30" y="80" width="140" height="56" rx="9" fill="${INK}"/>
      ${keys()}`,
  },
  headphones: {
    bg: '#fdeec9',
    body: `
      <path d="M54 124V100a46 46 0 0 1 92 0V124" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
      <rect x="38" y="106" width="30" height="50" rx="14" fill="${RED}"/><rect x="132" y="106" width="30" height="50" rx="14" fill="${RED}"/>
      <rect x="58" y="112" width="12" height="38" rx="6" fill="${INK}"/><rect x="130" y="112" width="12" height="38" rx="6" fill="${INK}"/>`,
  },
  controller: {
    bg: '#e5e3fb',
    body: `
      <path d="M58 76H142Q170 76 174 104L180 136Q182 156 166 156Q156 156 148 144L140 130H60L52 144Q44 156 34 156Q18 156 20 136L26 104Q30 76 58 76Z" fill="${CREAM}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M64 96V118M53 107H75" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <circle cx="136" cy="96" r="5.5" fill="${YELLOW}"/><circle cx="147" cy="107" r="5.5" fill="${RED}"/><circle cx="125" cy="107" r="5.5" fill="#4b6cf0"/><circle cx="136" cy="118" r="5.5" fill="${GREEN_L}"/>
      <rect x="92" y="102" width="16" height="6" rx="3" fill="${STEEL_D}"/>`,
  },
  guitar: {
    bg: '#fbe9d4',
    body: `
      <g transform="rotate(28 100 100)">
        <rect x="93" y="18" width="14" height="78" fill="${WOOD_D}"/>
        <path d="M90 6H110L112 26H88Z" fill="${INK}"/>
        <circle cx="100" cy="104" r="27" fill="#d98b3a"/><circle cx="100" cy="142" r="36" fill="#d98b3a"/>
        <circle cx="100" cy="120" r="11" fill="${INK}"/>
        <rect x="86" y="150" width="28" height="7" rx="2" fill="${INK}"/>
        <path d="M96 12V152M100 12V152M104 12V152" stroke="${CREAM}" stroke-width="1" opacity=".8"/>
      </g>`,
  },
  turntable: {
    bg: '#e3f2ea',
    body: `
      <rect x="30" y="58" width="140" height="100" rx="10" fill="${WOOD}"/>
      <rect x="30" y="146" width="140" height="12" rx="6" fill="${WOOD_D}"/>
      <circle cx="90" cy="104" r="40" fill="${INK}"/>
      <g fill="none" stroke="#3d4250" stroke-width="2"><circle cx="90" cy="104" r="32"/><circle cx="90" cy="104" r="25"/><circle cx="90" cy="104" r="18"/></g>
      <circle cx="90" cy="104" r="11" fill="${RED}"/><circle cx="90" cy="104" r="2.5" fill="${CREAM}"/>
      <path d="M150 76L122 118" stroke="${STEEL_L}" stroke-width="5" stroke-linecap="round"/>
      <rect x="112" y="112" width="14" height="10" rx="2" transform="rotate(34 119 117)" fill="${INK}"/>
      <circle cx="150" cy="76" r="8" fill="${STEEL_L}" stroke="${INK}" stroke-width="3"/>
      <circle cx="152" cy="136" r="5" fill="${INK}"/><circle cx="136" cy="136" r="5" fill="${INK}"/>`,
  },
  speaker: {
    bg: '#f0e8dc',
    body: `
      <rect x="34" y="50" width="60" height="108" rx="7" fill="${WOOD_D}"/><rect x="106" y="50" width="60" height="108" rx="7" fill="${WOOD_D}"/>
      <g fill="${INK}"><circle cx="64" cy="122" r="21"/><circle cx="136" cy="122" r="21"/><circle cx="64" cy="76" r="10"/><circle cx="136" cy="76" r="10"/></g>
      <g fill="${STEEL_D}"><circle cx="64" cy="122" r="12"/><circle cx="136" cy="122" r="12"/></g>
      <g fill="${INK}"><circle cx="64" cy="122" r="5"/><circle cx="136" cy="122" r="5"/></g>
      <g fill="${STEEL}"><circle cx="64" cy="76" r="4"/><circle cx="136" cy="76" r="4"/></g>`,
  },
  books: {
    bg: '#e0edf9',
    body: `
      <rect x="46" y="134" width="108" height="22" rx="4" fill="${RED}"/><rect x="134" y="138" width="20" height="14" fill="${CREAM}"/>
      <rect x="56" y="112" width="92" height="22" rx="4" fill="${GREEN}"/><rect x="56" y="116" width="18" height="14" fill="${CREAM}"/>
      <rect x="44" y="90" width="104" height="22" rx="4" fill="${YELLOW}"/><rect x="130" y="94" width="18" height="14" fill="${CREAM}"/>
      <g transform="rotate(-9 100 78)"><rect x="60" y="68" width="88" height="20" rx="4" fill="${PURPLE}"/><rect x="132" y="72" width="16" height="12" fill="${CREAM}"/></g>
      <path d="M70 145H110M86 123H126M60 101H100" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" opacity=".35"/>`,
  },
  armchair: {
    bg: '#fbe3dc',
    body: `
      <path d="M62 140L54 164M138 140L146 164" stroke="${WOOD_D}" stroke-width="7" stroke-linecap="round"/>
      <rect x="56" y="46" width="88" height="78" rx="18" fill="${GREEN}"/>
      <path d="M78 66V96M100 62V96M122 66V96" stroke="${GREEN_D}" stroke-width="3" stroke-linecap="round"/>
      <rect x="50" y="104" width="100" height="34" rx="12" fill="${GREEN_L}"/>
      <rect x="36" y="86" width="26" height="58" rx="12" fill="${GREEN_D}"/><rect x="138" y="86" width="26" height="58" rx="12" fill="${GREEN_D}"/>`,
  },
  lamp: {
    bg: '#fdf3c4',
    body: `
      <path d="M96 88L132 110L158 162H66Z" fill="${YELLOW}" opacity=".45"/>
      <ellipse cx="72" cy="160" rx="30" ry="7" fill="${INK}"/>
      <path d="M72 158L60 108L104 74" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="60" cy="108" r="6" fill="${STEEL}" stroke="${INK}" stroke-width="3"/>
      <path d="M98 52L140 80L124 108L84 82Z" fill="${RED}" stroke="${RED}" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="112" cy="98" r="8" fill="#fff6c2"/>`,
  },
  plant: {
    bg: '#e6f4d9',
    body: `
      <path d="M100 124V70M100 118L74 86M100 118L128 86" fill="none" stroke="${GREEN_D}" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="100" cy="62" rx="20" ry="32" fill="${GREEN}"/>
      <ellipse cx="66" cy="80" rx="16" ry="30" transform="rotate(-42 66 80)" fill="${GREEN_L}"/>
      <ellipse cx="136" cy="80" rx="16" ry="30" transform="rotate(42 136 80)" fill="${GREEN_D}"/>
      <path d="M100 40V84M88 58L100 66M112 54L100 62" stroke="#e6f4d9" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M70 130H130L122 166H78Z" fill="#c9683d"/>
      <rect x="64" y="120" width="72" height="14" rx="5" fill="#b0532c"/>`,
  },
  mirror: {
    bg: '#efe6f8',
    body: `
      <path d="M68 62L100 26L132 62" fill="none" stroke="${WOOD_D}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="100" cy="26" r="5" fill="${INK}"/>
      <circle cx="100" cy="108" r="54" fill="${WOOD}"/><circle cx="100" cy="108" r="45" fill="#dcebf4"/>
      <path d="M74 112L104 82M92 126L116 102" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".85"/>`,
  },
  moka: {
    bg: '#fde8d8',
    body: `
      <path d="M88 40Q82 32 88 24M106 40Q100 32 106 24" fill="none" stroke="${STEEL_D}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M128 76H150V114L136 108" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M66 156H134L124 112H76Z" fill="${STEEL}"/>
      <path d="M100 156H134L124 112H100Z" fill="${STEEL_D}" opacity=".45"/>
      <path d="M76 108H124L132 66H68Z" fill="${STEEL_L}"/>
      <path d="M100 108H124L132 66H100Z" fill="${STEEL}" opacity=".7"/>
      <path d="M68 66L56 62L70 80Z" fill="${STEEL_L}"/>
      <rect x="74" y="104" width="52" height="10" rx="2" fill="${STEEL_D}"/>
      <path d="M68 66H132L114 52H86Z" fill="${STEEL_D}"/>
      <circle cx="100" cy="48" r="6" fill="${INK}"/>`,
  },
  typewriter: {
    bg: '#dff3ee',
    body: `
      <rect x="72" y="40" width="56" height="50" rx="2" fill="#fff"/>
      <path d="M82 54H118M82 64H118M82 74H104" stroke="${STEEL_D}" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="46" y="80" width="108" height="12" rx="6" fill="${INK}"/>
      <rect x="54" y="88" width="92" height="24" rx="6" fill="#235d80"/>
      <path d="M52 106H148L164 150Q166 158 158 158H42Q34 158 36 150Z" fill="${BLUE}"/>
      ${typeKeys()}
      <rect x="76" y="143" width="48" height="6" rx="3" fill="${CREAM}"/>
      <circle cx="42" cy="86" r="6" fill="${STEEL}" stroke="${INK}" stroke-width="3"/><circle cx="158" cy="86" r="6" fill="${STEEL}" stroke="${INK}" stroke-width="3"/>`,
  },
  trainers: {
    bg: '#e5e3fb',
    body: `
      <path d="M34 138Q32 104 54 96L80 90Q90 112 116 122Q150 128 164 138Q170 144 166 150H38Q34 146 34 138Z" fill="${RED}"/>
      <path d="M54 96L80 90Q84 100 92 108L62 116Q54 108 54 96Z" fill="${INK}"/>
      <path d="M34 138Q40 128 58 134L70 148H36Q34 144 34 138Z" fill="#c8432d"/>
      <path d="M92 108L104 100M102 116L114 108M112 122L124 114" stroke="${CREAM}" stroke-width="4" stroke-linecap="round"/>
      <rect x="32" y="146" width="138" height="12" rx="6" fill="${CREAM}" stroke="${INK}" stroke-width="3.5"/>
      <path d="M124 136Q146 134 158 140" fill="none" stroke="${CREAM}" stroke-width="4" stroke-linecap="round"/>`,
  },
  watch: {
    bg: '#fdeec9',
    body: `
      <rect x="84" y="22" width="32" height="156" rx="9" fill="${WOOD_D}"/>
      <path d="M100 34V46M100 156V168" stroke="${CREAM}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 7"/>
      <rect x="132" y="94" width="10" height="12" rx="3" fill="${STEEL_D}"/>
      <circle cx="100" cy="100" r="36" fill="${STEEL}" stroke="${INK}" stroke-width="4.5"/>
      <circle cx="100" cy="100" r="27" fill="#fff"/>
      <path d="M100 78V82M100 118V122M78 100H82M118 100H122" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      <path d="M100 100V84" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><path d="M100 100L113 106" stroke="${RED}" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="100" cy="100" r="3.5" fill="${INK}"/>`,
  },
  surfboard: {
    bg: '#dcf1f7',
    body: `
      <path d="M0 150Q25 138 50 150T100 150T150 150T200 150V200H0Z" fill="#a9dbe9"/>
      <g transform="rotate(24 100 100)">
        <path d="M100 14C126 52 128 150 100 186C72 150 74 52 100 14Z" fill="#fff8e7" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M100 22V180" stroke="${RED}" stroke-width="4"/>
        <path d="M76 120Q100 110 124 120" fill="none" stroke="${BLUE}" stroke-width="9"/>
      </g>
      <path d="M0 168Q25 156 50 168T100 168T150 168T200 168V200H0Z" fill="#7cc3d6" opacity=".7"/>`,
  },
  kettle: {
    bg: '#fbe3dc',
    body: `
      <path d="M130 84Q164 84 160 118Q158 140 136 142" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
      <path d="M72 96L44 78L50 70L78 84Z" fill="${CREAM}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M62 152Q58 92 78 74H122Q142 92 138 152Z" fill="${CREAM}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
      <rect x="92" y="96" width="8" height="40" rx="4" fill="#9fd0e8"/><rect x="92" y="114" width="8" height="22" rx="4" fill="#4b9fd0"/>
      <rect x="78" y="64" width="44" height="10" rx="5" fill="${INK}"/><circle cx="100" cy="60" r="6" fill="${INK}"/>
      <rect x="54" y="150" width="92" height="10" rx="5" fill="${INK}"/>`,
  },
  football: { bg: '#e6f4d9', body: ball() },
  helmet: {
    bg: '#e2f0f5',
    body: `
      <path d="M72 134Q100 176 128 134" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M42 128A58 58 0 0 1 158 128Z" fill="${YELLOW}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
      <g fill="${INK}"><rect x="94" y="80" width="12" height="38" rx="6"/><rect x="68" y="86" width="12" height="32" rx="6" transform="rotate(-18 74 102)"/><rect x="120" y="86" width="12" height="32" rx="6" transform="rotate(18 126 102)"/></g>
      <rect x="36" y="124" width="132" height="12" rx="6" fill="${INK}"/>`,
  },
  sunglasses: {
    bg: '#fdf3c4',
    body: `
      <path d="M44 92L26 80M156 92L174 80" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <path d="M90 98Q100 88 110 98" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <rect x="40" y="84" width="52" height="40" rx="17" fill="${INK}"/><rect x="108" y="84" width="52" height="40" rx="17" fill="${INK}"/>
      <path d="M54 110L70 94M122 110L138 94" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".35"/>`,
  },
  // Spare pictures offered on the sell form, for visitors with no photo to hand.
  vase: {
    bg: '#fbe9d4',
    body: `
      <path d="M100 76V40M100 62L82 44M100 54L118 36" fill="none" stroke="${GREEN_D}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="100" cy="36" r="9" fill="${RED}"/><circle cx="80" cy="42" r="8" fill="${YELLOW}"/><circle cx="120" cy="34" r="8" fill="${PURPLE}"/>
      <path d="M86 74H114V88Q142 106 136 136Q130 160 100 160Q70 160 64 136Q58 106 86 88Z" fill="${BLUE}"/>
      <path d="M68 120Q100 132 132 120" fill="none" stroke="${CREAM}" stroke-width="5"/>
      <rect x="82" y="68" width="36" height="10" rx="5" fill="#235d80"/>`,
  },
  boardgame: {
    bg: '#e5e3fb',
    body: `
      <path d="M34 78L100 54L166 78L100 104Z" fill="${RED}"/>
      <path d="M34 78V128L100 156V104Z" fill="#c8432d"/><path d="M166 78V128L100 156V104Z" fill="#a83522"/>
      <path d="M72 76L100 66L128 76L100 87Z" fill="${CREAM}"/>
      <g transform="translate(136 128)"><rect x="0" y="0" width="34" height="34" rx="7" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="10" cy="10" r="3.2" fill="${INK}"/><circle cx="24" cy="24" r="3.2" fill="${INK}"/><circle cx="17" cy="17" r="3.2" fill="${INK}"/></g>
      <circle cx="46" cy="150" r="9" fill="${YELLOW}" stroke="${INK}" stroke-width="4"/>`,
  },
  toaster: {
    bg: '#dff3e4',
    body: `
      <rect x="66" y="42" width="30" height="40" rx="8" fill="#e2b06a"/><rect x="104" y="48" width="30" height="34" rx="8" fill="#e2b06a"/>
      <rect x="72" y="48" width="18" height="30" rx="5" fill="#f3d6a4"/><rect x="110" y="54" width="18" height="24" rx="5" fill="#f3d6a4"/>
      <rect x="40" y="74" width="120" height="78" rx="18" fill="${STEEL_L}" stroke="${INK}" stroke-width="4.5"/>
      <rect x="58" y="74" width="84" height="8" fill="${INK}"/>
      <rect x="150" y="96" width="16" height="10" rx="4" fill="${INK}"/>
      <circle cx="64" cy="132" r="7" fill="${RED}"/>
      <path d="M52 152V160M148 152V160" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`,
  },
};

export const ART_KEYS = Object.keys(ARTS);
export const SAMPLE_ART = ['vase', 'boardgame', 'toaster'] as const;

/** A complete, standalone SVG document for one illustration. */
export function artSvg(key: string): string | null {
  const art = ARTS[key];
  if (!art) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${art.bg}"/><ellipse cx="100" cy="170" rx="62" ry="7" fill="#000" opacity=".07"/>${art.body.replace(/\s*\n\s*/g, '')}</svg>`;
}

const cache = new Map<string, string | null>();

/** The illustration as a data URL, for <img src>. */
export function artUrl(key: string): string | null {
  if (!cache.has(key)) {
    const svg = artSvg(key);
    cache.set(key, svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : null);
  }
  return cache.get(key)!;
}

/** Shown for a listing whose picture cannot be resolved. */
export function placeholderUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#ebe8e0"/><g fill="none" stroke="#b9b5aa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="58" y="66" width="84" height="68" rx="10"/><path d="M58 120L84 96L104 114L120 102L142 122"/></g><circle cx="118" cy="86" r="7" fill="#b9b5aa"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const AVATAR_COLORS = ['#6c4cf1', '#2f7d5b', '#e8553d', '#2a6f97', '#b0532c', '#8a3fa0', '#23262e'];

/** Initials on a colored disc, for people without a photo. */
export function avatarUrl(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = AVATAR_COLORS[h % AVATAR_COLORS.length];
  const safe = initials.replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${bg}"/><text x="40" y="41" fill="#fff" font-family="Nunito,Arial,sans-serif" font-size="30" font-weight="800" text-anchor="middle" dominant-baseline="central">${safe}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
