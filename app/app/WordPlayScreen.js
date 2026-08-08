import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { notifyGameEnded, notifyGameStarted } from '../lib/recreationSocket';
import { socket } from '../socket';

export default function WordPlayScreen() {
  const router = useRouter();
  const [sets, setSets] = useState([]);
  const [index, setIndex] = useState(0);
  const [promptIndex, setPromptIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [correctAnswers, setCorrectAnswers] = useState([]);

  useEffect(() => {
    const handleCorrectAnswer = (answer) => {
      if (answer?.gameType === 'WORD') setCorrectAnswers((current) => [answer, ...current]);
    };
    socket.on('answer:correct', handleCorrectAnswer);
    return () => socket.off('answer:correct', handleCorrectAnswer);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        await apiRequest('/recreation/WORD/start', { method: 'POST' });
        const data = await apiRequest('/recreation/WORD');
        const loaded = data.questions || [];
        setSets(loaded);
        if (loaded[0]?.questionId) {
          await apiRequest('/recreation/WORD/current-question', {
            method: 'POST',
            body: JSON.stringify({ questionId: loaded[0].questionId, promptIndex: 0 }),
          });
        }
        try {
          await notifyGameStarted('WORD');
        } catch (socketError) {
          Alert.alert('실시간 전환 실패', socketError.message);
        }
      } catch (error) {
        Alert.alert('진행 실패', error.message);
      }
    };

    load();
  }, []);

  const current = sets[index];
  const prompts = [current?.option1, current?.option2, current?.option3];
  const currentPrompt = prompts[promptIndex] || prompts.find(Boolean) || `제시어 ${promptIndex + 1}`;
  const maxPromptIndex = Math.max(0, prompts.filter((prompt) => String(prompt || '').trim()).length - 1);

  const complete = async () => {
    try {
      await apiRequest('/recreation/WORD/complete', { method: 'POST' });
      try {
        await notifyGameEnded();
      } catch (socketError) {
        Alert.alert('실시간 종료 알림 실패', socketError.message);
      }
      router.back();
    } catch (error) {
      Alert.alert('완료 처리 실패', error.message);
    }
  };

  const advance = async () => {
    if (!current) {
      complete();
      return;
    }
    if (promptIndex < maxPromptIndex) {
      const nextPromptIndex = promptIndex + 1;
      try {
        await apiRequest('/recreation/WORD/current-question', {
          method: 'POST',
          body: JSON.stringify({ questionId: current.questionId, promptIndex: nextPromptIndex }),
        });
      } catch (error) {
        Alert.alert('제시어 이동 실패', error.message);
        return;
      }
      setPromptIndex(nextPromptIndex);
      setShowAnswer(false);
      return;
    }

    if (index + 1 < sets.length) {
      const nextIndex = index + 1;
      const nextSet = sets[nextIndex];
      try {
        await apiRequest('/recreation/WORD/current-question', {
          method: 'POST',
          body: JSON.stringify({ questionId: nextSet.questionId, promptIndex: 0 }),
        });
      } catch (error) {
        Alert.alert('문제 이동 실패', error.message);
        return;
      }
      setIndex(nextIndex);
      setPromptIndex(0);
      setShowAnswer(false);
      return;
    }

    complete();
  };

  const toggleAnswer = async () => {
    if (!current) return;
    const nextShowAnswer = !showAnswer;
    try {
      await apiRequest(nextShowAnswer ? '/recreation/WORD/reveal-answer' : '/recreation/WORD/current-question', {
        method: 'POST',
        body: JSON.stringify({ questionId: current.questionId, promptIndex }),
      });
      setShowAnswer(nextShowAnswer);
    } catch (error) {
      Alert.alert('정답 공개 실패', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.logoText}>Playce</Text>
      <Text style={styles.roundText}>Round {sets.length === 0 ? 0 : index + 1}</Text>

      <View style={styles.card}>
        <View style={styles.wordBox}>
          <Text style={styles.wordText}>{currentPrompt}</Text>
        </View>
        <Text style={styles.progressText}>제시어 {promptIndex + 1}/{Math.max(1, prompts.filter(Boolean).length || 1)}</Text>
        {showAnswer && <Text style={styles.answerText}>정답: {current?.answer || '-'}</Text>}
        <Text style={styles.correctTitle}>정답자</Text>
        <FlatList
          data={correctAnswers.filter((answer) => answer.questionId === current?.questionId)}
          keyExtractor={(_, answerIndex) => String(answerIndex)}
          horizontal
          ListEmptyComponent={<Text style={styles.emptyText}>아직 정답자가 없습니다.</Text>}
          renderItem={({ item }) => <Text style={styles.correctAnswer}>{item.nickname} · {item.teamName}</Text>}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={toggleAnswer} disabled={!current}>
          <Text style={styles.buttonText}>정답 보기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={current ? advance : () => router.back()}>
          <Text style={styles.buttonText}>
            {!current ? '뒤로가기' : promptIndex < maxPromptIndex ? '다음 제시어' : index + 1 < sets.length ? '다음 문제' : '완료'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 50 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: '#FFF', marginBottom: 20 },
  roundText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  card: { width: '90%', minHeight: 360, backgroundColor: '#FFF', borderRadius: 15, padding: 24, justifyContent: 'center', gap: 14 },
  wordBox: { minHeight: 58, borderRadius: 10, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  wordText: { color: '#000', fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  progressText: { color: '#666', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  answerText: { marginTop: 12, fontSize: 22, fontWeight: 'bold', color: '#000', textAlign: 'center' },
  correctTitle: { color: '#000', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  emptyText: { color: '#777', textAlign: 'center' },
  correctAnswer: { color: '#000', backgroundColor: '#EEE', borderRadius: 12, padding: 8, marginRight: 6, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 50, width: '90%', gap: 12 },
  primaryButton: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#DDD', padding: 15, borderRadius: 30, alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
