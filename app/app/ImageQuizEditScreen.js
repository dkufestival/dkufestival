import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest, toServerAssetUrl } from '../lib/api';

const IMAGE_FOCUS_OPTIONS = [
  { value: 'center', label: '중앙' },
  { value: 'top', label: '상단' },
  { value: 'bottom', label: '하단' },
  { value: 'left', label: '좌측' },
  { value: 'right', label: '우측' },
  { value: 'top left', label: '좌상단' },
  { value: 'top right', label: '우상단' },
  { value: 'bottom left', label: '좌하단' },
  { value: 'bottom right', label: '우하단' },
];

export default function ImageQuizEditScreen() {
  const router = useRouter();

  const [images, setImages] = useState([{ id: '1', imageUrl: '', previewUri: '', answer: '', imageFocus: 'center' }]);
  const [saving, setSaving] = useState(false);
  const [uploadingIds, setUploadingIds] = useState([]);

  useEffect(() => {
    const loadImages = async () => {
      try {
        const data = await apiRequest('/recreation/IMAGE');
        const loaded = (data.questions || []).map((item) => ({
          id: String(item.questionId || item.id),
          imageUrl: item.imageUrl,
          previewUri: '',
          answer: item.answer,
          imageFocus: item.imageFocus || 'center',
        }));
        setImages(loaded.length > 0 ? loaded : [{ id: '1', imageUrl: '', previewUri: '', answer: '', imageFocus: 'center' }]);
      } catch (error) {
        Alert.alert('불러오기 실패', error.message);
      }
    };

    loadImages();
  }, []);

  const addImageSet = () => {
    const newId = `${Date.now()}`;
    setImages([...images, { id: newId, imageUrl: '', previewUri: '', answer: '', imageFocus: 'center' }]);
  };

  const updateImage = (id, field, value) => {
    setImages(prev => prev.map(image => image.id === id ? { ...image, [field]: value } : image));
  };

  const pickImage = async (id) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '사진을 선택하려면 갤러리 접근 권한이 필요합니다.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      const asset = result.assets?.[0];
      if (result.canceled || !asset?.uri) return;

      updateImage(id, 'previewUri', asset.uri);
      const formData = new FormData();
      if (Platform.OS === 'web' && asset.file) {
        formData.append('image', asset.file);
      } else {
        formData.append('image', {
          uri: asset.uri,
          name: asset.fileName || 'image-quiz.jpg',
          type: asset.mimeType || 'image/jpeg',
        });
      }

      setUploadingIds((current) => [...current, id]);
      const data = await apiRequest('/recreation/upload', { method: 'POST', body: formData });
      updateImage(id, 'imageUrl', data.imageUrl);
    } catch (error) {
      Alert.alert('사진 업로드 실패', error.message || '사진을 업로드하지 못했습니다.');
    } finally {
      setUploadingIds((current) => current.filter((uploadingId) => uploadingId !== id));
    }
  };

  const saveImages = async () => {
    if (uploadingIds.length > 0) {
      Alert.alert('알림', '이미지 업로드가 끝날 때까지 기다려주세요.');
      return;
    }
    if (images.some((item) => item.previewUri && !item.imageUrl)) {
      Alert.alert('저장 실패', '업로드되지 않은 이미지가 있습니다.');
      return;
    }
    setSaving(true);
    try {
      const requestBody = {
        questions: images.map((item) => ({
          imageUrl: item.imageUrl,
          answer: item.answer,
          imageFocus: item.imageFocus || 'center',
        })),
      };
      console.log('[RecreationSave] request body:', requestBody);
      const result = await apiRequest('/recreation/IMAGE', {
        method: 'PUT',
        body: JSON.stringify(requestBody),
      });
      console.log('[RecreationSave] response:', result);
      router.back();
    } catch (error) {
      Alert.alert('저장 실패', error.message);
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.imageGroup}>
      {/* 왼쪽: 사진 첨부 영역 */}
      <TouchableOpacity style={styles.imagePlaceholder} onPress={() => pickImage(item.id)}>
        {item.previewUri || item.imageUrl ? (
          <Image source={{ uri: item.previewUri || toServerAssetUrl(item.imageUrl) }} style={styles.attachedImage} />
        ) : (
          <Text style={styles.imageLabel}>+ 사진첨부</Text>
        )}
      </TouchableOpacity>

      {/* 오른쪽: 정답 및 미리보기 영역 */}
      <View style={styles.contentRight}>
        <TextInput 
          style={styles.answerInput}
          placeholder="정답을 입력해주세요"
          placeholderTextColor="#ccc"
          value={item.answer}
          onChangeText={(value) => updateImage(item.id, 'answer', value)}
        />
        <TextInput
          style={styles.urlInput}
          placeholder="이미지 URL"
          placeholderTextColor="#aaa"
          value={uploadingIds.includes(item.id) ? '이미지 업로드 중...' : item.imageUrl}
          editable={false}
        />
        <Text style={styles.focusLabel}>확대 영역</Text>
        <View style={styles.focusGrid}>
          {IMAGE_FOCUS_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.focusChip, item.imageFocus === option.value ? styles.focusChipActive : null]}
              onPress={() => updateImage(item.id, 'imageFocus', option.value)}
            >
              <Text style={[styles.focusChipText, item.imageFocus === option.value ? styles.focusChipTextActive : null]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.previewTitle}>미리보기</Text>
        <View style={styles.previewRow}>
          <TouchableOpacity style={styles.smallPreview}>
             {item.imageUrl ? null : <Text style={styles.modifyText}>수정</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mediumPreview, { marginHorizontal: 8 }]}>
             {item.imageUrl ? null : <Text style={styles.modifyText}>수정</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.largePreview}>
             {item.imageUrl ? null : <Text style={styles.modifyText}>수정</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}><Ionicons name="notifications-outline" size={28} color="white" /></View>
      <Text style={styles.logoText}>Playce</Text>

      <View style={styles.tabContainer}>
        <View style={styles.tabInactive}><Text style={styles.tabText}>레크레이션 진행</Text></View>
        <View style={styles.tabActive}><Text style={styles.tabText}>레크레이션 편집</Text></View>
      </View>

      <View style={styles.whiteBox}>
        <View style={styles.titleHeader}><Text style={styles.titleHeaderText}>이미지게임</Text></View>
        <FlatList
          data={images}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ListFooterComponent={
            <TouchableOpacity style={styles.addButton} onPress={addImageSet}>
              <Text style={styles.addButtonText}>+ 추가</Text>
            </TouchableOpacity>
          }
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveButton} onPress={saveImages} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? '저장 중...' : '저장'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center' },
  header: { width: '90%', alignItems: 'flex-end', marginTop: 10 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: 'white', marginBottom: 20 },
  tabContainer: { flexDirection: 'row', width: '90%' },
  tabActive: { flex: 1, height: 45, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabInactive: { flex: 1, height: 45, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  tabText: { fontWeight: 'bold' },
  whiteBox: { backgroundColor: 'white', width: '90%', height: '55%', borderBottomLeftRadius: 15, borderBottomRightRadius: 15, overflow: 'hidden' },
  titleHeader: { padding: 12, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
  titleHeaderText: { fontWeight: 'bold', fontSize: 16 },

  // 이미지 게임 아이템 스타일
  imageGroup: { flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  imagePlaceholder: { width: 120, height: 130, backgroundColor: '#ddd', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  imageLabel: { fontSize: 14, color: '#333', fontWeight: 'bold' },
  attachedImage: { width: '100%', height: '100%', borderRadius: 10 },
  
  contentRight: { flex: 1, marginLeft: 15, justifyContent: 'center' },
  answerInput: { textAlign: 'center', fontSize: 15, fontWeight: 'bold', marginBottom: 5 },
  urlInput: { textAlign: 'center', fontSize: 12, marginBottom: 5, color: '#000' },
  focusLabel: { textAlign: 'center', fontSize: 12, fontWeight: 'bold', marginTop: 6, marginBottom: 4 },
  focusGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 6 },
  focusChip: { minWidth: 54, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, backgroundColor: '#eee', alignItems: 'center' },
  focusChipActive: { backgroundColor: '#000' },
  focusChipText: { fontSize: 10, color: '#444', fontWeight: 'bold' },
  focusChipTextActive: { color: '#fff' },
  previewTitle: { textAlign: 'center', fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
  previewRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  
  // 미리보기 박스들 (크기별)
  smallPreview: { width: 30, height: 30, backgroundColor: '#ddd', borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  mediumPreview: { width: 45, height: 45, backgroundColor: '#ddd', borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  largePreview: { width: 65, height: 75, backgroundColor: '#ddd', borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  modifyText: { fontSize: 10, color: '#666' },

  addButton: { padding: 20, alignItems: 'center' },
  addButtonText: { color: '#ccc', fontSize: 16 },
  footer: { position: 'absolute', bottom: 50, width: '90%' },
  saveButton: { backgroundColor: 'white', padding: 15, borderRadius: 30, alignItems: 'center' },
  saveButtonText: { color: 'black', fontSize: 18, fontWeight: 'bold' }
});
