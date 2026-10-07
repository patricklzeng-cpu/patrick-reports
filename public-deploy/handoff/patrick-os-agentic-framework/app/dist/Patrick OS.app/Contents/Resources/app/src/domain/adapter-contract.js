// Agent Adapter contract — ported from contracts/adapter-contract.ts to vanilla JS
// This is the single contract every adapter (real or mocked) must satisfy.
// Provider-specific payloads stop at the adapter boundary.

/**
 * @typedef {Object} CapabilityDescriptor
 * @property {string} id
 * @property {string} title
 * @property {string} inputSchemaVersion
 * @property {string} outputSchemaVersion
 * @property {boolean} supportsStreaming
 * @property {boolean} supportsCancellation
 * @property {"cloud"|"local"|"hybrid"} locality
 * @property {"low"|"medium"|"high"} risk
 */

/**
 * @typedef {Object} AdapterHealth
 * @property {string} adapterId
 * @property {"healthy"|"degraded"|"offline"} status
 * @property {string} checkedAt - ISO timestamp
 * @property {number=} latencyMs
 * @property {string=} version
 * @property {string[]=} capabilities
 * @property {string=} message
 */

/**
 * @typedef {Object} WorkspaceManifest
 * @property {string} root
 * @property {string=} repository
 * @property {string=} branch
 * @property {string[]} allowedPaths
 * @property {string[]} deniedPaths
 * @property {string[]} availableTools
 * @property {string[]} allowedCommands
 * @property {string[]} networkDestinations
 * @property {string[]} memoryReferences
 * @property {"public"|"internal"|"private"|"restricted"} dataClassification
 */

/**
 * @typedef {Object} TaskPolicy
 * @property {string} approvalProfile
 * @property {number=} maxCostUsd
 * @property {number=} maxTokens
 * @property {number} maxConcurrency
 * @property {boolean} allowNetwork
 * @property {boolean} allowWrites
 * @property {boolean} allowExternalSideEffects
 */

/**
 * @typedef {Object} AdapterTaskInput
 * @property {string} missionId
 * @property {string} taskId
 * @property {string} traceId
 * @property {string} idempotencyKey
 * @property {string} objective
 * @property {string[]} acceptanceChecks
 * @property {string[]} dependencies
 * @property {string[]} inputArtifacts
 * @property {WorkspaceManifest=} workspace
 * @property {TaskPolicy} policy
 * @property {number} timeoutMs
 * @property {number} attempt
 */

/**
 * @typedef {Object} AdapterRun
 * @property {string} runId
 * @property {string} adapterId
 * @property {"queued"|"running"|"blocked"} status
 * @property {string=} startedAt
 */

/**
 * @typedef {Object} Usage
 * @property {number=} inputTokens
 * @property {number=} outputTokens
 * @property {number=} costUsd
 * @property {number=} wallTimeMs
 */

/**
 * @typedef {Object} ArtifactRef
 * @property {string} id
 * @property {string} name
 * @property {string} uri
 * @property {string} checksum - sha256
 * @property {string} mimeType
 * @property {number} version
 */

/**
 * @typedef {Object} AgentEvent
 * @property {string} id
 * @property {string} schemaVersion
 * @property {number} sequence
 * @property {string} timestamp - ISO
 * @property {string} missionId
 * @property {string=} taskId
 * @property {string=} runId
 * @property {string} traceId
 * @property {string} source - adapter id | "patrick" | "user"
 * @property {string} type - mission.created | plan.proposed | task.queued | ...
 * @property {"debug"|"info"|"warning"|"error"} severity
 * @property {Record<string, any>} payload
 */

// JS-friendly stand-in for the TypeScript interface. Adapters implement
// the methods listed in the JSDoc.
export class AgentAdapter {
  /**
   * @returns {Promise<AdapterHealth>}
   */
  async probe() { throw new Error("not implemented"); }

  /**
   * @returns {Promise<CapabilityDescriptor[]>}
   */
  async capabilities() { throw new Error("not implemented"); }

  /**
   * @param {AdapterTaskInput} input
   * @returns {Promise<AdapterRun>}
   */
  async startTask(input) { throw new Error("not implemented"); }

  /**
   * @param {string} runId
   * @param {number=} afterSequence
   * @returns {AsyncIterable<AgentEvent>}
   */
  async *streamEvents(runId, afterSequence) { throw new Error("not implemented"); }

  /**
   * @param {string} runId
   * @param {string} reason
   * @returns {Promise<void>}
   */
  async cancelTask(runId, reason) { throw new Error("not implemented"); }

  /**
   * @param {string} runId
   * @returns {Promise<void>}
   */
  async resumeTask(runId) { throw new Error("not implemented"); }

  /**
   * @param {string} runId
   * @returns {Promise<ArtifactRef[]>}
   */
  async collectArtifacts(runId) { throw new Error("not implemented"); }

  /**
   * @param {string} runId
   * @returns {Promise<Usage|undefined>}
   */
  async getUsage(runId) { return undefined; }
}

export const EVENT_TYPES = Object.freeze([
  "mission.created",
  "plan.proposed",
  "plan.approved",
  "task.queued",
  "task.started",
  "task.progress",
  "task.log",
  "artifact.created",
  "artifact.updated",
  "approval.requested",
  "approval.resolved",
  "task.blocked",
  "task.failed",
  "task.completed",
  "handoff.started",
  "handoff.completed",
  "checkpoint.created",
  "review.started",
  "acceptance.passed",
  "acceptance.failed",
  "mission.completed",
  "mission.cancelled",
]);

export const MISSION_STATUSES = Object.freeze([
  "draft",
  "planning",
  "awaiting_approval",
  "queued",
  "running",
  "blocked",
  "reviewing",
  "completed",
  "failed",
  "cancelled",
]);