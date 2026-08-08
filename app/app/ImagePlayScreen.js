import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest, toServerAssetUrl } from '../lib/api';
import { notifyGameEnded, notifyGameStarted } from '../lib/recreationSocket';
import { socket } from '../socket';

const IMAGE_STAGES = [3.4, 2.6, 2, 1.45, 1];

export default function ImagePlayScreen() {
  const router = useRouter();
  const [images, setImages] = useState([]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [imageStage, setImageStage] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState([]);

  useEffect(() => {
    const handleCorrectAnswer = (answer) => {
      if (answer?.gameType === 'IMAGE') setCorrectAnswers((current) => [answer, ...current]);
    };
    socket.on('answer:correct', handleCorrectAnswer);
    return () => socket.off('answer:correct', handleCorrectAnswer);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        await apiRequest('/recreation/IMAGE/start', { method: 'POST' });
        const data = await apiRequest('/recreation/IMAGE');
        const loaded = data.questions || [];
        setImages(loaded);
        if (loaded[0]?.questionId) {
          await apiRequest('/recreation/IMAGE/current-question', {
            method: 'POST',
            body: JSON.stringify({ questionId: loaded[0].questionId }),
          });
        }
        try {
          await notifyGameStarted('IMAGE');
        } catch (socketError) {
          Alert.alert('실시간 전환 실패', socketError.message);
        }
      } catch (error) {
        Alert.alert('진행 실패', error.message);
      }
    };

    load();
  }, []);

  const current = images[index];

  const complete = async () => {
    try {
      await apiRequest('/recreation/IMAGE/complete', { method: 'POST' });
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

  const goNext = async () => {
    if (index + 1 >= images.length) {
      complete();
      return;
    }
    const nextIndex = index + 1;
    const nextImage = images[nextIndex];
    try {
      await apiRequest('/recreation/IMAGE/current-question', {
        method: 'POST',
        body: JSON.stringify({ questionId: nextImage.questionId }),
      });
    } catch (error) {
      Alert.alert('문제 이동 실패', error.message);
      return;
    }
    setIndex(nextIndex);
    setShowAnswer(false);
    setImageStage(0);
    setCorrectAnswers([]);
    socket.emit('image:stage', { stage: 0 });
  };

  const revealMore = () => {
    const nextStage = Math.min(4, imageStage + 1);
    setImageStage(nextStage);
    socket.emit('image:stage', { stage: nextStage }, (response) => {
      if (response?.ok === false) Alert.alert('단계 변경 실패', response.message);
    });
  };

  const toggleAnswer = async () => {
    if (!current) return;
    const nextShowAnswer = !showAnswer;
    try {
      await apiRequest(nextShowAnswer ? '/recreation/IMAGE/reveal-answer' : '/recreation/IMAGE/current-question', {
        method: 'POST',
        body: JSON.stringify({ questionId: current.questionId }),
      });
      setShowAnswer(nextShowAnswer);
    } catch (error) {
      Alert.alert('정답 공개 실패', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.logoText}>Playce</Text>
      <Text style={styles.roundText}>Image {images.length === 0 ? 0 : index + 1}</Text>

      <View style={styles.card}>
        {current?.imageUrl ? (
          <View style={styles.imageViewport}>
            <Image
              source={{ uri: toServerAssetUrl(current.imageUrl) }}
              style={[styles.image, { transform: [{ scale: IMAGE_STAGES[imageStage] }] }]}
              contentFit="contain"
              contentPosition={current.imageFocus || 'center'}
            />
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>이미지 URL이 없습니다.</Text>
          </View>
        )}
        {showAnswer && <Text style={styles.answerText}>정답: {current?.answer || '-'}</Text>}
        <Text style={styles.stageText}>확대 단계 {imageStage + 1}/5</Text>
        <Text style={styles.focusText}>확대 기준: {current?.imageFocus || 'center'}</Text>
        <FlatList
          data={correctAnswers.filter((answer) => answer.questionId === current?.questionId)}
          keyExtractor={(_, answerIndex) => String(answerIndex)}
          horizontal
          ListEmptyComponent={<Text style={styles.emptyText}>아직 정답자가 없습니다.</Text>}
          renderItem={({ item }) => <Text style={styles.correctAnswer}>{item.nickname} · {item.teamName}</Text>}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={revealMore} disabled={!current || imageStage >= 4}>
          <Text style={styles.buttonText}>{imageStage >= 4 ? '원본 공개 완료' : '사진 축소하기'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={toggleAnswer} disabled={!current}>
          <Text style={styles.buttonText}>정답 보기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={current ? goNext : () => router.back()}>
          <Text style={styles.buttonText}>{index + 1 >= images.length ? '완료' : '다음'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 50 },
  logoText: { fontSize: 50, fontWeight: 'bold', color: '#FFF', marginBottom: 20 },
  roundText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  card: { width: '90%', minHeight: 390, backgroundColor: '#FFF', borderRadius: 15, padding: 18, alignItems: 'center', justifyContent: 'center' },
  imageViewport: { width: '100%', height: 250, borderRadius: 8, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  placeholder: { width: '100%', height: 280, borderRadius: 8, backgroundColor: '#DDD', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#555', fontWeight: 'bold' },
  answerText: { marginTop: 18, fontSize: 22, fontWeight: 'bold', color: '#000' },
  stageText: { marginTop: 8, color: '#555', fontWeight: 'bold' },
  focusText: { marginTop: 4, color: '#666', fontSize: 12, fontWeight: 'bold' },
  emptyText: { color: '#777', marginTop: 10 },
  correctAnswer: { color: '#000', backgroundColor: '#EEE', borderRadius: 12, padding: 8, marginTop: 10, marginRight: 6, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 50, width: '90%', gap: 12 },
  primaryButton: { backgroundColor: '#FFF', padding: 15, borderRadius: 30, alignItems: 'center' },
  secondaryButton: { backgroundColor: '#DDD', padding: 15, borderRadius: 30, alignItems: 'center' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
});
