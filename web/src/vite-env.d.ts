/// <reference types="vite/client" />

interface AdenaWallet {
  AddEstablish(name: string): Promise<unknown>;
  GetAccount(): Promise<unknown>;
  AddNetwork?(network: { chainId: string; chainName: string; rpcUrl: string }): Promise<unknown>;
  SwitchNetwork?(chainId: string | { chainId: string }): Promise<unknown>;
  DoContract?(payload: {
    messages: {
      type: "/vm.m_call";
      value: { caller: string; send: string; pkg_path: string; func: string; args: string[] };
    }[];
    gasFee: number;
    gasWanted: number;
    memo: string;
  }): Promise<unknown>;
  On?(event: "changedAccount" | "changedNetwork", listener: (message: string) => void): void;
}

interface Window {
  adena?: AdenaWallet;
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  google_tag_manager?: object;
}
