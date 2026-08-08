import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { notifyGameEnded, notifyGameStarted } from '../lib/recreationSocket';

export default function ChosungPlayerScreen() {
  const router = useRouter();
  const [sets, setSets] = useState([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await apiRequest('/recreation/CHOSUNG/start', { method: 'POST' });
        const data = await apiRequest('/recreation/CHOSUNG');
        const loaded = data.questions || [];
        setSets(loaded);
        if (loaded[0]?.questionId) {
          await apiRequest('/recreation/CHOSUNG/current-question', {
            method: 'POST',
            body: JSON.stringify({ questionId: loaded[0].questionId }),
          });
        }
        try {
          await notifyGameStarted('CHOSUNG');
        } catch (socketError) {
          Alert.alert('실시간 전환 실패', socketError.message);
        }
      } catch (error) {
        Alert.alert('진행 실패', error.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const current = sets[index];

  const complete = async () => {
    try {
      await apiRequest('/recreation/CHOSUNG/complete', { method: 'POST' });
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
    if (index + 1 >= sets.length) {
      complete();
      return;
    }

    const nextIndex = index + 1;
    const nextSet = sets[nextIndex];
    try {
      await apiRequest('/recreation/CHOSUNG/current-question', {
        method: 'POST',
        body: JSON.stringify({ questionId: nextSet.questionId }),
      });
      setIndex(nextIndex);
      setShowAnswer(false);
    } catch (error) {
      Alert.alert('문제 이동 실패', error.message);
    }
  };

  const toggleAnswer = async () => {
    if (!current) return;
    const nextShowAnswer = !showAnswer;
    try {
      await apiRequest(nextShowAnswer ? '/recreation/CHOSUNG/reveal-answer' : '/recreation/CHOSUNG/current-question', {
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
      <Text style={styles.roundText}>Round {sets.length === 0 ? 0 : index + 1}</Text>

      <View style={styles.card}>
        <Text style={styles.topicText}>{current?.option1 || '초성 퀴즈'}</Text>
        <Text style={styles.chosungText}>{loading ? '불러오는 중...' : current?.prompt || '등록된 문제가 없습니다.'}</Text>
        {showAnswer && <Text style={styles.answerText}>정답: {current?.answer || '-'}</Text>}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={toggleAnswer} disabled={!current}>
          <Text style={styles.buttonText}>{showAnswer ? '정답 숨기기' : '정답 보기'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={current ? goNext : () => router.back()}>
          <Text style={styles.buttonText}>{index + 1 >= sets.length ? '완료' : '다음'}</Text>
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
  topicText: { color: '#666', fontSize: 15, fontWeight: '900', marginBottom: 20 },
  chosungText: { color: '#000', fontSize: 58, fontWeight: '900', textAlign: 'center' },
  answerText: { marginTop: 28, fontSize: 22, fontWeight: 'bold', color: '#000', textAlign: 'center' },
  footer: { position: 'absolute', bottom: 50, width: '90%', gap: 12 },
  primaryButton: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#DDD', padding: 15, borderRadius: 30, alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
