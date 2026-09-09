export type TerminalHost = {
  id: string;
  name: string;
  group: string;
  address: string;
  port: number;
  user: string;
  authMode: 'password' | 'key' | string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  rememberPassword: boolean;
  /** Public flag: catalog has a stored secret (the secret itself is never listed). */
  hasPassword?: boolean;
  hostKey: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TerminalSetting = {
  id: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  backgroundColor: string;
  foregroundColor: string;
  cursorStyle: 'block' | 'underline' | 'bar' | string;
  cursorBlink: boolean;
  scrollback: number;
  scrollSensitivity: number;
  defaultHostId: string;
};

export type PlaceUserScriptRequest = {
  sessionId: string;
  hostId: string;
  path: string;
  managedHostId?: string;
};

export type PlaceUserScriptResult = {
  path: string;
  target: string;
};
