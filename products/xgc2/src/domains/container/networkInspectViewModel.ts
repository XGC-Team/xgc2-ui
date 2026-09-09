/**
 * Operator-facing summary for `docker network inspect` JSON.
 */
import {
  dockerInspectRecord as asRecord,
  dockerInspectString as asString,
  dockerInspectTime as formatTime,
  parseDockerInspectDocument,
  pushDockerInspectFact as push,
  shortDockerInspectId as shortId,
  type DockerInspectFact,
} from './dockerInspectPrimitives';

export type NetworkInspectFact = DockerInspectFact;

export type NetworkInspectEndpoint = {
  id: string;
  name: string;
  ipv4: string;
  ipv6: string;
  mac: string;
  endpointId: string;
};

export type NetworkInspectSummary = {
  structured: boolean;
  facts: NetworkInspectFact[];
  endpoints: NetworkInspectEndpoint[];
};

export function summarizeNetworkInspect(content: string): NetworkInspectSummary {
  const doc = parseDockerInspectDocument(content);
  if (!doc) return emptySummary();

  const options = asRecord(doc.Options) ?? {};
  const ipam = asRecord(doc.IPAM);
  const configs = Array.isArray(ipam?.Config) ? ipam.Config : [];
  const facts: NetworkInspectFact[] = [];
  push(facts, 'Name', asString(doc.Name));
  push(facts, 'ID', shortId(asString(doc.Id)));
  push(facts, 'Driver', asString(doc.Driver));
  push(facts, 'Scope', asString(doc.Scope));
  push(facts, 'Created', formatTime(asString(doc.Created)));
  push(facts, 'Parent NIC', asString(options.parent));
  push(facts, 'IPv4', boolLabel(doc.EnableIPv4));
  push(facts, 'IPv6', boolLabel(doc.EnableIPv6));
  push(facts, 'Internal', boolLabel(doc.Internal));
  push(facts, 'Attachable', boolLabel(doc.Attachable));
  push(facts, 'IPAM driver', asString(ipam?.Driver));
  const optionPairs = Object.entries(options)
    .filter(([key]) => key !== 'parent')
    .map(([key, value]) => `${key}=${String(value)}`);
  if (optionPairs.length) push(facts, 'Options', optionPairs.join(', '));

  configs.forEach((entry, index) => {
    const config = asRecord(entry);
    if (!config) return;
    const suffix = configs.length > 1 ? ` ${index + 1}` : '';
    const parts = [
      asString(config.Subnet) && `subnet ${asString(config.Subnet)}`,
      asString(config.Gateway) && `gateway ${asString(config.Gateway)}`,
      asString(config.IPRange) && `range ${asString(config.IPRange)}`,
    ].filter(Boolean);
    push(facts, `IPAM${suffix}`, parts.join(' · '));
  });

  const labels = asRecord(doc.Labels);
  if (labels) {
    const pairs = Object.entries(labels).map(([key, value]) => (
      value === '' || value == null ? key : `${key}=${String(value)}`
    ));
    if (pairs.length) push(facts, 'Labels', pairs.join(', '));
  }

  const containers = asRecord(doc.Containers) ?? {};
  const endpoints: NetworkInspectEndpoint[] = Object.entries(containers).map(([id, value]) => {
    const endpoint = asRecord(value) ?? {};
    return {
      id,
      name: asString(endpoint.Name) || id.slice(0, 12),
      ipv4: asString(endpoint.IPv4Address),
      ipv6: asString(endpoint.IPv6Address),
      mac: asString(endpoint.MacAddress),
      endpointId: shortId(asString(endpoint.EndpointID)),
    };
  });

  return { structured: true,facts,endpoints };
}

function emptySummary(): NetworkInspectSummary {
  return { structured: false,facts: [],endpoints: [] };
}

function boolLabel(value: unknown) {
  if (value === true) return 'enabled';
  if (value === false) return 'disabled';
  return '';
}
