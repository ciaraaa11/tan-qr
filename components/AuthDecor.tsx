import { StyleSheet, View } from "react-native";

// Entire component is decorative only. No child can receive touches.
export function AuthDecor() {
  return (
    <View pointerEvents="none" style={styles.background}>
      <View style={styles.topHalo} />
      <View style={styles.topRing} />
      <View style={styles.rightDot} />
      <View style={styles.lowerHalo} />
      <View style={styles.lowerRing} />
      <View style={styles.smallDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  topHalo: {
    position: "absolute", top: -95, right: -105,
    width: 295, height: 295, borderRadius: 150,
    backgroundColor: "rgba(154, 140, 152, 0.26)",
  },
  topRing: {
    position: "absolute", top: 62, right: -65,
    width: 175, height: 175, borderRadius: 90,
    borderWidth: 2, borderColor: "rgba(74, 78, 105, 0.32)",
  },
  rightDot: {
    position: "absolute", top: 245, right: 20,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: "rgba(201, 173, 167, 0.75)",
  },
  lowerHalo: {
    position: "absolute", bottom: -120, left: -135,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: "rgba(201, 173, 167, 0.32)",
  },
  lowerRing: {
    position: "absolute", bottom: 75, left: -55,
    width: 150, height: 150, borderRadius: 75,
    borderWidth: 2, borderColor: "rgba(154, 140, 152, 0.36)",
  },
  smallDot: {
    position: "absolute", bottom: 230, left: 24,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: "rgba(74, 78, 105, 0.42)",
  },
});
