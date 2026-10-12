/** English names for ISO country codes. The eight realm names match shoal/profile. */
const COUNTRY_NAMES: Record<string, string> = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AG: "Antigua and Barbuda", AI: "Anguilla",
  AL: "Albania", AM: "Armenia", AO: "Angola", AQ: "Antarctica", AR: "Argentina", AS: "American Samoa",
  AT: "Austria", AU: "Australia", AW: "Aruba", AX: "Aland Islands", AZ: "Azerbaijan",
  BA: "Bosnia and Herzegovina", BB: "Barbados", BD: "Bangladesh", BE: "Belgium", BF: "Burkina Faso",
  BG: "Bulgaria", BH: "Bahrain", BI: "Burundi", BJ: "Benin", BL: "Saint Barthelemy", BM: "Bermuda",
  BN: "Brunei", BO: "Bolivia", BQ: "Caribbean Netherlands", BR: "Brazil", BS: "Bahamas", BT: "Bhutan",
  BV: "Bouvet Island", BW: "Botswana", BY: "Belarus", BZ: "Belize",
  CA: "Canada", CC: "Cocos Islands", CD: "Congo", CF: "Central African Republic", CG: "Republic of the Congo",
  CH: "Switzerland", CI: "Ivory Coast", CK: "Cook Islands", CL: "Chile", CM: "Cameroon", CN: "China",
  CO: "Colombia", CR: "Costa Rica", CU: "Cuba", CV: "Cabo Verde", CW: "Curacao", CX: "Christmas Island",
  CY: "Cyprus", CZ: "Czechia",
  DE: "Germany", DJ: "Djibouti", DK: "Denmark", DM: "Dominica", DO: "Dominican Republic", DZ: "Algeria",
  EC: "Ecuador", EE: "Estonia", EG: "Egypt", EH: "Western Sahara", ER: "Eritrea", ES: "Spain", ET: "Ethiopia",
  FI: "Finland", FJ: "Fiji", FK: "Falkland Islands", FM: "Micronesia", FO: "Faroe Islands", FR: "France",
  GA: "Gabon", GB: "United Kingdom", GD: "Grenada", GE: "Georgia", GF: "French Guiana", GG: "Guernsey",
  GH: "Ghana", GI: "Gibraltar", GL: "Greenland", GM: "Gambia", GN: "Guinea", GP: "Guadeloupe", GQ: "Equatorial Guinea",
  GR: "Greece", GS: "South Georgia", GT: "Guatemala", GU: "Guam", GW: "Guinea-Bissau", GY: "Guyana",
  HK: "Hong Kong", HM: "Heard Island", HN: "Honduras", HR: "Croatia", HT: "Haiti", HU: "Hungary",
  ID: "Indonesia", IE: "Ireland", IL: "Israel", IM: "Isle of Man", IN: "India", IO: "British Indian Ocean Territory",
  IQ: "Iraq", IR: "Iran", IS: "Iceland", IT: "Italy",
  JE: "Jersey", JM: "Jamaica", JO: "Jordan", JP: "Japan",
  KE: "Kenya", KG: "Kyrgyzstan", KH: "Cambodia", KI: "Kiribati", KM: "Comoros", KN: "Saint Kitts and Nevis",
  KP: "North Korea", KR: "Korea", KW: "Kuwait", KY: "Cayman Islands", KZ: "Kazakhstan",
  LA: "Laos", LB: "Lebanon", LC: "Saint Lucia", LI: "Liechtenstein", LK: "Sri Lanka", LR: "Liberia",
  LS: "Lesotho", LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", LY: "Libya",
  MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro", MF: "Saint Martin", MG: "Madagascar",
  MH: "Marshall Islands", MK: "North Macedonia", ML: "Mali", MM: "Myanmar", MN: "Mongolia", MO: "Macao",
  MP: "Northern Mariana Islands", MQ: "Martinique", MR: "Mauritania", MS: "Montserrat", MT: "Malta",
  MU: "Mauritius", MV: "Maldives", MW: "Malawi", MX: "Mexico", MY: "Malaysia", MZ: "Mozambique",
  NA: "Namibia", NC: "New Caledonia", NE: "Niger", NF: "Norfolk Island", NG: "Nigeria", NI: "Nicaragua",
  NL: "Netherlands", NO: "Norway", NP: "Nepal", NR: "Nauru", NU: "Niue", NZ: "New Zealand",
  OM: "Oman",
  PA: "Panama", PE: "Peru", PF: "French Polynesia", PG: "Papua New Guinea", PH: "Philippines", PK: "Pakistan",
  PL: "Poland", PM: "Saint Pierre and Miquelon", PN: "Pitcairn", PR: "Puerto Rico", PS: "Palestine", PT: "Portugal",
  PW: "Palau", PY: "Paraguay",
  QA: "Qatar",
  RE: "Reunion", RO: "Romania", RS: "Serbia", RU: "Russia", RW: "Rwanda",
  SA: "Saudi Arabia", SB: "Solomon Islands", SC: "Seychelles", SD: "Sudan", SE: "Sweden", SG: "Singapore",
  SH: "Saint Helena", SI: "Slovenia", SJ: "Svalbard", SK: "Slovakia", SL: "Sierra Leone", SM: "San Marino",
  SN: "Senegal", SO: "Somalia", SR: "Suriname", SS: "South Sudan", ST: "Sao Tome and Principe", SV: "El Salvador",
  SX: "Sint Maarten", SY: "Syria", SZ: "Eswatini",
  TC: "Turks and Caicos", TD: "Chad", TF: "French Southern Territories", TG: "Togo", TH: "Thailand", TJ: "Tajikistan",
  TK: "Tokelau", TL: "Timor-Leste", TM: "Turkmenistan", TN: "Tunisia", TO: "Tonga", TR: "Turkey", TT: "Trinidad and Tobago",
  TV: "Tuvalu", TW: "Taiwan", TZ: "Tanzania",
  UA: "Ukraine", UG: "Uganda", UM: "United States Minor Outlying Islands", US: "United States", UY: "Uruguay", UZ: "Uzbekistan",
  VA: "Vatican City", VC: "Saint Vincent and the Grenadines", VE: "Venezuela", VG: "British Virgin Islands",
  VI: "U.S. Virgin Islands", VN: "Vietnam", VU: "Vanuatu",
  WF: "Wallis and Futuna", WS: "Samoa",
  YE: "Yemen", YT: "Mayotte",
  ZA: "South Africa", ZM: "Zambia", ZW: "Zimbabwe",
};

/** Names the live shoal/profile realm already accepts, besides the practice label Sea. */
const CHAIN_COUNTRIES = new Set(["Vietnam", "Korea", "Japan", "Brazil", "France", "Nigeria", "Canada", "Australia"]);

const CODE_BY_NAME = new Map(Object.entries(COUNTRY_NAMES).map(([code, name]) => [name, code]));

export type IpCountry = { code: string; name: string };

export function countryFromCode(raw: string): IpCountry | null {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
  const name = COUNTRY_NAMES[code];
  if (!name) return null;
  return { code, name };
}

export function countryFromPayload(value: unknown): IpCountry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { code?: unknown; country?: unknown };
  const raw = typeof row.code === "string" && row.code.trim()
    ? row.code
    : typeof row.country === "string" ? row.country : "";
  return countryFromCode(raw);
}

/** Practice cards accept Sea and any country this table can name. */
export function acceptCountry(name: string): boolean {
  return name === "Sea" || CODE_BY_NAME.has(name);
}

/** Live shoal/profile only stores these names. Other countries stay in the browser. */
export function chainCountryName(name: string): string | null {
  return CHAIN_COUNTRIES.has(name) ? name : null;
}

export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return [...code].map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65)).join("");
}

export function codeForCountry(country: string): string {
  return CODE_BY_NAME.get(country) ?? "";
}

export function flagForCountry(country: string): string {
  const code = codeForCountry(country);
  return code ? flagEmoji(code) : "";
}

/** PNG flag. The UI font draws the emoji as the letters VN, so the picture is the flag. */
export function flagImageSrc(code: string): string {
  const clean = code.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(clean) || !COUNTRY_NAMES[clean.toUpperCase()]) return "";
  return `https://flagcdn.com/w40/${clean}.png`;
}

/** Visible sailor name: flag, then the username. */
export function sailorLabel(username: string, country: string): string {
  const flag = flagForCountry(country);
  return flag ? `${flag} ${username}` : username;
}

async function readCountry(fetchImpl: typeof fetch, url: string): Promise<IpCountry | null> {
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    return countryFromPayload(await response.json() as unknown);
  } catch {
    return null;
  }
}

/** Prefer the same-origin Vercel header. Fall back to a public lookup when that route is absent. */
export async function loadIpCountry(fetchImpl: typeof fetch = fetch): Promise<IpCountry | null> {
  const local = await readCountry(fetchImpl, "/api/country");
  if (local) return local;
  return readCountry(fetchImpl, "https://api.country.is/");
}
