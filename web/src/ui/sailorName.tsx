import { codeForCountry, flagImageSrc } from "../sim/country";

/** Flag picture plus username. The accessible name says the country in words. */
export function FlagImg({ code }: { code: string }) {
  const src = flagImageSrc(code);
  if (!src) return null;
  return <img className="flag-img" alt="" width={18} height={14} src={src} />;
}

export function SailorName({ username, country }: { username: string; country: string }) {
  const code = codeForCountry(country);
  return (
    <span className="sailor-name" aria-label={country && country !== "Sea" ? `${country} ${username}` : username}>
      <FlagImg code={code} />
      {username}
    </span>
  );
}
