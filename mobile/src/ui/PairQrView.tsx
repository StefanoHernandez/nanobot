import React from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";

export function PairQrView({ value, size }: { value: string; size: number }) {
  return (
    // Dark on white, with a quiet zone: scanners fail on an inverted code.
    <View accessibilityRole="image" style={{ backgroundColor: "white", padding: 12 }}>
      <QRCode value={value} size={size} color="black" backgroundColor="white" />
    </View>
  );
}
