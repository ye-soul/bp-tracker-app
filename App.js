import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView,
  Platform, Dimensions, Modal, Animated, Alert, Keyboard, Share,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Svg, { Rect, Text as SvgText, Line, G } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ▼ Google Cloud Vision API 키를 여기에 입력하세요
const GOOGLE_VISION_API_KEY = 'YOUR_API_KEY_HERE';


const C = {
  mint: '#3CC98A', mintD: '#2BA876', mintL: '#E8FBF3', mintM: '#B8F0D8',
  amber: '#F59E0B', amberL: '#FEF3C7',
  coral: '#F87171', coralL: '#FEE2E2',
  bg: '#F0FAF6', card: '#FFFFFF', text: '#1A2E22', muted: '#7A9E8A',
  border: 'rgba(60,201,138,0.15)',
};

const SHADOW = {
  shadowColor: '#3CC98A', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
};

const TIPS = [
  '나트륨을 줄이면 혈압이 낮아질 수 있어요 🧂',
  '매일 30분 걷기가 혈압을 낮춰줘요 🚶',
  '바나나·시금치가 혈압 조절에 도움돼요 🍌',
  '금연은 혈압 관리의 첫걸음이에요 🚬',
  '음주는 적당히, 혈압에 영향을 줘요 🍷',
  '하루 7~8시간 수면이 혈압 조절에 중요해요 😴',
  '깊은 호흡과 명상이 혈압을 낮춰줘요 🧘',
  '아침 기상 후 30분 이내에 재는 게 좋아요 ⏰',
  '커피는 하루 2잔 이하로 줄여보세요 ☕',
  '채소·과일·통곡물 위주 DASH 식단이 좋아요 🥦',
  '처방받은 혈압약은 임의로 중단하지 마세요 💊',
  '추운 날 외출 시 따뜻하게 입으세요 🌡️',
  '정기적으로 병원 방문해 혈압을 체크하세요 🏥',
  '하루 1.5~2L 수분 섭취가 도움돼요 💧',
];

const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const DAY_NAMES = ['일','월','화','수','목','금','토'];

// ── 유틸 ──────────────────────────────────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function makeDayKey(year, month, date) {
  return `${year}-${month}-${date}`; // month is 0-indexed
}

function getStatus(sys, dia) {
  const s = parseInt(sys, 10), d = parseInt(dia, 10);
  if (isNaN(s) || isNaN(d)) return null;
  // 수치가 높을수록 나쁜 상태 — sys/dia 중 높은 쪽 기준
  if (s >= 180 || d >= 120) return { key: 'danger',  label: '매우 높아요',    icon: '🚨', desc: '즉시 안정을 취하고 필요 시 병원에 가세요.', colors: ['#EF4444','#DC2626'] };
  if (s >= 140 || d >= 90)  return { key: 'danger',  label: '많이 높아요',    icon: '🍵', desc: '충분히 쉬고 주의 깊게 관찰하세요.',           colors: ['#F87171','#EF4444'] };
  if (s >= 130 || d >= 80)  return { key: 'caution', label: '조금 높아요',    icon: '🌤️', desc: '물 한 잔 마시고 쉬어봐요.',                    colors: ['#F59E0B','#D97706'] };
  if (s >= 120)             return { key: 'caution', label: '괜찮은 편이에요', icon: '🙂', desc: '꾸준히 체크해요.',                             colors: ['#34D399','#10B981'] };
  return                           { key: 'normal',  label: '정상이에요',      icon: '🌿', desc: '잘 관리되고 있어요!',                          colors: ['#3CC98A','#2BA876'] };
}

function getTimeLabel() {
  const h = new Date().getHours();
  if (h < 12) return '아침';
  if (h < 18) return '낮';
  return '저녁';
}

function formatDate() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]}요일)`;
}

function formatDateTime(isoString) {
  const d = new Date(isoString);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function uniqueDays(recs) {
  return new Set(recs.map(r => r.dayStr)).size;
}

function calcAvg(recs) {
  if (!recs.length) return null;
  const hrRecs = recs.filter(r => r.hr);
  return {
    sys: Math.round(recs.reduce((a, r) => a + r.sys, 0) / recs.length),
    dia: Math.round(recs.reduce((a, r) => a + r.dia, 0) / recs.length),
    hr: hrRecs.length ? Math.round(hrRecs.reduce((a, r) => a + r.hr, 0) / hrRecs.length) : null,
  };
}

async function scanBPFromCamera(showToast, setOcrLoading) {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { showToast('카메라 권한이 필요해요'); return null; }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (result.canceled) return null;

    setOcrLoading(true);
    const { uri } = result.assets[0];

    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 900 } }],
      { compress: 0.75, format: 'jpeg', base64: true }
    );

    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: resized.base64 },
            features: [{ type: 'TEXT_DETECTION' }],
          }],
        }),
      }
    );
    const data = await res.json();
    const text = (data?.responses?.[0]?.fullTextAnnotation?.text || '').replace(/\s+/g, ' ');

    let sys = null, dia = null, hr = null;

    const slashMatch = text.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    if (slashMatch) {
      const a = parseInt(slashMatch[1]), b = parseInt(slashMatch[2]);
      if (a > b && a >= 80 && a <= 250 && b >= 40 && b <= 130) { sys = a; dia = b; }
    }

    if (!sys) {
      const sysM = text.match(/(?:SYS|수축)[^\d]*(\d{2,3})/i);
      const diaM = text.match(/(?:DIA|이완)[^\d]*(\d{2,3})/i);
      if (sysM) sys = parseInt(sysM[1]);
      if (diaM) dia = parseInt(diaM[1]);
    }

    const hrM = text.match(/(?:PULSE|PUL|HR|맥박|심박)[^\d]*(\d{2,3})/i);
    if (hrM) hr = parseInt(hrM[1]);

    if (!sys || !dia) {
      const nums = (text.match(/\d+/g) || []).map(Number).filter(n => n >= 40 && n <= 250);
      const candidates = nums.filter(n => n >= 80 && n <= 250);
      if (candidates.length >= 2) {
        sys = candidates[0];
        dia = candidates.find(n => n < sys) || null;
      }
    }

    if (!sys && !dia) { showToast('숫자를 인식하지 못했어요. 다시 찍어보세요.'); return null; }

    return { sys: sys?.toString() || '', dia: dia?.toString() || '', hr: hr?.toString() || '' };
  } catch (e) {
    showToast('인식 실패: 네트워크 연결을 확인해주세요');
    return null;
  } finally {
    setOcrLoading(false);
  }
}

async function shareReport(records, showToast) {
  try {
    const now = new Date();
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
    const recs = records.filter(r => new Date(r.time) >= cutoff);

    if (!recs.length) { showToast('최근 30일 기록이 없어요'); return; }

    const avgSys = Math.round(recs.reduce((a, r) => a + r.sys, 0) / recs.length);
    const avgDia = Math.round(recs.reduce((a, r) => a + r.dia, 0) / recs.length);
    const hrRecs = recs.filter(r => r.hr);
    const avgHr = hrRecs.length ? Math.round(hrRecs.reduce((a, r) => a + r.hr, 0) / hrRecs.length) : null;
    const maxSys = Math.max(...recs.map(r => r.sys));
    const minSys = Math.min(...recs.map(r => r.sys));
    const maxDia = Math.max(...recs.map(r => r.dia));
    const minDia = Math.min(...recs.map(r => r.dia));
    const normalN = recs.filter(r => getStatus(r.sys, r.dia)?.key === 'normal').length;
    const cautionN = recs.filter(r => getStatus(r.sys, r.dia)?.key === 'caution').length;
    const dangerN = recs.filter(r => getStatus(r.sys, r.dia)?.key === 'danger').length;
    const days = new Set(recs.map(r => r.dayStr)).size;

    const dateStr = `${now.getFullYear()}.${now.getMonth()+1}.${now.getDate()}`;
    const fromStr = `${cutoff.getMonth()+1}/${cutoff.getDate()}`;
    const toStr = `${now.getMonth()+1}/${now.getDate()}`;

    const recentLines = recs.slice(0, 10).map(r => {
      const st = getStatus(r.sys, r.dia);
      const hr = r.hr ? `  ❤️ ${r.hr}bpm` : '';
      return `  ${r.dateStr}  ${r.sys}/${r.dia}${hr}  ${st?.label || ''}`;
    }).join('\n');

    const text = [
      `📊 혈압 리포트  ${dateStr}`,
      `━━━━━━━━━━━━━━━━━━`,
      `📅 기간: ${fromStr} ~ ${toStr} (${days}일, ${recs.length}회)`,
      ``,
      `💉 30일 평균: ${avgSys} / ${avgDia} mmHg`,
      avgHr ? `❤️ 평균 심박수: ${avgHr} bpm` : null,
      ``,
      `📈 수축기 범위: ${minSys} ~ ${maxSys} mmHg`,
      `📉 이완기 범위: ${minDia} ~ ${maxDia} mmHg`,
      ``,
      `✅ 정상: ${normalN}회`,
      cautionN > 0 ? `⚠️ 조금 높음: ${cautionN}회` : null,
      dangerN > 0 ? `🔴 많이 높음: ${dangerN}회` : null,
      ``,
      `📋 최근 기록`,
      recentLines,
      ``,
      `─ 혈압 노트 앱으로 기록됨`,
    ].filter(l => l !== null).join('\n');

    await Share.share({ message: text, title: '혈압 리포트' });
  } catch (e) {
    if (e.message !== 'The user did not share') showToast('공유 실패: ' + e.message);
  }
}

// ── Result Popup (저장 직후 표시) ─────────────────────────────────────────────
function ResultCard({ result, onDismiss }) {
  const scale = useRef(new Animated.Value(0.85)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!result) return;
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(onDismiss, 2600);
    return () => clearTimeout(t);
  }, [result]);

  if (!result) return null;
  const st = getStatus(result.sys, result.dia);

  return (
    <Modal visible={!!result} transparent animationType="none" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.rcOverlay} activeOpacity={1} onPress={onDismiss}>
        <Animated.View style={[styles.rcWrapper, { transform: [{ scale }], opacity }]}>
          <LinearGradient colors={st?.colors || ['#3CC98A','#2BA876']} style={styles.rcCard}>
            <Text style={styles.rcIcon}>{st?.icon}</Text>
            <Text style={styles.rcVals}>{result.sys} / {result.dia}</Text>
            <Text style={styles.rcUnit}>mmHg</Text>
            {result.hr ? <Text style={styles.rcHr}>❤️ {result.hr} bpm</Text> : null}
            <Text style={styles.rcLabel}>{st?.label}</Text>
            <Text style={styles.rcDesc}>{st?.desc}</Text>
            <View style={styles.rcDismissHint}>
              <Text style={styles.rcDismissText}>탭하면 닫힘</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, visible, bottomInset }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: visible ? 0 : 16, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible]);
  return (
    <Animated.View style={[styles.toast, { bottom: 72 + bottomInset, opacity, transform: [{ translateY }] }]}>
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ── SVG Chart ─────────────────────────────────────────────────────────────────
function BPChart({ records }) {
  const chartW = SCREEN_WIDTH - 72;
  const chartH = 160;
  const padL = 36, padB = 36, padT = 14;
  const plotW = chartW - padL - 8;
  const plotH = chartH - padB - padT;
  const yMin = 55, yMax = 210;
  const data = records.slice(0, 7).reverse();
  if (!data.length) return null;

  const yPx = v => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const barW = Math.min(24, (plotW / data.length) * 0.52);
  const spacing = plotW / data.length;
  const yTicks = [60, 80, 100, 120, 140, 160, 180, 200];

  function barColor(sys, dia) {
    const st = getStatus(sys, dia);
    if (!st) return C.mint;
    if (st.key === 'caution') return C.amber;
    if (st.key === 'danger') return C.coral;
    return C.mint;
  }

  return (
    <View>
      <View style={styles.chartLegend}>
        {[{ color: C.mint, label: '정상' }, { color: C.amber, label: '주의' }, { color: C.coral, label: '고혈압' }].map(item => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
        <Text style={styles.legendNote}>막대: 이완기~수축기 범위</Text>
      </View>
      <Svg width={chartW} height={chartH}>
        {yTicks.map(tick => {
          const y = yPx(tick);
          return (
            <G key={tick}>
              <Line x1={padL} y1={y} x2={chartW-8} y2={y} stroke="rgba(0,0,0,0.05)" strokeWidth={1} />
              <SvgText x={padL-4} y={y+4} fontSize={9} fill={C.muted} textAnchor="end" fontWeight="600">{tick}</SvgText>
            </G>
          );
        })}
        {data.map((r, i) => {
          const x = padL + i * spacing + (spacing - barW) / 2;
          const yTop = yPx(r.sys), yBot = yPx(r.dia);
          const h = Math.max(yBot - yTop, 4);
          const color = barColor(r.sys, r.dia);
          const label = formatDateTime(r.time).split(' ')[0];
          return (
            <G key={r.time}>
              <Rect x={x} y={yTop} width={barW} height={h} fill={color} rx={4} opacity={0.85} />
              <SvgText x={x+barW/2} y={yTop-2} fontSize={8} fill={C.text} textAnchor="middle" fontWeight="700">{r.sys}</SvgText>
              <SvgText x={x+barW/2} y={yBot+8} fontSize={8} fill={C.muted} textAnchor="middle" fontWeight="600">{r.dia}</SvgText>
              <SvgText x={x+barW/2} y={chartH-4} fontSize={8} fill={C.muted} textAnchor="middle" fontWeight="600">{label}</SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

// ── Calendar Tab ──────────────────────────────────────────────────────────────
function CalendarTab({ records, onDelete }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(null);

  // Group records by dayStr
  const recsByDay = {};
  records.forEach(r => {
    if (!recsByDay[r.dayStr]) recsByDay[r.dayStr] = [];
    recsByDay[r.dayStr].push(r);
  });

  // Calendar grid
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isToday = (d) =>
    d === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();

  const prevMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Day dot color = worst status of the day
  function dayDotColor(recs) {
    if (recs.some(r => getStatus(r.sys, r.dia)?.key === 'danger')) return C.coral;
    if (recs.some(r => getStatus(r.sys, r.dia)?.key === 'caution')) return C.amber;
    return C.mint;
  }

  const selectedKey = selectedDay ? makeDayKey(viewYear, viewMonth, selectedDay) : null;
  const selectedRecs = selectedKey ? (recsByDay[selectedKey] || []) : [];

  // Month has any records?
  const monthHasRecords = Object.keys(recsByDay).some(k => {
    const [y, m] = k.split('-').map(Number);
    return y === viewYear && m === viewMonth;
  });

  // sec paddingHorizontal(18*2) + card padding(12*2) = 60
  const CELL_SIZE = Math.floor((SCREEN_WIDTH - 60) / 7);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* 월 이동 */}
      <View style={styles.sec}>
        <View style={styles.calNavRow}>
          <TouchableOpacity style={styles.calNavBtn} onPress={prevMonth}>
            <Text style={styles.calNavArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.calNavTitle}>{viewYear}년 {MONTH_NAMES[viewMonth]}</Text>
          <TouchableOpacity style={styles.calNavBtn} onPress={nextMonth}>
            <Text style={styles.calNavArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 8 }]}>
          {/* 요일 헤더 */}
          <View style={{ flexDirection: 'row' }}>
            {DAY_NAMES.map((d, i) => (
              <View key={d} style={{ width: CELL_SIZE, alignItems: 'center', paddingBottom: 6 }}>
                <Text style={[styles.calDayLabel, i === 0 && { color: C.coral }, i === 6 && { color: '#5B8DEF' }]}>{d}</Text>
              </View>
            ))}
          </View>

          {/* 날짜 그리드 */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((day, i) => {
              if (!day) return <View key={`e-${i}`} style={{ width: CELL_SIZE, height: CELL_SIZE + 10 }} />;
              const dk = makeDayKey(viewYear, viewMonth, day);
              const recs = recsByDay[dk] || [];
              const hasRec = recs.length > 0;
              const dotColor = hasRec ? dayDotColor(recs) : null;
              const isSelected = selectedDay === day;
              const isTd = isToday(day);
              const isSun = (firstDayOfWeek + day - 1) % 7 === 0;
              const isSat = (firstDayOfWeek + day - 1) % 7 === 6;

              return (
                <TouchableOpacity
                  key={dk}
                  style={{ width: CELL_SIZE, height: CELL_SIZE + 10, alignItems: 'center', paddingTop: 2 }}
                  onPress={() => setSelectedDay(isSelected ? null : day)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    { width: CELL_SIZE - 6, height: CELL_SIZE - 6, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
                    isTd && { backgroundColor: C.mint },
                    isSelected && !isTd && { backgroundColor: C.mintL, borderWidth: 1.5, borderColor: C.mint },
                  ]}>
                    <Text style={[
                      styles.calDateText,
                      isTd && { color: 'white', fontWeight: '900' },
                      isSelected && !isTd && { color: C.mintD, fontWeight: '800' },
                      isSun && !isTd && !isSelected && { color: C.coral },
                      isSat && !isTd && !isSelected && { color: '#5B8DEF' },
                    ]}>{day}</Text>
                  </View>
                  {hasRec
                    ? <View style={[styles.calDot, { backgroundColor: dotColor, marginTop: 2 }]} />
                    : <View style={{ height: 7 }} />
                  }
                </TouchableOpacity>
              );
            })}
          </View>

          {!monthHasRecords && (
            <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 12, fontWeight: '600', fontSize: 13 }}>
              이달 기록이 없어요
            </Text>
          )}
        </View>
      </View>

      {/* 선택한 날의 기록 */}
      {selectedDay !== null && (
        <View style={styles.sec}>
          <Text style={styles.secLabel}>
            {viewYear}년 {viewMonth + 1}월 {selectedDay}일
          </Text>
          {selectedRecs.length === 0 ? (
            <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
              <Text style={{ color: C.muted, fontWeight: '700' }}>이날 기록이 없어요</Text>
            </View>
          ) : (
            selectedRecs.map((r) => {
              const st = getStatus(r.sys, r.dia);
              const bc =
                st?.key === 'normal' ? { bg: C.mintL, tc: '#1a7a4a' } :
                st?.key === 'caution' ? { bg: C.amberL, tc: '#92610a' } :
                { bg: C.coralL, tc: '#9a2a2a' };
              return (
                <View key={r.time} style={styles.recItem}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Text style={styles.recDate}>{r.dateStr}</Text>
                          {r.tl ? <View style={styles.timeTag}><Text style={styles.timeTagText}>{r.tl}</Text></View> : null}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.recBP}>
                            {r.sys} / {r.dia}
                            <Text style={{ fontSize: 13, color: C.muted, fontWeight: '500' }}> mmHg</Text>
                          </Text>
                          {r.hr ? <View style={styles.recHrTag}><Text style={styles.recHrText}>❤️ {r.hr}</Text></View> : null}
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <View style={[styles.recBadge, { backgroundColor: bc.bg }]}>
                          <Text style={[styles.recBadgeText, { color: bc.tc }]}>{st?.label}</Text>
                        </View>
                        <TouchableOpacity style={styles.delBtn} onPress={() => onDelete(r.time)}>
                          <Text style={styles.delBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {r.memo ? <Text style={styles.recMemo}>💬 {r.memo}</Text> : null}
                    {r.med ? <Text style={[styles.recMemo, { color: C.mintD }]}>💊 혈압약 복용</Text> : null}
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* 전체 기록 없을 때 */}
      {records.length === 0 && (
        <View style={[styles.sec]}>
          <View style={styles.emptyRec}>
            <Text style={{ fontSize: 32, marginBottom: 12 }}>📅</Text>
            <Text style={{ color: C.muted, fontWeight: '700', fontSize: 15 }}>아직 기록이 없어요</Text>
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>오늘 탭에서 혈압을 입력해보세요</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ── Bottom Tab Bar ─────────────────────────────────────────────────────────────
const TABS = [
  { key: 'today', icon: '🏠', label: '오늘' },
  { key: 'records', icon: '📅', label: '달력' },
  { key: 'stats', icon: '📊', label: '통계' },
];

function BottomTabBar({ active, onChange }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {TABS.map(tab => {
        const isActive = active === tab.key;
        return (
          <TouchableOpacity key={tab.key} style={styles.tabItem} onPress={() => onChange(tab.key)} activeOpacity={0.7}>
            <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            {isActive && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Onboarding ─────────────────────────────────────────────────────────────────
function OnboardingScreen({ onComplete }) {
  const [name, setName] = useState('');
  return (
    <LinearGradient colors={['#3CC98A', '#2BA876', '#1D8F5E']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.obContent} keyboardShouldPersistTaps="handled">
        <View style={styles.obLogo}><Text style={{ fontSize: 44 }}>🩺</Text></View>
        <Text style={styles.obTitle}>혈압 노트</Text>
        <Text style={styles.obSub}>매일 혈압을 기록하고{'\n'}건강 변화를 한눈에 확인하세요</Text>
        <View style={styles.obRange}>
          <Text style={styles.obRangeTitle}>혈압 기준 안내</Text>
          <Text style={styles.obRangeRow}>🌿 정상 &nbsp;&nbsp; 120/80 미만</Text>
          <Text style={styles.obRangeRow}>🌤️ 주의 &nbsp;&nbsp; 120~139 / 80~89</Text>
          <Text style={styles.obRangeRow}>🔴 고혈압  140/90 이상</Text>
        </View>
        <TextInput
          style={styles.obInput}
          placeholder="이름을 입력해주세요 (선택)"
          placeholderTextColor="#aaa"
          value={name} onChangeText={setName} maxLength={20}
          returnKeyType="done" onSubmitEditing={() => onComplete(name.trim())} autoFocus
        />
        <TouchableOpacity style={styles.obBtn} onPress={() => onComplete(name.trim())} activeOpacity={0.88}>
          <Text style={styles.obBtnText}>시작하기</Text>
        </TouchableOpacity>
        <Text style={styles.obNote}>입력하신 이름은 이 기기에만 저장되며 외부로 전송되지 않습니다.</Text>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Settings Modal ─────────────────────────────────────────────────────────────
function SettingsModal({ visible, onClose, userName, onSaveName, onReset }) {
  const [name, setName] = useState('');
  useEffect(() => { setName(userName || ''); }, [userName, visible]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHdr}>
            <Text style={styles.modalTitle}>설정</Text>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
              <Text style={{ color: C.muted, fontWeight: '700', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSecLabel}>이름 변경</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            <TextInput
              style={[styles.settingsInput, { flex: 1 }]} value={name} onChangeText={setName}
              placeholder="이름" placeholderTextColor={C.muted} maxLength={20} returnKeyType="done"
            />
            <TouchableOpacity style={styles.settingsSaveBtn} onPress={() => { onSaveName(name.trim()); onClose(); }}>
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 15 }}>저장</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modalDivider} />
          <Text style={[styles.modalSecLabel, { marginTop: 16 }]}>데이터</Text>
          <TouchableOpacity style={styles.settingsResetBtn} onPress={() => { onReset(); onClose(); }}>
            <Text style={{ color: '#9a2a2a', fontWeight: '700', fontSize: 15 }}>전체 기록 초기화</Text>
          </TouchableOpacity>
          <View style={styles.modalDivider} />
          <Text style={[styles.modalSecLabel, { marginTop: 16 }]}>정보</Text>
          <Text style={{ fontSize: 13, color: C.muted, fontWeight: '600', marginTop: 4 }}>혈압 노트 v1.0.0</Text>
        </View>
      </View>
    </Modal>
  );
}

// ── Report Modal ───────────────────────────────────────────────────────────────
function ReportModal({ visible, onClose, records, showToast }) {
  const [sharing, setSharing] = useState(false);
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
  const recs = records.filter(r => new Date(r.time) >= cutoff);
  const days = uniqueDays(recs);
  const period = `${cutoff.getMonth()+1}/${cutoff.getDate()} ~ ${now.getMonth()+1}/${now.getDate()} · ${days}일 기록 (${recs.length}회)`;

  let stats = null;
  if (recs.length) {
    const avgSys = Math.round(recs.reduce((a,r) => a+r.sys, 0) / recs.length);
    const avgDia = Math.round(recs.reduce((a,r) => a+r.dia, 0) / recs.length);
    stats = {
      avgSys, avgDia,
      maxSys: Math.max(...recs.map(r=>r.sys)), minSys: Math.min(...recs.map(r=>r.sys)),
      maxDia: Math.max(...recs.map(r=>r.dia)), minDia: Math.min(...recs.map(r=>r.dia)),
      normalN: recs.filter(r => getStatus(r.sys,r.dia)?.key==='normal').length,
      cautionN: recs.filter(r => getStatus(r.sys,r.dia)?.key==='caution').length,
      dangerN: recs.filter(r => getStatus(r.sys,r.dia)?.key==='danger').length,
      avgHr: (() => { const h = recs.filter(r=>r.hr); return h.length ? Math.round(h.reduce((a,r)=>a+r.hr,0)/h.length) : null; })(),
    };
  }

  const handleShare = async () => {
    setSharing(true);
    await shareReport(records, showToast);
    setSharing(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, { maxHeight: '92%' }]}>
          <View style={styles.modalHdr}>
            <View>
              <Text style={styles.modalTitle}>📤 리포트 내보내기</Text>
              <Text style={{ fontSize: 13, color: C.muted, fontWeight: '600', marginTop: 2 }}>{period}</Text>
            </View>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
              <Text style={{ color: C.muted, fontWeight: '700', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {stats ? (
              <>
                <View style={styles.rptAvg}>
                  <Text style={styles.rptAvgLabel}>30일 평균 혈압</Text>
                  <Text style={styles.rptAvgVal}>{stats.avgSys} / {stats.avgDia}</Text>
                  <Text style={styles.rptAvgUnit}>mmHg</Text>
                  {stats.avgHr ? (
                    <View style={styles.rptAvgHr}>
                      <Text style={styles.rptAvgHrText}>❤️ 평균 심박수 {stats.avgHr} bpm</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  {[{label:'수축기 범위', val:`${stats.minSys} ~ ${stats.maxSys}`},{label:'이완기 범위', val:`${stats.minDia} ~ ${stats.maxDia}`}].map(item => (
                    <View key={item.label} style={[styles.rptStatBox, { flex: 1 }]}>
                      <Text style={styles.rptStatLabel}>{item.label}</Text>
                      <Text style={styles.rptStatVal}>{item.val}</Text>
                    </View>
                  ))}
                </View>
                <View style={[styles.rptStatBox, { marginBottom: 10 }]}>
                  <Text style={[styles.rptStatLabel, { marginBottom: 10 }]}>측정 결과 분포</Text>
                  <View style={{ flexDirection: 'row' }}>
                    {[{n:stats.normalN,label:'정상',color:'#1a7a4a'},{n:stats.cautionN,label:'조금 높음',color:'#92610a'},{n:stats.dangerN,label:'많이 높음',color:'#9a2a2a'}].map(item => (
                      <View key={item.label} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 22, fontWeight: '900', color: item.color }}>{item.n}</Text>
                        <Text style={{ fontSize: 11, color: C.muted, fontWeight: '700', marginTop: 2 }}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={[styles.rptStatBox, { marginBottom: 10 }]}>
                  <Text style={[styles.rptStatLabel, { marginBottom: 8 }]}>날짜별 기록 (최근 14개)</Text>
                  {recs.slice(0, 14).map((r, i) => {
                    const st = getStatus(r.sys, r.dia);
                    const bg = st?.key==='normal' ? '#e8fbf3' : st?.key==='caution' ? '#fef3c7' : '#fee2e2';
                    const tc = st?.key==='normal' ? '#1a7a4a' : st?.key==='caution' ? '#92610a' : '#9a2a2a';
                    return (
                      <View key={i} style={styles.rptRow}>
                        <Text style={styles.rptRowDate}>{r.dateStr}{r.tl ? ' '+r.tl : ''}</Text>
                        <Text style={styles.rptRowBP}>{r.sys}/{r.dia}{r.hr ? ` ❤️${r.hr}` : ''}</Text>
                        <View style={[styles.rptBadge, { backgroundColor: bg }]}>
                          <Text style={[styles.rptBadgeText, { color: tc }]}>{st?.label}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={[styles.shareBtn, sharing && { opacity: 0.6 }]}
                  onPress={handleShare} disabled={sharing} activeOpacity={0.85}
                >
                  <Text style={styles.shareBtnText}>{sharing ? '공유 중...' : '📤 공유하기  (카톡 · 메모 · 문자)'}</Text>
                </TouchableOpacity>
                <View style={styles.rptTip}>
                  <Text style={styles.rptTipText}>💡 이 리포트를 캡처하거나 진료 시 의사에게 보여주세요.</Text>
                </View>
              </>
            ) : (
              <Text style={{ color: C.muted, textAlign: 'center', padding: 24, fontWeight: '700' }}>최근 30일 기록이 없어요</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────
function AppInner() {
  const insets = useSafeAreaInsets();

  const [userName, setUserName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [activeTab, setActiveTab] = useState('today');

  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [memo, setMemo] = useState('');

  const diaRef = useRef(null);
  const hrRef = useRef(null);
  const memoRef = useRef(null);

  const [medOn, setMedOn] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef(null);
  const [savedResult, setSavedResult] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [n, r, m] = await Promise.all([
          AsyncStorage.getItem('bp_username'),
          AsyncStorage.getItem('bp_records'),
          AsyncStorage.getItem('bp_med_' + todayKey()),
        ]);
        if (n !== null) setUserName(n);
        if (r) setRecords(JSON.parse(r));
        if (m) setMedOn(m === '1');
      } catch (e) {}
      setTipIdx(Math.floor(Math.random() * TIPS.length));
      setLoading(false);
    })();
  }, []);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2200);
  }, []);

  const saveRecords = useCallback(async (next) => {
    setRecords(next);
    await AsyncStorage.setItem('bp_records', JSON.stringify(next));
  }, []);

  const handleStart = useCallback(async (name) => {
    await AsyncStorage.setItem('bp_username', name);
    setUserName(name);
  }, []);

  const handleSave = useCallback(async () => {
    const s = parseInt(systolic, 10), d = parseInt(diastolic, 10);
    if (!s || !d || s < 60 || s > 250 || d < 40 || d > 130) {
      showToast('혈압 숫자를 올바르게 입력해주세요'); return;
    }
    const hr = parseInt(heartRate, 10);
    if (heartRate && (isNaN(hr) || hr < 30 || hr > 250)) {
      showToast('심박수를 올바르게 입력해주세요 (30~250)'); return;
    }
    const now = new Date();
    const rec = {
      sys: s, dia: d, hr: heartRate ? hr : null, med: medOn,
      memo: memo.trim(), tl: getTimeLabel(), time: now.toISOString(),
      dayStr: todayKey(), dateStr: formatDateTime(now.toISOString()),
    };
    let updated = [rec, ...records];
    if (updated.length > 365) updated = updated.slice(0, 365);
    await saveRecords(updated);
    setSystolic(''); setDiastolic(''); setHeartRate(''); setMemo('');
    Keyboard.dismiss();
    setSavedResult({ sys: s, dia: d, hr: heartRate ? hr : null });
  }, [systolic, diastolic, heartRate, memo, medOn, records, saveRecords, showToast]);

  const handleDelete = useCallback((recordTime) => {
    Alert.alert('삭제', '이 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        const updated = records.filter(r => r.time !== recordTime);
        await saveRecords(updated); showToast('삭제됐어요');
      }},
    ]);
  }, [records, saveRecords, showToast]);

  const toggleMed = useCallback(async () => {
    const next = !medOn; setMedOn(next);
    await AsyncStorage.setItem('bp_med_' + todayKey(), next ? '1' : '0');
  }, [medOn]);

  const handleReset = useCallback(() => {
    Alert.alert('초기화', '전체 기록을 삭제할까요? 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '초기화', style: 'destructive', onPress: async () => { await saveRecords([]); showToast('초기화됐어요'); }},
    ]);
  }, [saveRecords, showToast]);

  // ── 파생 상태 ────────────────────────────────────────────────────────────────
  const todayRecs = records.filter(r => r.dayStr === todayKey());
  const latest = todayRecs[0] || null;
  const todayStatus = latest ? getStatus(latest.sys, latest.dia) : null;

  const now = new Date();
  const wCut = new Date(now); wCut.setDate(wCut.getDate() - 7);
  const mCut = new Date(now); mCut.setDate(mCut.getDate() - 30);
  const weekAvg = calcAvg(records.filter(r => new Date(r.time) >= wCut));
  const monthAvg = calcAvg(records.filter(r => new Date(r.time) >= mCut));
  const weekRecs = records.filter(r => new Date(r.time) >= wCut);
  const monthRecs = records.filter(r => new Date(r.time) >= mCut);

  const statusColors = todayStatus?.colors || ['#3CC98A', '#2BA876'];

  const canSave = systolic.length > 0 && diastolic.length > 0;

  if (loading) return null;
  if (userName === null) return <OnboardingScreen onComplete={handleStart} />;

  // ── 오늘 탭: 입력 → 약 → 상태 ────────────────────────────────────────────
  const TodayTab = (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.bg }}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 1. 혈압 입력 */}
        <View style={styles.sec}>
          <View style={styles.secRow}>
            <Text style={styles.secLabel}>혈압 입력</Text>
            <TouchableOpacity
              style={[styles.ocrBtn, ocrLoading && { opacity: 0.5 }]}
              onPress={async () => {
                const vals = await scanBPFromCamera(showToast, setOcrLoading);
                if (vals) {
                  if (vals.sys) setSystolic(vals.sys);
                  if (vals.dia) setDiastolic(vals.dia);
                  if (vals.hr) setHeartRate(vals.hr);
                  showToast('인식됐어요 — 확인 후 저장해주세요 ✓');
                }
              }}
              disabled={ocrLoading}
              activeOpacity={0.75}
            >
              <Text style={styles.ocrBtnText}>{ocrLoading ? '인식 중...' : '📷 사진으로 입력'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            <View style={styles.bpRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bpFieldLabel}>수축기 (위)</Text>
                <TextInput
                  style={styles.bpInput} keyboardType="numeric" placeholder="120"
                  placeholderTextColor={C.muted} value={systolic} onChangeText={setSystolic}
                  maxLength={3} returnKeyType="next" onSubmitEditing={() => diaRef.current?.focus()}
                />
                <Text style={styles.bpUnit}>mmHg</Text>
              </View>
              <Text style={styles.bpSlash}>/</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.bpFieldLabel}>이완기 (아래)</Text>
                <TextInput
                  ref={diaRef} style={styles.bpInput} keyboardType="numeric" placeholder="80"
                  placeholderTextColor={C.muted} value={diastolic} onChangeText={setDiastolic}
                  maxLength={3} returnKeyType="next" onSubmitEditing={() => hrRef.current?.focus()}
                />
                <Text style={styles.bpUnit}>mmHg</Text>
              </View>
            </View>

            <View style={styles.hrRow}>
              <View style={styles.hrIco}><Text style={{ fontSize: 18 }}>❤️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bpFieldLabel}>심박수 (선택)</Text>
                <TextInput
                  ref={hrRef} style={styles.hrInput} keyboardType="numeric" placeholder="72"
                  placeholderTextColor={C.muted} value={heartRate} onChangeText={setHeartRate}
                  maxLength={3} returnKeyType="next" onSubmitEditing={() => memoRef.current?.focus()}
                />
              </View>
              <Text style={styles.hrUnit}>bpm</Text>
            </View>

            <Text style={styles.memoLabel}>
              📝 메모 <Text style={{ fontSize: 13, color: C.muted, fontWeight: '400' }}>(선택)</Text>
            </Text>
            <TextInput
              ref={memoRef} style={styles.memoInput}
              placeholder="예: 커피 마심, 잠 못 잤음..."
              placeholderTextColor={C.muted} value={memo} onChangeText={setMemo}
              maxLength={100} returnKeyType="done" onSubmitEditing={handleSave}
            />
            <TouchableOpacity onPress={handleSave} activeOpacity={canSave ? 0.85 : 1} disabled={!canSave}>
              <LinearGradient
                colors={canSave ? [C.mint, C.mintD] : ['#C8E6D4', '#B8D6C4']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.saveBtn}
              >
                <Text style={[styles.saveBtnText, !canSave && { color: 'rgba(255,255,255,0.6)' }]}>
                  {canSave ? '기록 저장하기' : '수축기 / 이완기를 입력하세요'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. 혈압약 복용 */}
        <View style={styles.sec}>
          <View style={styles.medCard}>
            <View style={styles.medLeft}>
              <View style={styles.medIco}><Text style={{ fontSize: 22 }}>💊</Text></View>
              <View>
                <Text style={styles.medTitle}>혈압약 복용</Text>
                <Text style={[styles.medSub, medOn && { color: C.mint }]}>
                  {medOn ? '오늘 복용 완료 ✓' : '아직 체크 안 했어요'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.toggle, medOn && styles.toggleOn]} onPress={toggleMed} activeOpacity={0.8}>
              <View style={[styles.toggleThumb, medOn && styles.toggleThumbOn]} />
            </TouchableOpacity>
          </View>
        </View>


        <Text style={styles.disclaimer}>
          ※ 이 앱은 건강 기록 보조 도구입니다. 의료적 진단이나 치료를 대체하지 않습니다.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ── 통계 탭 ──────────────────────────────────────────────────────────────────
  const StatsTab = (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {records.length >= 3 && (
        <View style={styles.sec}>
          <Text style={styles.secLabel}>최근 7일 혈압 추이</Text>
          <View style={styles.card}>
            <BPChart records={records} />
          </View>
        </View>
      )}
      <View style={styles.sec}>
        <Text style={styles.secLabel}>통계 요약</Text>
        {records.length > 0 ? (
          <>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>이번 주 평균</Text>
                <Text style={styles.statVal}>{weekAvg ? `${weekAvg.sys}/${weekAvg.dia}` : '—'}</Text>
                <Text style={styles.statSub}>{weekAvg ? `${uniqueDays(weekRecs)}일 기록` : '기록 없음'}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>이번 달 평균</Text>
                <Text style={styles.statVal}>{monthAvg ? `${monthAvg.sys}/${monthAvg.dia}` : '—'}</Text>
                <Text style={styles.statSub}>{monthAvg ? `${uniqueDays(monthRecs)}일 기록` : '기록 없음'}</Text>
              </View>
            </View>
            {(weekAvg?.hr || monthAvg?.hr) ? (
              <View style={styles.hrStatCard}>
                <Text style={styles.hrStatIco}>❤️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hrStatLabel}>평균 심박수</Text>
                  <View style={{ flexDirection: 'row', gap: 20, marginTop: 4 }}>
                    {weekAvg?.hr ? <Text style={styles.hrStatVal}>주간 <Text style={styles.hrStatNum}>{weekAvg.hr}</Text> bpm</Text> : null}
                    {monthAvg?.hr ? <Text style={styles.hrStatVal}>월간 <Text style={styles.hrStatNum}>{monthAvg.hr}</Text> bpm</Text> : null}
                  </View>
                </View>
              </View>
            ) : null}
            <TouchableOpacity style={styles.rptCard} onPress={() => setReportVisible(true)} activeOpacity={0.88}>
              <View>
                <Text style={styles.rptTitle}>📤 리포트 내보내기</Text>
                <Text style={styles.rptSub}>30일 요약 · 카톡·메모·문자 공유</Text>
              </View>
              <View style={styles.rptBtn}><Text style={styles.rptBtnText}>보기</Text></View>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.statsEmpty}>
            <Text style={{ fontSize: 32, marginBottom: 12 }}>📈</Text>
            <Text style={{ color: C.muted, fontWeight: '700', fontSize: 15 }}>기록이 쌓이면 통계가 나와요</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* 헤더 — 혈압 상태에 따라 전체 색 변경 */}
      <LinearGradient
        colors={statusColors}
        start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
        style={styles.header}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.hdrHi}>안녕하세요 👋</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.hdrName}>{userName ? `${userName}님` : '혈압 노트'}</Text>
            {latest && (
              <View style={[
                styles.hdrStatusBadge,
                todayStatus?.key === 'caution' && { backgroundColor: 'rgba(245,158,11,0.25)' },
                todayStatus?.key === 'danger' && { backgroundColor: 'rgba(248,113,113,0.25)' },
              ]}>
                <Text style={styles.hdrStatusText}>
                  {todayStatus?.icon} {latest.sys}/{latest.dia}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.hdrDate}>{formatDate()}</Text>
          <Text style={styles.hdrTip}>💡 {TIPS[tipIdx]}</Text>
        </View>
        <TouchableOpacity style={styles.hdrBtn} onPress={() => setSettingsVisible(true)}>
          <Text style={styles.hdrBtnText}>설정</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View style={{ flex: 1 }}>
        {activeTab === 'today' && TodayTab}
        {activeTab === 'records' && <CalendarTab records={records} onDelete={handleDelete} />}
        {activeTab === 'stats' && StatsTab}
      </View>

      <BottomTabBar active={activeTab} onChange={setActiveTab} />

      <SettingsModal
        visible={settingsVisible} onClose={() => setSettingsVisible(false)}
        userName={userName}
        onSaveName={async (name) => {
          await AsyncStorage.setItem('bp_username', name);
          setUserName(name); showToast('저장됐어요 ✓');
        }}
        onReset={handleReset}
      />
      <ReportModal visible={reportVisible} onClose={() => setReportVisible(false)} records={records} showToast={showToast} />
      <Toast message={toastMsg} visible={toastVisible} bottomInset={insets.bottom} />
      <ResultCard result={savedResult} onDismiss={() => setSavedResult(null)} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

// ── 스타일 ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.mint },

  obContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  obLogo: { width: 84, height: 84, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  obTitle: { fontSize: 32, fontWeight: '900', color: 'white', marginBottom: 8, letterSpacing: -0.5 },
  obSub: { fontSize: 15, color: 'rgba(255,255,255,0.78)', textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  obRange: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 16, marginBottom: 24, width: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  obRangeTitle: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  obRangeRow: { fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 30, fontWeight: '600' },
  obInput: { width: '100%', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, color: C.text, marginBottom: 12, fontWeight: '600' },
  obBtn: { width: '100%', backgroundColor: 'white', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  obBtnText: { color: C.mintD, fontSize: 17, fontWeight: '900' },
  obNote: { marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.52)', textAlign: 'center', lineHeight: 18 },

  header: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hdrHi: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginBottom: 2 },
  hdrName: { fontSize: 20, fontWeight: '900', color: 'white', letterSpacing: -0.5 },
  hdrDate: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '600' },
  hdrTip: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 5, fontWeight: '500', lineHeight: 16 },
  hdrStatusBadge: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  hdrStatusText: { fontSize: 13, color: 'white', fontWeight: '800' },
  hdrBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4 },
  hdrBtnText: { fontSize: 13, fontWeight: '700', color: 'white' },

  tabBar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: 'rgba(60,201,138,0.12)', paddingTop: 6 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 4, position: 'relative' },
  tabIcon: { fontSize: 22, marginBottom: 2, opacity: 0.4 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 11, color: C.muted, fontWeight: '600' },
  tabLabelActive: { color: C.mint, fontWeight: '800' },
  tabIndicator: { position: 'absolute', top: 0, width: 28, height: 3, backgroundColor: C.mint, borderRadius: 99 },

  sec: { paddingHorizontal: 18, paddingTop: 16 },
  secRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  secLabel: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 1, textTransform: 'uppercase', paddingLeft: 2, marginBottom: 10 },
  ocrBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: C.border, ...SHADOW },
  ocrBtnText: { fontSize: 12, color: C.mintD, fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 20, ...SHADOW },

  // 달력
  calNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calNavBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderRadius: 12, ...SHADOW },
  calNavArrow: { fontSize: 22, color: C.mint, fontWeight: '700', lineHeight: 26 },
  calNavTitle: { fontSize: 17, fontWeight: '900', color: C.text },
  calDayRow: { flexDirection: 'row', marginBottom: 4 },
  calDayCell: { alignItems: 'center', paddingVertical: 4 },
  calDayLabel: { fontSize: 12, fontWeight: '800', color: C.muted },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDateCircle: { borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  calDateToday: { backgroundColor: C.mint },
  calDateSelected: { backgroundColor: C.mintL, borderWidth: 2, borderColor: C.mint },
  calDateText: { fontSize: 14, fontWeight: '600', color: C.text },
  calDot: { width: 5, height: 5, borderRadius: 3 },

  statusCard: { borderRadius: 20, padding: 20 },
  statusCardEmpty: { backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: C.mintM, ...SHADOW },
  statusInner: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statusIco: { width: 56, height: 56, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusVals: { fontSize: 26, fontWeight: '900', color: 'white', letterSpacing: -1 },
  statusUnit: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  statusHrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 2 },
  statusHr: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  statusHrBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  statusHrBadgeText: { fontSize: 11, color: 'white', fontWeight: '800' },
  statusLbl: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  statusDesc: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  statusCnt: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 4, fontWeight: '600' },

  medCard: { backgroundColor: C.card, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...SHADOW },
  medLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  medIco: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  medTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  medSub: { fontSize: 13, color: C.muted, marginTop: 2, fontWeight: '600' },
  toggle: { width: 52, height: 30, backgroundColor: '#E2E8F0', borderRadius: 99, justifyContent: 'center', paddingHorizontal: 3.5 },
  toggleOn: { backgroundColor: C.mint },
  toggleThumb: { width: 23, height: 23, borderRadius: 12, backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  toggleThumbOn: { alignSelf: 'flex-end' },

  bpRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  bpFieldLabel: { fontSize: 11, color: C.muted, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  bpInput: { borderWidth: 2, borderColor: C.border, borderRadius: 12, paddingVertical: 12, fontSize: 28, fontWeight: '900', textAlign: 'center', color: C.text, backgroundColor: C.bg },
  bpUnit: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 4, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  bpSlash: { fontSize: 30, fontWeight: '300', color: C.muted, marginTop: 18 },
  hrRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, backgroundColor: '#FFF0F3', borderRadius: 12, padding: 12 },
  hrIco: { width: 40, height: 40, backgroundColor: '#FFE0E6', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  hrInput: { borderWidth: 2, borderColor: '#FFD0DA', borderRadius: 10, paddingVertical: 8, fontSize: 22, fontWeight: '900', textAlign: 'center', color: C.text, backgroundColor: 'white' },
  hrUnit: { fontSize: 13, color: '#E05070', fontWeight: '700', minWidth: 30 },
  memoLabel: { fontSize: 14, fontWeight: '700', marginBottom: 6, color: C.text },
  memoInput: { borderWidth: 2, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: C.bg, color: C.text, marginBottom: 16, fontWeight: '600' },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: 'white', fontSize: 16, fontWeight: '900' },

  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: C.muted, fontWeight: '700' },
  legendNote: { fontSize: 10, color: C.muted, marginLeft: 'auto' },

  emptyRec: { backgroundColor: C.card, borderRadius: 20, padding: 40, alignItems: 'center', ...SHADOW },
  recItem: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 10, ...SHADOW },
  recDate: { fontSize: 12, color: C.muted, fontWeight: '700' },
  recBP: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5, color: C.text },
  recBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99 },
  recBadgeText: { fontSize: 11, fontWeight: '800' },
  recMemo: { fontSize: 13, color: C.muted, marginTop: 8, fontWeight: '600' },
  timeTag: { backgroundColor: C.mintL, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 },
  timeTagText: { fontSize: 11, color: C.mintD, fontWeight: '800' },
  recHrTag: { backgroundColor: '#FFE0E6', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  recHrText: { fontSize: 11, color: '#C0304A', fontWeight: '700' },
  delBtn: { padding: 6, borderRadius: 8, backgroundColor: '#FFF0F0' },
  delBtnText: { color: '#E05070', fontSize: 12, fontWeight: '700' },

  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 18, alignItems: 'center', ...SHADOW },
  statLabel: { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  statVal: { fontSize: 22, fontWeight: '900', color: C.text, letterSpacing: -0.5 },
  statSub: { fontSize: 12, color: C.muted, marginTop: 4, fontWeight: '600' },
  hrStatCard: { backgroundColor: '#FFF0F3', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  hrStatIco: { fontSize: 24 },
  hrStatLabel: { fontSize: 11, color: '#E05070', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  hrStatVal: { fontSize: 13, color: C.muted, fontWeight: '600' },
  hrStatNum: { fontSize: 16, color: '#C0304A', fontWeight: '900' },
  rptCard: { backgroundColor: C.mint, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: C.mint, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  rptTitle: { fontSize: 15, fontWeight: '800', color: 'white' },
  rptSub: { fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 2, fontWeight: '600' },
  rptBtn: { backgroundColor: 'white', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  rptBtnText: { fontSize: 14, fontWeight: '800', color: C.mintD },
  statsEmpty: { backgroundColor: C.card, borderRadius: 16, padding: 40, alignItems: 'center', ...SHADOW },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(10,30,20,0.55)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: C.text },
  modalCloseBtn: { backgroundColor: C.bg, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  modalSecLabel: { fontSize: 11, color: C.muted, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  modalDivider: { height: 1.5, backgroundColor: C.border, marginVertical: 4 },
  settingsInput: { borderWidth: 2, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: C.bg, color: C.text, fontWeight: '600' },
  settingsSaveBtn: { backgroundColor: C.mint, borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center' },
  settingsResetBtn: { backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 4 },

  rptAvg: { backgroundColor: C.mintL, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 10 },
  rptAvgLabel: { fontSize: 12, color: C.mintD, fontWeight: '800', marginBottom: 4 },
  rptAvgVal: { fontSize: 32, fontWeight: '900', color: C.mintD, letterSpacing: -1 },
  rptAvgUnit: { fontSize: 13, color: C.mintD, marginTop: 4, fontWeight: '600' },
  rptAvgHr: { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 5 },
  rptAvgHrText: { fontSize: 13, color: C.mintD, fontWeight: '700' },
  rptStatBox: { backgroundColor: C.bg, borderRadius: 12, padding: 14 },
  rptStatLabel: { fontSize: 11, color: C.muted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  rptStatVal: { fontSize: 16, fontWeight: '900', color: C.text },
  rptRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  rptRowDate: { flex: 1, fontSize: 12, color: C.muted, fontWeight: '600' },
  rptRowBP: { fontSize: 13, fontWeight: '800', color: C.text, marginRight: 8 },
  rptBadge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 99 },
  rptBadgeText: { fontSize: 11, fontWeight: '800' },
  rptTip: { backgroundColor: C.mintL, borderRadius: 12, padding: 14, marginBottom: 8 },
  rptTipText: { fontSize: 13, color: C.mintD, lineHeight: 22, fontWeight: '700' },

  shareBtn: { backgroundColor: C.mint, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  shareBtnText: { color: 'white', fontSize: 15, fontWeight: '800' },

  // Result Card
  rcOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  rcWrapper: { width: SCREEN_WIDTH * 0.72, borderRadius: 28, overflow: 'hidden', ...SHADOW },
  rcCard: { padding: 36, alignItems: 'center' },
  rcIcon: { fontSize: 52, marginBottom: 12 },
  rcVals: { fontSize: 44, fontWeight: '900', color: 'white', letterSpacing: -2, lineHeight: 50 },
  rcUnit: { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginTop: 2, marginBottom: 8 },
  rcHr: { fontSize: 15, color: 'rgba(255,255,255,0.9)', fontWeight: '700', marginBottom: 6 },
  rcLabel: { fontSize: 20, fontWeight: '900', color: 'white', marginBottom: 6 },
  rcDesc: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 22 },
  rcDismissHint: { marginTop: 20, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 6 },
  rcDismissText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: C.text, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 99, zIndex: 999 },
  toastText: { color: 'white', fontSize: 14, fontWeight: '700' },

  disclaimer: { fontSize: 11, color: C.muted, textAlign: 'center', paddingHorizontal: 20, paddingTop: 16, lineHeight: 18, fontWeight: '600' },
});
