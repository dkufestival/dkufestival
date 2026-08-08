import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest, getCurrentUser, setActiveRoomId } from '../lib/api';

export default function AdminMainScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportCount, setReportCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const lastNotificationIdRef = useRef(null);
  const notificationReadyRef = useRef(false);
  const user = getCurrentUser();

  const hostId = user?.userId || user?.user_id || user?.id || 1;

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/rooms?hostId=${hostId}`);
      setRooms(data.rooms || []);
      const firstRoom = data.rooms?.[0];
      setSelectedRoomId((currentRoomId) => {
        if (currentRoomId || !firstRoom) return currentRoomId;
        setActiveRoomId(firstRoom.roomId);
        return firstRoom.roomId;
      });
    } catch (error) {
      Alert.alert('방 조회 실패', error.message);
    } finally {
      setLoading(false);
    }
  }, [hostId]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    let mounted = true;
    notificationReadyRef.current = false;
    lastNotificationIdRef.current = null;

    const loadReports = async () => {
      if (!selectedRoomId) {
        setReportCount(0);
        setNotificationCount(0);
        return;
      }

      try {
        const [attendanceData, notificationData] = await Promise.all([
          apiRequest(`/attendance?roomId=${selectedRoomId}`),
          apiRequest(`/notifications?roomId=${selectedRoomId}`),
        ]);
        if (!mounted) return;
        setReportCount((attendanceData.members || []).filter((member) => member.note).length);
        const notifications = notificationData.notifications || [];
        setNotificationCount(notifications.length);

        const latest = notifications[0];
        if (latest?.id && notificationReadyRef.current && latest.id !== lastNotificationIdRef.current) {
          Alert.alert(
            latest.type === 'RETURN' ? '복귀 보고' : latest.type === 'LEAVE' ? '방 나가기' : '이동 보고',
            latest.message
          );
        }
        if (latest?.id) {
          lastNotificationIdRef.current = latest.id;
        }
        notificationReadyRef.current = true;
      } catch {
        if (mounted) {
          setReportCount(0);
          setNotificationCount(0);
        }
      }
    };

    loadReports();
    const timer = setInterval(loadReports, 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [selectedRoomId]);

  const selectRoom = (roomId) => {
    setSelectedRoomId(roomId);
    setActiveRoomId(roomId);
  };

  const createRoom = async () => {
    try {
      const title = newRoomTitle.trim() || `방 ${rooms.length + 1}`;
      const data = await apiRequest('/rooms', {
        method: 'POST',
        body: JSON.stringify({ hostId, title }),
      });
      setNewRoomTitle('');
      setRooms([data.room, ...rooms]);
      selectRoom(data.room.roomId);
    } catch (error) {
      Alert.alert('방 생성 실패', error.message);
    }
  };

  const requireRoom = (route) => {
    if (!selectedRoomId) {
      Alert.alert('알림', '먼저 제어할 방을 선택하거나 생성해주세요.');
      return;
    }
    router.push(route);
  };

  const openCollaborationTools = () => {
    const room = rooms.find((item) => item.roomId === selectedRoomId);
    if (!room) {
      Alert.alert('알림', '먼저 제어할 방을 선택하거나 생성해주세요.');
      return;
    }
    router.push({
      pathname: '/TeamScoreNoticeScreen',
      params: { roomCode: room.roomCode, roomId: room.roomId },
    });
  };

  const openNoticeTools = () => {
    const room = rooms.find((item) => item.roomId === selectedRoomId);
    if (!room) {
      Alert.alert('알림', '먼저 제어할 방을 선택하거나 생성해주세요.');
      return;
    }
    router.push({
      pathname: '/NoticeAdminScreen',
      params: { roomCode: room.roomCode, roomId: room.roomId },
    });
  };

  const renderRoom = ({ item }) => {
    const selected = selectedRoomId === item.roomId;
    return (
      <TouchableOpacity
        style={[styles.roomItem, selected ? styles.roomItemSelected : null]}
        onPress={() => selectRoom(item.roomId)}
      >
        <View style={styles.roomInfo}>
          <Text style={[styles.roomTitle, selected ? styles.selectedText : null]}>{item.title}</Text>
          <Text style={[styles.roomCode, selected ? styles.selectedText : null]}>코드 {item.roomCode}</Text>
        </View>
        <Text style={[styles.roomBadge, selected ? styles.selectedBadge : null]}>
          {selected ? '제어중' : '선택'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.logoContainer}>
        <TouchableOpacity style={styles.notificationButton} onPress={() => requireRoom('/NotificationScreen')}>
          <Ionicons name="notifications-outline" size={28} color="white" />
          {notificationCount > 0 && <View style={styles.notificationDot} />}
        </TouchableOpacity>
        <Text style={styles.logoText}>Playce</Text>
      </View>

      <View style={styles.roomPanel}>
        <View style={styles.createRow}>
          <TextInput
            style={styles.roomInput}
            placeholder="방 이름"
            placeholderTextColor="#777"
            value={newRoomTitle}
            onChangeText={setNewRoomTitle}
          />
          <TouchableOpacity style={styles.createButton} onPress={createRoom}>
            <Text style={styles.createButtonText}>생성</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color="#000" /></View>
        ) : (
          <FlatList
            data={rooms}
            renderItem={renderRoom}
            keyExtractor={(item) => String(item.roomId)}
            style={styles.roomList}
            ListEmptyComponent={<Text style={styles.emptyText}>생성된 방이 없습니다.</Text>}
          />
        )}
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.menuButton} onPress={() => requireRoom('/AttendanceScreen')}>
          <Text style={styles.buttonText}>인원파악</Text>
          {reportCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{reportCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={() => requireRoom('/RecreationCreateScreen')}>
          <Text style={styles.buttonText}>레크레이션</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={openCollaborationTools}>
          <Text style={styles.buttonText}>팀/점수</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={openNoticeTools}>
          <Text style={styles.buttonText}>공지</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={() => requireRoom('/ScheduleScreen')}>
          <Text style={styles.buttonText}>일정</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footerContainer}>
        <TouchableOpacity style={styles.whiteButton} onPress={() => router.replace('/')}>
          <Text style={styles.buttonText}>종료</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center' },
  logoContainer: { width: '85%', marginTop: 34, marginBottom: 12, alignItems: 'center' },
  notificationButton: { position: 'absolute', right: 0, top: 4, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  notificationDot: { position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: 5, backgroundColor: '#ff3b30' },
  logoText: { fontSize: 48, fontWeight: 'bold', color: '#FFF' },
  roomPanel: { width: '85%', height: 182, backgroundColor: '#FFF', borderRadius: 15, padding: 12, marginBottom: 14 },
  createRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  roomInput: { flex: 1, height: 42, backgroundColor: '#EEE', borderRadius: 10, paddingHorizontal: 12, color: '#000' },
  createButton: { width: 70, height: 42, borderRadius: 10, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  createButtonText: { color: '#FFF', fontWeight: 'bold' },
  roomList: { flex: 1 },
  roomItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#DDD', marginBottom: 8 },
  roomItemSelected: { backgroundColor: '#000', borderColor: '#000' },
  roomInfo: { flex: 1 },
  roomTitle: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  roomCode: { color: '#555', fontSize: 12, marginTop: 2 },
  selectedText: { color: '#FFF' },
  roomBadge: { color: '#555', fontSize: 12, fontWeight: 'bold' },
  selectedBadge: { color: '#FFF' },
  loadingBox: { flex: 1, justifyContent: 'center' },
  emptyText: { color: '#777', textAlign: 'center', marginTop: 30, fontWeight: 'bold' },
  menuContainer: { width: '85%', gap: 12 },
  menuButton: { backgroundColor: '#FFF', height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  badge: { position: 'absolute', right: 18, minWidth: 26, height: 26, borderRadius: 13, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  badgeText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  whiteButton: { backgroundColor: '#FFF', height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  footerContainer: { width: '85%', marginTop: 14, paddingBottom: 18 },
});
