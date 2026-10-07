export type AdapterId = "openai" | "hermes" | "open-swarm" | "pi" | string;

export interface CapabilityDescriptor {
  id: string;
  title: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  supportsStreaming: boolean;
  supportsCancellation: boolean;
  locality: "cloud" | "local" | "hybrid";
  risk: "low" | "medium" | "high";
}

export interface AdapterHealth {
  adapterId: AdapterId;
  status: "healthy" | "degraded" | "offline";
  checkedAt: string;
  latencyMs?: number;
  version?: string;
  capabilities?: string[];
  message?: string;
}

export interface AdapterTaskInput {
  missionId: string;
  taskId: string;
  traceId: string;
  idempotencyKey: string;
  objective: string;
  acceptanceChecks: string[];
  dependencies: string[];
  inputArtifacts: string[];
  workspace?: WorkspaceManifest;
  policy: TaskPolicy;
  timeoutMs: number;
  attempt: number;
}

export interface WorkspaceManifest {
  root: string;
  repository?: string;
  branch?: string;
  allowedPaths: string[];
  deniedPaths: string[];
  availableTools: string[];
  allowedCommands: string[];
  networkDestinations: string[];
  memoryReferences: string[];
  dataClassification: "public" | "internal" | "private" | "restricted";
}

export interface TaskPolicy {
  approvalProfile: string;
  maxCostUsd?: number;
  maxTokens?: number;
  maxConcurrency: number;
  allowNetwork: boolean;
  allowWrites: boolean;
  allowExternalSideEffects: boolean;
}

export interface AdapterRun {
  runId: string;
  adapterId: AdapterId;
  status: "queued" | "running" | "blocked";
  startedAt?: string;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  wallTimeMs?: number;
}

export interface ArtifactRef {
  id: string;
  name: string;
  uri: string;
  checksum: string;
  mimeType: string;
  version: number;
}

export interface AgentEvent {
  id: string;
  schemaVersion: string;
  sequence: number;
  timestamp: string;
  missionId: string;
  taskId?: string;
  runId?: string;
  traceId: string;
  source: AdapterId | "patrick" | "user";
  type: string;
  severity: "debug" | "info" | "warning" | "error";
  payload: Record<string, unknown>;
}

export interface AgentAdapter {
  readonly id: AdapterId;
  readonly displayName: string;

  probe(): Promise<AdapterHealth>;
  capabilities(): Promise<CapabilityDescriptor[]>;
  startTask(input: AdapterTaskInput): Promise<AdapterRun>;
  streamEvents(runId: string, afterSequence?: number): AsyncIterable<AgentEvent>;
  cancelTask(runId: string, reason: string): Promise<void>;
  resumeTask?(runId: string): Promise<void>;
  collectArtifacts(runId: string): Promise<ArtifactRef[]>;
  getUsage?(runId: string): Promise<Usage>;
}

