export interface RuntimeConfig {
  apiBaseUrl: string;
  environment: string;
}

declare global {
  interface Window {
    __NEXCAUSE_CONFIG__?: Partial<RuntimeConfig>;
  }
}

export const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: window.__NEXCAUSE_CONFIG__?.apiBaseUrl ?? "/api",
  environment: window.__NEXCAUSE_CONFIG__?.environment ?? "local",
};
