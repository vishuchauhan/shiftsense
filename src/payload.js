// Builds the exact payload sent to the cloud for one pattern. Only allowlisted fingerprint fields.
export const PAYLOAD_INCIDENT_KEYS = ["id", "site", "symptoms", "trigger", "status", "confirmed_cause", "downtime", "fix", "fix_verified", "safety_flag"];

export function cloudPayload(cluster) {
  return {
    stats: cluster.stats,
    signature: cluster.signature,
    incidents: cluster.members.map((m) => ({
      id: m.id,
      site: m.site_token,
      symptoms: m.symptoms,
      trigger: m.trigger,
      status: m.status,
      confirmed_cause: m.cause_category,
      downtime: m.downtime_bucket,
      fix: m.resolution_category,
      fix_verified: m.resolution_verified,
      safety_flag: m.safety_flag,
    })),
  };
}
