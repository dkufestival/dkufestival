import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { notifyGameEnded, notifyGameStarted } from '../lib/recreationSocket';

const handLabels = { rock: '주먹', scissors: '가위', paper: '보' };
const hands = [
  { key: 'rock', icon: 'fist-raised' },
  { key: 'scissors', icon: 'hand-scissors' },
  { key: 'paper', icon: 'hand-paper' },
];

export default function RPSPlayScreen() {
  const router = useRouter();
  const [rounds, setRounds] = useState([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        await apiRequest('/recreation/RPS/start', { method: 'POST' });
        const data = await apiRequest('/recreation/RPS');
        const loaded = data.questions || [];
        setRounds(loaded);
        if (loaded[0]?.questionId) {
          await apiRequest('/recreation/RPS/current-question', {
            method: 'POST',
            body: JSON.stringify({ questionId: loaded[0].questionId }),
          });
        }
        try {
          await notifyGameStarted('RPS');
        } catch (socketError) {
          Alert.alert('실시간 전환 실패', socketError.message);
        }
      } catch (error) {
        Alert.alert('진행 실패', error.message);
      }
    };

    load();
  }, []);

  const current = rounds[index];

  const complete = async () => {
    try {
      await apiRequest('/recreation/RPS/complete', { method: 'POST' });
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
    if (index + 1 >= rounds.length) {
      complete();
      return;
    }
    const nextIndex = index + 1;
    const nextRound = rounds[nextIndex];
    try {
      await apiRequest('/recreation/RPS/current-question', {
        method: 'POST',
        body: JSON.stringify({ questionId: nextRound.questionId }),
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
      await apiRequest(nextShowAnswer ? '/recreation/RPS/reveal-answer' : '/recreation/RPS/current-question', {
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
      <Text style={styles.roundText}>{current?.prompt || `Round ${rounds.length === 0 ? 0 : index + 1}`}</Text>

      <View style={styles.card}>
        <View style={styles.handRow}>
          {hands.map((hand) => (
            <View key={hand.key} style={styles.handBox}>
              <FontAwesome5 name={hand.icon} size={38} color="black" />
              <Text style={styles.handText}>{handLabels[hand.key]}</Text>
            </View>
          ))}
        </View>
        {showAnswer && <Text style={styles.answerText}>정답: {handLabels[current?.answer] || '-'}</Text>}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={toggleAnswer} disabled={!current}>
          <Text style={styles.buttonText}>정답 보기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={current ? goNext : () => router.back()}>
          <Text style={styles.buttonText}>{index + 1 >= rounds.length ? '완료' : '다음'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 50 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: '#FFF', marginBottom: 20 },
  roundText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  card: { width: '90%', minHeight: 300, backgroundColor: '#FFF', borderRadius: 15, padding: 24, alignItems: 'center', justifyContent: 'center' },
  handRow: { flexDirection: 'row', gap: 10 },
  handBox: { width: 88, height: 100, borderRadius: 10, borderWidth: 1, borderColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 8 },
  handText: { color: '#000', fontWeight: 'bold' },
  answerText: { marginTop: 28, fontSize: 22, fontWeight: 'bold', color: '#000' },
  footer: { position: 'absolute', bottom: 50, width: '90%', gap: 12 },
  primaryButton: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#DDD', padding: 15, borderRadius: 30, alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
