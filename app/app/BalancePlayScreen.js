import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { notifyGameEnded, notifyGameStarted } from '../lib/recreationSocket';

export default function BalancePlayScreen() {
  const router = useRouter();
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setStarting(true);
      try {
        await apiRequest('/recreation/BALANCE/start', { method: 'POST' });
        const data = await apiRequest('/recreation/BALANCE');
        const loaded = data.questions || [];
        setQuestions(loaded);
        if (loaded[0]?.questionId) {
          await apiRequest('/recreation/BALANCE/current-question', {
            method: 'POST',
            body: JSON.stringify({ questionId: loaded[0].questionId }),
          });
        }
        try {
          await notifyGameStarted('BALANCE');
        } catch (socketError) {
          Alert.alert('실시간 전환 실패', socketError.message);
        }
      } catch (error) {
        Alert.alert('진행 실패', error.message);
      } finally {
        setStarting(false);
      }
    };

    load();
  }, []);

  const current = questions[index];

  const complete = async () => {
    try {
      await apiRequest('/recreation/BALANCE/complete', { method: 'POST' });
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
      await apiRequest('/recreation/BALANCE/current-question', {
        method: 'POST',
        body: JSON.stringify({ questionId: nextQuestion.questionId }),
      });
      setIndex(nextIndex);
    } catch (error) {
      Alert.alert('문제 이동 실패', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.logoText}>Playce</Text>
      <Text style={styles.roundText}>Balance {questions.length === 0 ? 0 : index + 1}</Text>

      <View style={styles.card}>
        <Text style={styles.questionText}>
          {starting ? '불러오는 중...' : current?.prompt || '등록된 문제가 없습니다.'}
        </Text>
        <View style={styles.optionBox}>
          <Text style={styles.optionLabel}>{current?.option1 || '선택지 1'}</Text>
        </View>
        <Text style={styles.vsText}>VS</Text>
        <View style={styles.optionBox}>
          <Text style={styles.optionLabel}>{current?.option2 || '선택지 2'}</Text>
        </View>
      </View>

      <View style={styles.footer}>
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
  card: { width: '90%', minHeight: 360, backgroundColor: '#FFF', borderRadius: 15, padding: 24, alignItems: 'center', justifyContent: 'center' },
  questionText: { color: '#000', fontSize: 23, fontWeight: 'bold', textAlign: 'center', marginBottom: 28 },
  optionBox: { width: '100%', minHeight: 64, borderRadius: 14, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', padding: 12 },
  optionLabel: { color: '#000', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  vsText: { color: '#000', fontSize: 18, fontWeight: '900', marginVertical: 14 },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  primaryButton: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
