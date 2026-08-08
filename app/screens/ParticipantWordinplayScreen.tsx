import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useParticipantGameEvents } from "@/hooks/use-participant-game-events";
import socket from "@/socket";
import { apiRequest, getCurrentMember } from "../lib/api";

type WordQuestion = {
  questionId: number;
  option1?: string;
  option2?: string;
  option3?: string;
  answer?: string;
};

export default function WordGameScreen() {
  useParticipantGameEvents();
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState<WordQuestion | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const loadQuestion = useCallback(async () => {
    try {
      const [roomData, gameData] = await Promise.all([
        apiRequest("/rooms/current"),
        apiRequest("/recreation/WORD"),
      ]);

      const currentQuestionId = roomData.room?.currentQuestionId;
      const currentPromptIndex = Math.max(0, Number(roomData.room?.currentPromptIndex) || 0);
      const questions = gameData.questions || [];
      const nextQuestion = questions.find((item: WordQuestion) => item.questionId === currentQuestionId) || questions[0] || null;
      setQuestion(nextQuestion);
      setPromptIndex(currentPromptIndex);
    } catch (error) {
      Alert.alert("조회 실패", error instanceof Error ? error.message : "문제를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    loadQuestion();
    const timer = setInterval(loadQuestion, 2000);
    return () => clearInterval(timer);
  }, [loadQuestion]);

  useEffect(() => {
    const handleGameStateChanged = () => {
      loadQuestion();
    };
    socket.on("game:stateChanged", handleGameStateChanged);
    return () => {
      socket.off("game:stateChanged", handleGameStateChanged);
    };
  }, [loadQuestion]);

  const prompts = useMemo(() => [question?.option1, question?.option2, question?.option3], [question]);
  const currentPrompt = prompts[promptIndex] || prompts.find(Boolean) || `제시어 ${promptIndex + 1}`;
  const promptCount = Math.max(1, prompts.filter((item) => String(item || "").trim()).length || 1);

  const handleSubmit = async () => {
    if (!question?.questionId || !answer.trim()) {
      Alert.alert("알림", "답안을 입력하세요.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/recreation/WORD/answers", {
        method: "POST",
        body: JSON.stringify({
          questionId: question.questionId,
          memberId: getCurrentMember()?.memberId,
          answerText: answer.trim(),
        }),
      });
      setAnswer("");
      Alert.alert("제출 완료", "답안이 제출되었습니다.");
    } catch (error) {
      Alert.alert("제출 실패", error instanceof Error ? error.message : "답안을 제출하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Ionicons name="notifications-outline" size={32} color="white" style={styles.bell} />

      <Text style={styles.title}>Playce</Text>
      <Text style={styles.roundTitle}>Round 1</Text>

      <View style={styles.wordButton}>
        <Text style={styles.wordText}>{currentPrompt}</Text>
      </View>
      <Text style={styles.promptIndex}>{promptIndex + 1}/{promptCount}</Text>

      <TextInput
        style={styles.input}
        placeholder="답안을 입력하세요"
        placeholderTextColor="#9aa8b8"
        value={answer}
        onChangeText={setAnswer}
      />

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        <Text style={styles.submitText}>{submitting ? "제출 중..." : "제출"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: "center", paddingHorizontal: 18 },
  bell: { position: "absolute", top: 35, right: 28 },
  title: { marginTop: 120, color: "#fff", fontSize: 46, fontWeight: "900" },
  roundTitle: { marginTop: 28, marginBottom: 26, color: "#fff", fontSize: 46, fontWeight: "900" },
  wordButton: { width: "100%", minHeight: 56, backgroundColor: "#fff", borderRadius: 22, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  wordText: { color: "#000", fontSize: 18, fontWeight: "900", textAlign: "center" },
  promptIndex: { marginTop: 10, color: "#fff", fontSize: 12, fontWeight: "700" },
  input: { width: "100%", height: 44, backgroundColor: "#fff", borderRadius: 22, paddingHorizontal: 16, fontSize: 14, marginTop: 190 },
  submitButton: { position: "absolute", bottom: 55, width: "100%", height: 44, backgroundColor: "#fff", borderRadius: 22, justifyContent: "center", alignItems: "center" },
  submitText: { color: "#000", fontSize: 14, fontWeight: "600" },
});
