import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";

import socket, { normalizeRoomCode } from "@/socket";

type GameEndedPayload = {
  roomCode?: string;
};

export function useParticipantGameEvents() {
  const router = useRouter();
  const { roomCode } = useLocalSearchParams<{ roomCode?: string }>();

  useEffect(() => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    const handleGameEnded = (data: GameEndedPayload = {}) => {
      const eventRoomCode = normalizeRoomCode(data.roomCode);

      if (eventRoomCode && normalizedRoomCode && eventRoomCode !== normalizedRoomCode) {
        return;
      }

      router.replace({
        pathname: "/ParticipantHomeScreen",
        params: normalizedRoomCode ? { roomCode: normalizedRoomCode } : {},
      } as never);
    };

    socket.on("gameEnded", handleGameEnded);

    return () => {
      socket.off("gameEnded", handleGameEnded);
    };
  }, [roomCode, router]);
}
