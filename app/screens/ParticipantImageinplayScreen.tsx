import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useParticipantGameEvents } from "@/hooks/use-participant-game-events";
import { apiRequest, getCurrentMember, toServerAssetUrl } from "../lib/api";
import socket from "@/socket";
import { Image as ExpoImage, type ImageContentPosition } from "expo-image";

type ImageQuestion = {
  questionId: number;
  imageUrl?: string;
  imageFocus?: ImageContentPosition;
};

const IMAGE_STAGES = [3.4, 2.6, 2, 1.45, 1];

export default function ImageGameScreen() {
  useParticipantGameEvents();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [question, setQuestion] = useState<ImageQuestion | null>(null);
  const [imageStage, setImageStage] = useState(0);

  useEffect(() => {
    let mounted = true;
    const loadQuestion = async () => {
      try {
        const [roomData, gameData] = await Promise.all([
          apiRequest("/rooms/current"),
          apiRequest("/recreation/IMAGE"),
        ]);
        if (!mounted) return;
        const currentQuestionId = roomData.room?.currentQuestionId;
        setImageStage(Math.max(0, Math.min(4, Number(roomData.room?.currentImageStage) || 0)));
        const questions = gameData.questions || [];
        setQuestion(questions.find((item: ImageQuestion) => item.questionId === currentQuestionId) || questions[0] || null);
      } catch (error) {
        if (mounted) Alert.alert("조회 실패", error instanceof Error ? error.message : "문제를 불러오지 못했습니다.");
      }
    };
    loadQuestion();
    const timer = setInterval(loadQuestion, 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const handleImageStage = ({ stage }: { stage?: number } = {}) => setImageStage(Math.max(0, Math.min(4, Number(stage) || 0)));
    socket.on("image:stage", handleImageStage);
    return () => {
      socket.off("image:stage", handleImageStage);
    };
  }, []);

  const handleSubmit = async () => {
    if (!question?.questionId || !answer.trim()) {
      Alert.alert("알림", "답안을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("/recreation/IMAGE/answers", {
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

      <View style={styles.imageBox}>
        {question?.imageUrl ? (
          <ExpoImage
            source={{ uri: toServerAssetUrl(question.imageUrl) }}
            style={[styles.image, { transform: [{ scale: IMAGE_STAGES[imageStage] }] }]}
            contentFit="contain"
            contentPosition={question.imageFocus || "center"}
          />
        ) : (
          <Text style={styles.imageText}>이미지가 없습니다.</Text>
        )}
      </View>
      <Text style={styles.stageText}>확대 단계 {imageStage + 1}/5</Text>

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
  imageBox: { marginTop: 85, width: 290, height: 290, backgroundColor: "#fff", borderRadius: 8, justifyContent: "center", alignItems: "center" },
  image: { width: "100%", height: "100%", borderRadius: 8 },
  imageText: { color: "#aaa", fontSize: 14 },
  stageText: { color: "#fff", marginTop: 10, fontSize: 12, fontWeight: "700" },
  input: { width: "100%", height: 44, backgroundColor: "#fff", borderRadius: 22, paddingHorizontal: 16, fontSize: 14, marginTop: 78 },
  submitButton: { position: "absolute", bottom: 55, width: "100%", height: 44, backgroundColor: "#fff", borderRadius: 22, justifyContent: "center", alignItems: "center" },
  submitText: { color: "#000", fontSize: 14, fontWeight: "600" },
});
