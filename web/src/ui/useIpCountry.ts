import { useEffect, useState } from "react";
import { loadIpCountry, type IpCountry } from "../sim/country";

export type IpCountryState = {
  status: "loading" | "ready" | "missing";
  country: IpCountry | null;
};

let cached: Promise<IpCountry | null> | null = null;

function sharedIpCountry(): Promise<IpCountry | null> {
  if (!cached) cached = loadIpCountry();
  return cached;
}

/** One lookup per page. The sailor does not choose the country. */
export function useIpCountry(): IpCountryState {
  const [state, setState] = useState<IpCountryState>({ status: "loading", country: null });
  useEffect(() => {
    let live = true;
    void sharedIpCountry().then((country) => {
      if (!live) return;
      setState(country ? { status: "ready", country } : { status: "missing", country: null });
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
