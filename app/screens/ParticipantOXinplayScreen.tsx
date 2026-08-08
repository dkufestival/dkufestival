import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useParticipantGameEvents } from "@/hooks/use-participant-game-events";

export default function OXGameScreen() {
  useParticipantGameEvents();
  const [selected, setSelected] = useState("");

  return (
    <View style={styles.container}>
      <Ionicons name="notifications-outline" size={32} color="white" style={styles.bell} />

      <Text style={styles.title}>Playce</Text>
      <Text style={styles.subTitle}>Question 1</Text>

      <View style={styles.oxArea}>
        <TouchableOpacity style={styles.oxBox} onPress={() => setSelected("O")}>
          <Text style={styles.oxText}>O</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.oxBox} onPress={() => setSelected("X")}>
          <Text style={styles.oxText}>X</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.submitButton}>
        <Text style={styles.submitText}>제출</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: "center", paddingHorizontal: 18 },
  bell: { position: "absolute", top: 35, right: 28 },
  title: { marginTop: 120, color: "#fff", fontSize: 46, fontWeight: "900" },
  subTitle: { marginTop: 36, color: "#fff", fontSize: 34, fontWeight: "900" },
  oxArea: { marginTop: 140, flexDirection: "row", gap: 8 },
  oxBox: { width: 165, height: 165, backgroundColor: "#fff", borderRadius: 8, justifyContent: "center", alignItems: "center" },
  oxText: { color: "#000", fontSize: 58 },
  submitButton: { position: "absolute", bottom: 55, width: "100%", height: 44, backgroundColor: "#fff", borderRadius: 22, justifyContent: "center", alignItems: "center" },
  submitText: { color: "#000", fontSize: 14, fontWeight: "600" },
});
