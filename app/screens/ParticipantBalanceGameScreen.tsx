import { useState, useEffect } from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiRequest } from "@/lib/api"; // 프로젝트 내 apiRequest 경로 확인
import { PlayceButton, PlayceHeading, PlayceLayout, PlayceStatus } from "./participant-ui"; // 경로 확인

export default function ParticipantBalanceGameScreen() {
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // 1. 서버에서 밸런스 게임 문제 가져오기
  useEffect(() => {
    if (!roomCode) return;
    
    apiRequest(`/recreation/BALANCE?roomCode=${roomCode}`)
      .then((data) => {
        if (data.questions) {
          setQuestions(data.questions);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("데이터 로드 실패:", err);
        setLoading(false);
      });
  }, [roomCode]);

  // 2. 투표 처리 로직
  const handleVote = async (choice: string) => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;

    try {
      await apiRequest('/recreation/BALANCE/vote', {
        method: 'POST',
        body: JSON.stringify({ roomCode, questionId: currentQuestion.id, choice }),
      });

      // 투표 후 다음 문제로 이동
      if (currentIndex < questions.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // 마지막 문제 완료 처리 (예: 대기 화면으로 이동 등)
        console.log("모든 투표 완료");
      }
    } catch (error) {
      console.error("투표 실패:", error);
    }
  };

  if (loading) {
    return (
      <PlayceLayout>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </PlayceLayout>
    );
  }

  const currentQuestion = questions[currentIndex];

  if (!currentQuestion) {
    return (
      <PlayceLayout>
        <PlayceHeading>진행 대기 중</PlayceHeading>
        <PlayceStatus>출제된 문제가 없습니다.</PlayceStatus>
      </PlayceLayout>
    );
  }

  return (
    <PlayceLayout>
      <PlayceHeading>밸런스 게임</PlayceHeading>

      <View style={styles.content}>
        <PlayceStatus>{currentQuestion.question}</PlayceStatus>
        
        <View style={styles.buttonGroup}>
          <PlayceButton 
            label={currentQuestion.option1} 
            onPress={() => handleVote(currentQuestion.option1)} 
          />
          <PlayceButton 
            label={currentQuestion.option2} 
            onPress={() => handleVote(currentQuestion.option2)} 
          />
        </View>
      </View>
    </PlayceLayout>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { marginTop: 50, gap: 30 },
  buttonGroup: { gap: 20 },
});