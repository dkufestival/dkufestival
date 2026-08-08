import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiRequest, clearParticipantSession, getActiveRoomId, getCurrentMember, toServerAssetUrl } from '../lib/api';
import { normalizeRoomCode, socket } from '../socket';

const IMAGE_STAGES = [3.4, 2.6, 2, 1.45, 1];

export default function ParticipantHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [flow, setFlow] = useState(params.report === '1' ? 'report' : 'waiting');
  const reportingRef = useRef(false);
  const flowLockRef = useRef(params.report === '1');
  const [activity, setActivity] = useState(null);
  const [note, setNote] = useState('');
  const [reporting, setReporting] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [scoreboard, setScoreboard] = useState([]);
  const [notices, setNotices] = useState([]);
  const [latestNotice, setLatestNotice] = useState(null);

  const applyCollaborationState = (data = {}) => {
    if (Array.isArray(data.teams)) setTeams(data.teams);
    if (Array.isArray(data.members)) setMembers(data.members);
    if (Array.isArray(data.scoreboard)) setScoreboard(data.scoreboard);
    if (Array.isArray(data.notices)) {
      setNotices(data.notices);
      setLatestNotice(data.notices[0] || null);
    }
  };

  const loadCurrentActivity = useCallback(async () => {
    if (!getActiveRoomId()) return;

    const data = await apiRequest('/rooms/current');
    const nextRoomCode = normalizeRoomCode(data.room?.roomCode);
    if (nextRoomCode) setRoomCode(nextRoomCode);

    const nextActivity = data.room?.currentActivityType
      ? {
          type: data.room.currentActivityType,
          title: data.room.currentActivityTitle || data.room.currentActivityType,
          currentQuestionId: data.room.currentQuestionId,
          currentPromptIndex: Number(data.room.currentPromptIndex || 0),
          currentImageStage: Number(data.room.currentImageStage || 0),
          currentPrompt: data.room.currentPrompt || '',
          currentOption1: data.room.currentOption1 || '',
          currentOption2: data.room.currentOption2 || '',
          currentOption3: data.room.currentOption3 || '',
          answerRevealed: data.room.answerRevealed,
          currentAnswer: data.room.currentAnswer || '',
        }
      : null;

    setActivity(nextActivity);
    if (reportingRef.current || flowLockRef.current) return;
    if (!nextActivity) {
      setFlow((currentFlow) => currentFlow === 'activity' ? 'waiting' : currentFlow);
    } else {
      setFlow('activity');
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const handleMissionPhotoStarted = (data = {}) => {
      if (!mounted) return;
      if (reportingRef.current || flowLockRef.current) {
        Alert.alert('참가 불가', '개인활동보고 중에는 게임에 참가할 수 없습니다.');
        return;
      }
      router.replace({
        pathname: '/MissionPhotoPlayScreen',
        params: {
          roomCode: data.roomCode || '',
          missionText: data.missionText || '',
        },
      });
    };

    const handleMusicQuizNavigate = ({ roomCode = '' } = {}) => {
      console.log('ParticipantHomeScreen: received musicQuiz:navigate', { roomCode });
      if (!mounted) return;
      if (reportingRef.current || flowLockRef.current) {
        Alert.alert('참가 불가', '개인활동보고 중에는 게임에 참가할 수 없습니다.');
        return;
      }
      router.replace({ pathname: '/MusicquizPlayerScreen', params: { roomCode } });
    };

    const joinSocketRoom = async () => {
      try {
        const data = await apiRequest('/rooms/current');
        const nextRoomCode = data.room?.roomCode;
        console.log('ParticipantHomeScreen: joinSocketRoom', { nextRoomCode });
        if (!nextRoomCode || !mounted) return;
        setRoomCode(nextRoomCode);

        socket.emit('joinRoom', {
          roomCode: nextRoomCode,
          role: 'participant',
          nickname: getCurrentMember()?.nickname || getCurrentMember()?.name,
          memberId: getCurrentMember()?.memberId,
        }, (response) => {
          reportingRef.current = Boolean(response?.isReporting);
          if (reportingRef.current) {
            flowLockRef.current = true;
            setFlow('actionAlone');
          }
          socket.emit('collaboration:sync', { roomCode: nextRoomCode }, (response) => {
            if (response?.ok && mounted) applyCollaborationState(response);
          });
          socket.emit('musicQuiz:sync', (response) => {
            console.log('ParticipantHomeScreen: musicQuiz:sync response', response);
            if (response?.musicQuiz) handleMusicQuizNavigate({ roomCode: nextRoomCode });
          });
        });
      } catch (error) {
        if (mounted) {
          Alert.alert('실시간 연결 실패', error.message);
        }
      }
    };
    const handleTeamUpdate = (data = {}) => {
      if (!mounted) return;
      const eventRoomCode = normalizeRoomCode(data.roomCode);
      if (!eventRoomCode || eventRoomCode === normalizeRoomCode(roomCode)) {
        applyCollaborationState(data);
      }
    };
    const handleScoreChanged = (data = {}) => {
      if (!mounted || !Array.isArray(data.scoreboard)) return;
      const eventRoomCode = normalizeRoomCode(data.roomCode);
      if (!eventRoomCode || eventRoomCode === normalizeRoomCode(roomCode)) {
        setScoreboard(data.scoreboard);
      }
    };
    const handleNoticeReceived = (data = {}) => {
      if (!mounted || !data.notice) return;
      const eventRoomCode = normalizeRoomCode(data.roomCode);
      if (!eventRoomCode || eventRoomCode === normalizeRoomCode(roomCode)) {
        setLatestNotice(data.notice);
        setNotices((current) => [data.notice, ...current].slice(0, 20));
      }
    };
    const handleGameStarted = async (data = {}) => {
      if (!mounted) return;
      const eventRoomCode = normalizeRoomCode(data.roomCode);
      if (eventRoomCode && eventRoomCode !== normalizeRoomCode(roomCode)) return;
      if (reportingRef.current || flowLockRef.current) {
        Alert.alert('참가 불가', '개인활동보고 중에는 게임에 참가할 수 없습니다.');
        return;
      }

      try {
        await loadCurrentActivity();
      } catch (error) {
        if (mounted) Alert.alert('상태 조회 실패', error.message);
      }
    };
    const handleGameEnded = (data = {}) => {
      if (!mounted) return;
      const eventRoomCode = normalizeRoomCode(data.roomCode);
      if (eventRoomCode && eventRoomCode !== normalizeRoomCode(roomCode)) return;

      setActivity(null);
      setFlow('waiting');
    };

    socket.on('connect', joinSocketRoom);
    socket.on('missionPhoto:started', handleMissionPhotoStarted);
    socket.on('musicQuiz:navigate', handleMusicQuizNavigate);
    socket.on('team:update', handleTeamUpdate);
    socket.on('score:changed', handleScoreChanged);
    socket.on('notice:received', handleNoticeReceived);
    socket.on('gameStarted', handleGameStarted);
    socket.on('game:stateChanged', handleGameStarted);
    socket.on('gameEnded', handleGameEnded);
    if (socket.connected) {
      joinSocketRoom();
    } else {
      socket.connect();
    }

    return () => {
      mounted = false;
      socket.off('connect', joinSocketRoom);
      socket.off('missionPhoto:started', handleMissionPhotoStarted);
      socket.off('musicQuiz:navigate', handleMusicQuizNavigate);
      socket.off('team:update', handleTeamUpdate);
      socket.off('score:changed', handleScoreChanged);
      socket.off('notice:received', handleNoticeReceived);
      socket.off('gameStarted', handleGameStarted);
      socket.off('game:stateChanged', handleGameStarted);
      socket.off('gameEnded', handleGameEnded);
    };
  }, [loadCurrentActivity, roomCode, router]);

  const leaveRoom = () => {
    Alert.alert('방 나가기', '현재 방에서 나가시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: async () => {
          const memberId = getCurrentMember()?.memberId;
          try {
            if (memberId) {
              await apiRequest(`/members/${memberId}`, { method: 'DELETE' });
            }
          } catch (error) {
            Alert.alert('나가기 실패', error.message);
            return;
          }
          socket.emit('leaveRoom', {});
          clearParticipantSession();
          router.replace('/');
        },
      },
    ]);
  };

  const submitReport = async () => {
    const memberId = getCurrentMember()?.memberId;
    const finalNote = String(note || '').trim();
    if (!memberId) {
      Alert.alert('보고 실패', '참가자 정보를 찾을 수 없습니다. 다시 입장해주세요.');
      return;
    }
    if (!finalNote) {
      Alert.alert('알림', '보고 내용을 입력해주세요.');
      return;
    }

    setReporting(true);
    try {
      await apiRequest(`/members/${memberId}/report`, {
        method: 'PATCH',
        body: JSON.stringify({ note: finalNote }),
      });
      reportingRef.current = true;
      flowLockRef.current = true;
      socket.emit('activity:report', { isReporting: true });
      setFlow('actionAlone');
      Alert.alert('보고 완료', '진행자에게 보고되었습니다.');
    } catch (error) {
      Alert.alert('보고 실패', error.message);
    } finally {
      setReporting(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const safeLoadCurrentActivity = async () => {
      try {
        await loadCurrentActivity();
      } catch (error) {
        if (mounted) Alert.alert('상태 조회 실패', error.message);
      }
    };

    safeLoadCurrentActivity();
    const timer = setInterval(safeLoadCurrentActivity, 2000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [loadCurrentActivity]);

  const clearReport = async () => {
    const memberId = getCurrentMember()?.memberId;
    if (!memberId) {
      setFlow('waiting');
      return;
    }

    try {
      await apiRequest(`/members/${memberId}/report`, {
        method: 'PATCH',
        body: JSON.stringify({ note: '' }),
      });
      reportingRef.current = false;
      flowLockRef.current = false;
      socket.emit('activity:report', { isReporting: false });
      setNote('');
    } catch (error) {
      Alert.alert('복귀 처리 실패', error.message);
      return;
    }
    setFlow('waiting');
  };

  if (flow === 'report') {
    return (
      <PersonalActivityReportScreen
        note={note}
        setNote={setNote}
        onSubmit={submitReport}
        onBack={() => {
          flowLockRef.current = false;
          setFlow('waiting');
        }}
        reporting={reporting}
        onExit={leaveRoom}
      />
    );
  }

  if (flow === 'actionAlone') {
    return <ActionAloneScreen onReturn={clearReport} onSchedule={() => router.push('/ScheduleScreen?readonly=1')} onExit={leaveRoom} liveState={{ teams, members, scoreboard, notices, latestNotice }} />;
  }

  if (flow === 'activity') {
    return <ActivityScreen activity={activity} onExit={leaveRoom} onReport={() => {
      flowLockRef.current = true;
      setFlow('report');
    }} />;
  }

  return <WaitingForMcScreen onReport={() => {
    flowLockRef.current = true;
    setFlow('report');
  }} onSchedule={() => router.push('/ScheduleScreen?readonly=1')} onExit={leaveRoom} liveState={{ teams, members, scoreboard, notices, latestNotice }} />;
}

function ActivityScreen({ activity, onExit, onReport }) {
  const [questions, setQuestions] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [textAnswer, setTextAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submittedAnswer, setSubmittedAnswer] = useState('');
  const [imageStage, setImageStage] = useState(0);
  const [promptIndex, setPromptIndex] = useState(0);
  const [rouletteDisplayText, setRouletteDisplayText] = useState('');
  const [rouletteResult, setRouletteResult] = useState('');
  const rouletteCycleRef = useRef(null);
  const rouletteFinishRef = useRef(null);

  useEffect(() => {
    const handleImageStage = ({ stage } = {}) => setImageStage(Math.max(0, Math.min(4, Number(stage) || 0)));
    const handleRouletteSpin = ({ result, duration = 2400, options = [] } = {}) => {
      const cycleOptions = (Array.isArray(options) && options.length > 0 ? options : questions.map((question) => question.prompt).filter(Boolean)).filter(Boolean);
      const cyclePool = cycleOptions.length > 0 ? cycleOptions : [result].filter(Boolean);
      setRouletteResult('');
      setRouletteDisplayText(result || cyclePool[0] || '');
      if (rouletteCycleRef.current) clearInterval(rouletteCycleRef.current);
      if (rouletteFinishRef.current) clearTimeout(rouletteFinishRef.current);
      rouletteCycleRef.current = setInterval(() => {
        const next = cyclePool[Math.floor(Math.random() * cyclePool.length)];
        setRouletteDisplayText(next || '');
      }, 70);
      rouletteFinishRef.current = setTimeout(() => {
        if (rouletteCycleRef.current) clearInterval(rouletteCycleRef.current);
        rouletteCycleRef.current = null;
        setRouletteDisplayText(result || cyclePool[0] || '');
        setRouletteResult(result || cyclePool[0] || '');
      }, duration);
    };
    socket.on('image:stage', handleImageStage);
    socket.on('roulette:spin', handleRouletteSpin);
    return () => {
      socket.off('image:stage', handleImageStage);
      socket.off('roulette:spin', handleRouletteSpin);
      if (rouletteCycleRef.current) clearInterval(rouletteCycleRef.current);
      if (rouletteFinishRef.current) clearTimeout(rouletteFinishRef.current);
    };
  }, [questions]);

  useEffect(() => {
    const loadQuestions = async () => {
      if (!activity?.type) return;
      try {
        const data = await apiRequest(`/recreation/${activity.type}`);
        setQuestions(data.questions || []);
        setSelectedAnswer('');
        setTextAnswer('');
        setSubmitted(false);
        setSubmittedAnswer('');
      } catch (error) {
        Alert.alert('문제 조회 실패', error.message);
      }
    };

    loadQuestions();
  }, [activity?.type]);

  const question = activity?.currentQuestionId
    ? questions.find((item) => item.questionId === activity.currentQuestionId) || questions[0]
    : questions[0];

  useEffect(() => {
    setSelectedAnswer('');
    setTextAnswer('');
    setSubmitted(false);
    setSubmittedAnswer('');
    setImageStage(Math.max(0, Math.min(4, Number(activity?.currentImageStage) || 0)));
    setPromptIndex(Math.max(0, Number(activity?.currentPromptIndex) || 0));
    setRouletteDisplayText('');
    setRouletteResult('');
  }, [activity?.currentQuestionId, activity?.currentPromptIndex, activity?.currentImageStage]);

  const submitAnswer = async (answerText) => {
    const finalAnswer = String(answerText || '').trim();
    if (!question?.questionId || !finalAnswer) {
      Alert.alert('알림', '답안을 입력해주세요.');
      return;
    }

    try {
      await apiRequest(`/recreation/${activity.type}/answers`, {
        method: 'POST',
        body: JSON.stringify({
          questionId: question.questionId,
          memberId: getCurrentMember()?.memberId,
          answerText: finalAnswer,
        }),
      });
      setSubmitted(true);
      setSubmittedAnswer(finalAnswer);
      Alert.alert('제출 완료', '진행자가 정답을 공개할 때까지 기다려주세요.');
    } catch (error) {
      Alert.alert('제출 실패', error.message);
    }
  };

  const renderBody = () => {
    if (!question && !['ROULETTE', 'BALANCE'].includes(activity?.type)) {
      return <Text style={styles.helperText}>진행자가 문제를 등록하지 않았습니다.</Text>;
    }

    if (activity?.type === 'OX') {
      return (
        <>
          <Text style={styles.questionText}>{question.prompt || 'O/X 퀴즈'}</Text>
          <View style={styles.choiceRow}>
            {['O', 'X'].map((answer) => (
              <TouchableOpacity
                key={answer}
                style={[styles.answerCard, selectedAnswer === answer ? styles.selectedCard : null]}
                onPress={() => setSelectedAnswer(answer)}
              >
                <Text style={styles.answerCardText}>{answer}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <PlayceButton label={submitted ? '제출완료' : '제출'} onPress={() => submitAnswer(selectedAnswer)} />
          <AnswerResult activity={activity} submittedAnswer={submittedAnswer} />
        </>
      );
    }

    if (activity?.type === 'RPS') {
      return (
        <>
          <Text style={styles.questionText}>{question.prompt || '가위바위보'}</Text>
          <View style={styles.choiceRow}>
            {[
              ['rock', '주먹'],
              ['scissors', '가위'],
              ['paper', '보'],
            ].map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[styles.rpsCard, selectedAnswer === value ? styles.selectedCard : null]}
                onPress={() => setSelectedAnswer(value)}
              >
                <Text style={styles.rpsText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <PlayceButton label={submitted ? '제출완료' : '제출'} onPress={() => submitAnswer(selectedAnswer)} />
          <AnswerResult activity={activity} submittedAnswer={submittedAnswer} />
        </>
      );
    }

    if (activity?.type === 'WORD') {
      const prompts = [question?.option1, question?.option2, question?.option3];
      const currentPrompt = prompts[promptIndex] || prompts.find(Boolean) || `제시어 ${promptIndex + 1}`;
      const promptCount = Math.max(1, prompts.filter((prompt) => String(prompt || '').trim()).length || 1);
      return (
        <>
          <Text style={styles.headingText}>Round 1</Text>
          <View style={styles.promptPill}>
            <Text style={styles.promptText}>{currentPrompt}</Text>
          </View>
          <Text style={styles.promptIndexText}>제시어 {promptIndex + 1}/{promptCount}</Text>
          <TextInput
            placeholder="답안을 작성하세요"
            placeholderTextColor="#a9a9a9"
            style={styles.input}
            value={textAnswer}
            onChangeText={setTextAnswer}
          />
          <PlayceButton label={submitted ? '제출완료' : '제출'} onPress={() => submitAnswer(textAnswer)} />
          <AnswerResult activity={activity} submittedAnswer={submittedAnswer} />
        </>
      );
    }

    if (activity?.type === 'CHOSUNG') {
      return (
        <>
          <Text style={styles.headingText}>Round 1</Text>
          <Text style={styles.chosungTopic}>{question.option1 || activity.currentOption1 || '초성 퀴즈'}</Text>
          <View style={styles.chosungCard}>
            <Text style={styles.chosungText}>{question.prompt || activity.currentPrompt || '초성'}</Text>
          </View>
          <TextInput
            placeholder="정답을 작성하세요"
            placeholderTextColor="#a9a9a9"
            style={styles.input}
            value={textAnswer}
            onChangeText={setTextAnswer}
            editable={!submitted}
          />
          <PlayceButton label={submitted ? '제출완료' : '제출'} onPress={() => submitAnswer(textAnswer)} />
          <AnswerResult activity={activity} submittedAnswer={submittedAnswer} />
        </>
      );
    }

    if (activity?.type === 'IMAGE') {
      return (
        <>
          {question?.imageUrl ? (
            <View style={styles.imageBox}>
              <Image
                source={{ uri: toServerAssetUrl(question.imageUrl) }}
                style={[styles.imageZoom, { transform: [{ scale: IMAGE_STAGES[imageStage] || IMAGE_STAGES[0] }] }]}
                contentFit="contain"
                contentPosition={question.imageFocus || 'center'}
              />
            </View>
          ) : (
            <View style={styles.imageBox}><Text style={styles.imageLabel}>사진</Text></View>
          )}
          <TextInput
            placeholder="답안을 작성하세요"
            placeholderTextColor="#a9a9a9"
            style={styles.input}
            value={textAnswer}
            onChangeText={setTextAnswer}
          />
          <PlayceButton label={submitted ? '제출완료' : '제출'} onPress={() => submitAnswer(textAnswer)} />
          <AnswerResult activity={activity} submittedAnswer={submittedAnswer} />
        </>
      );
    }

    if (activity?.type === 'ANONYMOUS') {
      return (
        <>
          <Text style={styles.questionText}>{question.prompt || '익명한마디'}</Text>
          <TextInput
            placeholder="한마디를 작성하세요"
            placeholderTextColor="#a9a9a9"
            style={[styles.input, styles.multilineInput]}
            value={textAnswer}
            onChangeText={setTextAnswer}
            multiline
          />
          <PlayceButton label={submitted ? '제출완료' : '제출'} onPress={() => submitAnswer(textAnswer)} />
        </>
      );
    }

    if (activity?.type === 'BALANCE') {
      const prompt = question?.prompt || activity.currentPrompt || '밸런스 게임';
      const options = [
        question?.option1 || activity.currentOption1,
        question?.option2 || activity.currentOption2,
      ];

      return (
        <>
          <Text style={styles.questionText}>{prompt}</Text>
          <View style={styles.balanceChoiceColumn}>
            {options.map((option, index) => (
              <View key={`${option}-${index}`} style={styles.balanceCard}>
                <Text style={styles.balanceText}>{option || `선택지 ${index + 1}`}</Text>
              </View>
            ))}
          </View>
        </>
      );
    }

    if (activity?.type === 'ROULETTE') {
      return (
        <>
          <Text style={styles.questionText}>룰렛 진행 중</Text>
          <View style={styles.rouletteWheel}>
            <Text style={styles.rouletteWheelLabel}>{rouletteDisplayText ? '돌리는 중...' : '룰렛'}</Text>
            <Text style={styles.rouletteWheelText}>{rouletteDisplayText || activity.currentPrompt || '선택지 없음'}</Text>
          </View>
          {rouletteResult || (activity.answerRevealed && activity.currentAnswer) ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>결과</Text>
              <Text style={styles.resultAnswer}>{rouletteResult || activity.currentAnswer}</Text>
            </View>
          ) : (
            <Text style={styles.helperText}>진행자가 결과를 공개할 때까지 기다려주세요.</Text>
          )}
        </>
      );
    }

    return <Text style={styles.helperText}>레크레이션 진행 중입니다.</Text>;
  };

  return (
    <PlayceLayout showExit showReport onExit={onExit} onReport={onReport}>
      <View style={styles.activityWrap}>
        <Text style={styles.activityTitle}>{activity?.title || '레크레이션 진행 중'}</Text>
        {renderBody()}
      </View>
    </PlayceLayout>
  );
}

function normalizeAnswer(value) {
  return String(value || '').trim().toLowerCase();
}

function formatAnswer(activity) {
  if (activity?.type === 'RPS') {
    return { rock: '주먹', scissors: '가위', paper: '보' }[activity.currentAnswer] || activity.currentAnswer;
  }
  return activity?.currentAnswer || '-';
}

function AnswerResult({ activity, submittedAnswer }) {
  if (!activity?.answerRevealed || !activity.currentAnswer) return null;

  const isCorrect = normalizeAnswer(activity.currentAnswer) === normalizeAnswer(submittedAnswer);

  return (
    <View style={[styles.resultBox, isCorrect ? styles.correctBox : styles.wrongBox]}>
      <Text style={styles.resultTitle}>{isCorrect ? '정답입니다' : '오답입니다'}</Text>
      <Text style={styles.resultAnswer}>정답: {formatAnswer(activity)}</Text>
    </View>
  );
}

function ActionAloneScreen({ onReturn, onSchedule, onExit, liveState }) {
  return (
    <PlayceLayout showExit onExit={onExit}>
      <LiveRoomPanel liveState={liveState} />
      <View style={styles.statusWrap}>
        <Text style={styles.statusText}>Action Alone...</Text>
      </View>

      <View style={styles.actionButtons}>
        <PlayceButton label="복귀완료" onPress={onReturn} />
        <PlayceButton label="일정확인" onPress={onSchedule} />
      </View>
    </PlayceLayout>
  );
}

function PersonalActivityReportScreen({ note, setNote, onSubmit, onBack, reporting, onExit }) {
  return (
    <PlayceLayout showExit onExit={onExit}>
      <View style={styles.reportButtons}>
        <PlayceButton label="화장실 이동" onPress={() => setNote('화장실 이동')} />
        <PlayceButton label="편의점 이동" onPress={() => setNote('편의점 이동')} />
        <PlayceButton label="흡연 이동" onPress={() => setNote('흡연 이동')} />
        <View style={styles.etcWrap}>
          <Text style={styles.etcLabel}>기타</Text>
          <TextInput
            placeholder="내용을 입력하세요"
            placeholderTextColor="#a9a9a9"
            style={styles.input}
            value={note}
            onChangeText={setNote}
          />
        </View>
        <PlayceButton label={reporting ? '제출중' : '제출'} onPress={onSubmit} />
      </View>

      <View style={styles.backButton}>
        <PlayceButton label="뒤로가기" onPress={onBack} />
      </View>
    </PlayceLayout>
  );
}

function WaitingForMcScreen({ onReport, onSchedule, onExit, liveState }) {
  return (
    <PlayceLayout showExit onExit={onExit}>
      <LiveRoomPanel liveState={liveState} />
      <View style={styles.statusWrap}>
        <Text style={styles.statusText}>waiting for MC...</Text>
      </View>

      <View style={styles.actionButtons}>
        <PlayceButton label="개인활동보고" onPress={onReport} />
        <PlayceButton label="일정확인" onPress={onSchedule} />
      </View>
    </PlayceLayout>
  );
}

function LiveRoomPanel({ liveState = {} }) {
  const memberId = getCurrentMember()?.memberId;
  const myMember = (liveState.members || []).find((member) => member.memberId === memberId);
  const myTeam = myMember?.team;
  const scoreboard = [...(liveState.scoreboard || [])].sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder);
  const notice = liveState.latestNotice || liveState.notices?.[0];

  return (
    <View style={styles.livePanel}>
      {notice?.message ? (
        <View style={styles.noticeBanner}>
          <Text style={styles.noticeBannerLabel}>공지</Text>
          <Text style={styles.noticeBannerText}>{notice.message}</Text>
        </View>
      ) : null}

      <View style={styles.liveSummaryRow}>
        <View style={styles.liveSummaryBox}>
          <Text style={styles.liveLabel}>내 팀</Text>
          <Text style={styles.liveValue}>{myTeam?.name || '미배정'}</Text>
        </View>
        <View style={styles.liveSummaryBox}>
          <Text style={styles.liveLabel}>점수판</Text>
          <Text style={styles.liveValue}>{scoreboard.length > 0 ? `${scoreboard.length}팀` : '대기'}</Text>
        </View>
      </View>

      {scoreboard.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scoreStrip}>
          {scoreboard.map((team) => (
            <View key={team.teamId} style={[styles.scorePill, myTeam?.teamId === team.teamId ? styles.myScorePill : null]}>
              <Text style={[styles.scorePillName, myTeam?.teamId === team.teamId ? styles.myScoreText : null]}>{team.name}</Text>
              <Text style={[styles.scorePillValue, myTeam?.teamId === team.teamId ? styles.myScoreText : null]}>{team.score}점</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function PlayceLayout({ children, showExit = false, showReport = false, onExit, onReport }) {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        {showExit ? (
          <TouchableOpacity style={styles.exitButton} onPress={onExit}>
            <Text style={styles.exitText}>EXIT</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.topIcon} />
        )}
        {showReport ? (
          <TouchableOpacity style={styles.reportIconButton} onPress={onReport}>
            <Ionicons name="megaphone-outline" size={28} color="#fff" />
          </TouchableOpacity>
        ) : (
          <Text style={styles.topIcon}>!</Text>
        )}
      </View>
      <Text style={styles.logo}>Playce</Text>
      {children}
    </SafeAreaView>
  );
}

function PlayceButton({ label, onPress }) {
  return (
    <TouchableOpacity style={styles.pill} onPress={onPress}>
      <Text style={styles.pillText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', paddingHorizontal: 18 },
  topBar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topIcon: { width: 36, color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  reportIconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  exitButton: { minWidth: 58, height: 40, justifyContent: 'center' },
  exitText: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'left' },
  logo: { color: '#fff', fontFamily: 'monospace', fontSize: 48, fontWeight: '900', lineHeight: 58, marginTop: 47, textAlign: 'center' },
  livePanel: { width: '100%', marginTop: 18, borderRadius: 14, backgroundColor: '#fff', padding: 12, gap: 10 },
  noticeBanner: { borderRadius: 10, backgroundColor: '#000', paddingVertical: 9, paddingHorizontal: 11 },
  noticeBannerLabel: { color: '#fff', fontSize: 11, fontWeight: '900', marginBottom: 3 },
  noticeBannerText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  liveSummaryRow: { flexDirection: 'row', gap: 8 },
  liveSummaryBox: { flex: 1, borderRadius: 10, backgroundColor: '#eee', padding: 10 },
  liveLabel: { color: '#666', fontSize: 11, fontWeight: '900', marginBottom: 4 },
  liveValue: { color: '#000', fontSize: 15, fontWeight: '900' },
  scoreStrip: { gap: 8 },
  scorePill: { minWidth: 92, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', paddingVertical: 8, paddingHorizontal: 10 },
  myScorePill: { backgroundColor: '#000', borderColor: '#000' },
  scorePillName: { color: '#000', fontSize: 12, fontWeight: '900' },
  scorePillValue: { color: '#555', fontSize: 12, fontWeight: '800', marginTop: 2 },
  myScoreText: { color: '#fff' },
  statusWrap: { flex: 1, justifyContent: 'center', paddingBottom: 61 },
  statusText: { color: '#fff', fontFamily: 'monospace', fontSize: 23, fontWeight: '900', lineHeight: 30, textAlign: 'center' },
  activityTitle: { color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginTop: 24 },
  helperText: { color: '#aaa', fontSize: 13, textAlign: 'center', marginTop: 16 },
  activityWrap: { flex: 1, justifyContent: 'center', gap: 18, paddingBottom: 68 },
  headingText: { color: '#fff', fontSize: 32, fontWeight: 'bold', textAlign: 'center' },
  questionText: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  choiceRow: { flexDirection: 'row', gap: 10 },
  answerCard: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#fff' },
  answerCardText: { color: '#000', fontSize: 56, fontWeight: '500' },
  selectedCard: { borderWidth: 4, borderColor: '#6ea8ff' },
  resultBox: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  correctBox: { backgroundColor: '#dff7e8' },
  wrongBox: { backgroundColor: '#ffe2e2' },
  resultTitle: { color: '#000', fontSize: 18, fontWeight: '900' },
  resultAnswer: { color: '#000', fontSize: 13, fontWeight: '700', marginTop: 4 },
  rpsCard: { flex: 1, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#fff' },
  rpsText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  chosungTopic: { color: '#aaa', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  chosungCard: { minHeight: 128, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  chosungText: { color: '#000', fontSize: 56, fontWeight: '900', textAlign: 'center' },
  balanceChoiceColumn: { gap: 12 },
  balanceCard: { minHeight: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 14 },
  balanceText: { color: '#000', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  promptPill: { minHeight: 46, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  promptText: { color: '#000', fontSize: 14, fontWeight: '700' },
  promptIndexText: { color: '#aaa', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  imageBox: { width: '82%', aspectRatio: 1, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
  imageZoom: { width: '100%', height: '100%' },
  imageLabel: { color: '#aaa', fontSize: 14, fontWeight: '600' },
  rouletteWheel: { width: 190, height: 190, borderRadius: 95, borderWidth: 9, borderColor: '#fff', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  rouletteWheelLabel: { color: '#fff', fontSize: 13, fontWeight: '900', marginBottom: 8 },
  rouletteWheelText: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  multilineInput: { minHeight: 110, borderRadius: 18, paddingTop: 14, textAlignVertical: 'top' },
  actionButtons: { gap: 22, paddingBottom: 101 },
  reportButtons: { gap: 28, marginTop: 142 },
  etcWrap: { gap: 9 },
  etcLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  input: { width: '100%', height: 46, borderRadius: 24, backgroundColor: '#fff', color: '#000', fontSize: 14, fontWeight: '600', paddingHorizontal: 17 },
  backButton: { marginTop: 44 },
  pill: { width: '100%', height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#fff' },
  pillText: { color: '#000', fontSize: 14, fontWeight: '700' },
});
