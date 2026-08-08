import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useParticipantGameEvents } from '../hooks/use-participant-game-events';
import { getCurrentMember, serverFetch } from '../lib/api';
import { normalizeRoomCode, socket } from '../socket';

export default function MissionPhotoPlayScreen() {
  useParticipantGameEvents();
  const router = useRouter();
  const { roomCode, missionText } = useLocalSearchParams();
  const [imageUri, setImageUri] = useState('');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!normalizedRoomCode) return undefined;

    const joinSocketRoom = () => {
      socket.emit('joinRoom', {
        roomCode: normalizedRoomCode,
        role: 'participant',
        nickname: getCurrentMember()?.nickname,
        memberId: getCurrentMember()?.memberId,
      });
    };

    socket.on('connect', joinSocketRoom);
    if (socket.connected) {
      joinSocketRoom();
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', joinSocketRoom);
    };
  }, [roomCode]);

  const selectImage = async (source) => {
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('권한 필요', source === 'camera' ? '카메라 권한을 허용해주세요.' : '사진 접근 권한을 허용해주세요.');
        return;
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });

      const asset = result.assets?.[0];
      if (!result.canceled && asset?.uri) {
        setImageUri(asset.uri);
        setSelectedAsset(asset);
        setSubmitted(false);
      }
    } catch (error) {
      Alert.alert('사진 선택 실패', error?.message || '사진을 불러오지 못했습니다.');
    }
  };

  const submit = () => {
    if (submitting || submitted) return;

    const participantName = getCurrentMember()?.nickname;
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (!selectedAsset?.uri) {
      Alert.alert('알림', '제출할 사진을 선택해주세요.');
      return;
    }
    if (!normalizedRoomCode || !participantName) {
      Alert.alert('제출 실패', '방 또는 참가자 정보를 찾을 수 없습니다. 다시 입장해주세요.');
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append('photo', {
      uri: selectedAsset.uri,
      name: selectedAsset.fileName || `mission-photo-${Date.now()}.jpg`,
      type: selectedAsset.mimeType || 'image/jpeg',
    });

    serverFetch('/api/mission-photo/upload', { method: 'POST', body: formData })
      .then(async (uploadResponse) => {
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadResult.message || '사진 업로드에 실패했습니다.');

        socket.timeout(15000).emit(
          'missionPhoto:submit',
          {
            roomCode: normalizedRoomCode,
            participantName,
            imageUri: uploadResult.imageUrl,
            submittedAt: new Date().toISOString(),
          },
          (error, response) => {
            setSubmitting(false);
            if (error || !response?.ok) {
              Alert.alert('제출 실패', response?.message || 'Socket.IO 서버 응답이 없습니다.');
              return;
            }
            setSubmitted(true);
          }
        );
      })
      .catch((error) => {
        setSubmitting(false);
        Alert.alert('제출 실패', error?.message || '사진을 업로드하지 못했습니다.');
      });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <TouchableOpacity style={styles.reportButton} onPress={() => router.replace('/ParticipantHomeScreen?report=1')}>
        <Ionicons name="megaphone-outline" size={28} color="#FFF" />
      </TouchableOpacity>
      <Text style={styles.logoText}>Playce</Text>
      <Text style={styles.title}>미션 사진 찍기</Text>

      <View style={styles.card}>
        <Text style={styles.missionText}>{missionText || '미션을 불러오는 중입니다.'}</Text>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}><Text style={styles.placeholderText}>사진을 선택해주세요.</Text></View>
        )}
        <View style={styles.selectRow}>
          <TouchableOpacity style={styles.selectButton} onPress={() => selectImage('camera')} disabled={submitted}>
            <Text style={styles.selectButtonText}>카메라</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectButton} onPress={() => selectImage('gallery')} disabled={submitted}>
            <Text style={styles.selectButtonText}>갤러리</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.submitButton} onPress={submit} disabled={submitting || submitted}>
          <Text style={styles.submitText}>{submitting ? '제출 중...' : submitted ? '제출 완료' : '제출하기'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 50 },
  reportButton: { position: 'absolute', top: 54, right: 22, zIndex: 2, padding: 8 },
  logoText: { color: '#FFF', fontSize: 50, fontWeight: 'bold', marginBottom: 18 },
  title: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
  card: { width: '90%', borderRadius: 15, backgroundColor: '#FFF', padding: 18, alignItems: 'center' },
  missionText: { color: '#000', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  preview: { width: '100%', height: 280, borderRadius: 10, backgroundColor: '#EEE' },
  placeholder: { width: '100%', height: 280, borderRadius: 10, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#777', fontWeight: 'bold' },
  selectRow: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 14 },
  selectButton: { flex: 1, borderRadius: 20, backgroundColor: '#DDD', paddingVertical: 12, alignItems: 'center' },
  selectButtonText: { color: '#000', fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  submitButton: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  submitText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
