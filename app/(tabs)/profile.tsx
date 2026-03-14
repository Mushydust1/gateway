import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { useStore } from "../../lib/store";

export default function ProfileScreen() {
  const { profile } = useStore();

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.avatarPlaceholder}>👤</Text>
        <Text style={styles.pseudonym}>{profile?.pseudonym ?? "..."}</Text>
        <Text style={styles.label}>Your default pseudonym</Text>
        <Text style={styles.hint}>
          You get a unique pseudonym for each flight room.
        </Text>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    padding: 16,
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  avatarPlaceholder: {
    fontSize: 64,
    marginBottom: 16,
  },
  pseudonym: {
    fontSize: 24,
    fontWeight: "700",
    color: "#F8FAFC",
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 12,
  },
  hint: {
    fontSize: 13,
    color: "#475569",
    textAlign: "center",
    lineHeight: 18,
  },
  signOutButton: {
    marginTop: 24,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  signOutText: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "600",
  },
});
