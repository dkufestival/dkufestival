import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { apiRequest, setActiveRoomId } from '../lib/api';
import { normalizeRoomCode, socket } from '../socket';

export default function NoticeAdminScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const roomCode = normalizeRoomCode(params.roomCode);
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const [noticeText, setNoticeText] = useState('');
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadNotices = useCallback(async () => {
    if (!roomCode) return;
    setLoading(true);
    try {
      const data = await apiRequest(`/rooms/${roomCode}/host-notices`);
      setNotices(data.notices || []);
    } catch (error) {
      Alert.alert('공지 조회 실패', error.message);
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    if (roomId) setActiveRoomId(roomId);
  }, [roomId]);

  useEffect(() => {
    if (!roomCode) return undefined;

    const joinAsHost = () => {
      socket.timeout(5000).emit('joinRoom', { roomCode, role: 'host' }, (error, response) => {
        if (error || !response?.ok) {
          Alert.alert('실시간 연결 실패', response?.message || '서버 연결을 확인해주세요.');
        }
      });
    };
    const handleNoticeReceived = (data = {}) => {
      if (normalizeRoomCode(data.roomCode) !== roomCode || !data.notice) return;
      setNotices((current) => [data.notice, ...current].slice(0, 20));
    };

    socket.on('connect', joinAsHost);
    socket.on('notice:received', handleNoticeReceived);
    if (socket.connected) joinAsHost();
    else socket.connect();
    loadNotices();

    return () => {
      socket.off('connect', joinAsHost);
      socket.off('notice:received', handleNoticeReceived);
    };
  }, [loadNotices, roomCode]);

  const sendNotice = () => {
    const message = noticeText.trim();
    if (!message) {
      Alert.alert('알림', '공지 내용을 입력해주세요.');
      return;
    }

    socket.timeout(5000).emit('notice:send', { roomCode, message }, (error, response) => {
      if (error || !response?.ok) {
        Alert.alert('공지 전송 실패', response?.message || '서버 연결을 확인해주세요.');
        return;
      }
      setNoticeText('');
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.logoText}>Playce</Text>
        <TouchableOpacity style={styles.iconButton} onPress={loadNotices}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={styles.roomText}>방 코드 {roomCode || '-'}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator color="#fff" style={{ marginBottom: 12 }} />}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>공지 작성</Text>
          <TextInput
            style={styles.noticeInput}
            value={noticeText}
            onChangeText={setNoticeText}
            placeholder="참가자에게 전달할 공지를 입력하세요"
            placeholderTextColor="#777"
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendNotice}>
            <Text style={styles.sendButtonText}>공지 보내기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>최근 공지</Text>
          {notices.length === 0 ? (
            <Text style={styles.emptyText}>등록된 공지가 없습니다.</Text>
          ) : notices.map((notice) => (
            <View key={notice.noticeId || notice.id} style={styles.noticeItem}>
              <Text style={styles.noticeMessage}>{notice.message}</Text>
              <Text style={styles.noticeTime}>{String(notice.createdAt || '').slice(0, 16).replace('T', ' ')}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { height: 74, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 38, fontWeight: 'bold', color: '#FFF' },
  roomText: { color: '#bbb', textAlign: 'center', marginBottom: 12, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 34, gap: 14 },
  panel: { backgroundColor: '#FFF', borderRadius: 15, padding: 14 },
  panelTitle: { color: '#000', fontSize: 18, fontWeight: '900', marginBottom: 12 },
  noticeInput: { minHeight: 120, borderRadius: 12, backgroundColor: '#EEE', color: '#000', padding: 12, textAlignVertical: 'top', fontWeight: '700' },
  sendButton: { height: 44, borderRadius: 22, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  sendButtonText: { color: '#FFF', fontWeight: '900' },
  emptyText: { color: '#777', textAlign: 'center', paddingVertical: 12, fontWeight: '700' },
  noticeItem: { marginTop: 10, borderRadius: 10, backgroundColor: '#F2F2F2', padding: 10 },
  noticeMessage: { color: '#000', fontSize: 14, fontWeight: '800' },
  noticeTime: { color: '#777', fontSize: 11, fontWeight: '700', marginTop: 5 },
});
