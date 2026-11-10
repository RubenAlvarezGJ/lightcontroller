import { CMD, HEADER_IN } from './frame';

export interface Reply {
  /** Command code echoed in byte 1. */
  cmd: number;
  /** Power state, decoded from a sync reply's last byte (0x32 on, 0x33 off). */
  power?: boolean;
  raw: Uint8Array;
}

const POWER_ON = 0x32;
const POWER_OFF = 0x33;

/**
 * Parses a notification from FFF4. Replies start with 0x56. Their checksums are
 * not consistent, so this reads fields by position and never validates them.
 * Returns null for anything that isn't a reply frame.
 */
export function parseReply(bytes: Uint8Array): Reply | null {
  if (bytes.length < 2 || bytes[0] !== HEADER_IN) return null;
  const reply: Reply = { cmd: bytes[1]!, raw: bytes };
  if (reply.cmd === CMD.SYNC && bytes.length > 4) {
    const last = bytes[bytes.length - 1];
    if (last === POWER_ON) reply.power = true;
    else if (last === POWER_OFF) reply.power = false;
  }
  return reply;
}
