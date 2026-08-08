import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { apiRequest, getCurrentMember, SERVER_BASE_URL } from '../lib/api';
import { socket } from '../socket';

export default function MusicquizPlayerScreen() {
  const router = useRouter();
  const soundRef = useRef(null);
  const stopTimerRef = useRef(null);
  const pulseLoopRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [quizState, setQuizState] = useState('waiting');
  const [music, setMusic] = useState(null);
  const [answer, setAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [roundResult, setRoundResult] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);

  const stopAudio = useCallback(async () => {
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    pulseLoopRef.current?.stop();
    pulseAnim.setValue(1);
    const sound = soundRef.current;
    soundRef.current = null;
    if (!sound) return;
    try {
      await sound.stopAsync();
    } catch {
      // The sound may already have reached its end.
    }
    await sound.unloadAsync();
  }, [pulseAnim]);

  const showResult = useCallback(async (resultMusic, result) => {
    await stopAudio();
    if (resultMusic) setMusic(resultMusic);
    if (result) setRoundResult(result);
    setQuizState('result');
  }, [stopAudio]);

  const playQuestion = useCallback(async (data) => {
    await stopAudio();
    setMusic(data.music);
    setQuizState('playing');
    setAnswer('');
    setIsSubmitted(false);
    setRoundResult(null);

    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();

    const remainingMs = data.remainingMs ?? data.playTime * 1000;
    if (remainingMs <= 0) {
      await stopAudio();
      return;
    }

    try {
      const elapsedMs = Math.max(0, data.playTime * 1000 - remainingMs);
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${SERVER_BASE_URL}${data.music.audioUrl}` },
        { shouldPlay: true, positionMillis: elapsedMs }
      );
      soundRef.current = sound;
      stopTimerRef.current = setTimeout(() => stopAudio().catch(console.error), remainingMs);
    } catch {
      await stopAudio();
      Alert.alert('오류', '음악 재생에 실패했습니다.');
    }
  }, [pulseAnim, stopAudio]);

  const syncQuestion = useCallback(() => {
    socket.emit('musicQuiz:sync', (response) => {
      if (!response?.musicQuiz) return;
      if (response.musicQuiz.status === 'result') {
        showResult(response.musicQuiz.music, response.musicQuiz.result).catch(console.error);
      } else {
        playQuestion(response.musicQuiz).catch(console.error);
      }
    });
  }, [playQuestion, showResult]);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(console.error);
    const handleStart = (data) => {
      console.log('MusicquizPlayerScreen: received musicQuiz:start', data);
      return playQuestion(data).catch(console.error);
    };
    const handleStop = ({ music: resultMusic, result } = {}) => {
      console.log('MusicquizPlayerScreen: received musicQuiz:stop', { resultMusic, result });
      return showResult(resultMusic, result).catch(console.error);
    };
    const handleConnect = () => {
      console.log('MusicquizPlayerScreen: socket connected');
      setIsConnected(true);
    };
    const handleDisconnect = () => {
      console.log('MusicquizPlayerScreen: socket disconnected');
      setIsConnected(false);
    };
    const handleEnd = () => {
      console.log('MusicquizPlayerScreen: received musicQuiz:end');
      stopAudio().catch(console.error);
      router.replace('/ParticipantHomeScreen');
    };
    const handleNavigate = ({ roomCode } = {}) => {
      console.log('MusicquizPlayerScreen: received musicQuiz:navigate', { roomCode });
      if (roomCode) {
        syncQuestion();
      }
    };

    socket.on('musicQuiz:start', handleStart);
    socket.on('musicQuiz:stop', handleStop);
    socket.on('musicQuiz:end', handleEnd);
    socket.on('musicQuiz:navigate', handleNavigate);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    const joinSocketRoom = async () => {
      try {
        const data = await apiRequest('/rooms/current');
        const roomCode = data.room?.roomCode;
        if (!roomCode) return;
        socket.timeout(5000).emit(
          'joinRoom',
          {
            roomCode,
            role: 'participant',
            nickname: getCurrentMember()?.nickname || getCurrentMember()?.name,
            memberId: getCurrentMember()?.memberId,
          },
          (error, response) => {
            if (error || !response?.ok) {
              Alert.alert('방 연결 오류', response?.message || 'Socket.IO 서버 응답이 없습니다.');
              return;
            }
            syncQuestion();
          }
        );
      } catch (error) {
        Alert.alert('방 연결 오류', error.message);
      }
    };
    socket.on('connect', joinSocketRoom);
    if (socket.connected) joinSocketRoom();
    else socket.connect();

    return () => {
      socket.off('musicQuiz:start', handleStart);
      socket.off('musicQuiz:stop', handleStop);
      socket.off('musicQuiz:end', handleEnd);
      socket.off('musicQuiz:navigate', handleNavigate);
      socket.off('connect', handleConnect);
      socket.off('connect', joinSocketRoom);
      socket.off('disconnect', handleDisconnect);
      stopAudio().catch(console.error);
    };
  }, [playQuestion, router, showResult, stopAudio, syncQuestion]);

  const submitAnswer = () => {
    if (!answer.trim()) {
      Alert.alert('오류', '정답을 입력하세요.');
      return;
    }
    if (!isConnected) {
      Alert.alert('연결 오류', '서버 재연결 후 다시 제출해주세요.');
      return;
    }
    console.log('MusicquizPlayerScreen: submitAnswer payload', { answer });
    socket.timeout(5000).emit('musicQuiz:submitAnswer', { answer }, (error, response) => {
      if (error) {
        console.error('MusicquizPlayerScreen: submitAnswer timeout', error);
        Alert.alert('오류', '서버 응답 시간이 초과되었습니다.');
        return;
      }
      console.log('MusicquizPlayerScreen: submitAnswer response', response);
      if (!response?.ok) {
        Alert.alert('오류', response?.message || '정답을 제출하지 못했습니다.');
        return;
      }
      setIsSubmitted(true);
      Alert.alert('제출 완료', '정답이 제출되었습니다.');
    });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.reportButton} onPress={() => router.replace('/ParticipantHomeScreen?report=1')}>
        <Ionicons name="megaphone-outline" size={28} color="#FFF" />
      </TouchableOpacity>
      <Text style={styles.logo}>Playce</Text>
      <Text style={styles.title}>음악 퀴즈</Text>
      <Text style={[styles.connection, isConnected ? styles.connected : styles.disconnected]}>
        {isConnected ? '서버 연결됨' : '서버 연결 끊김 · 재연결 중'}
      </Text>
      {quizState === 'waiting' && <Text style={styles.waiting}>문제를 기다리는 중...</Text>}
      {quizState === 'playing' && (
        <>
          <Animated.View style={[styles.circle, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.musicIcon}>♪</Text>
          </Animated.View>
          <Text style={styles.playing}>노래 제목을 입력하세요</Text>
          <Text style={styles.time}>정답 공개 전까지 제출할 수 있습니다.</Text>
          <TextInput
            style={styles.input}
            placeholder="노래 제목 입력"
            value={answer}
            onChangeText={setAnswer}
            editable={!isSubmitted}
          />
          <TouchableOpacity style={[styles.submitButton, isSubmitted && styles.disabledButton]} onPress={submitAnswer} disabled={isSubmitted}>
            <Text style={styles.submitText}>{isSubmitted ? '제출 완료' : '제출하기'}</Text>
          </TouchableOpacity>
        </>
      )}
      {quizState === 'result' && music && (
        <>
          <Text style={styles.resultLabel}>정답</Text>
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>{music.title}</Text>
            <Text style={styles.resultArtist}>{music.artist}</Text>
            {roundResult && (
              <>
                <Text style={[styles.judgement, roundResult.isCorrect ? styles.correct : styles.incorrect]}>
                  {roundResult.isCorrect ? '정답입니다' : '오답입니다'}
                </Text>
                <Text style={styles.summary}>
                  내 답안: {roundResult.submittedAnswer || '미제출'} · 전체 정답 {roundResult.correctCount}명 / 제출 {roundResult.totalSubmissions}명
                </Text>
              </>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 90, paddingHorizontal: 20 },
  reportButton: { position: 'absolute', top: 54, right: 22, zIndex: 2, padding: 8 },
  logo: { color: '#fff', fontSize: 42, fontWeight: 'bold' },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 20 },
  connection: { marginTop: 8, fontSize: 12, fontWeight: '700' },
  connected: { color: '#70d68a' },
  disconnected: { color: '#ff8a8a' },
  waiting: { color: '#fff', marginTop: 100, fontSize: 22 },
  circle: { width: 180, height: 180, borderRadius: 90, borderWidth: 2, borderColor: '#fff', justifyContent: 'center', alignItems: 'center', marginTop: 55 },
  musicIcon: { color: '#fff', fontSize: 80 },
  playing: { color: '#fff', fontSize: 25, marginTop: 30, fontWeight: '700' },
  time: { color: '#fff', fontSize: 20, marginTop: 8 },
  input: { width: '100%', height: 55, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, marginTop: 35 },
  submitButton: { width: '100%', height: 55, backgroundColor: '#fff', borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  disabledButton: { opacity: 0.5 },
  submitText: { color: '#000', fontSize: 18, fontWeight: '700' },
  resultLabel: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 80 },
  resultBox: { width: '100%', height: 180, backgroundColor: '#fff', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 25 },
  resultTitle: { fontSize: 34, fontWeight: 'bold', color: '#000' },
  resultArtist: { fontSize: 22, color: '#444', marginTop: 15 },
  judgement: { fontSize: 18, fontWeight: '700', marginTop: 20 },
  correct: { color: '#16853c' },
  incorrect: { color: '#c73434' },
  summary: { color: '#555', fontSize: 13, marginTop: 10, paddingHorizontal: 12, textAlign: 'center' },
});
