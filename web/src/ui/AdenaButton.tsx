import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ARC_CHAIN_ID, arcBalanceMicro, chainIdOf, ensureArcChain, firstAddress, readEthereum, waitForEthereum, type Eip1193 } from "../chain/arc";
import { clearSession, readSession, subscribeSession, withChain, writeSession } from "../chain/session";
import { ensureOnyxSigner, needsUserGesture, shortAddress } from "./adena";

const WALLET_SITE = "https://metamask.io/download/";

async function refreshFrom(eth: NonNullable<ReturnType<typeof readEthereum>>): Promise<{ address: string; chainId: string; ugnot: number | null } | null> {
  const accounts = firstAddress(await eth.request({ method: "eth_accounts" }));
  if (!accounts) return null;
  const chainId = chainIdOf(await eth.request({ method: "eth_chainId" }));
  const ugnot = chainId === ARC_CHAIN_ID ? await arcBalanceMicro(eth, accounts) : null;
  return { address: accounts, chainId, ugnot };
}

/** Top-bar wallet connect. The sea opens only after a 1 USDC pool stake. */
export function AdenaButton({ paused }: { paused: boolean }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [switchNote, setSwitchNote] = useState("");
  const [connectNote, setConnectNote] = useState("");
  const [host, setHost] = useState<HTMLElement | null>(null);
  const copyTimer = useRef<number | null>(null);
  const addressRef = useRef<string | null>(null);
  const chainRef = useRef("");

  const apply = (view: { address: string; chainId: string; ugnot?: number | null } | null) => {
    addressRef.current = view?.address ?? null;
    chainRef.current = view?.chainId ?? "";
    setAddress(view?.address ?? null);
    setChainId(view?.chainId ?? "");
    if (view) writeSession({ address: view.address, chainId: view.chainId, ugnot: view.ugnot ?? null });
    else clearSession();
  };

  useEffect(() => {
    const found = document.querySelector(".app");
    setHost(found instanceof HTMLElement ? found : null);
  }, []);

  useEffect(() => subscribeSession(() => {
    const current = readSession();
    if (!current.address) return;
    if (current.address === addressRef.current && current.chainId === chainRef.current) return;
    addressRef.current = current.address;
    chainRef.current = current.chainId;
    setAddress(current.address);
    setChainId(current.chainId);
  }), []);

  useEffect(() => {
    if (paused) setOpen(false);
  }, [paused]);

  useEffect(() => {
    let cancel = false;
    let eth: Eip1193 | undefined;
    const ticket = { n: 0 };
    const pull = () => {
      if (!eth) return;
      const mine = ++ticket.n;
      void refreshFrom(eth).then((view) => {
        if (cancel || mine !== ticket.n || !view) return;
        apply(view);
      }).catch(() => {
        // A late empty read must not wipe a connection that already landed.
      });
    };
    void (async () => {
      const found = await waitForEthereum();
      if (cancel) return;
      if (!found) {
        setMissing(true);
        setConnectNote("This page needs an Ethereum wallet. Install one, then press Connect again.");
        return;
      }
      eth = found;
      found.on?.("accountsChanged", pull);
      found.on?.("chainChanged", pull);
      const ready = await ensureOnyxSigner(undefined, found);
      if (cancel) return;
      if (!ready.ok) {
        if (!needsUserGesture(ready.detail)) setConnectNote(ready.detail);
        return;
      }
      ticket.n += 1;
      const view = await refreshFrom(found);
      if (cancel) return;
      apply(view?.chainId === ARC_CHAIN_ID ? view : { address: ready.signer, chainId: ARC_CHAIN_ID, ugnot: view?.ugnot ?? null });
    })();
    return () => {
      cancel = true;
      eth?.removeListener?.("accountsChanged", pull);
      eth?.removeListener?.("chainChanged", pull);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const connect = async () => {
    setBusy(true);
    setMissing(false);
    setConnectNote("");
    try {
      const eth = readEthereum();
      if (!eth) {
        setMissing(true);
        setConnectNote("This page needs an Ethereum wallet. Install one, then press Connect again.");
        return;
      }
      const ready = await withChain(async () => ensureOnyxSigner());
      if (ready === "busy") {
        setConnectNote("The wallet is already sending a call.");
        return;
      }
      if (!ready.ok) {
        setConnectNote(ready.detail);
        return;
      }
      const view = await refreshFrom(eth);
      if (view) apply(view);
      setOpen(true);
    } catch {
      setConnectNote("The wallet did not connect. Unlock it and press Connect again.");
    } finally {
      setBusy(false);
    }
  };

  const askArc = async () => {
    const eth = readEthereum();
    if (!eth) return;
    setBusy(true);
    setSwitchNote("");
    try {
      const outcome = await ensureArcChain(eth);
      if (!outcome.ok) {
        setSwitchNote(outcome.detail);
        return;
      }
      const current = addressRef.current;
      if (!current) return;
      const ugnot = await arcBalanceMicro(eth, current);
      chainRef.current = ARC_CHAIN_ID;
      setChainId(ARC_CHAIN_ID);
      writeSession({ address: current, chainId: ARC_CHAIN_ID, ugnot });
    } catch {
      setSwitchNote("The wallet stayed off Arc testnet.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    const eth = readEthereum();
    if (!eth) return;
    try {
      const view = await refreshFrom(eth);
      if (!view) return;
      apply(view);
    } catch {
      // Keep the address and chain id already on screen.
    }
  };

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopyLabel("Copied");
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => {
        copyTimer.current = null;
        setCopyLabel("Copy");
      }, 1500);
    } catch {
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
        copyTimer.current = null;
      }
      setCopyLabel("Copy failed");
    }
  };

  const label = address ? shortAddress(address) : busy ? "Connecting" : "Connect wallet";
  const title = address ?? (missing ? "Install an Ethereum wallet, then connect." : "Connect wallet");
  const onArc = chainId === ARC_CHAIN_ID;
  const sheet =
    address && open && host
      ? createPortal(
          <aside className="card account">
            <p className="kicker">Arc testnet</p>
            <p className="address">{address}</p>
            <p>
              {onArc
                ? "This wallet is on Arc testnet. Mint, lock, and leave talk to FishDuel."
                : chainId
                  ? `This wallet is on chain ${chainId}. Switch to Arc testnet.`
                  : "Chain unavailable. Switch to Arc testnet."}
            </p>
            {onArc ? null : (
              <button type="button" className="switch-net" disabled={busy} onClick={() => void askArc()}>
                {busy ? "Asking the wallet" : "Switch to Arc testnet"}
              </button>
            )}
            {switchNote ? <p>{switchNote}</p> : null}
            <div className="row">
              <button type="button" onClick={() => void copy()}>
                {copyLabel}
              </button>
              <button type="button" onClick={() => void refresh()}>
                Refresh
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <p>Mint sends 5 USDC to the Shoal collection. Lock sends 1 USDC to the duel. Leave returns that stake. Profile and party send no USDC. A kill of another seated fish sends Award to FishEarn. Bites stay in this browser.</p>
            <p>Stake 1 USDC into the pool to enter. There is no practice sea.</p>
          </aside>,
          host,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className={address ? "adena on" : "adena"}
        onClick={() => {
          if (address) {
            if (paused) return;
            setOpen((value) => !value);
            return;
          }
          void connect();
        }}
        disabled={busy}
        title={title}
        aria-label={address ? `Wallet ${address}` : undefined}
      >
        {label}
      </button>
      {missing ? (
        <a className="adena install" href={WALLET_SITE} target="_blank" rel="noreferrer">
          Install
        </a>
      ) : null}
      {connectNote ? (
        <p className="adena-note" role="status">
          {connectNote}
        </p>
      ) : null}
      {sheet}
    </>
  );
}
