import { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');
const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF2D55'];

type Particle = {
  id: number;
  x: number;
  color: string;
  delay: number;
  drift: number;
  size: number;
};

const PARTICLES: Particle[] = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: Math.random() * W,
  color: COLORS[i % COLORS.length]!,
  delay: Math.floor(Math.random() * 280),
  drift: (Math.random() - 0.5) * 120,
  size: 6 + Math.random() * 8,
}));

function ConfettiBit({ p }: { p: Particle }) {
  const y = useSharedValue(-20);
  const x = useSharedValue(p.x);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    y.value = withDelay(
      p.delay,
      withTiming(H * 0.75, { duration: 1600, easing: Easing.out(Easing.quad) }),
    );
    x.value = withDelay(
      p.delay,
      withTiming(p.x + p.drift, { duration: 1600, easing: Easing.out(Easing.cubic) }),
    );
    opacity.value = withDelay(p.delay + 900, withTiming(0, { duration: 700 }));
    rotate.value = withDelay(p.delay, withTiming(360 + Math.random() * 180, { duration: 1600 }));
  }, [opacity, p.delay, p.drift, p.x, rotate, x, y]);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: p.size,
    height: p.size * 0.55,
    borderRadius: 2,
    backgroundColor: p.color,
    opacity: opacity.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return <Animated.View style={style} />;
}

/** Lightweight full-screen confetti burst (no extra dependency). */
export function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {PARTICLES.map((p) => (
        <ConfettiBit key={p.id} p={p} />
      ))}
    </View>
  );
}
