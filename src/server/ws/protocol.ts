export interface ClientMessage {
  type: string;
  terminalId?: number;
  data?: string;
  cols?: number;
  rows?: number;
}

export interface ServerMessage {
  type: string;
  terminalId?: number;
  data?: string;
  exitCode?: number;
  title?: string;
  message?: string;
}
