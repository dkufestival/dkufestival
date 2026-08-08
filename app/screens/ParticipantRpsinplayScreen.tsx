import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useParticipantGameEvents } from "@/hooks/use-participant-game-events";

export default function RSPGameScreen() {
  useParticipantGameEvents();
  const [selected, setSelected] = useState("");

  return (
    <View style={styles.container}>
      <Ionicons name="notifications-outline" size={32} color="white" style={styles.bell} />

      <Text style={styles.title}>Playce</Text>
      <Text style={styles.roundTitle}>Round 1</Text>

      <View style={styles.rspArea}>
        <TouchableOpacity style={styles.rspBox} onPress={() => setSelected("rock")}>
          <Text style={styles.rspText}>✊</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.rspBox} onPress={() => setSelected("scissors")}>
          <Text style={styles.rspText}>✌️</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.rspBox} onPress={() => setSelected("paper")}>
          <Text style={styles.rspText}>✋</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.submitButton}>
        <Text style={styles.submitText}>제출</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: "center", paddingHorizontal: 16 },
  bell: { position: "absolute", top: 35, right: 28 },
  title: { marginTop: 120, color: "#fff", fontSize: 46, fontWeight: "900" },
  roundTitle: { marginTop: 85, color: "#fff", fontSize: 46, fontWeight: "900" },
  rspArea: { marginTop: 80, flexDirection: "row", gap: 10 },
  rspBox: { width: 115, height: 115, backgroundColor: "#fff", borderRadius: 8, justifyContent: "center", alignItems: "center" },
  rspText: { fontSize: 60 },
  submitButton: { position: "absolute", bottom: 55, width: "100%", height: 44, backgroundColor: "#fff", borderRadius: 22, justifyContent: "center", alignItems: "center" },
  submitText: { color: "#000", fontSize: 14, fontWeight: "600" },
});
