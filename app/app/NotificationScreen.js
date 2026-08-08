import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';

export default function NotificationScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadNotifications = async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const data = await apiRequest('/notifications');
        if (!mounted) return;
        setNotifications(data.notifications || []);
      } catch (error) {
        if (mounted) Alert.alert('알림 조회 실패', error.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadNotifications(true);
    const timer = setInterval(() => loadNotifications(false), 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.logoText}>Playce</Text>
      <Text style={styles.title}>알림</Text>

      <View style={styles.card}>
        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator color="#000" />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>도착한 알림이 없습니다.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {notifications.map((notification) => (
              <View key={notification.id} style={styles.reportItem}>
                <Text style={styles.reportTitle}>
                  {notification.type === 'RETURN' ? '복귀 보고' : notification.type === 'LEAVE' ? '방 나가기' : '이동 보고'}
                </Text>
                <Text style={styles.reportMeta}>
                  {notification.name} / {notification.school || '-'} / {notification.num || '-'}
                </Text>
                <Text style={styles.reportNote}>{notification.message}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>뒤로가기</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 50 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: '#FFF' },
  title: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 12, marginBottom: 20 },
  card: { width: '90%', height: '62%', backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden' },
  list: { padding: 14 },
  reportItem: { borderRadius: 10, backgroundColor: '#EEE', padding: 14, marginBottom: 10 },
  reportTitle: { color: '#000', fontSize: 17, fontWeight: '900' },
  reportMeta: { color: '#555', fontSize: 12, fontWeight: '700', marginTop: 4 },
  reportNote: { color: '#000', fontSize: 15, fontWeight: '700', marginTop: 10 },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#777', fontWeight: 'bold' },
  backButton: { width: '90%', height: 55, backgroundColor: '#FFF', borderRadius: 30, justifyContent: 'center', alignItems: 'center', position: 'absolute', bottom: 50 },
  backButtonText: { fontSize: 18, fontWeight: 'bold', color: '#000' },
});
