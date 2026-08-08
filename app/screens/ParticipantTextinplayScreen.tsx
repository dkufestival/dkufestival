import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useParticipantGameEvents } from "@/hooks/use-participant-game-events";

export default function TextGameScreen() {
  useParticipantGameEvents();
  const [answer, setAnswer] = useState("");

  return (
    <View style={styles.container}>
      <Ionicons name="notifications-outline" size={32} color="white" style={styles.bell} />

      <Text style={styles.title}>Playce</Text>
      <Text style={styles.subTitle}>Question 1</Text>

      <View style={styles.emptySpace} />

      <TextInput
        style={styles.input}
        placeholder="답안을 입력하세요"
        placeholderTextColor="#9aa8b8"
        value={answer}
        onChangeText={setAnswer}
      />

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
  emptySpace: { height: 340 },
  input: { width: "100%", height: 44, backgroundColor: "#fff", borderRadius: 22, paddingHorizontal: 16, fontSize: 14 },
  submitButton: { position: "absolute", bottom: 55, width: "100%", height: 44, backgroundColor: "#fff", borderRadius: 22, justifyContent: "center", alignItems: "center" },
  submitText: { color: "#000", fontSize: 14, fontWeight: "600" },
});
