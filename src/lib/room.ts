// src/lib/room.ts
// The single karaoke room shared by the TV display (/tv) and every controller
// (/ and /remote). A home setup has one TV and one party, so a single stable
// room id keeps pairing trivial: open /tv on the TV and / on any phone.
// Override with NEXT_PUBLIC_ROOM_ID when hosting more than one room.
export const ROOM_ID = (process.env.NEXT_PUBLIC_ROOM_ID ?? "main").trim() || "main";

/** Short, human-readable room code shown on the TV (e.g. "MAIN"). */
export const ROOM_CODE = ROOM_ID.toUpperCase();
