export type Kind = "minecraft" | "game" | "container" | "website" | "bot";
export type Status =
  | "running"
  | "offline"
  | "starting"
  | "stopping"
  | "installing"
  | "error"
  | "suspended";
export type PowerAction = "start" | "stop" | "restart" | "kill";
export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  balance: number;
  suspended: boolean;
  createdAt: string;
  discordId?: string;
}
export interface Plan {
  id: string;
  name: string;
  tagline: string;
  memory: number;
  cpu: number;
  disk: number;
  price: number;
  popular?: boolean;
}
export interface Variable {
  key: string;
  label: string;
  default: string;
  description?: string;
  required?: boolean;
  secret?: boolean;
  rules?: string;
  options?: string[];
}
export interface Ziyn {
  id: string;
  name: string;
  kind: Kind;
  description: string;
  version: string;
  author: string;
  image: string;
  command: string[];
  stopCommand: string;
  port: number;
  protocol: "tcp" | "udp";
  variables: Variable[];
  tags: string[];
  color: string;
  icon: string;
  enabled: boolean;
  source: string;
  features: string[];
}
export interface Server {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  kind: Kind;
  templateId: string;
  software: string;
  version: string;
  nodeId: string;
  planId: string;
  memory: number;
  cpu: number;
  disk: number;
  port: number;
  address: string;
  status: Status;
  environment: Record<string, string>;
  monthlyCost: number;
  createdAt: string;
  expiresAt: string;
  favorite: boolean;
  containerId?: string;
  error?: string;
}
export interface NodeInfo {
  id: string;
  name: string;
  region: string;
  country: string;
  endpoint: string;
  status: "online" | "offline" | "maintenance";
  memory: number;
  disk: number;
  cpu: number;
  usedMemory: number;
  usedDisk: number;
  usedCpu: number;
  latency: number;
  maintenance: boolean;
}
export interface Metrics {
  cpu: number;
  memory: number;
  disk: number;
  networkIn: number;
  networkOut: number;
  uptime: number;
  players?: number;
  maxPlayers?: number;
  history: { time: string; cpu: number; memory: number }[];
}
export interface Backup {
  id: string;
  serverId: string;
  name: string;
  size: number;
  checksum: string;
  createdAt: string;
  status: "creating" | "ready" | "error";
}
export interface Schedule {
  id: string;
  serverId: string;
  name: string;
  action: "restart" | "start" | "stop" | "backup" | "command";
  interval: number;
  command: string;
  enabled: boolean;
  lastRun?: string;
  nextRun: string;
  lastResult?: string;
}
export interface Autopilot {
  serverId: string;
  recovery: boolean;
  backup: boolean;
  backupInterval: number;
  idleSleep: boolean;
  idleMinutes: number;
  budgetAlert: boolean;
  budget: number;
  lastAction?: string;
}
export interface Invoice {
  id: string;
  userId: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  status: "paid" | "pending" | "failed";
  provider: string;
  serverId?: string;
  createdAt: string;
}
export interface Activity {
  id: string;
  userId: string;
  serverId?: string;
  action: string;
  detail: string;
  severity: "info" | "success" | "warning" | "error";
  createdAt: string;
}
export interface Plugin {
  id: string;
  serverId: string;
  projectId: string;
  name: string;
  description: string;
  version: string;
  filename: string;
  size: number;
  installedAt: string;
  demo: boolean;
}
export interface Bootstrap {
  user: User;
  mode: "demo" | "docker";
  version: string;
  currency: string;
  plans: Plan[];
  nodes: NodeInfo[];
  servers: Server[];
  activity: Activity[];
  invoices: Invoice[];
  integrations: {
    stripe: boolean;
    discord: boolean;
    discordAppId?: string;
    registration: boolean;
  };
}
export interface FileEntry {
  name: string;
  path: string;
  directory: boolean;
  size: number;
  modifiedAt: string;
}
export interface ConsoleLine {
  id: string;
  time: string;
  level: "info" | "warn" | "error" | "command";
  message: string;
}
export interface PluginSearchResult {
  project_id: string;
  title: string;
  description: string;
  downloads: number;
  author: string;
  icon_url?: string;
  versions: string[];
}
export const KIND_LABELS: Record<Kind, string> = {
  minecraft: "Minecraft",
  game: "Game server",
  container: "Container",
  website: "Website",
  bot: "Bot",
};
