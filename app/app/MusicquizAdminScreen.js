import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiRequest, serverFetch, SERVER_BASE_URL } from '../lib/api';
import { socket } from '../socket';

export default function MusicquizAdminScreen() {
  const router = useRouter();
  const soundRef = useRef(null);
  const stopTimerRef = useRef(null);
  const addRequestPendingRef = useRef(false);
  const [selectedTime, setSelectedTime] = useState(3);
  const [musicList, setMusicList] = useState([]);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeMusicId, setActiveMusicId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingMusic, setEditingMusic] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [roundResult, setRoundResult] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [roomCode, setRoomCode] = useState('');
  const [roomId, setRoomId] = useState(null);

  const stopLocalAudio = useCallback(async () => {
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    const sound = soundRef.current;
    soundRef.current = null;
    setIsPlaying(false);
    if (!sound) return;
    try {
      await sound.stopAsync();
    } catch {
      // The sound may already have reached its end.
    }
    await sound.unloadAsync();
  }, []);

  const loadQuestions = useCallback(async () => {
    try {
      const response = await serverFetch('/api/music-quiz/questions');
      const data = await response.json();
      console.log('[MusicQuiz] loaded questions:', { status: response.status, data });
      if (!response.ok) throw new Error(data.message);
      setMusicList(data);
    } catch (error) {
      console.error('[MusicQuiz] loadQuestions error', error);
      Alert.alert('오류', error.message || '음악 문제를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(console.error);
    loadQuestions();

    const handleStop = ({ result } = {}) => {
      setRoundResult(result || null);
      setActiveMusicId(null);
      stopLocalAudio().catch(console.error);
    };
    const handleAnswer = (submittedAnswer) => setAnswers((currentAnswers) => [...currentAnswers, submittedAnswer]);
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    socket.on('musicQuiz:stop', handleStop);
    socket.on('musicQuiz:correctAnswer', handleAnswer);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('musicQuiz:stop', handleStop);
      socket.off('musicQuiz:correctAnswer', handleAnswer);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      stopLocalAudio().catch(console.error);
    };
  }, [loadQuestions, stopLocalAudio]);

  useEffect(() => {
    let mounted = true;
    const joinSocketRoom = async () => {
      try {
        const data = await apiRequest('/rooms/default');
        const nextRoomCode = data.room?.room_code || data.room?.roomCode || '';
        const nextRoomId = data.room?.room_id || data.room?.roomId || null;
        if (nextRoomId) setRoomId(nextRoomId);
        if (!nextRoomCode || !mounted) return;
        setRoomCode(nextRoomCode);
        console.log('MusicquizAdminScreen: joining host room', { nextRoomCode, nextRoomId });
        socket.timeout(5000).emit('joinRoom', { roomCode: nextRoomCode, role: 'host' }, (error, response) => {
          if (mounted && (error || !response?.ok)) {
            Alert.alert('방 연결 오류', response?.message || 'Socket.IO 서버 응답이 없습니다.');
          }
        });
      } catch (error) {
        if (mounted) Alert.alert('방 연결 오류', error.message);
      }
    };
    socket.on('connect', joinSocketRoom);
    if (socket.connected) joinSocketRoom();
    else socket.connect();
    return () => {
      mounted = false;
      socket.off('connect', joinSocketRoom);
    };
  }, []);

  const pickMusicFile = async () => {
    console.log('[MusicQuiz] picking audio file');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });
      console.log('[MusicQuiz] selected file picker result', result);
      if (result.canceled || result.type === 'cancel') {
        console.log('[MusicQuiz] file picker cancelled');
        return;
      }
      const file = result.assets?.[0] || result;
      if (!file?.uri) {
        throw new Error('유효한 오디오 파일을 선택해주세요.');
      }

      const fileName = file.name || file.fileName || `music-${Date.now()}.mp3`;
      const extensionMimeTypes = {
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        wav: 'audio/wav',
        aac: 'audio/aac',
        ogg: 'audio/ogg',
        flac: 'audio/flac',
      };
      const extension = fileName.split('.').pop()?.toLowerCase();
      const providedMimeType = file.mimeType || file.type;
      const inferredMimeType = (
        !providedMimeType || providedMimeType === 'application/octet-stream'
          ? extensionMimeTypes[extension] || providedMimeType
          : providedMimeType
      ) || 'application/octet-stream';
      const audioFile = {
        uri: file.uri,
        name: fileName,
        mimeType: inferredMimeType,
        file: file.file,
      };

      console.log('[MusicQuiz] selected file:', audioFile);
      setSelectedFile(audioFile);
    } catch (error) {
      console.error('[MusicQuiz] pickMusicFile error', error);
      Alert.alert('오류', error.message || '파일 선택에 실패했습니다.');
    }
  };

  const addMusic = async () => {
    console.log('[MusicQuiz] add button clicked', { title, artist, selectedFile });
    if (addRequestPendingRef.current) return;
    if (!title.trim() || !artist.trim() || !selectedFile) {
      Alert.alert('오류', '곡 제목, 가수, 음악 파일을 모두 입력하세요.');
      return;
    }

    addRequestPendingRef.current = true;
    setIsSaving(true);
    try {
      console.log('[MusicQuiz] save request body:', {
        title: title.trim(),
        artist: artist.trim(),
        selectedFile,
      });
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('artist', artist.trim());
      if (Platform.OS === 'web' && selectedFile.file) {
        formData.append('audio', selectedFile.file, selectedFile.name);
      } else {
        formData.append('audio', {
          uri: selectedFile.uri,
          name: selectedFile.name,
          type: selectedFile.mimeType || 'audio/mpeg',
        });
      }
      const response = await serverFetch('/api/music-quiz/questions/create', {
        method: 'POST',
        body: formData,
      });
      const question = await response.json();
      console.log('[MusicQuiz] save response:', { status: response.status, question });
      if (!response.ok) throw new Error(question.message);

      setMusicList((questions) => [...questions, question]);
      setTitle('');
      setArtist('');
      setSelectedFile(null);
    } catch (error) {
      console.error('[MusicQuiz] addMusic error', error);
      Alert.alert('오류', error.message || '음악 문제를 저장하지 못했습니다.');
    } finally {
      addRequestPendingRef.current = false;
      setIsSaving(false);
    }
  };

  const beginEdit = (music) => {
    setEditingMusic(music);
    setTitle(music.title);
    setArtist(music.artist);
    setSelectedFile(null);
  };

  const cancelEdit = () => {
    setEditingMusic(null);
    setTitle('');
    setArtist('');
  };

  const saveEdit = async () => {
    if (!title.trim() || !artist.trim()) {
      Alert.alert('오류', '곡 제목과 가수를 모두 입력하세요.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await serverFetch(`/api/music-quiz/questions/${editingMusic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, artist }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.message);
      setMusicList((questions) => questions.map((question) => (
        question.id === editingMusic.id ? { ...question, ...updated } : question
      )));
      cancelEdit();
    } catch (error) {
      Alert.alert('오류', error.message || '음악 문제를 수정하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeMusic = async (id) => {
    setIsSaving(true);
    try {
      const response = await serverFetch(`/api/music-quiz/questions/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }
      setMusicList((questions) => questions.filter((question) => question.id !== id));
    } catch (error) {
      Alert.alert('오류', error.message || '음악 문제를 삭제하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const startQuiz = async (music) => {
    if (activeMusicId || !isConnected) {
      if (!isConnected) Alert.alert('연결 오류', '서버 연결을 확인해주세요.');
      return;
    }
    if (!roomId) {
      Alert.alert('오류', '방 ID를 찾을 수 없습니다.');
      return;
    }

    try {
      await stopLocalAudio();
      console.log('[MusicQuiz] start request body:', { roomId, roomCode, music, playTime: selectedTime });
      const startApiResult = await apiRequest('/recreation/MUSIC/start', {
        method: 'POST',
        body: JSON.stringify({ roomId }),
      });
      console.log('[MusicQuiz] start API response:', startApiResult);
      setAnswers([]);
      setRoundResult(null);
      const response = await new Promise((resolve, reject) => {
        socket.timeout(5000).emit('musicQuiz:start', { music, playTime: selectedTime }, (error, result) => {
          if (error) reject(new Error('서버 응답 시간이 초과되었습니다.'));
          else resolve(result);
        });
      });
      console.log('[MusicQuiz] musicQuiz:start response', response);
      if (!response?.ok) throw new Error(response?.message || '문제를 시작하지 못했습니다.');

      setActiveMusicId(String(music.id));
      const elapsedMs = Math.max(0, Date.now() - response.musicQuiz.startedAt);
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${SERVER_BASE_URL}${music.audioUrl}` },
        { shouldPlay: true, positionMillis: elapsedMs }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      stopTimerRef.current = setTimeout(
        () => stopLocalAudio().catch(console.error),
        Math.max(0, selectedTime * 1000 - elapsedMs)
      );
    } catch (error) {
      console.error('MusicquizAdminScreen: startQuiz error', error);
      await stopLocalAudio();
      socket.emit('musicQuiz:stop');
      Alert.alert('오류', error.message || '음악 재생에 실패했습니다.');
    }
  };

  const revealAnswer = () => {
    if (!activeMusicId) return;
    socket.emit('musicQuiz:stop');
  };

  const endQuiz = async () => {
    await stopLocalAudio();
    socket.emit('musicQuiz:end');
    try {
      await apiRequest('/recreation/MUSIC/complete', {
        method: 'POST',
        body: JSON.stringify({ roomId }),
      });
    } catch (error) {
      console.error('MusicquizAdminScreen: endQuiz error', error);
      Alert.alert('완료 처리 실패', error.message);
      return;
    }
    router.back();
  };

  const renderMusicItem = ({ item }) => (
    <View key={item.id} style={styles.musicCard}>
      <View style={styles.musicInfo}>
        <Text style={styles.musicTitle}>{item.title}</Text>
        <Text style={styles.artist}>{item.artist}</Text>
        <Text style={styles.fileName}>{item.fileName}</Text>
        <View style={styles.quizActions}>
          <TouchableOpacity style={styles.startAction} onPress={() => startQuiz(item)} disabled={Boolean(activeMusicId)}>
            <Text style={styles.startActionText}>
              {String(item.id) === activeMusicId ? (isPlaying ? '재생 중' : '입력 받는 중') : '이 음악으로 시작'}
            </Text>
          </TouchableOpacity>
          {String(item.id) === activeMusicId && (
            <TouchableOpacity style={styles.revealAction} onPress={revealAnswer}>
              <Text style={styles.revealActionText}>정답 공개</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <TouchableOpacity onPress={() => beginEdit(item)} disabled={Boolean(activeMusicId) || isSaving}>
        <Text style={styles.action}>수정</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => removeMusic(item.id)} disabled={Boolean(activeMusicId) || isSaving}>
        <Text style={styles.delete}>x</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.logo}>Playce</Text>
      <Text style={styles.title}>음악 퀴즈 관리자</Text>
      <Text style={styles.room}>방 코드: {roomCode || '불러오는 중'}</Text>
      <Text style={[styles.connection, isConnected ? styles.connected : styles.disconnected]}>
        {isConnected ? '서버 연결됨' : '서버 연결 끊김 · 재연결 중'}
      </Text>
      <Text style={styles.label}>전주 재생 시간</Text>
      <View style={styles.timeContainer}>
        {[1, 3, 5].map((time) => (
          <TouchableOpacity
            key={time}
            style={[styles.timeButton, selectedTime === time && styles.selectedButton]}
            onPress={() => setSelectedTime(time)}
          >
            <Text style={styles.timeText}>{time}초</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>{editingMusic ? '음악 정보 수정' : '음악 추가'}</Text>
      <TextInput style={styles.input} placeholder="곡 제목" value={title} onChangeText={setTitle} />
      <TextInput style={styles.input} placeholder="가수" value={artist} onChangeText={setArtist} />
      {!editingMusic && (
        <TouchableOpacity style={styles.fileButton} onPress={pickMusicFile} disabled={isSaving}>
          <Text>{selectedFile?.name || '음악 파일 선택'}</Text>
        </TouchableOpacity>
      )}
      {editingMusic ? (
        <View style={styles.formActions}>
          <TouchableOpacity style={styles.addButton} onPress={saveEdit} disabled={isSaving}>
            <Text style={styles.buttonText}>{isSaving ? '저장 중...' : '수정 저장'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={cancelEdit} disabled={isSaving}>
            <Text style={styles.buttonText}>취소</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addButton} onPress={addMusic} disabled={isSaving}>
          <Text style={styles.buttonText}>{isSaving ? '저장 중...' : '+ 음악 추가하기'}</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.label}>곡 목록</Text>
      <View style={styles.list}>
        {musicList.length > 0
          ? musicList.map((item) => renderMusicItem({ item }))
          : <Text style={styles.empty}>등록된 음악이 없습니다.</Text>}
      </View>
      {activeMusicId && (
        <Text style={styles.playing}>
          {isPlaying ? '음악 재생 중' : '참가자 입력 받는 중'} · 정답자 {answers.length}명
        </Text>
      )}
      {roundResult && <Text style={styles.playing}>결과 · 정답 {roundResult.correctCount}명 / 제출 {roundResult.totalSubmissions}명</Text>}
      {answers.length > 0 && <Text style={styles.answers}>{answers.map(({ nickname, teamName }) => `${nickname} · ${teamName}`).join(' / ')}</Text>}
      <TouchableOpacity style={styles.endButton} onPress={endQuiz}>
        <Text style={styles.buttonText}>게임 종료</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#000', paddingTop: 55, alignItems: 'center', paddingHorizontal: 20 },
  logo: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 10 },
  room: { color: '#bbb', marginTop: 8 },
  connection: { marginTop: 4, fontSize: 12, fontWeight: '700' },
  connected: { color: '#70d68a' },
  disconnected: { color: '#ff8a8a' },
  label: { color: '#fff', marginTop: 16, marginBottom: 8, fontWeight: '600', alignSelf: 'flex-start' },
  timeContainer: { flexDirection: 'row', gap: 8, width: '100%' },
  timeButton: { flex: 1, backgroundColor: '#fff', padding: 12, borderRadius: 12, alignItems: 'center' },
  selectedButton: { backgroundColor: '#bbb' },
  timeText: { color: '#000', fontWeight: '700' },
  input: { width: '100%', height: 45, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, marginBottom: 8 },
  fileButton: { width: '100%', backgroundColor: '#fff', padding: 13, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  addButton: { width: '100%', backgroundColor: '#fff', padding: 13, borderRadius: 12, alignItems: 'center' },
  cancelButton: { width: '100%', backgroundColor: '#bbb', padding: 13, borderRadius: 12, alignItems: 'center' },
  formActions: { width: '100%', gap: 8 },
  buttonText: { color: '#000', fontWeight: '700' },
  list: { width: '100%' },
  empty: { color: '#aaa', textAlign: 'center', paddingVertical: 16 },
  musicCard: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  musicInfo: { flex: 1 },
  musicTitle: { color: '#000', fontSize: 16, fontWeight: '700' },
  artist: { color: '#444', marginTop: 3 },
  fileName: { color: '#777', fontSize: 11, marginTop: 3 },
  quizActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  startAction: { alignSelf: 'flex-start', backgroundColor: '#000', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10 },
  startActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  revealAction: { alignSelf: 'flex-start', backgroundColor: '#f4c542', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10 },
  revealActionText: { color: '#000', fontSize: 12, fontWeight: '700' },
  action: { color: '#000', fontWeight: '700', padding: 8 },
  delete: { color: '#000', fontSize: 22, padding: 8 },
  playing: { color: '#fff', marginTop: 10, fontWeight: '700' },
  answers: { color: '#ddd', marginTop: 7, fontSize: 12 },
  endButton: { width: '100%', backgroundColor: '#fff', padding: 13, borderRadius: 20, alignItems: 'center', marginTop: 10, marginBottom: 20 },
});
