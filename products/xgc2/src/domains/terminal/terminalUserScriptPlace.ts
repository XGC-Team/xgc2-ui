import {
  parseUsernodeCommandFilePath,
  publicUserScriptRelativePath,
} from '../usernode/usernodePublic';
import type { PlaceUserScriptRequest } from './terminalModel';

/** Build the place request for a one-line invoke, or null when Insert is text-only. */
export function userScriptPlaceRequest(
  command: string,
  session: { id: string; hostId: string } | undefined,
  managedHostId = '',
): PlaceUserScriptRequest | null {
  if (!session?.id || !session.hostId) return null;
  const path = parseUsernodeCommandFilePath(command);
  if (!path || !publicUserScriptRelativePath(path)) return null;
  const managed = managedHostId.trim();
  return {
    sessionId: session.id,
    hostId: session.hostId,
    path,
    managedHostId: managed && managed !== 'local' ? managed : '',
  };
}
