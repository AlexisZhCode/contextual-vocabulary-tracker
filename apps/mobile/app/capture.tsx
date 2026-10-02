import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image as RNImage,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { lookupWord } from '../src/api/dictionary';
import {
  cropUriToJpegBase64,
  extractMarkedText,
  imageUriToJpegBase64,
  type MarkedTextItem,
} from '../src/api/geminiExtract';
import {
  boundsFromPoints,
  viewBoundsToImageCrop,
  type Point,
} from '../src/api/ocr';
import * as queries from '../src/db/queries';
import { colors, radii } from '../src/theme/colors';
import type { DictionaryResult, SourceWithStats } from '../src/types';

type Mode = 'underline' | 'circle';
type PickIntent = 'camera' | 'library' | 'upload';

type Stroke = {
  id: string;
  mode: Mode;
  points: Point[];
};

type ExtractedItem = DictionaryResult & {
  selected: boolean;
  status: 'ok' | 'missing';
};

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pointsToPath(points: Point[]) {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

const PAGE_WIDTH = Dimensions.get('window').width - 40;
const PAGE_HEIGHT = Math.min(Dimensions.get('window').height * 0.42, 360);

export default function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sourceId: presetSourceId, intent } = useLocalSearchParams<{
    sourceId?: string;
    intent?: string;
  }>();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [mode, setMode] = useState<Mode>('underline');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const activeStrokeIdRef = useRef<string | null>(null);
  const transformRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const canvasWindowRef = useRef({ x: 0, y: 0 });
  const canvasNodeRef = useRef<View>(null);
  const scaleSV = useSharedValue(1);
  const txSV = useSharedValue(0);
  const tySV = useSharedValue(0);
  const startScaleSV = useSharedValue(1);
  const startTxSV = useSharedValue(0);
  const startTySV = useSharedValue(0);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [rawOcr, setRawOcr] = useState('');
  const [sources, setSources] = useState<SourceWithStats[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>(
    presetSourceId,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [autoIntentDone, setAutoIntentDone] = useState(false);

  useEffect(() => {
    void queries.listSourcesWithStats().then((list) => {
      setSources(list);
      if (!presetSourceId && list[0]) {
        setSelectedSourceId(list[0].id);
      }
    });
  }, [presetSourceId]);

  const resetExtraction = () => {
    setItems([]);
    setRawOcr('');
  };

  const resetZoom = useCallback(() => {
    transformRef.current = { scale: 1, tx: 0, ty: 0 };
    scaleSV.value = withTiming(1, { duration: 160 });
    txSV.value = withTiming(0, { duration: 160 });
    tySV.value = withTiming(0, { duration: 160 });
    startScaleSV.value = 1;
    startTxSV.value = 0;
    startTySV.value = 0;
  }, [scaleSV, startScaleSV, startTxSV, startTySV, txSV, tySV]);

  const applyPickedUri = (uri: string) => {
    setImageUri(uri);
    setStrokes([]);
    activeStrokeIdRef.current = null;
    resetZoom();
    resetExtraction();
    RNImage.getSize(
      uri,
      (width, height) => setImageSize({ width, height }),
      () => setImageSize(null),
    );
  };

  const uploadFromFiles = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const uri = picked.assets?.[0]?.uri;
      if (!uri) {
        Alert.alert('Could not load file', 'Try another PNG or JPG.');
        return;
      }
      applyPickedUri(uri);
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : String(error));
    } finally {
      setPicking(false);
    }
  }, [picking]);

  const pickImage = useCallback(
    async (fromCamera: boolean) => {
      if (picking) return;
      setPicking(true);
      try {
        if (fromCamera) {
          const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
          if (!cameraPermission.granted) {
            Alert.alert('Camera permission needed', 'Allow camera, or upload an image file.');
            return;
          }
          const picked = await ImagePicker.launchCameraAsync({
            quality: 1,
            allowsEditing: false,
            exif: false,
          });
          if (picked.canceled) return;
          const uri = picked.assets?.[0]?.uri;
          if (!uri) return;
          applyPickedUri(uri);
          return;
        }

        if (Platform.OS === 'android') {
          const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!libraryPermission.granted) {
            Alert.alert('Photos permission needed', 'Allow Photos, or upload from Files.');
            return;
          }
        }

        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          allowsEditing: false,
          exif: false,
        });
        if (picked.canceled) return;
        const uri = picked.assets?.[0]?.uri;
        if (!uri) return;
        applyPickedUri(uri);
      } catch (error) {
        Alert.alert('Image picker failed', error instanceof Error ? error.message : String(error));
      } finally {
        setPicking(false);
      }
    },
    [picking],
  );

  const runIntent = useCallback(
    (value: PickIntent) => {
      if (value === 'camera') void pickImage(true);
      else if (value === 'library') void pickImage(false);
      else void uploadFromFiles();
    },
    [pickImage, uploadFromFiles],
  );

  useEffect(() => {
    if (autoIntentDone) return;
    if (intent !== 'camera' && intent !== 'library' && intent !== 'upload') return;
    setAutoIntentDone(true);
    const task = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => runIntent(intent as PickIntent), 400);
    });
    return () => task.cancel();
  }, [intent, autoIntentDone, runIntent]);

  const finishedStrokes = useMemo(
    () => strokes.filter((s) => s.points.length >= 2),
    [strokes],
  );

  const applyMarkedItems = useCallback(async (marked: MarkedTextItem[]) => {
    if (marked.length === 0) {
      Alert.alert(
        'No marked text found',
        'Gemini did not find underlined, circled, highlighted, or bracketed text. Try a clearer photo.',
      );
      return;
    }

    setRawOcr(marked.map((m) => m.marked_text).join(' · '));

    const lookedUp: ExtractedItem[] = [];
    const seen = new Set<string>();
    for (const item of marked) {
      const key = item.marked_text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const found = await lookupWord(item.marked_text).catch(() => null);
      lookedUp.push({
        word: found?.word ?? item.marked_text,
        phonetic: item.phonetic || found?.phonetic || null,
        pos: found?.pos ?? null,
        glossZh: item.definition || found?.glossZh || '（未找到释义）',
        glossEn: item.context || found?.glossEn || null,
        audioUrl: found?.audioUrl ?? null,
        selected: Boolean(item.definition || found?.glossZh),
        status: item.definition || found?.glossZh ? 'ok' : 'missing',
      });
    }
    setItems(lookedUp);
  }, []);

  const extractFromStroke = useCallback(async () => {
    if (!imageUri || !imageSize || finishedStrokes.length === 0) {
      Alert.alert('Draw first', 'Underline or circle the word(s) on the image.');
      return;
    }

    setExtracting(true);
    resetExtraction();
    try {
      const crops = finishedStrokes
        .map((stroke) => {
          const bounds = boundsFromPoints(stroke.points);
          if (!bounds) return null;
          return viewBoundsToImageCrop(
            bounds,
            { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            imageSize,
            stroke.mode,
          );
        })
        .filter((c): c is NonNullable<typeof c> => !!c);

      // Run Gemini calls in parallel — sequential was the main draw-path bottleneck.
      const batches = await Promise.all(
        crops.map(async (crop) => {
          const base64 = await cropUriToJpegBase64(imageUri, crop);
          return extractMarkedText(base64, { regionMode: true });
        }),
      );

      const merged: MarkedTextItem[] = [];
      const seen = new Set<string>();
      for (const items of batches) {
        for (const item of items) {
          const key = item.marked_text.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(item);
        }
      }

      await applyMarkedItems(merged);
    } catch (error) {
      Alert.alert(
        'Could not extract words',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setExtracting(false);
    }
  }, [imageUri, imageSize, finishedStrokes, applyMarkedItems]);

  const extractPenUnderlines = useCallback(async () => {
    if (!imageUri) {
      Alert.alert('Upload a photo', 'Choose a book photo that already has pen marks.');
      return;
    }

    setExtracting(true);
    resetExtraction();
    try {
      const base64 = await imageUriToJpegBase64(imageUri);
      const marked = await extractMarkedText(base64);
      await applyMarkedItems(marked);
    } catch (error) {
      Alert.alert(
        'Could not extract marked text',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setExtracting(false);
    }
  }, [imageUri, applyMarkedItems]);

  const syncTransformRef = (scale: number, tx: number, ty: number) => {
    transformRef.current = { scale, tx, ty };
  };

  const setScrollLockedJS = (locked: boolean) => {
    setScrollLocked(locked);
  };

  const clampPanWorklet = (scale: number, tx: number, ty: number) => {
    'worklet';
    const maxX = ((scale - 1) * PAGE_WIDTH) / 2 + 40;
    const maxY = ((scale - 1) * PAGE_HEIGHT) / 2 + 40;
    return {
      tx: Math.max(-maxX, Math.min(maxX, tx)),
      ty: Math.max(-maxY, Math.min(maxY, ty)),
    };
  };

  /** Map screen (window) touch → unscaled canvas coords (matches SVG / OCR space). */
  const mapAbsoluteToCanvas = (absoluteX: number, absoluteY: number): Point => {
    const { scale, tx, ty } = transformRef.current;
    const s = Math.max(0.01, scale);
    const cx = PAGE_WIDTH / 2;
    const cy = PAGE_HEIGHT / 2;
    const lx = absoluteX - canvasWindowRef.current.x;
    const ly = absoluteY - canvasWindowRef.current.y;
    // Inverse of: T(cx+tx, cy+ty) · S(s) · T(-cx, -cy)
    return {
      x: (lx - cx - tx) / s + cx,
      y: (ly - cy - ty) / s + cy,
    };
  };

  const undoLastStroke = () => {
    activeStrokeIdRef.current = null;
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
    resetExtraction();
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      'worklet';
      runOnJS(setScrollLockedJS)(true);
      startScaleSV.value = scaleSV.value;
      startTxSV.value = txSV.value;
      startTySV.value = tySV.value;
    })
    .onUpdate((e) => {
      'worklet';
      const next = Math.min(4, Math.max(1, startScaleSV.value * e.scale));
      // Zoom about pinch focal point (in the outer canvas / window-relative space).
      const focalX = e.focalX;
      const focalY = e.focalY;
      const cx = PAGE_WIDTH / 2;
      const cy = PAGE_HEIGHT / 2;
      const prev = startScaleSV.value;
      // Point in canvas space under focal before zoom change (using start translate)
      const canvasX = (focalX - cx - startTxSV.value) / Math.max(0.01, prev) + cx;
      const canvasY = (focalY - cy - startTySV.value) / Math.max(0.01, prev) + cy;
      scaleSV.value = next;
      // Keep that canvas point under the same focal after scale change
      txSV.value = focalX - cx - (canvasX - cx) * next;
      tySV.value = focalY - cy - (canvasY - cy) * next;
      if (next <= 1.01) {
        scaleSV.value = 1;
        txSV.value = 0;
        tySV.value = 0;
      }
    })
    .onEnd(() => {
      'worklet';
      if (scaleSV.value <= 1.02) {
        scaleSV.value = 1;
        txSV.value = 0;
        tySV.value = 0;
      }
      const clamped = clampPanWorklet(scaleSV.value, txSV.value, tySV.value);
      txSV.value = clamped.tx;
      tySV.value = clamped.ty;
      runOnJS(syncTransformRef)(scaleSV.value, clamped.tx, clamped.ty);
      runOnJS(setScrollLockedJS)(false);
    })
    .onFinalize(() => {
      'worklet';
      runOnJS(setScrollLockedJS)(false);
    });

  const twoFingerPan = Gesture.Pan()
    .minPointers(2)
    .onBegin(() => {
      'worklet';
      runOnJS(setScrollLockedJS)(true);
      startTxSV.value = txSV.value;
      startTySV.value = tySV.value;
    })
    .onUpdate((e) => {
      'worklet';
      if (scaleSV.value <= 1.01) return;
      const next = clampPanWorklet(
        scaleSV.value,
        startTxSV.value + e.translationX,
        startTySV.value + e.translationY,
      );
      txSV.value = next.tx;
      tySV.value = next.ty;
    })
    .onEnd(() => {
      'worklet';
      runOnJS(syncTransformRef)(scaleSV.value, txSV.value, tySV.value);
      runOnJS(setScrollLockedJS)(false);
    })
    .onFinalize(() => {
      'worklet';
      runOnJS(setScrollLockedJS)(false);
    });

  const appendPoint = (id: string, point: Point) => {
    setStrokes((prev) =>
      prev.map((stroke) =>
        stroke.id === id ? { ...stroke, points: [...stroke.points, point] } : stroke,
      ),
    );
  };

  const refreshCanvasWindow = useCallback(() => {
    canvasNodeRef.current?.measureInWindow((x, y) => {
      canvasWindowRef.current = { x, y };
    });
  }, []);

  const beginStroke = (absoluteX: number, absoluteY: number) => {
    transformRef.current = {
      scale: scaleSV.value,
      tx: txSV.value,
      ty: tySV.value,
    };
    const id = createId('stroke');
    activeStrokeIdRef.current = id;
    const point = mapAbsoluteToCanvas(absoluteX, absoluteY);
    setStrokes((prev) => [...prev, { id, mode, points: [point] }]);
    resetExtraction();
    setScrollLocked(true);
    // Refresh in background for subsequent points / next stroke.
    refreshCanvasWindow();
  };

  const endStroke = () => {
    const id = activeStrokeIdRef.current;
    activeStrokeIdRef.current = null;
    setScrollLocked(false);
    // Drop accidental taps that never became a real underline/circle.
    if (id) {
      setStrokes((prev) =>
        prev.filter((stroke) => !(stroke.id === id && stroke.points.length < 2)),
      );
    }
  };

  const drawPan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(2)
    .averageTouches(false)
    .onBegin((e) => {
      beginStroke(e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      const id = activeStrokeIdRef.current;
      if (!id) return;
      transformRef.current = {
        scale: scaleSV.value,
        tx: txSV.value,
        ty: tySV.value,
      };
      appendPoint(id, mapAbsoluteToCanvas(e.absoluteX, e.absoluteY));
    })
    .onEnd(() => {
      endStroke();
    })
    .onFinalize(() => {
      if (activeStrokeIdRef.current) endStroke();
    })
    .runOnJS(true);

  // Pinch / two-finger pan take priority so zoom doesn't create stray draw strokes.
  const canvasGesture = Gesture.Exclusive(
    Gesture.Simultaneous(pinch, twoFingerPan),
    drawPan,
  );

  const canvasAnimatedStyle = useAnimatedStyle(() => {
    const cx = PAGE_WIDTH / 2;
    const cy = PAGE_HEIGHT / 2;
    return {
      transform: [
        { translateX: cx + txSV.value },
        { translateY: cy + tySV.value },
        { scale: scaleSV.value },
        { translateX: -cx },
        { translateY: -cy },
      ],
    };
  });

  const selectedCount = items.filter((i) => i.selected && i.status === 'ok').length;
  const canUndo = strokes.length > 0;

  const onSaveSelected = async () => {
    if (!selectedSourceId || saving) return;
    const toSave = items.filter((i) => i.selected && i.status === 'ok');
    if (toSave.length === 0) {
      Alert.alert('Nothing to save', 'Select at least one word with a definition.');
      return;
    }
    setSaving(true);
    try {
      for (const item of toSave) {
        await queries.createEntry({
          id: createId('ent'),
          sourceId: selectedSourceId,
          word: item.word,
          phonetic: item.phonetic,
          pos: item.pos,
          glossZh: item.glossZh,
          glossEn: item.glossEn,
          audioUrl: item.audioUrl,
        });
      }
      router.replace(`/source/${selectedSourceId}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.link}>Close</Text>
        </Pressable>
        <Text style={styles.topTitle}>Look up</Text>
        <Pressable
          onPress={() => {
            setStrokes([]);
            activeStrokeIdRef.current = null;
            resetZoom();
            resetExtraction();
          }}
          hitSlop={10}
        >
          <Text style={styles.link}>Clear</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!scrollLocked}
        scrollEventThrottle={16}
        onScroll={refreshCanvasWindow}
        onMomentumScrollEnd={refreshCanvasWindow}
        onScrollEndDrag={refreshCanvasWindow}
      >
        {!imageUri ? (
          <View style={styles.emptyCapture}>
            <Pressable
              style={[styles.uploadZone, picking && styles.disabled]}
              onPress={() => void uploadFromFiles()}
              disabled={picking}
            >
              <View style={styles.uploadIcon}>
                {picking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={32} color="#fff" />
                )}
              </View>
              <Text style={styles.emptyTitle}>Upload a screenshot</Text>
              <Text style={styles.emptyBody}>
                Then underline or circle words. We’ll OCR the marked region and look them up.
              </Text>
              <View style={styles.uploadCta}>
                <Text style={styles.uploadCtaText}>
                  {picking ? 'Opening file picker…' : 'Choose file'}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, picking && styles.disabled]}
              onPress={() => void pickImage(false)}
              disabled={picking}
            >
              <Ionicons name="images-outline" size={20} color={colors.text} />
              <Text style={styles.secondaryText}>From Photos</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, picking && styles.disabled]}
              onPress={() => void pickImage(true)}
              disabled={picking}
            >
              <Ionicons name="camera-outline" size={20} color={colors.text} />
              <Text style={styles.secondaryText}>Take photo</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.modeRow}>
              {(['underline', 'circle'] as Mode[]).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.modeChip, mode === m && styles.modeActive]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                    {m === 'underline' ? 'Underline' : 'Circle'}
                  </Text>
                </Pressable>
              ))}
              <View style={styles.modeSpacer} />
              <Pressable
                style={[styles.modeChip, !canUndo && styles.disabled]}
                onPress={undoLastStroke}
                disabled={!canUndo}
              >
                <Ionicons
                  name="arrow-undo"
                  size={16}
                  color={!canUndo ? colors.textTertiary : colors.text}
                />
                <Text
                  style={[styles.modeText, !canUndo && { color: colors.textTertiary }]}
                >
                  Undo
                </Text>
              </Pressable>
              <Pressable style={styles.modeChip} onPress={resetZoom}>
                <Ionicons name="scan-outline" size={16} color={colors.text} />
                <Text style={styles.modeText}>Reset zoom</Text>
              </Pressable>
            </View>

            <GestureDetector gesture={canvasGesture}>
              <View
                ref={canvasNodeRef}
                collapsable={false}
                style={[styles.canvas, { width: PAGE_WIDTH, height: PAGE_HEIGHT }]}
                onLayout={() => {
                  canvasNodeRef.current?.measureInWindow((x, y) => {
                    canvasWindowRef.current = { x, y };
                  });
                }}
              >
                <Animated.View
                  style={[
                    { width: PAGE_WIDTH, height: PAGE_HEIGHT },
                    canvasAnimatedStyle,
                  ]}
                >
                  <Image source={{ uri: imageUri }} style={styles.page} contentFit="contain" />
                  <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                    {strokes.map((stroke) => {
                      const d = pointsToPath(stroke.points);
                      if (!d) return null;
                      return (
                        <Path
                          key={stroke.id}
                          d={d}
                          stroke={colors.link}
                          strokeWidth={stroke.mode === 'underline' ? 3 : 2.5}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })}
                  </Svg>
                </Animated.View>
              </View>
            </GestureDetector>

            <Text style={styles.hint}>
              Pinch to zoom, two fingers to pan, one finger to draw. Undo removes your last
              underline or circle. Extraction uses Gemini AI (not on-device OCR).
            </Text>

            <Pressable
              style={[styles.secondaryBtn, extracting && styles.disabled]}
              onPress={() => void extractPenUnderlines()}
              disabled={extracting}
            >
              {extracting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Ionicons name="color-wand-outline" size={18} color={colors.text} />
              )}
              <Text style={styles.secondaryText}>
                {extracting ? 'Gemini is reading marks…' : 'Extract pen marks (AI)'}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.primaryBtn,
                (extracting || finishedStrokes.length === 0) && styles.disabled,
              ]}
              onPress={() => void extractFromStroke()}
              disabled={extracting || finishedStrokes.length === 0}
            >
              {extracting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="color-wand" size={18} color="#fff" />
              )}
              <Text style={styles.primaryText}>
                {extracting ? 'Gemini is reading…' : 'Extract drawn marks (AI)'}
              </Text>
            </Pressable>

            {items.length > 0 ? (
              <View style={styles.listCard}>
                <Text style={styles.listTitle}>
                  {items.length} word{items.length === 1 ? '' : 's'} found
                </Text>
                {rawOcr ? (
                  <Text style={styles.ocrRaw} numberOfLines={2}>
                    OCR: {rawOcr}
                  </Text>
                ) : null}
                {items.map((item) => (
                  <Pressable
                    key={item.word}
                    style={styles.itemRow}
                    onPress={() =>
                      setItems((prev) =>
                        prev.map((row) => 
                          row.word === item.word
                            ? { ...row, selected: !row.selected }
                            : row,
                        ),
                      )
                    }
                  >
                    <Ionicons
                      name={item.selected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={item.status === 'ok' ? colors.link : colors.textTertiary}
                    />
                    <View style={styles.itemBody}>
                      <Text style={styles.itemWord}>{item.word}</Text>
                      <Text style={styles.itemGloss} numberOfLines={2}>
                        {item.glossZh}
                      </Text>
                      {item.glossEn ? (
                        <Text style={styles.itemEn} numberOfLines={2}>
                          {item.glossEn}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}

                <Pressable style={styles.sourcePicker} onPress={() => setPickerOpen(true)}>
                  <Text style={styles.sourceLabel}>Save to</Text>
                  <Text style={styles.sourceValue} numberOfLines={1}>
                    {selectedSource?.title ?? 'Choose source'}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </Pressable>

                <Pressable
                  style={[
                    styles.primaryBtn,
                    (!selectedSourceId || saving || selectedCount === 0) && styles.disabled,
                  ]}
                  onPress={() => void onSaveSelected()}
                  disabled={!selectedSourceId || saving || selectedCount === 0}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>
                      Save {selectedCount} word{selectedCount === 1 ? '' : 's'}
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            <Pressable style={styles.changeImage} onPress={() => void uploadFromFiles()}>
              <Text style={styles.changeImageText}>Change image</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Choose source</Text>
            {sources.map((s) => (
              <Pressable
                key={s.id}
                style={styles.modalRow}
                onPress={() => {
                  setSelectedSourceId(s.id);
                  setPickerOpen(false);
                }}
              >
                <Text style={styles.modalRowText}>{s.title}</Text>
                {selectedSourceId === s.id ? (
                  <Ionicons name="checkmark" size={18} color={colors.link} />
                ) : null}
              </Pressable>
            ))}
            <Pressable
              style={styles.modalRow}
              onPress={() => {
                setPickerOpen(false);
                router.push('/add-source');
              }}
            >
              <Text style={[styles.modalRowText, { color: colors.link }]}>Add new source…</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: { fontSize: 17, fontWeight: '600' },
  link: { color: colors.link, fontSize: 17 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  emptyCapture: { marginTop: 24, gap: 10 },
  uploadZone: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.separator,
    gap: 10,
  },
  uploadIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  uploadCta: {
    marginTop: 8,
    backgroundColor: colors.text,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  uploadCtaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: radii.card,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.surface,
  },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  modeSpacer: { flexGrow: 1, minWidth: 8 },
  modeChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeActive: { backgroundColor: colors.text },
  modeText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  modeTextActive: { color: '#fff' },
  canvas: {
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: '#111',
    alignSelf: 'center',
  },
  page: { width: '100%', height: '100%' },
  hint: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: colors.text,
    borderRadius: radii.card,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  debug: { marginTop: 6, fontSize: 11, color: colors.textTertiary },
  listCard: {
    marginTop: 18,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 14,
    gap: 10,
  },
  listTitle: { fontSize: 18, fontWeight: '700' },
  ocrRaw: { fontSize: 12, color: colors.textTertiary, lineHeight: 16 },
  itemRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separatorLight,
  },
  itemBody: { flex: 1 },
  itemWord: {
    fontSize: 17,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  itemGloss: { marginTop: 2, fontSize: 14, color: colors.text, lineHeight: 20 },
  itemEn: { marginTop: 2, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  sourcePicker: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sourceLabel: { color: colors.textSecondary, fontSize: 13 },
  sourceValue: { flex: 1, fontSize: 15, fontWeight: '600' },
  changeImage: { marginTop: 16, alignItems: 'center', padding: 8 },
  changeImageText: { color: colors.link, fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
    gap: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separatorLight,
  },
  modalRowText: { fontSize: 16, color: colors.text },
});
