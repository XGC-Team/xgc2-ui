export function mavrosFcuUrl(localPort: number | string,host: string,remotePort: number | string) {
  const local = Number(localPort);
  const remote = Number(remotePort);
  return Number.isInteger(local) && Number.isInteger(remote) && local > 0 && remote > 0 && host.trim()
    ? `udp://:${local}@${host.trim()}:${remote}`
    : '';
}

export function vrpnPoseTopic(rigidBodyName: string) {
  const normalized = rigidBodyName.trim().replace(/^\/+|\/+$/g,'');
  return `/vrpn_client_node/${normalized || '<rigid-body>'}/pose`;
}
