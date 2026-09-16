import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { lookupWord } from '../src/api/dictionary';
import {
  boundsFromPoints,
  cropAndRecognizeWords,
  viewBoundsToImageCrop,
  type Point,
} from '../src/api/ocr';
import * as queries from '../src/db/queries';
import { colors, radii } from '../src/theme/colors';
import type { DictionaryResult, SourceWithStats } from '../src/types';

type Mode = 'underline' | 'circle';
type PickIntent = 'camera' | 'library' | 'upload';

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
  const [stroke, setStroke] = useState<Point[]>([]);
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

  const applyPickedUri = (uri: string) => {
    setImageUri(uri);
    setStroke([]);
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

  const path = useMemo(() => pointsToPath(stroke), [stroke]);
  const bounds = useMemo(() => boundsFromPoints(stroke), [stroke]);

  const extractFromStroke = useCallback(async () => {
    if (!imageUri || !bounds || !imageSize) {
      Alert.alert('Draw first', 'Underline or circle the word(s) on the image.');
      return;
    }

    const crop = viewBoundsToImageCrop(
      bounds,
      { width: PAGE_WIDTH, height: PAGE_HEIGHT },
      imageSize,
      mode,
    );
    if (!crop) {
      Alert.alert('Mark a clearer region', 'Try a longer underline or a tighter circle.');
      return;
    }

    setExtracting(true);
    resetExtraction();
    try {
      const { words, rawText } = await cropAndRecognizeWords({ imageUri, crop });
      setRawOcr(rawText);
      if (words.length === 0) {
        Alert.alert(
          'No words found',
          rawText
            ? `OCR read: “${rawText.slice(0, 120)}” — try marking again.`
            : 'Could not read text in that region. Try a clearer mark.',
        );
        return;
      }

      const lookedUp: ExtractedItem[] = [];
      for (const word of words) {
        const found = await lookupWord(word);
        if (found) {
          lookedUp.push({ ...found, selected: true, status: 'ok' });
        } else {
          lookedUp.push({
            word,
            phonetic: null,
            pos: null,
            glossZh: '（未找到释义）',
            glossEn: null,
            audioUrl: null,
            selected: false,
            status: 'missing',
          });
        }
      }
      setItems(lookedUp);
    } catch (error) {
      Alert.alert(
        'Could not extract words',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setExtracting(false);
    }
  }, [imageUri, bounds, imageSize, mode]);

  const pan = Gesture.Pan()
    .onBegin((e) => {
      setStroke([{ x: e.x, y: e.y }]);
      resetExtraction();
    })
    .onUpdate((e) => {
      setStroke((prev) => [...prev, { x: e.x, y: e.y }]);
    })
    .onEnd(() => {
      // Keep stroke; user taps Extract words.
    })
    .runOnJS(true);

  const selectedCount = items.filter((i) => i.selected && i.status === 'ok').length;

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
  const cropPreview = useMemo(() => {
    if (!bounds || !imageSize) return null;
    return viewBoundsToImageCrop(
      bounds,
      { width: PAGE_WIDTH, height: PAGE_HEIGHT },
      imageSize,
      mode,
    );
  }, [bounds, imageSize, mode]);

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
            setStroke([]);
            resetExtraction();
          }}
          hitSlop={10}
        >
          <Text style={styles.link}>Clear</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
                  onPress={() => {
                    setMode(m);
                    setStroke([]);
                    resetExtraction();
                  }}
                >
                  <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                    {m === 'underline' ? 'Underline' : 'Circle'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <GestureDetector gesture={pan}>
              <View style={[styles.canvas, { width: PAGE_WIDTH, height: PAGE_HEIGHT }]}>
                <Image source={{ uri: imageUri }} style={styles.page} contentFit="contain" />
                <Svg style={StyleSheet.absoluteFill}>
                  {path ? (
                    <Path
                      d={path}
                      stroke={colors.link}
                      strokeWidth={mode === 'underline' ? 3 : 2.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {bounds ? (
                    <Rect
                      x={bounds.minX}
                      y={
                        mode === 'underline'
                          ? bounds.minY - Math.max(36, (bounds.maxY - bounds.minY) * 5)
                          : bounds.minY - 10
                      }
                      width={Math.max(1, bounds.maxX - bounds.minX + (mode === 'underline' ? 24 : 20))}
                      height={
                        mode === 'underline'
                          ? Math.max(36, (bounds.maxY - bounds.minY) * 5) +
                            (bounds.maxY - bounds.minY) * 1.5
                          : bounds.maxY - bounds.minY + 20
                      }
                      stroke="rgba(0,122,255,0.45)"
                      strokeWidth={1}
                      fill="rgba(0,122,255,0.08)"
                    />
                  ) : null}
                </Svg>
              </View>
            </GestureDetector>

            <Text style={styles.hint}>
              {mode === 'underline'
                ? 'Draw under the word(s). We’ll read the text just above your line.'
                : 'Circle the word(s). We’ll read everything inside the mark.'}
            </Text>

            <Pressable
              style={[
                styles.primaryBtn,
                (extracting || stroke.length < 2) && styles.disabled,
              ]}
              onPress={() => void extractFromStroke()}
              disabled={extracting || stroke.length < 2}
            >
              {extracting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="scan" size={18} color="#fff" />
              )}
              <Text style={styles.primaryText}>
                {extracting ? 'Reading marked words…' : 'Extract & look up'}
              </Text>
            </Pressable>

            {cropPreview ? (
              <Text style={styles.debug}>
                Region {cropPreview.width}×{cropPreview.height}px
              </Text>
            ) : null}

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
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
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
