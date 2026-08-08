import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { notifyGameEnded, notifyGameStarted } from '../lib/recreationSocket';

export default function QuizPlayScreen() {
  const router = useRouter();
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        await apiRequest('/recreation/OX/start', { method: 'POST' });
        const data = await apiRequest('/recreation/OX');
        const loaded = data.questions || [];
        setQuestions(loaded);
        if (loaded[0]?.questionId) {
          await apiRequest('/recreation/OX/current-question', {
            method: 'POST',
            body: JSON.stringify({ questionId: loaded[0].questionId }),
          });
        }
        try {
          await notifyGameStarted('OX');
        } catch (socketError) {
          Alert.alert('실시간 전환 실패', socketError.message);
        }
      } catch (error) {
        Alert.alert('진행 실패', error.message);
      }
    };

    load();
  }, []);

  const current = questions[index];

  const complete = async () => {
    try {
      await apiRequest('/recreation/OX/complete', { method: 'POST' });
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

  const goNext = async () => {
    if (index + 1 >= questions.length) {
      complete();
      return;
    }
    const nextIndex = index + 1;
    const nextQuestion = questions[nextIndex];
    try {
      await apiRequest('/recreation/OX/current-question', {
        method: 'POST',
        body: JSON.stringify({ questionId: nextQuestion.questionId }),
      });
    } catch (error) {
      Alert.alert('문제 이동 실패', error.message);
      return;
    }
    setIndex(nextIndex);
    setShowAnswer(false);
  };

  const toggleAnswer = async () => {
    if (!current) return;
    const nextShowAnswer = !showAnswer;
    try {
      await apiRequest(nextShowAnswer ? '/recreation/OX/reveal-answer' : '/recreation/OX/current-question', {
        method: 'POST',
        body: JSON.stringify({ questionId: current.questionId }),
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
      <Text style={styles.roundText}>Question {questions.length === 0 ? 0 : index + 1}</Text>

      <View style={styles.card}>
        <Text style={styles.questionText}>{current?.prompt || '등록된 문제가 없습니다.'}</Text>
        <View style={styles.answerRow}>
          <View style={styles.oxBox}><Text style={styles.oxText}>O</Text></View>
          <View style={styles.oxBox}><Text style={styles.oxText}>X</Text></View>
        </View>
        {showAnswer && <Text style={styles.answerText}>정답: {current?.answer || '-'}</Text>}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={toggleAnswer} disabled={!current}>
          <Text style={styles.buttonText}>정답 보기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={current ? goNext : () => router.back()}>
          <Text style={styles.buttonText}>{index + 1 >= questions.length ? '완료' : '다음'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 50 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: '#FFF', marginBottom: 20 },
  roundText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  card: { width: '90%', minHeight: 330, backgroundColor: '#FFF', borderRadius: 15, padding: 24, alignItems: 'center', justifyContent: 'center' },
  questionText: { color: '#000', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 32 },
  answerRow: { flexDirection: 'row', gap: 12 },
  oxBox: { width: 110, height: 110, borderRadius: 10, borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center' },
  oxText: { fontSize: 52, fontWeight: 'bold', color: '#000' },
  answerText: { marginTop: 28, fontSize: 22, fontWeight: 'bold', color: '#000' },
  footer: { position: 'absolute', bottom: 50, width: '90%', gap: 12 },
  primaryButton: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#DDD', padding: 15, borderRadius: 30, alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
