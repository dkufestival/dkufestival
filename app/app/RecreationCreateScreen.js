import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

const ROUTES = {
  OX: { editRoute: '/QuizEditScreen', playRoute: '/QuizPlayScreen' },
  RPS: { editRoute: '/RPSQuizEditScreen', playRoute: '/RPSPlayScreen' },
  IMAGE: { editRoute: '/ImageQuizEditScreen', playRoute: '/ImagePlayScreen' },
  WORD: { editRoute: '/WordQuizEditScreen', playRoute: '/WordPlayScreen' },
  CHOSUNG: { editRoute: '/ChosungAdminScreen', playRoute: '/ChosungPlayerScreen' },
  ANONYMOUS: { editRoute: '/AnonymousEditScreen', playRoute: '/AnonymousPlayScreen' },
  BALANCE: { editRoute: '/BalanceEditScreen', playRoute: '/BalancePlayScreen' },
  ROULETTE: { editRoute: '/RouletteAdminScreen', playRoute: '/RoulettePlayerScreen' },
  MISSION_PHOTO: { editRoute: '/MissionPhotoEditScreen', playRoute: '/MissionPhotoEditScreen' },
  MUSIC: { editRoute: '/MusicquizAdminScreen', playRoute: '/MusicquizAdminScreen' },
};

export default function RecreationCreateScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('progress'); // 'progress' 또는 'edit'
  const [games, setGames] = useState([]);
  const [availableGames, setAvailableGames] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const lastNotificationIdRef = useRef(null);
  const notificationReadyRef = useRef(false);

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/recreation');
      const availableData = await apiRequest('/recreation/available/list');
      setGames((data.games || []).map((game) => ({ ...game, ...(ROUTES[game.type] || {}) })));
      setAvailableGames((availableData.games || []).map((game) => ({ ...game, ...(ROUTES[game.type] || {}) })));
    } catch (error) {
      Alert.alert('레크레이션 조회 실패', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadGames();
    }, [loadGames])
  );

  useEffect(() => {
    let mounted = true;

    const loadNotifications = async () => {
      try {
        const data = await apiRequest('/notifications');
        if (!mounted) return;
        const notifications = data.notifications || [];
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
        if (mounted) setNotificationCount(0);
      }
    };

    loadNotifications();
    const timer = setInterval(loadNotifications, 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const addGame = async (game) => {
    try {
      await apiRequest(`/recreation/${game.type}/add`, { method: 'POST' });
      setPickerOpen(false);
      await loadGames();
      if (game.editRoute) {
        router.push(game.editRoute);
      }
    } catch (error) {
      Alert.alert('레크레이션 추가 실패', error.message);
    }
  };

  const renderItem = ({ item }) => {
    const isDone = item.status === '완료';

    return (
      <View style={styles.listItem}>
        {/* 편집 모드일 때만 순서 변경 아이콘 표시 */}
        {activeTab === 'edit' && (
          <MaterialIcons name="menu" size={24} color="#ccc" style={{ marginRight: 10 }} />
        )}

        {/* 게임 제목 클릭 시: 진행 탭이면 게임 시작, 편집 탭이면 아무동작 안함 */}
        <TouchableOpacity 
          style={styles.textContainer} 
          onPress={() => activeTab === 'progress' && item.playRoute && router.push(item.playRoute)}
          disabled={activeTab === 'edit'}
        >
          <Text style={styles.listText}>{item.title}</Text>
        </TouchableOpacity>

        {/* 진행 탭일 때: 완료/미실행 배지 표시 */}
        {activeTab === 'progress' && (
          <View style={[
            styles.statusBadge,
            isDone ? styles.badgeDone : styles.badgeNotDone
          ]}>
            <Text style={[
              styles.statusText,
              isDone ? styles.textDone : styles.textNotDone
            ]}>
              {item.status}
            </Text>
          </View>
        )}

        {/* 편집 탭일 때: 편집 버튼 표시 */}
        {activeTab === 'edit' && (
          <TouchableOpacity 
            style={styles.editItemButton}
            onPress={() => item.editRoute && router.push(item.editRoute)}
          >
            <Text style={styles.editItemText}>편집</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* 알림 아이콘 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/NotificationScreen')}>
          <Ionicons name="notifications-outline" size={28} color="white" />
          {notificationCount > 0 && <View style={styles.notificationDot} />}
        </TouchableOpacity>
      </View>

      {/* 로고 */}
      <Text style={styles.logoText}>Playce</Text>

      {/* 탭 메뉴 */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'progress' ? styles.activeTab : styles.inactiveTab]}
          onPress={() => setActiveTab('progress')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'progress' ? 'black' : 'white' }]}>
            레크레이션 진행
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'edit' ? styles.activeTab : styles.inactiveTab]}
          onPress={() => setActiveTab('edit')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'edit' ? 'black' : 'white' }]}>
            레크레이션 편집
          </Text>
        </TouchableOpacity>
      </View>

      {/* 리스트 박스 */}
      <View style={styles.whiteBox}>
        <FlatList
          data={games}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshing={loading}
          onRefresh={loadGames}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.emptyText}>등록된 레크레이션이 없습니다.</Text>}
            </View>
          }
          ListFooterComponent={activeTab === 'edit' ? (
            <TouchableOpacity style={styles.addButton} onPress={() => setPickerOpen(true)}>
              <Text style={styles.addButtonText}>+ 추가</Text>
            </TouchableOpacity>
          ) : null}
        />
      </View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>레크레이션 선택</Text>
            {availableGames.map((game) => (
              <TouchableOpacity
                key={game.type}
                style={[styles.pickerItem, game.isEnabled ? styles.pickerItemDisabled : null]}
                onPress={() => addGame(game)}
                disabled={game.isEnabled}
              >
                <Text style={styles.pickerItemText}>{game.title}</Text>
                <Text style={styles.pickerItemState}>{game.isEnabled ? '추가됨' : '추가'}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeButton} onPress={() => setPickerOpen(false)}>
              <Text style={styles.closeButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 하단 뒤로가기 버튼 */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>뒤로가기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center' },
  header: { width: '90%', alignItems: 'flex-end', marginTop: 10 },
  notificationDot: { position: 'absolute', top: 0, right: -1, width: 9, height: 9, borderRadius: 5, backgroundColor: '#ff3b30' },
  logoText: { fontSize: 45, fontWeight: 'bold', color: 'white', marginTop: 10, marginBottom: 30 },
  tabContainer: { flexDirection: 'row', width: '90%' },
  tab: { 
    flex: 1, 
    height: 45, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderTopLeftRadius: 15, 
    borderTopRightRadius: 15 
  },
  activeTab: { backgroundColor: 'white' },
  inactiveTab: { backgroundColor: '#555' },
  tabText: { fontSize: 14, fontWeight: 'bold' },
  whiteBox: { 
    backgroundColor: 'white', 
    width: '90%', 
    height: '50%', 
    borderBottomLeftRadius: 15, 
    borderBottomRightRadius: 15,
    overflow: 'hidden'
  },
  listItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 15, 
    paddingHorizontal: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#f0f0f0' 
  },
  textContainer: { flex: 1 },
  listText: { fontSize: 16, fontWeight: '600', color: '#333' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  badgeDone: { backgroundColor: 'black' },
  textDone: { color: 'white' },
  badgeNotDone: { backgroundColor: '#e0e0e0' },
  textNotDone: { color: '#888' },
  editItemButton: { backgroundColor: '#eee', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  editItemText: { fontSize: 12, color: '#555', fontWeight: 'bold' },
  addButton: { padding: 20, alignItems: 'center' },
  addButtonText: { color: '#ccc', fontSize: 15 },
  emptyBox: { padding: 30, alignItems: 'center' },
  emptyText: { color: '#777', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  pickerBox: { width: '84%', backgroundColor: 'white', borderRadius: 15, padding: 16 },
  pickerTitle: { color: '#000', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eee', marginBottom: 8 },
  pickerItemDisabled: { backgroundColor: '#f2f2f2' },
  pickerItemText: { flex: 1, color: '#000', fontSize: 15, fontWeight: 'bold' },
  pickerItemState: { color: '#777', fontSize: 12, fontWeight: 'bold' },
  closeButton: { marginTop: 8, backgroundColor: '#000', borderRadius: 24, height: 46, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  backButton: { backgroundColor: 'white', padding: 16, borderRadius: 30, alignItems: 'center' },
  backButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' }
});
