import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import type { SignaturePadHandle } from './signature-pad.types';

export const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_, ref) {
  const view = useRef<View>(null);
  const drawing = useRef<string>('');
  const points = useRef(0);
  const [paths, setPaths] = useState<string[]>([]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => {
      const { locationX: x, locationY: y } = event.nativeEvent;
      drawing.current = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      setPaths(current => [...current, drawing.current]);
    },
    onPanResponderMove: event => {
      if (points.current >= 2400) return;
      const { locationX: x, locationY: y } = event.nativeEvent;
      points.current++;
      drawing.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      const next = drawing.current;
      setPaths(current => [...current.slice(0, -1), next]);
    },
  }), []);
  useImperativeHandle(ref, () => ({
    clear() { drawing.current = ''; points.current = 0; setPaths([]); },
    async capture() {
      if (points.current < 2) throw new Error('Vui lòng vẽ chữ ký trong khung.');
      const base64 = await captureRef(view, { result: 'base64', format: 'png', width: 600, height: 180 });
      const image = `data:image/png;base64,${base64}`;
      if (image.length > 90000) throw new Error('Chữ ký quá lớn. Vui lòng xóa và ký lại.');
      return image;
    },
  }), []);
  return <View ref={view} collapsable={false} accessible accessibilityLabel="Khung vẽ chữ ký" {...pan.panHandlers} style={{ height: 180, backgroundColor: '#fff', borderWidth: 1, borderColor: '#81929d', borderRadius: 8, overflow: 'hidden' }}>
    <Svg width="100%" height="180">{paths.map((d, index) => <Path key={index} d={d} stroke="#213f53" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}</Svg>
  </View>;
});
