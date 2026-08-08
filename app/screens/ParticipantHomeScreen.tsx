import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import socket, { GAME_ROUTES, isGameType, normalizeRoomCode } from "@/socket";
import { PlayceButton, PlayceInput, PlayceLayout, PlayceStatus } from "./participant-ui";

type ActivityFlow = "waiting" | "report" | "actionAlone";
type GameStartedPayload = {
  gameType?: string;
  roomCode?: string;
  gameId?: string;
  startedAt?: string;
};
type SocketAck = {
  ok?: boolean;
  message?: string;
};

export default function ParticipantHomeScreen() {
  const router = useRouter();
  const { roomCode } = useLocalSearchParams<{ roomCode?: string }>();
  const [flow, setFlow] = useState<ActivityFlow>("waiting");
  const [socketMessage, setSocketMessage] = useState("waiting for MC...");
  const lastGameIdRef = useRef<string | null>(null);

  useEffect(() => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (!normalizedRoomCode) {
      setSocketMessage("room code is missing");
      return undefined;
    }

    const joinRoom = () => {
      socket.timeout(5000).emit(
        "joinRoom",
        { roomCode: normalizedRoomCode, role: "participant" },
        (error: Error | null, response: SocketAck) => {
          if (error || !response?.ok) {
            setSocketMessage(response?.message || "room connection failed");
            return;
          }

          setSocketMessage("waiting for MC...");
        },
      );
    };

    const handleGameStarted = (data: GameStartedPayload) => {
      const eventRoomCode = normalizeRoomCode(data.roomCode);

      if (eventRoomCode && eventRoomCode !== normalizedRoomCode) {
        return;
      }

      if (!isGameType(data.gameType)) {
        console.warn("Unknown gameStarted payload:", data);
        return;
      }

      const eventId = data.gameId || `${data.roomCode}:${data.gameType}:${data.startedAt}`;

      if (lastGameIdRef.current === eventId) {
        return;
      }

      lastGameIdRef.current = eventId;
      console.log("Navigate participant game screen:", data);
      router.push({
        pathname: GAME_ROUTES[data.gameType],
        params: { roomCode: normalizedRoomCode },
      } as never);
    };

    const handleConnect = () => {
      joinRoom();
    };

    const handleDisconnect = () => {
      setSocketMessage("server disconnected");
    };

    if (socket.connected) {
      joinRoom();
    } else {
      socket.connect();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("gameStarted", handleGameStarted);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("gameStarted", handleGameStarted);
    };
  }, [roomCode, router]);

  if (flow === "report") {
    return <PersonalActivityReportScreen onSubmit={() => setFlow("actionAlone")} />;
  }

  if (flow === "actionAlone") {
    return <ActionAloneScreen onReturn={() => setFlow("waiting")} />;
  }

  return (
    <WaitingForMcScreen
      message={socketMessage}
      onReport={() => setFlow("report")}
    />
  );
}

function ActionAloneScreen({ onReturn }: { onReturn: () => void }) {
  return (
    <PlayceLayout showExit>
      <View style={styles.statusWrap}>
        <PlayceStatus>Action Alone...</PlayceStatus>
      </View>

      <View style={styles.actionButtons}>
        <PlayceButton label="복귀완료" onPress={onReturn} />
        <PlayceButton label="일정확인" />
      </View>
    </PlayceLayout>
  );
}

export function PersonalActivityReportScreen({ onSubmit }: { onSubmit?: () => void }) {
  return (
    <PlayceLayout showExit>
      <View style={styles.reportButtons}>
        <PlayceButton label="화장실 이동" />
        <PlayceButton label="편의점 이동" />
        <PlayceButton label="흡연 이동" />
        <View style={styles.etcWrap}>
          <Text style={styles.etcLabel}>기타</Text>
          <PlayceInput placeholder="내용을 입력하세요" style={styles.leftInput} />
        </View>
        <PlayceButton label="제출" onPress={onSubmit} />
      </View>

      <View style={styles.backButton}>
        <PlayceButton label="뒤로가기" />
      </View>
    </PlayceLayout>
  );
}

export function WaitingForMcScreen({
  message = "waiting for MC...",
  onReport,
}: {
  message?: string;
  onReport?: () => void;
}) {
  return (
    <PlayceLayout showExit>
      <View style={styles.statusWrap}>
        <PlayceStatus>{message}</PlayceStatus>
      </View>

      <View style={styles.actionButtons}>
        <PlayceButton label="개인활동보고" onPress={onReport} />
        <PlayceButton label="일정확인" />
      </View>
    </PlayceLayout>
  );
}

const styles = StyleSheet.create({
  statusWrap: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 61,
  },
  actionButtons: {
    gap: 22,
    paddingBottom: 101,
  },
  reportButtons: {
    gap: 28,
    marginTop: 142,
  },
  etcWrap: {
    gap: 9,
  },
  etcLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  leftInput: {
    textAlign: "left",
  },
  backButton: {
    marginTop: 44,
  },
});
