import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { notifyGameEnded, notifyGameStarted } from '../lib/recreationSocket';
import { socket } from '../socket';

export default function RoulettePlayerScreen() {
  const router = useRouter();
  const [options, setOptions] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState('');
  const [displayText, setDisplayText] = useState('');
  const cycleTimerRef = useRef(null);
  const finishTimerRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        await apiRequest('/recreation/ROULETTE/start', { method: 'POST' });
        const data = await apiRequest('/recreation/ROULETTE');
        setOptions(data.questions || []);
        await apiRequest('/recreation/ROULETTE/current-question', { method: 'POST' });
        try {
          await notifyGameStarted('ROULETTE');
        } catch (socketError) {
          Alert.alert('실시간 전환 실패', socketError.message);
        }
      } catch (error) {
        Alert.alert('진행 실패', error.message);
      }
    };

    load();
  }, []);

  useEffect(() => () => {
    if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
  }, []);

  const spin = async () => {
    const candidates = options.filter((option) => option.prompt);
    if (candidates.length === 0) {
      Alert.alert('알림', '등록된 룰렛 옵션이 없습니다.');
      return;
    }

    if (spinning) return;
    setResult('');
    setSpinning(true);
    const nextResult = candidates[Math.floor(Math.random() * candidates.length)];
    const duration = 2400;
    socket.emit('roulette:spin', { result: nextResult.prompt, duration, options: candidates.map((candidate) => candidate.prompt) }, (response) => {
      if (response?.ok === false) Alert.alert('룰렛 동기화 실패', response.message);
    });
    if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    setDisplayText(nextResult.prompt);
    cycleTimerRef.current = setInterval(() => {
      const randomCandidate = candidates[Math.floor(Math.random() * candidates.length)];
      setDisplayText(randomCandidate?.prompt || '');
    }, 70);
    finishTimerRef.current = setTimeout(async () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = null;
      setDisplayText(nextResult.prompt);
      setResult(nextResult.prompt);
      setSpinning(false);
      try {
        await apiRequest('/recreation/ROULETTE/reveal-answer', {
          method: 'POST',
          body: JSON.stringify({ questionId: nextResult.questionId, promptIndex: 0 }),
        });
      } catch (error) {
        Alert.alert('결과 공개 실패', error.message);
      }
    }, duration);
  };

  const complete = async () => {
    try {
      await apiRequest('/recreation/ROULETTE/complete', { method: 'POST' });
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.logoText}>Playce</Text>
      <Text style={styles.roundText}>룰렛</Text>

      <View style={styles.card}>
        <View style={[styles.wheel, spinning ? styles.wheelSpinning : null]}>
          <Text style={styles.wheelLabel}>{spinning ? '돌리는 중...' : '룰렛'}</Text>
          <Text style={styles.wheelText}>{displayText || options.map((option) => option.prompt).filter(Boolean).join(' / ') || '옵션 없음'}</Text>
        </View>
        {result ? <Text style={styles.answerText}>결과: {result}</Text> : null}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={spin} disabled={spinning}>
          <Text style={styles.buttonText}>{spinning ? '진행 중' : '룰렛 시작'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={complete}>
          <Text style={styles.buttonText}>완료</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 50 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: '#FFF', marginBottom: 20 },
  roundText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  card: { width: '90%', minHeight: 390, backgroundColor: '#FFF', borderRadius: 15, padding: 24, alignItems: 'center', justifyContent: 'center' },
  wheel: { width: 230, height: 230, borderRadius: 115, borderWidth: 8, borderColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: '#EEE' },
  wheelSpinning: { borderColor: '#777', backgroundColor: '#DDD' },
  wheelLabel: { color: '#666', fontSize: 13, fontWeight: 'bold', marginBottom: 10 },
  wheelText: { color: '#000', fontSize: 17, fontWeight: 'bold', textAlign: 'center' },
  answerText: { marginTop: 28, fontSize: 22, fontWeight: 'bold', color: '#000', textAlign: 'center' },
  footer: { position: 'absolute', bottom: 50, width: '90%', gap: 12 },
  primaryButton: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#DDD', padding: 15, borderRadius: 30, alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
