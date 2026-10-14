import React from "react";
import { Image, View, type ImageProps, type StyleProp, type ViewStyle } from "react-native";
import { SvgUri } from "react-native-svg";

const SVG = /\.svg(?:[?#]|$)/i;

/** Agent media is typed by file name (server sends octet-stream), so check the name first. */
export const isSvg = (url: string, name?: string) => SVG.test(name ?? "") || SVG.test(url);

/** RN Image (Fresco) cannot decode SVG on Android: draw those with react-native-svg, "contain"-fit. */
export function AnyImage({ url, name, ...props }: Omit<ImageProps, "source"> & { url: string; name?: string }) {
  if (isSvg(url, name)) {
    return (
      <View style={props.style as StyleProp<ViewStyle>} testID={props.testID}>
        <SvgUri uri={url} width="100%" height="100%" />
      </View>
    );
  }
  return <Image {...props} source={{ uri: url }} />;
}
