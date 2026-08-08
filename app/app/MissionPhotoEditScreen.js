import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest, toServerAssetUrl } from '../lib/api';
import { socket } from '../socket';

export default function MissionPhotoEditScreen() {
  const router = useRouter();
  const [missionText, setMissionText] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [started, setStarted] = useState(false);
  const [joinedSocketRoom, setJoinedSocketRoom] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [roomData, gameData] = await Promise.all([
          apiRequest('/rooms/default'),
          apiRequest('/recreation/MISSION_PHOTO'),
        ]);
        const nextRoomCode = roomData.room?.room_code || roomData.room?.roomCode || '';
        const nextRoomId = roomData.room?.room_id || roomData.room?.roomId || null;
        console.log('MissionPhotoEditScreen: loaded room', { nextRoomCode, nextRoomId, gameData });
        setRoomCode(nextRoomCode);
        if (nextRoomId) setRoomId(nextRoomId);
        setMissionText(gameData.questions?.[0]?.prompt || '');
      } catch (error) {
        Alert.alert('불러오기 실패', error.message);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!roomCode) return undefined;
    let mounted = true;

    const joinSocketRoom = () => {
      setJoinedSocketRoom(false);
      socket.timeout(5000).emit('joinRoom', { roomCode, role: 'host' }, (error, response) => {
        if (!mounted) return;
        if (error || !response?.ok) {
          Alert.alert('실시간 연결 실패', response?.message || 'Socket.IO 서버 응답이 없습니다.');
          return;
        }
        setJoinedSocketRoom(true);
      });
    };
    const handleDisconnect = () => {
      if (mounted) setJoinedSocketRoom(false);
    };

    socket.on('connect', joinSocketRoom);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) {
      joinSocketRoom();
    } else {
      socket.connect();
    }

    return () => {
      mounted = false;
      socket.off('connect', joinSocketRoom);
      socket.off('disconnect', handleDisconnect);
    };
  }, [roomCode]);

  useEffect(() => {
    const handleSubmitted = (submission) => {
      setSubmissions((current) => [submission, ...current]);
    };

    socket.on('missionPhoto:submitted', handleSubmitted);
    return () => {
      socket.off('missionPhoto:submitted', handleSubmitted);
    };
  }, []);

  const saveMission = async () => {
    const normalizedMissionText = missionText.trim();
    if (!normalizedMissionText) {
      Alert.alert('알림', '미션 문구를 입력해주세요.');
      return false;
    }
    if (normalizedMissionText.length > 100) {
      Alert.alert('알림', '미션 문구는 100자 이하로 입력해주세요.');
      return false;
    }

    const requestBody = { questions: [{ prompt: normalizedMissionText }] };
    console.log('[RecreationSave] request body:', requestBody);
    const result = await apiRequest('/recreation/MISSION_PHOTO', {
      method: 'PUT',
      body: JSON.stringify(requestBody),
    });
    console.log('[RecreationSave] response:', result);
    return true;
  };

  const startGame = async () => {
    if (!roomCode) {
      Alert.alert('시작 실패', '방 코드를 찾을 수 없습니다.');
      return;
    }

    setStarting(true);
    try {
      if (!(await saveMission())) {
        setStarting(false);
        return;
      }
      const startBody = { roomId };
      console.log('[RecreationSave] start request body:', startBody);
      const startResult = await apiRequest('/recreation/MISSION_PHOTO/start', {
        method: 'POST',
        body: JSON.stringify(startBody),
      });
      console.log('[RecreationSave] start response:', startResult);
      // TODO: MVP 이후에는 REST 성공 후 Socket.IO 실패 시 상태 불일치를 서버에서 함께 처리합니다.
      socket.timeout(5000).emit(
        'missionPhoto:start',
        { roomCode, missionText: missionText.trim() },
        (error, response) => {
          setStarting(false);
          if (error || !response?.ok) {
            Alert.alert('시작 실패', response?.message || 'Socket.IO 서버 응답이 없습니다.');
            return;
          }
          setSubmissions([]);
          setStarted(true);
        }
      );
    } catch (error) {
      setStarting(false);
      Alert.alert('시작 실패', error.message);
    }
  };

  const completeGame = async () => {
    setEnding(true);
    try {
      const completeBody = { roomId };
      console.log('[RecreationSave] complete request body:', completeBody);
      const completeResult = await apiRequest('/recreation/MISSION_PHOTO/complete', {
        method: 'POST',
        body: JSON.stringify(completeBody),
      });
      console.log('[RecreationSave] complete response:', completeResult);
      // TODO: MVP 이후에는 REST 성공 후 Socket.IO 실패 시 상태 불일치를 서버에서 함께 처리합니다.
      socket.timeout(5000).emit('endGame', { roomCode }, (error, response) => {
        setEnding(false);
        if (error || !response?.ok) {
          Alert.alert('완료 처리 실패', response?.message || 'Socket.IO 서버 응답이 없습니다.');
          return;
        }
        router.back();
      });
    } catch (error) {
      setEnding(false);
      Alert.alert('완료 처리 실패', error.message);
    }
  };

  const renderSubmission = ({ item }) => (
    <View style={styles.submission}>
      <Image source={{ uri: toServerAssetUrl(item.imageUri) }} style={styles.preview} />
      <View style={styles.submissionInfo}>
        <Text style={styles.participantName}>{item.participantName}</Text>
        <Text style={styles.submittedAt}>{new Date(item.submittedAt).toLocaleString()}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}><Ionicons name="camera-outline" size={30} color="white" /></View>
      <Text style={styles.logoText}>Playce</Text>

      <View style={styles.whiteBox}>
        <Text style={styles.title}>미션 사진 찍기</Text>
        <TextInput
          style={styles.input}
          placeholder="미션 문구를 입력하세요"
          placeholderTextColor="#999"
          value={missionText}
          onChangeText={setMissionText}
          maxLength={100}
          multiline
          editable={!started}
        />
        <Text style={styles.listTitle}>제출 목록 {submissions.length}건</Text>
        <FlatList
          data={submissions}
          renderItem={renderSubmission}
          keyExtractor={(_, index) => String(index)}
          ListEmptyComponent={<Text style={styles.emptyText}>아직 제출된 사진이 없습니다.</Text>}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.button}
          onPress={started ? completeGame : startGame}
          disabled={starting || ending || (!started && !joinedSocketRoom)}
        >
          <Text style={styles.buttonText}>
            {starting ? '시작 중...' : ending ? '완료 중...' : started ? '게임 완료' : '게임 시작'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center' },
  header: { width: '90%', alignItems: 'flex-end', marginTop: 10 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: '#FFF', marginBottom: 20 },
  whiteBox: { width: '90%', height: '64%', borderRadius: 15, backgroundColor: '#FFF', padding: 18 },
  title: { color: '#000', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 14 },
  input: { minHeight: 92, borderWidth: 1, borderColor: '#CCC', borderRadius: 10, padding: 12, color: '#000', textAlignVertical: 'top' },
  listTitle: { color: '#000', fontWeight: 'bold', marginTop: 18, marginBottom: 8 },
  submission: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EEE', paddingVertical: 10 },
  preview: { width: 76, height: 76, borderRadius: 8, backgroundColor: '#EEE' },
  submissionInfo: { flex: 1, marginLeft: 12 },
  participantName: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  submittedAt: { color: '#666', fontSize: 12, marginTop: 5 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 24 },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  button: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
