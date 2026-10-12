import { useEffect, useState } from "react";
import { chainLine, loadOnyxFish, type OnyxFishStatus } from "../chain/onyxStatus";

export function useOnyxFish(): OnyxFishStatus {
  const [status, setStatus] = useState<OnyxFishStatus>({ kind: "reading" });
  useEffect(() => {
    let live = true;
    loadOnyxFish().then((next) => {
      if (live) setStatus(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return status;
}

/** Top-bar and gate disclosure. Practice buttons still do not send realm calls. */
export function ChainLine() {
  const status = useOnyxFish();
  const text = chainLine(status);
  return <span title={text}>{text}</span>;
}
